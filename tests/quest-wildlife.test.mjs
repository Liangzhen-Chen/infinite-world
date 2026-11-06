import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {planRuleStateMigration}from'../server-plugin/rule-state-migration.mjs';
import {questGenerators,validateQuestSources}from'../server-plugin/quest-sources.mjs';
import {advanceQuestBoard}from'../server-plugin/quest-board.mjs';
import {recordWildlifeDeath}from'../server-plugin/wildlife.mjs';
import {compatibleWorld,planWorldUpgrade}from'../server-plugin/world-upgrade.mjs';
import {applyBatch,offers,localFacts}from'../world/design/t155-village-wildlife.mjs';
import {toolDefinitions}from'../extension/tools.mjs';
import {questPublisher}from'../server-plugin/entity-view.mjs';
const formal=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,scan=questGenerators().find(g=>g.id==='village_wildlife').scan;
const writer=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc),set:(p,value)=>{let n=doc;for(const k of p.slice(0,-1))n=n[k]??={};n[p.at(-1)]=structuredClone(value);},say:()=>{}});
function setup(){
 const w=applyBatch(formal);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(w),fresh=engine.createCharacter(seed,{},'t155'),doc=applyPatches(fresh,planRuleStateMigration(fresh,w.rules));doc.state.minute=540;
 w.rules.questSources.npcNeeds=[];w.rules.questSources.events=[];w.rules.questSources.limits.perDay=20;
 for(const id of Object.keys(w.rules.questSources.publishers))if(doc.state.settlements[id])doc.state.settlements[id].treasury=12000;
 const run=async(tool,args,eventId)=>{const r=await engine.reduce(doc,{tool,args,eventId});const updated=applyPatches(doc,r.patches);Object.assign(doc,updated);return r.result;};
 // A1：引擎在自己的世界副本上工作；夹具的世界改指引擎世界（断言不动）
 return {w:engine.world,engine,doc,run};
}
function creatures(s){
 s.doc.state.creatures??={};
 for(const [i,row] of offers.filter(r=>r.objective.type==='creature').entries()){
  const o=row.objective,id=`monster_t155_${i}`,h=s.w.rules.wildlife.habitats.find(h=>h.location===o.location);
  const species=s.engine.byId.get(o.species);s.doc.state.created[id]={id,name:`指定个体${i}`,monster:o.species,template:species.template,scope:o.location};
  s.doc.state.creatures[id]={id,name:`指定个体${i}`,species:o.species,ecology:h.id,location:o.location,level:1,hp:1,maxHp:1,status:'正常',owner:null};
 }
}
const qs=s=>Object.values(s.doc.state.quests).filter(q=>q.source?.generator==='village_wildlife');
const qFor=(s,id)=>qs(s).find(q=>q.source.cause===id);
const qty=(bag,id)=>typeof bag[id]==='number'?bag[id]:bag[id]?.quantity??0;
test('正式发布逐本批ID保留八条目标与两条地方说明，L1/L2/L4定稿仍能复核',async()=>{
 assert.deepEqual(formal.rules.questSources.wildlife,offers);
 for(const row of localFacts)assert.ok(formal.settlementProfiles.find(p=>p.id===row.board).facts.includes(row.text),row.id);
 const {publish}=await import('../tools/t155-wildlife-content.mjs');const p=await publish();
 assert.equal(p.release,true);assert.equal(p.published,false);assert.deepEqual(p.offers,offers.map(o=>o.id));
});
test('本批八单及两条说明覆盖六处，登记生成器共享托管且不造生物、不接管种族敌意',()=>{
 const s=setup();assert.equal(offers.length,8);assert.equal(localFacts.length,2);assert.equal(new Set(offers.map(r=>r.board)).size,6);
 assert.deepEqual(validateQuestSources(s.w),[]);assert.equal(toolDefinitions().length,27);
 const before=structuredClone(s.doc.state.creatures);scan(writer(s.doc),s.engine,s.doc.state.minute);
 assert.deepEqual(s.doc.state.creatures,before);assert.equal(qs(s).filter(q=>q.objective.type==='creature').length,0);
 creatures(s);const treasuries=Object.fromEntries(Object.entries(s.doc.state.settlements).map(([id,a])=>[id,a.treasury]));
 const actors=structuredClone(s.doc.state.creatures);scan(writer(s.doc),s.engine,s.doc.state.minute);
 assert.equal(qs(s).length,8);assert.deepEqual(s.doc.state.creatures,actors);
 for(const [board,before] of Object.entries(treasuries))assert.equal(s.doc.state.settlements[board].treasury,before-qs(s).filter(q=>q.location===board&&q.objective.type==='creature').reduce((n,q)=>n+q.escrow,0));
 for(const q of qs(s)){assert.equal(q.escrow,60);assert.equal(q.fundedBy.treasury,q.location);assert.equal(q.publisher,questPublisher(s.engine,s.doc.state,q.location).value);}
 scan(writer(s.doc),s.engine,s.doc.state.minute+DAY);assert.equal(qs(s).length,8);
});
test('指定目标死亡：到访、另一个体死亡及只改状态不能领酬，实际交锋后一次支付',async()=>{
 const s=setup();creatures(s);scan(writer(s.doc),s.engine,s.doc.state.minute);let q=qFor(s,'t155_hw_tower');
 s.doc.state.location=q.location;await s.run('world_quest',{operation:'accept',quest:q.id},'take');
 s.doc.state.discoveries[q.objective.location]={minute:s.doc.state.minute};
 await assert.rejects(s.run('world_quest',{operation:'complete',quest:q.id},'visit'),/证据/);
 const a=s.doc.state.creatures[q.objective.target];a.hp=0;a.status='死亡';
 await assert.rejects(s.run('world_quest',{operation:'complete',quest:q.id},'state-only'),/证据/);a.hp=1;a.status='正常';
 const other='monster_t155_other';s.doc.state.creatures[other]={...a,status:'死亡',hp:0};recordWildlifeDeath(writer(s.doc),s.engine,other,'wrong-target');
 await assert.rejects(s.run('world_quest',{operation:'complete',quest:q.id},'wrong'),/证据/);
 s.doc.state.location=q.objective.location;Object.assign(s.doc.state.player,{level:100,hp:10000,maxHp:10000});
 for(let i=0;i<30&&s.doc.state.creatures[q.objective.target].hp>0;i++)await s.run('world_combat',{target:q.objective.target,intent:'attack'},`hit-${i}`);
 assert.equal(s.doc.state.creatures[q.objective.target].status,'死亡');
 const coins=s.doc.state.player.coins,treasury=s.doc.state.settlements[q.location].treasury;
 const result=await s.run('world_quest',{operation:'complete',quest:q.id},'paid');assert.equal(result.reward,60);
 assert.equal(s.doc.state.player.coins,coins+60);assert.equal(s.doc.state.settlements[q.location].treasury,treasury);
 await assert.rejects(s.run('world_quest',{operation:'complete',quest:q.id},'twice'),/可结算/);assert.equal(s.doc.state.player.coins,coins+60);
});
test('避让与供物、换铁读首领实际立约和库存，不够物资或无效盟约均不能交割',async()=>{
 for(const id of ['t155_hw_avoid','t155_yp_offering','t155_lq_trade']){
  const s=setup();scan(writer(s.doc),s.engine,s.doc.state.minute);const q=qFor(s,id),o=q.objective,b=s.w.bosses.find(b=>b.actor===o.target);
  await s.run('world_quest',{operation:'accept',quest:q.id},`take-${id}`);
  await assert.rejects(s.run('world_quest',{operation:'complete',quest:q.id},'no-pact'),/证据/);
  s.doc.state.location=o.location;Object.assign(s.doc.state.npcs[o.target],{location:o.location,status:'正常',activity:'谈判',scheduleTravel:null,cognitionTravel:null});
  const args={operation:'negotiate',lair:b.residence.id,pact:o.pact,offer:structuredClone(o.offer),request:structuredClone(o.request)};
  if(o.request.length){const value=s.engine.byId.get('item_iron').basePrice,price=s.engine.byId.get('item_ration').basePrice;args.offer[0].quantity=Math.max(1,Math.ceil(value/price));}
  s.doc.state.inventory.item_ration={quantity:0};
  if(args.offer.length){const no=await s.run('world_lair',args,'no-food');assert.equal(no.accepted,false);await assert.rejects(s.run('world_quest',{operation:'complete',quest:q.id},'no-stock'),/证据/);}
  s.doc.state.inventory.item_ration={quantity:20,quality:'木',durability:100};
  const held=qty(s.doc.state.npcs[o.target].inventory,'item_ration'),iron=qty(s.doc.state.npcs[o.target].inventory,'item_iron');
  const result=await s.run('world_lair',args,'pact');assert.equal(result.accepted,true);
  assert.equal(s.doc.state.inventory.item_ration.quantity,20-(args.offer[0]?.quantity??0));
  if(args.offer.length)assert.equal(qty(s.doc.state.npcs[o.target].inventory,'item_ration'),held+args.offer[0].quantity);
  if(args.request.length){assert.equal(qty(s.doc.state.npcs[o.target].inventory,'item_iron'),iron-1);assert.equal(s.doc.state.inventory.item_iron.quantity,1);}
  await s.run('world_quest',{operation:'complete',quest:q.id},'finish');assert.equal(s.doc.state.quests[q.id].status,'已完成');
 }
});
test('同分钟接单前的旧盟约不能领奖；NPC只接已有执行器支持的目标',async()=>{
 const s=setup();scan(writer(s.doc),s.engine,s.doc.state.minute);const q=qFor(s,'t155_hw_avoid'),a=s.doc.state.npcs[q.objective.target];
 const terms={pact:'respect_territory',alliance:false,offer:[],request:[]};a.negotiation={format:1,inventory:{},relation:{event:'old',pact:terms.pact,alliance:false},history:[{event:'old',minute:s.doc.state.minute,terms,accepted:true,reason:'守界'}]};
 const reader='npc_hw_linsui';s.doc.state.location=q.location;Object.assign(s.doc.state.npcs[reader],{location:q.location,status:'正常',activity:'工作'});
 await assert.rejects(s.run('world_quest',{operation:'accept',quest:q.id,taker:reader,consent:true},'npc'),/执行.*能力/);
 assert.equal(s.doc.state.quests[q.id].status,'公开');await s.run('world_quest',{operation:'accept',quest:q.id},'take');
 await assert.rejects(s.run('world_quest',{operation:'complete',quest:q.id},'old'),/证据/);
});
test('材料交付沿原实物路径；过期退款返原公账；低于留底不出单',async()=>{
 const s=setup();scan(writer(s.doc),s.engine,s.doc.state.minute);const q=qFor(s,'t155_bs_material');
 s.doc.state.location=q.location;s.doc.state.npcs[q.publisher].location=q.location;s.doc.state.inventory.item_herb={quantity:2};
 const received=qty(s.doc.state.npcs[q.publisher].inventory,'item_herb');await s.run('world_quest',{operation:'accept',quest:q.id},'take');await s.run('world_quest',{operation:'complete',quest:q.id},'deliver');
 assert.equal(s.doc.state.inventory.item_herb?.quantity??0,0);assert.equal(qty(s.doc.state.npcs[q.publisher].inventory,'item_herb'),received+2);
 const unpaid=qs(s).filter(q=>q.status==='公开'),before=Object.fromEntries(Object.entries(s.doc.state.settlements).map(([id,a])=>[id,a.treasury]));
 advanceQuestBoard(writer(s.doc),s.engine,s.doc.state.minute,s.doc.state.minute+11*DAY);
 for(const [id,money] of Object.entries(before))assert.equal(s.doc.state.settlements[id].treasury,money+unpaid.filter(q=>q.location===id).reduce((n,q)=>n+q.escrow,0));
 const poor=setup();for(const a of Object.values(poor.doc.state.settlements))a.treasury=0;creatures(poor);assert.deepEqual(scan(writer(poor.doc),poor.engine,540),[]);
});
test('world_upgrade保留已改钱物与个体终态，新规则进入既有战役并确定性重放任务',()=>{
 const old=structuredClone(formal);delete old.rules.questSources.wildlife;
 const engine=new WorldEngine(old),doc=engine.createCharacter(seed,{},'upgrade');doc.state.player.coins=137;doc.state.inventory.item_herb={quantity:7};
 doc.state.creatures??={};doc.state.creatures.monster_saved={species:'monster_mist_flat_soul',status:'已超度',hp:0,location:null};
 const next=applyBatch(old),c=compatibleWorld(old,next),p=planWorldUpgrade(doc,old,c.world,{worldHash:'t155-upgrade',eventId:'upgrade'}),updated=applyPatches(doc,p.patches);
 assert.equal(updated.state.player.coins,137);assert.deepEqual(updated.state.inventory.item_herb,{quantity:7});assert.deepEqual(updated.state.creatures.monster_saved,doc.state.creatures.monster_saved);
 const upgraded=new WorldEngine(c.world);assert.equal(upgraded.rules.questSources.wildlife.length,8);scan(writer(updated),upgraded,updated.state.minute);assert.ok(Object.values(updated.state.quests).some(q=>q.source?.generator==='village_wildlife'));
 const replayed=structuredClone(updated),replay=new WorldEngine(c.world);replay.replaying=true;replay.replayResult={};
 const live=scan(writer(updated),upgraded,updated.state.minute+DAY);
 assert.deepEqual(scan(writer(replayed),replay,replayed.state.minute+DAY),live);assert.deepEqual(replayed,updated);
});
