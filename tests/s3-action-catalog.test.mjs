import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {world} from './helpers/finance.mjs';
import {init} from '../server-plugin/index.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {actionCall,loadActionRegistry} from '../server-plugin/action-registry.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';

const registry=loadActionRegistry();
const operations=['settle','close','file_claim','receive_collection','resume_estate'];

test('义务扩展只在动作目录声明，静态工具保留原信息',()=>{
 const tools=new Map(toolDefinitions().map(d=>[d.function.name,d.function]));
 const promise=tools.get('world_promise').parameters.properties;
 assert.ok(operations.every(op=>!promise.operation.enum.includes(op)));
 assert.ok(!('estate' in promise));
 assert.ok(!('liability' in tools.get('world_trade').parameters.properties));
 const settlement=tools.get('world_settlement').parameters.properties;
 assert.ok(!settlement.operation.enum.includes('medicine_cancel'));
 assert.ok(!('contract' in settlement));
 assert.match(tools.get('world_quest').description,/NPC按世界钟履约/);
 assert.match(tools.get('world_field').parameters.properties.quantity.description,/采集份数/);
 assert.notEqual(fs.readFileSync('extension/tools.mjs','utf8').charCodeAt(0),0xfeff);
 for(const op of operations){
  const a=registry.byId.get(`core:promise.${op}`);
  assert.equal(a.source,'catalog');assert.equal(a.consent.from,'self');assert.ok(a.hint&&a.preconditions.length);
  assert.throws(()=>actionCall(registry,a.id,{}),/还缺/);
 }
 const investment=actionCall(registry,'trade.invest_liability',{seller:'npc_hw_linsui',quantity:10,liability:'unlimited',consent:true});
 assert.equal(investment.args.operation,'invest');assert.equal(investment.args.liability,'unlimited');
 assert.throws(()=>actionCall(registry,'promise.settle',{obligation:'x',actor:'npc_hw_linsui'}),/没有这些槽位/);
});

test('world_actions 可发现全部义务扩展，world_act 清偿一次并保留幂等和账本守恒',async t=>{
 const root=fs.mkdtempSync(path.join(tmpRoot(),'s3-action-catalog-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const app=express();app.use(express.json({limit:'50mb'}));const router=express.Router();
 await init(router,{baseRoot:root,world,npcPlanningEnabled:false});app.use(router);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const request=async(endpoint,body)=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
 };
 const {reference:{campaignId}}=await request('/create',{name:'清偿旅人'});
 for(const id of [...operations.map(op=>`core:promise.${op}`),'core:settlement.medicine_cancel','core:trade.invest_liability']){
  const listed=await request('/actions',{campaignId,query:id});
  const row=listed.actions.find(a=>a.id===id);assert.ok(row,id);assert.ok(row.hint&&row.slots.some(s=>s.required),id);
 }
 const promised=await request('/execute',{campaignId,tool:'world_promise',args:{promisor:'player',promisee:'npc_hw_linsui',type:'付款',coins:10,content:'归还十文'},eventId:'catalog-promise'});
 const obligation=promised.result.obligation.id;
 const before=await request('/export',{campaignId});
 const call={campaignId,tool:'world_act',args:{action:'promise.settle',slots:{obligation,coins:10}},eventId:'catalog-settle'};
 const paid=await request('/execute',call);assert.equal(paid.result.transferred,10);assert.equal(paid.result.remaining,0);
 assert.equal((await request('/execute',call)).duplicate,true);
 const after=await request('/export',{campaignId});
 assert.equal(after.events.length,before.events.length+1);
 const event=after.events.find(e=>e.id==='catalog-settle');
 assert.deepEqual(event.input.args,{obligation,coins:10,operation:'settle'});
 assert.equal(event.input.tool,'world_promise');
 const document=bundle=>bundle.events.reduce((doc,event)=>applyPatches(doc,event.patches),bundle.initial);
 const old=document(before),doc=document(after);
 assert.equal(doc.state.player.coins,old.state.player.coins-10);
 assert.equal(doc.state.npcs.npc_hw_linsui.coins,old.state.npcs.npc_hw_linsui.coins+10);
 assert.equal(doc.state.obligations[obligation].paid,10);
 assert.deepEqual(auditLedger(doc.ledger),[]);
});
