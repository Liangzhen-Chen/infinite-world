import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityResolver, MemoryIndex, validateMemory, normalize } from '../server-plugin/retrieval.mjs';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';
import {init} from '../server-plugin/index.mjs';
const entities = [{ id: 'npc_hw_linsui', name: '林穗', aliases: ['林穗姐', '老板娘', '林老板', '穗姐'], scope: 'loc_hw' }];
test('别名首字符索引与完整扫描的顺序、歧义及当前作用域一致，扩展不污染父解析器',()=>{
 const resolver=new EntityResolver([{id:'npc_a',name:'林',aliases:['木匠','林伯'],scope:'loc_a'},{id:'npc_b',name:'林伯',aliases:['木匠'],scope:'loc_b'},{id:'npc_c',name:'明月',aliases:['🌙'],scope:'loc_a'}]);
 const scan=(view,text,scope)=>{const found=new Set();for(const alias of view.names)if(normalize(text).includes(alias))try{found.add(view.resolve(alias,scope));}catch{}return [...found];};
 const check=view=>{for(const text of ['林伯找木匠和明月🌙','🌙','木匠','找不到','林'])for(const scope of [null,'loc_a','loc_b','loc_c'])assert.deepEqual([...view.mentions(text,scope)],scan(view,text,scope));};
 check(resolver);
 const child=resolver.extend([{id:'npc_d',name:'林伯',scope:'loc_c'}]);check(child);check(resolver);
 // Only alias buckets are cached. Live entity scope must still affect resolve.
 resolver.entities.get('npc_a').scope='loc_b';check(resolver);
});
const make = () => {
    const index = new MemoryIndex({ entities });
    index.upsert({ id: 'fact_kitchen', source: '长期事实', text: '第三天玩家帮林穗找回遗失的账簿，她允许玩家借用酒馆厨房',
        entities: ['npc_hw_linsui'], salience: 5, keywords: ['承诺'] });
    return index;
};
for (const query of ['那本账本', '她的帐本', '我能用灶台吗', '老板娘答应过我什么', '她的賬簿', '能借廚房嗎']) {
    test(`1.3 检索：${query}`, () => assert.equal(make().search(query)[0]?.id, 'fact_kitchen'));
}
test('E8 别名、繁简、异体字归一，未知与歧义拒绝', () => {
    const resolver = new EntityResolver([...entities, { id: 'other', name: '另一店主', aliases: ['老板娘'], scope: 'loc_bs' }]);
    assert.equal(resolver.resolve('老闆娘', 'loc_hw'), 'npc_hw_linsui');
    assert.throws(() => resolver.resolve('老板娘'), /歧义/); assert.throws(() => resolver.resolve('路人甲'), /未登记/);
});
test('E16 增量索引重复刷新不读取或重新切词原文，编辑显式更新', () => {
    const index = make(); let reads = 0;
    const chat = Array.from({ length: 5000 }, () => ({ is_user: true, get mes() { reads++; return '在河边散步'; } }));
    index.syncChat(chat); const count = index.tokenizations; reads = 0;
    index.syncChat(chat); assert.equal(reads, 0); assert.equal(index.tokenizations, count);
    index.editChat(7, { is_user: true, mes: '找回紫色短笛' });
    assert.ok(index.search('紫色短笛').some(row => row.id === 'chat_7'));
});
test('记忆正文拒绝系统用语，保留原始事件，结果按来源去重', () => {
    assert.throws(() => validateMemory('以账本为准'), /系统用语/);
    assert.equal(validateMemory('林穗收到六枚铜币'), '林穗收到六枚铜币');
    const index = make();
    index.upsert({ id: 'event_a', eventId: 'evt1', source: '事件', text: '蓝色雁渡船票', salience: 5 });
    index.upsert({ id: 'chat_a', eventId: 'evt1', source: '原始对话', text: '那张蓝色雁渡船票' });
    assert.equal(index.search('蓝色船票').filter(row => row.eventId === 'evt1').length, 1);
});

test('增量索引：缺少前序或尾部消息时拒绝且保留旧索引',()=>{
    const index=make();index.syncDelta(0,[{mes:'紫色短笛'}],1);
    assert.throws(()=>index.syncDelta(3,[{mes:'不存在的消息'}],4),/前序/);
    assert.throws(()=>index.syncDelta(1,[],3),/前序/);
    assert.throws(()=>index.editChat(7,{mes:'另一消息'}),/已同步/);
    assert.equal(index.chatMessages.length,1);
    assert.equal(index.search('紫色短笛')[0].id,'chat_0');
    index.syncDelta(1,[{mes:'黄色风筝'}],2);
    assert.equal(index.search('黄色风筝')[0].id,'chat_1');
});

test('不精确物品名只推荐同类候选，短实物名称不被工序册挤掉',()=>{
    const resolver=new EntityResolver([
        ...Array.from({length:6},(_,i)=>({id:`item_book_${i}`,name:`燕麦加工工序册第${i}卷`})),
        {id:'recipe_oats',name:'燕麦'}, {id:'item_oats',name:'带壳燕麦'}, {id:'item_flour',name:'燕麦粉'},
    ]);
    assert.throws(()=>resolver.resolve('燕麦',null,'item'),error=>{
        assert.match(error.message,/带壳燕麦（item_oats）/);
        assert.match(error.message,/燕麦粉（item_flour）/);
        assert.doesNotMatch(error.message,/recipe_oats/);
        return true;
    });
});

test('world_search 真实HTTP入口检索四村公开资料，获知前不返回传闻，查询不改世界',async t=>{
    const world=await loadRuntimeWorld(),original=structuredClone(world),root=await fs.mkdtemp(path.join(tmpRoot(),'fields-village-search-'));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json());const router=express.Router();
    await init(router,{baseRoot:root,world,npcPlanningEnabled:false,consistencyEnabled:false});app.use(router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
    const request=async(endpoint,body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await res.json();assert.equal(res.status,200,result.error);return result;};
    const created=await request('/create',{character:{name:'未访四村的旅人'}}),campaignId=created.reference.campaignId,before=await request('/read',{campaignId});
    // T90后白石镇也有details，但经济pending-ledger不设产量；四村逐项核检索，白石镇只核已登记条目且不得冒出产量账。
    const town=world.settlementProfiles.find(p=>p.id==='loc_bs').details;
    for(const [query,key]of [[town.problems[0].title,`issue_${town.problems[0].id}`],[town.calendar.festivals[0].name,'festival_0']]){const result=await request('/search',{campaignId,query:`${town.name}${query}`});assert.ok(result.results.some(row=>row.id===`settlement_loc_bs_${key}`),`${town.name}${query}`);}
    assert.ok((await request('/search',{campaignId,query:`${town.name}公共燕麦田年粮产量`})).results.every(row=>row.id!=='settlement_loc_bs_production_0'));
    for(const profile of world.settlementProfiles.filter(p=>p.details&&p.id!=='loc_bs')){
        const p=profile.details;
        for(const [query,key]of [['公共燕麦田年粮产量','production_0'],['公共粮仓当前库存','current'],['村级头人执法权限','governance'],[p.problems[0].title,`issue_${p.problems[0].id}`],['集市赶集日','market'],[p.calendar.festivals[0].name,'festival_0']]){
            const result=await request('/search',{campaignId,query:`${p.name}${query}`});
            assert.ok(result.results.some(row=>row.id===`settlement_${p.id}_${key}`),`${p.name}${query}`);
        }
        const unknown=await request('/search',{campaignId,query:`${p.name}传闻 ${p.rumors[0].claim}`,limit:12});
        for(const r of p.rumors){assert.ok(unknown.results.every(row=>!row.text.includes(r.fact)&&!row.text.includes(r.claim)));}
        assert.ok(unknown.results.every(row=>!row.text.includes(p.hiddenPlaces[0].detail)&&!row.text.includes(p.problems[0].options[0].proposal)));
    }
    assert.deepEqual(await request('/read',{campaignId}),before);assert.deepEqual(world,original);
    const profile=world.settlementProfiles.find(p=>p.details),rumor=profile.details.rumors[0],source=world.npcs.find(p=>p.id===rumor.source).name;
    const chat=[{name:source,is_user:false,mes:`${source}对我说：“${rumor.claim}”` }];
    const acquired=await request('/search',{campaignId,query:rumor.claim,chat,limit:12});
    const spoken=acquired.results.find(row=>row.id==='chat_0');assert.ok(spoken);assert.match(spoken.text,new RegExp(source));assert.ok(spoken.text.includes(rumor.claim));assert.equal(spoken.text.includes(rumor.fact),false);
    assert.ok(acquired.results.filter(row=>row.id.startsWith('settlement_')).every(row=>!row.text.includes(rumor.claim)));
    const forgotten=await request('/search',{campaignId,query:rumor.claim,chat:[],limit:12});assert.ok(forgotten.results.every(row=>row.id!=='chat_0'));
    assert.deepEqual(await request('/read',{campaignId}),before);assert.deepEqual(world,original);
});
