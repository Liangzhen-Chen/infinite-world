import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once}from'node:events';
import express from 'express';
import {init}from'../server-plugin/index.mjs';
import {loadWorld}from'../tools/load-world.mjs';
test('服务器 API：创建、执行、幂等、拒绝瞬移、检索与路径边界',async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'infinite-fields-http-'));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json({limit:'500mb'}));const router=express.Router();await init(router,{baseRoot:root});app.use(router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    const request=async(endpoint,body)=>{
        const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return {status:response.status,body:await response.json()};
    };
    const created=await request('/create',{name:'测试旅人'});assert.equal(created.status,200);
    const campaignId=created.body.reference.campaignId;
    const moved=await request('/execute',{campaignId,tool:'world_move',args:{destination:'河湾村'},eventId:'walk'});assert.equal(moved.status,200);
    assert.equal((await request('/execute',{campaignId,tool:'world_move',args:{destination:'河湾村'},eventId:'walk'})).body.duplicate,true);
    assert.equal((await request('/execute',{campaignId,tool:'world_turn',args:{startMinute:540,location:'王都'},eventId:'fake'})).status,400);
    const scene=await request('/scene',{campaignId,query:'老板娘'});assert.ok(scene.body.scene.includes('测试旅人'));
    const searched=await request('/search',{campaignId,query:'蓝色短笛',chat:[{is_user:true,mes:'我找回了蓝色短笛。'}]});assert.equal(searched.body.results[0].source,'原始对话');
    assert.equal((await request('/read',{campaignId:'../bad'})).status,400);
    const read=await request('/read',{campaignId});assert.equal(read.body.document.state.player.coins,180);
    const exported=await request('/export',{campaignId});assert.ok(Object.keys(exported.body.worlds).length);
    const imported=await request('/import',{bundle:exported.body});assert.equal(imported.status,200);assert.deepEqual(imported.body.document,read.body.document);
    assert.equal((await request('/execute',{campaignId,tool:'world_health',args:{delta:999},eventId:'heal'})).status,400);
});

async function serverFixture(t,{baseRoot=null,world=null,userRoots=null}={}){
    const app=express();app.use(express.json({limit:'500mb'}));
    if(userRoots)app.use((req,_res,next)=>{const root=userRoots[req.headers['test-user']??'a'];req.user={directories:{root,chats:path.join(root,'chats')}};next();});
    const router=express.Router();await init(router,{baseRoot,world});app.use(router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
    return async(endpoint,body={},user='a')=>{
        const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','test-user':user},body:JSON.stringify(body)});
        return {status:response.status,body:await response.json()};
    };
}

test('服务器角色创建校验属性与开放出生地，不允许请求指定幸运或等级',async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'infinite-fields-character-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const request=await serverFixture(t,{baseRoot:root});
    const created=await request('/create',{character:{name:'创建旅人',gender:'女',appearance:'左手戴旧皮手套。'}});
    assert.equal(created.status,200,created.body.error);assert.equal(created.body.document.state.player.level,0);
    assert.equal(created.body.document.state.location,'loc_hw');assert.equal(created.body.document.state.player.gender,'女');
    assert.equal(created.body.document.privateState,undefined);
    const exported=(await request('/export',{campaignId:created.body.reference.campaignId})).body;
    assert.ok(exported.initial.privateState.luck>=1&&exported.initial.privateState.luck<=100);
    assert.deepEqual((await request('/import',{bundle:exported})).body.document,created.body.document);
    assert.equal((await request('/read',{campaignId:created.body.reference.campaignId})).body.document.privateState,undefined);
    assert.equal((await request('/create',{character:{level:200}})).status,400);
    assert.equal((await request('/create',{character:{birthplace:'王都'}})).status,400);
    assert.equal((await request('/create',{character:{attributes:{力量:99}}})).status,400);
    assert.equal((await request('/execute',{campaignId:created.body.reference.campaignId,tool:'world_experience',args:{amount:10000},eventId:'inject-xp'})).status,400);
});

test('服务器：两个用户的存档、原文索引和导出互相隔离，同分钟记忆更新可检索',async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'infinite-fields-users-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const request=await serverFixture(t,{userRoots:{a:path.join(root,'a'),b:path.join(root,'b')}});
    const a=(await request('/create',{})).body.reference.campaignId,b=(await request('/create',{},'b')).body.reference.campaignId;
    assert.equal((await request('/read',{campaignId:a},'b')).status,404);
    assert.equal((await request('/export',{campaignId:a},'b')).status,404);
    assert.equal((await request('/execute',{campaignId:a,eventId:'intruder',tool:'world_time',args:{minutes:50}},'b')).status,404);
    await request('/sync-index',{campaignId:a,start:0,total:1,messages:[{mes:'紫色短笛藏在屋顶'}]});
    assert.deepEqual((await request('/search',{campaignId:b,query:'紫色短笛'},'b')).body.results,[]);
    for(const [id,content]of [['one','林穗喜欢紫色短笛'],['two','林穗喜欢黄色风筝']]){
        assert.equal((await request('/execute',{campaignId:a,eventId:id,tool:'world_remember',args:{subject:'林穗',key:'喜好',content}})).status,200);
    }
    const refreshed=(await request('/search',{campaignId:a,query:'黄色风筝'})).body.results;
    assert.ok(refreshed.some(row=>row.text==='林穗喜欢黄色风筝'));
    assert.equal((await request('/read',{campaignId:a})).body.document.state.minute,540);
    const person=await request('/execute',{campaignId:a,eventId:'new-person',tool:'world_create',args:{type:'npc',name:'索引试客',data:{age:28,occupation:'船夫',notes:'一位会吹竖笛的船夫'}}});
    assert.equal(person.status,200,person.body.error);
    const fact=await request('/execute',{campaignId:a,eventId:'new-fact',tool:'world_remember',args:{subject:'索引试客',key:'工作',content:'索引试客明早去修码头'}});
    assert.equal(fact.status,200,fact.body.error);
    assert.ok((await request('/search',{campaignId:a,query:'索引试客'})).body.results.some(row=>row.text.includes('明早去修码头')));
});

test('世界自动迁移：保留已改变的居民资金，加入新居民，重放与便携回退一致',async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'infinite-fields-upgrade-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const original=await loadWorld(),oldApi=await serverFixture(t,{baseRoot:root,world:original});
    const created=(await oldApi('/create',{})).body,campaignId=created.reference.campaignId;
    await oldApi('/execute',{campaignId,tool:'world_trade',args:{seller:'林穗',service:'住宿'},eventId:'rent',anchor:'a'});
    const updated=structuredClone(original);updated.version='edition-3';updated.rules.version=updated.version;
    updated.skills[0].description='仅新版目录具有的技能说明';
    updated.npcs[0].coins=500;updated.npcs[0].notes+='她现在把客房窗户修好了。';
    updated.npcs[1].coins=220;
    updated.npcs.push({...structuredClone(updated.npcs[0]),id:'npc_hw_new_test',name:'米菱',aliases:[],coins:125});
    const newApi=await serverFixture(t,{baseRoot:root,world:updated});
    const previousCatalog=await newApi('/catalog',{campaignId,entity:original.skills[0].id,kind:'skill'});
    assert.equal(previousCatalog.status,200,previousCatalog.body.error);
    assert.equal(previousCatalog.body.description,original.skills[0].description);
    const upgraded=(await newApi('/read',{campaignId})).body;
    const currentCatalog=await newApi('/catalog',{campaignId,entity:original.skills[0].id,kind:'skill'});
    assert.equal(currentCatalog.status,200,currentCatalog.body.error);
    assert.equal(currentCatalog.body.description,updated.skills[0].description);
    assert.equal(upgraded.document.state.npcs.npc_hw_linsui.coins,456);
    assert.equal(upgraded.document.state.npcs.npc_hw_ayan.coins,220);
    assert.equal(upgraded.document.state.npcs.npc_hw_new_test.coins,125);
    const note=Object.values(upgraded.document.state.records).find(row=>row.category==='world_update');
    assert.equal(note.conflicts.length,1);assert.deepEqual(note.added,['npc_hw_new_test']);
    assert.equal((await newApi('/read',{campaignId})).body.reference.sequence,upgraded.reference.sequence);
    const exported=(await newApi('/export',{campaignId})).body;
    assert.deepEqual((await newApi('/import',{bundle:exported})).body.document,upgraded.document);
    const backupName=(await fs.readdir(path.join(root,'infinite-fields',campaignId))).find(name=>name.startsWith('before-world-update-'));
    const backup=JSON.parse(await fs.readFile(path.join(root,'infinite-fields',campaignId,backupName),'utf8'));
    const restored=(await oldApi('/import',{bundle:backup})).body;
    assert.equal(restored.worldVersion,original.version);assert.equal(restored.document.state.player.coins,174);
    // Removing the earlier rent recomputes whether the starting money was touched.
    const reconciled=(await newApi('/reconcile',{campaignId,validAnchors:[]})).body;
    assert.equal(reconciled.document.state.npcs.npc_hw_linsui.coins,500);
    assert.equal(reconciled.document.state.player.coins,180);
    const restarted=await serverFixture(t,{baseRoot:root,world:updated});
    assert.deepEqual((await restarted('/read',{campaignId})).body.document,reconciled.document);
});
