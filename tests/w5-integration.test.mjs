import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {init} from '../server-plugin/index.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {compatibleWorld} from '../server-plugin/world-upgrade.mjs';

async function api(t,root,world){
 const app=express();app.use(express.json());const router=express.Router();await init(router,{baseRoot:root,world});app.use(router);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 return async(endpoint,body)=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();assert.equal(response.status,200,result.error);return result;
 };
}
test('W5正式内容经world_upgrade进入旧战役检索，保持钱袋与NPC个人记忆',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'w5-upgrade-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const published=await loadWorld();assert.equal(published.cultures.length,10);assert.equal(published.deities.length,12);
 const original=structuredClone(published);delete original.cultures;delete original.deities;
 const beforeApi=await api(t,root,original),created=await beforeApi('/create',{}),campaignId=created.reference.campaignId;
 const before=await beforeApi('/read',{campaignId});
 assert.equal((await beforeApi('/search',{campaignId,query:'葭界'})).results.some(row=>row.id==='lore_deity_bank'),false);
 const afterApi=await api(t,root,published),after=await afterApi('/read',{campaignId});
 assert.deepEqual(after.document.state.player,before.document.state.player);
 assert.deepEqual(after.document.memories,before.document.memories);
 const oldActors=before.document.state.npcs;assert.equal(Object.keys(oldActors).length,18);
 for(const [id,actor]of Object.entries(oldActors))assert.deepEqual(after.document.state.npcs[id],actor,id);
 // 五村批次与白石镇升档后正式目录为251个full，旧战役18人；新增数按正式目录核对而不写死。
 const added=published.npcs.filter(row=>!Object.hasOwn(oldActors,row.id));assert.equal(added.length,published.npcs.length-18);assert.ok(added.length>0);
 assert.deepEqual(Object.keys(after.document.state.npcs).sort(),published.npcs.map(row=>row.id).sort());
 for(const row of added)assert.deepEqual(after.document.state.npcs[row.id],{id:row.id,name:row.name,location:row.location,coins:row.coins??0,inventory:row.inventory??{},trust:row.trust??0,affection:row.affection??0,developments:[],relationships:{}},row.id);
 for(const row of [...published.residents,...published.factionPeople])assert.equal(after.document.state.npcs[row.id],undefined,row.id);
 const faith=await afterApi('/search',{campaignId,query:'葭界 阵界'});
 assert.ok(faith.results.some(row=>row.id==='lore_deity_bank'&&row.text.includes('不能凭符纸创造河水')));
 const culture=await afterApi('/search',{campaignId,query:'镜沼篆汀人'});
 assert.ok(culture.results.some(row=>row.id==='lore_culture_reed'&&row.text.includes('符袋')));
 const repeat=await afterApi('/read',{campaignId});assert.equal(repeat.reference.sequence,after.reference.sequence);
 const bundle=await afterApi('/export',{campaignId});
 assert.ok(Object.values(bundle.worlds).some(world=>world.deities?.some(row=>row.id==='deity_bank')));
 const retained=compatibleWorld(published,original);
 assert.equal(retained.world.cultures.length,10);assert.equal(retained.world.deities.length,12);
 assert.ok(retained.retained.some(row=>row.id==='deity_bank'));
});
