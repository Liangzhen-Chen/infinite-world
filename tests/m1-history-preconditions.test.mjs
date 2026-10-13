import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {init} from '../server-plugin/index.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {modelToolCall,toolDefinitions} from '../extension/tools.mjs';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';
import {runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {digest} from '../server-plugin/storage.mjs';

const world=await loadWorld();
const script=async id=>JSON.parse(await fs.readFile(new URL(`playtests/${id}.json`,import.meta.url),'utf8'));
const qty=value=>typeof value==='number'?value:value?.quantity??0;

async function http(t,edition=world){
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-t28-http-'));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json({limit:'500mb'}));const router=express.Router();
    let providerCalls=0;const forbidden=()=>{providerCalls++;throw Error('T28预算为0，禁止模型请求');};
    await init(router,{world:edition,baseRoot:root,newCampaignSeed:()=> 'm1-history-preconditions',
        npcPlanningEnabled:false,npcPlanner:forbidden,consistencyEnabled:false,consistencyClient:forbidden});
    app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    t.after(()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
    const request=async(endpoint,body={})=>{
        const response=await fetch(`http://127.0.0.1:${server.address().port}/${endpoint}`,{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return{status:response.status,body:await response.json()};
    };
    const api=async(endpoint,body)=>{const response=await request(endpoint,body);
        assert.equal(response.status,200,`${endpoint}: ${response.body.error}`);return response.body;};
    t.after(()=>assert.equal(providerCalls,0));
    return{api,request,root};
}

async function campaign(t,id,edition=world){
    const server=await http(t,edition),created=await server.api('create',{character:{name:'前置测试者'}});
    const campaignId=created.reference.campaignId;let document=created.document,index=0;
    const read=async()=>{document=(await server.api('read',{campaignId})).document;return document;};
    const call=async(tool,args,anchor)=>{
        const eventId=`${id}_http_${index++}`,routed=modelToolCall(tool,args);
        assert.ok(tool==='world_turn'||toolDefinitions().some(row=>row.function.name===routed.tool));
        const request={campaignId,...routed,eventId,anchor:anchor??eventId};
        const saved=await server.api('execute',request);await read();
        return{tool:routed.tool,args:routed.args,result:saved.result,eventId,request};
    };
    const reject=async(tool,args,pattern)=>{
        const before=structuredClone(document),response=await server.request('execute',{
            campaignId,...modelToolCall(tool,args),eventId:`${id}_reject_${index++}`});
        assert.equal(response.status,400);assert.match(response.body.error,pattern);
        assert.deepEqual(await read(),before,'前置拒绝不得改变存档');
    };
    const roundTrip=async()=>{
        const before=structuredClone(document),bundle=await server.api('export',{campaignId});
        const invalid=bundle.events.filter(event=>{const {hash,...body}=event;return digest(body)!==hash;}).map(event=>{
            const {hash,...body}=event;return{id:event.id,tool:event.input?.tool,entity:event.input?.args?.entity,
                serializedHash:digest(body),storedHash:hash,undefinedTeacherRestoresHash:digest({...body,result:{...body.result,teacher:undefined}})===hash,
                undefinedStatusRestoresHash:digest({...body,result:{...body.result,status:undefined}})===hash};
        });
        if(invalid.length)t.diagnostic(JSON.stringify({scope:'导出事件链最小失败证据，未修改bundle或哈希',invalid}));
        const imported=await server.api('import',{bundle});assert.deepEqual(imported.document,before);
        assert.deepEqual((await server.api('read',{campaignId:imported.reference.campaignId})).document,before);
        assert.deepEqual(await read(),before);return{bundle,imported};
    };
    return{...server,campaignId,call,read,reject,roundTrip,get document(){return document;}};
}

// Scripted tool choices only exercise HTTP preconditions. They do not measure model selection or prose.
function scriptedClient(actions){let index=0;return{async generate({messages}){
    const user=messages.findLastIndex(row=>row.role==='user'),input=messages[user].content;
    const results=messages.slice(user+1).filter(row=>row.role==='tool');
    if(!results.length&&actions(input)?.length)return{choices:[{message:{role:'assistant',tool_calls:actions(input).map(([name,args])=>({
        id:`precondition_${index++}`,type:'function',function:{name,arguments:JSON.stringify(args)}}))}}]};
    for(const row of results)assert.equal(JSON.parse(row.content).ok,true,row.content);
    return{choices:[{message:{role:'assistant',content:input.startsWith('（场外）')?'已核对当前账本。':'已按本回合请求办理。<回合 额外="0分"/>'}}]};
}};}
const failures=result=>JSON.stringify(result.turns.filter(row=>row.errors.length||row.assertions.some(check=>!check.pass)).map(row=>({index:row.index,errors:row.errors,failed:row.assertions.filter(check=>!check.pass)})));

test('G1正式暮纹术经购书、识字练习及实际学习后扣木炭/魔力；同一事件重试保持完整存档',async t=>{
    const s=await campaign(t,'magic'),scenario=await script('magic'),trace=[];
    assert.equal(scenario.turns.length,20);assert.ok(scenario.requirements.includes('G1'));
    assert.equal(world.spells.find(row=>row.id==='spell_shadow_03').materials[0].item,'item_charcoal');
    async function turn(index,act=async()=>[]){
        const before=structuredClone(s.document),calls=await act();
        await s.call('world_turn',{startMinute:before.state.minute,extraMinutes:0,outOfCharacter:scenario.turns[index].input.startsWith('（场外）')});
        const checks=evaluateAssertions(scenario.turns[index].assertions,{before,after:s.document,calls,reply:''});
        assert.ok(checks.every(row=>row.pass),JSON.stringify({index,failed:checks.filter(row=>!row.pass)}));
        trace.push({index,minute:s.document.state.minute,coins:s.document.state.player.coins,calls:calls.map(c=>({tool:c.tool,success:c.result.success}))});
        return calls;
    }
    async function availableLesson(entity,source){
        const calls=[],clock=s.document.state.minute%1440;
        if(clock+120>720&&clock<780)calls.push(await s.call('world_time',{until:{dayOffset:0,hour:13},activity:'休息'}));
        else if(clock+120>1080)calls.push(await s.call('world_time',{until:{dayOffset:1,hour:9},activity:'休息'}));
        calls.push(await s.call('world_learn',{entity,source}));return calls;
    }
    const learnLight=()=>availableLesson('spell_light','许苓');
    await turn(0,async()=>[await s.call('world_move',{destination:'河边小屋'})]);
    await turn(1,async()=>await learnLight());
    await turn(2,async()=>s.document.state.spells.spell_light?[]:await learnLight());
    await turn(3,async()=>s.document.state.spells.spell_light?[await s.call('world_cast',{spell:'照明术',target:'旧木杖'})]:await learnLight());
    await turn(4);await turn(5,async()=>[await s.call('world_cast',{spell:'照明术',target:'旧木杖'})]);
    await turn(6,async()=>{await s.reject('world_cast',{spell:'元素护卫',target:'player'},/尚未学会/);return[];});
    await turn(7,async()=>[await s.call('world_time',{minutes:60,activity:'休息'})]);await turn(8);
    await turn(9,async()=>[await s.call('world_move',{destination:'小学堂'}),await s.call('world_time',{until:{dayOffset:1,hour:9},activity:'休息'})]);
    const literacy=()=>availableLesson('基础识字','陆青');
    await turn(10,async()=>await literacy());
    for(const i of[11,12])await turn(i,async()=>s.document.state.skills.skill_literacy?[]:await literacy());
    await turn(13,async()=>[await s.call('world_trade',{seller:'陆青',item:'纸土留痕初抄',quantity:1}),await s.call('world_trade',{seller:'陆青',item:'刮薄羊皮纸',quantity:1})]);
    await turn(14,async()=>{const calls=[];for(let day=0;day<4;day++){
        if(day)calls.push(await s.call('world_time',{until:{dayOffset:1,hour:9},activity:'休息'}));
        calls.push(await s.call('world_practice',{skill:'识字',target:'纸土留痕初抄',gain:30}));
    }return calls;});
    const learnShadow=()=>s.call('world_learn',{entity:'暮纹术',source:'纸土留痕初抄'});
    await turn(15,async()=>[await learnShadow()]);
    await turn(16,async()=>{const calls=[];for(let attempt=0;attempt<2&&!s.document.state.spells.spell_shadow_03;attempt++)calls.push(await learnShadow());return calls;});
    assert.deepEqual(s.document.state.spells.spell_shadow_03.source,{type:'book',id:'item_book_m4_surface',author:world.items.find(row=>row.id==='item_book_m4_surface').book.author,edition:world.items.find(row=>row.id==='item_book_m4_surface').book.edition});
    await turn(17);await s.reject('world_cast',{spell:'暮纹术',target:'刮薄羊皮纸',text:'明早到小学堂读书'},/缺少材料/);
    await turn(18,async()=>[await s.call('world_move',{destination:'河湾村'}),await s.call('world_trade',{seller:'段岩',item:'木炭小袋',quantity:1})]);
    const bought=structuredClone(s.document),seller=s.document.state.npcs.npc_hw_duanyan;
    assert.equal(qty(seller.inventory.item_charcoal),7);assert.equal(qty(s.document.state.inventory.item_charcoal),1);
    const casts=await turn(19,async()=>[await s.call('world_cast',{spell:'暮纹术',target:'刮薄羊皮纸',text:'明早到小学堂读书'})]);
    const cast=casts[0],after=structuredClone(s.document),retry=await s.api('execute',cast.request);
    assert.equal(retry.duplicate,true);assert.deepEqual(retry.result,cast.result);assert.deepEqual(await s.read(),after);
    assert.equal(cast.result.mpCost,3);assert.equal(cast.result.ok,true);assert.equal(typeof cast.result.success,'boolean');
    assert.equal(after.state.player.mp,bought.state.player.mp-3);assert.equal(qty(after.state.inventory.item_charcoal),0);
    assert.equal(after.state.minute,bought.state.minute+1);assert.equal(qty(after.state.inventory.item_parchment),1);
    const records=Object.values(after.state.records).filter(row=>row.category==='magic_mark'&&row.source===cast.eventId);
    assert.equal(records.length,cast.result.success?1:0,'失败仍扣料，但不能生成成功痕迹');
    await s.reject('world_cast',{spell:'暮纹术',target:'刮薄羊皮纸',text:'另一条短句'},/缺少材料/);
    t.diagnostic(JSON.stringify({scope:'扣料/扣魔力/重复事件及拒绝前置已完成；导出导入仍须通过，模型0，非真实提示栈验收',trace,cast:cast.result}));
    await s.roundTrip();
});

test('M6–M8复用运行器真实reconcile/sync-index：修改输入撤销旧账、重生成幂等、删除并导入无漂移',async t=>{
    const server=await http(t),scenario=await script('reconcile'),endpoints=[];
    const api=async(name,body)=>{endpoints.push({name,body});return server.api(name,body);};
    const client=scriptedClient(input=>{
        if(input.startsWith('（场外）'))return[];
        if(input.includes('走进'))return[['world_move',{destination:'青灯酒馆'}]];
        if(input.includes('付六铜'))return[['world_trade',{seller:'林穗',service:'住宿',days:1}]];
        if(input.includes('买'))return[['world_trade',{seller:'林穗',item:'面包',quantity:input.includes('两个')?2:1}]];
        return[];
    });
    const result=await runPlaytest({scenario,api,client,bundle:await loadPromptBundle()});
    assert.equal(result.pass,true,failures(result));
    const edited=result.turns.find(row=>scenario.turns[row.index].historyAction==='edit-player-message');
    assert.ok(edited.assertions.some(row=>row.kind==='rollback'&&row.pass));
    assert.equal(edited.calls[0].args.quantity,2);
    assert.equal(result.turns[2].assertions.find(row=>row.kind==='rollback').pass,true);
    assert.ok(result.turns[1].assertions.some(row=>row.kind==='duplicate'&&row.pass));
    assert.ok(endpoints.filter(row=>row.name==='reconcile').length>=4);assert.ok(endpoints.some(row=>row.name==='sync-index'));
    assert.equal(result.finalDocument.state.player.coins,174);assert.equal(qty(result.finalDocument.state.inventory.item_bread),0);
    const bundle=await api('export',{campaignId:result.session.campaignId}),imported=await api('import',{bundle});
    assert.deepEqual(imported.document,result.finalDocument);
    assert.deepEqual((await api('read',{campaignId:imported.reference.campaignId})).document,result.finalDocument);
    const view=await api('read',{campaignId:result.session.campaignId}),anchor='after-reconcile-search',query='买过的面包';
    const review=await api('review/begin',{campaignId:result.session.campaignId,anchor,playerText:query,expectedSequence:view.reference.sequence,captureSearch:true});
    const bread=await api('search',{campaignId:result.session.campaignId,query,token:review.token,anchor,expectedSequence:view.reference.sequence});
    assert.ok(bread.results.every(row=>!['reconcile-1-8-0','reconcile-1-9-0'].includes(row.eventId)),'修改与删除的旧交易不得保留为亲历事件');
    t.diagnostic('脚本仅驱动工具选择；全部存储、回滚与检索走隔离HTTP，未进行真实模型验收。');
});

test('M9旧版本合成副本导入后真实world_upgrade仅一次，关系/库存/记忆不丢，后续行动与往返一致',async t=>{
    const oldWorld=structuredClone(world);oldWorld.version=`${world.version}-t28-previous`;oldWorld.rules.version=oldWorld.version;
    const old=await campaign(t,'previous',oldWorld);
    await old.call('world_move',{destination:'青灯酒馆'});
    await old.call('world_trade',{seller:'林穗',service:'住宿',days:1});
    await old.call('world_trade',{seller:'林穗',item:'面包',quantity:1});
    await old.call('world_remember',{subject:'player',key:'旧版住宿',content:'我在青灯酒馆付过六铜房费，并向林穗买了一个面包。',source:'亲历',keywords:['青灯酒馆','房费','面包']});
    const before=structuredClone(old.document);assert.ok(before.state.npcs.npc_hw_linsui.relationships.player);
    const originalBundle=await old.api('export',{campaignId:old.campaignId});
    const current=await http(t),imported=await current.api('import',{bundle:originalBundle});
    assert.deepEqual(imported.document,before,'导入本身不伪造升级');
    const campaignId=imported.reference.campaignId,upgraded=await current.api('read',{campaignId});
    assert.equal(upgraded.document.worldVersion,world.version);assert.notEqual(upgraded.document.worldHash,before.worldHash);
    assert.equal(upgraded.document.worldSourceHash,digest(world));
    assert.deepEqual(upgraded.document.state.player,before.state.player);
    assert.deepEqual(upgraded.document.state.inventory,before.state.inventory);
    assert.deepEqual(upgraded.document.state.npcs,before.state.npcs);
    assert.deepEqual(upgraded.document.state.relationEvidence,before.state.relationEvidence);
    assert.deepEqual(upgraded.document.memories,before.memories);
    const exported=await current.api('export',{campaignId}),updates=exported.events.filter(row=>row.input?.type==='world_upgrade');
    assert.equal(updates.length,1);assert.equal(updates[0].input.worldHash,digest(world));assert.equal(updates[0].result.added.length,0);
    assert.ok(exported.worlds[before.worldHash]);assert.ok(exported.worlds[upgraded.document.worldHash]);
    assert.deepEqual(await old.api('export',{campaignId:old.campaignId}),originalBundle,'旧源副本不可被导入目标修改');
    const backupFiles=await fs.readdir(path.join(current.root,'infinite-fields',campaignId));
    assert.ok(backupFiles.some(name=>name.startsWith('before-world-update-')));
    const scenario=await script('world_upgrade');assert.equal(scenario.initial.requiresSession,true);
    const client=scriptedClient(input=>{
        if(input.includes('再向林穗买'))return[['world_trade',{seller:'林穗',item:'面包',quantity:1}]];
        if(input==='我走回河湾村口。')return[['world_move',{destination:'河湾村'}]];
        if(input==='我沿原路回青灯酒馆。')return[['world_move',{destination:'青灯酒馆'}]];
        return[];
    });
    const result=await runPlaytest({scenario,api:current.api,client,bundle:await loadPromptBundle(),session:{campaignId,chat:[],history:[]}});
    assert.equal(result.pass,true,failures(result));
    assert.deepEqual(result.finalDocument.memories,before.memories);
    assert.deepEqual(result.finalDocument.state.npcs.npc_hw_linsui.relationships,before.state.npcs.npc_hw_linsui.relationships);
    const finalBundle=await current.api('export',{campaignId});assert.equal(finalBundle.events.filter(row=>row.input?.type==='world_upgrade').length,1);
    const restored=await current.api('import',{bundle:finalBundle});assert.deepEqual(restored.document,result.finalDocument);
    const reread=await current.api('read',{campaignId:restored.reference.campaignId});assert.deepEqual(reread.document,result.finalDocument);
    assert.equal(reread.reference.sequence,restored.reference.sequence,'再次读取不得重复升级');
    t.diagnostic('旧版本是当前正式世界的前版版本标记合成副本，无新增人口；真实HTTP升级及8轮脚本前置通过不代表模型M9已通过。world_upgrade场景需预建session，现有批量CLI不提供此夹具。');
});

