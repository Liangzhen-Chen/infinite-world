import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {batchContext,l1,approved,counts} from '../tools/w5-rumors.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';
import {npcRumors,npcRumorSeeds} from '../server-plugin/npc-rumors.mjs';
import {shareNpcMemory,advanceNpcCognition} from '../server-plugin/npc-cognition.mjs';
import {advanceNpcSchedules} from '../server-plugin/npc-schedule.mjs';
import {planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function draft(document){return{document,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);}};}
async function run(engine,doc,tool,args,eventId){const r=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,r.patches),result:r.result};}
export function checkBatch(n){
 test(`T${116+n}: 本批ID完整发布、L1/L2/L4有效、真伪与旧内容去重`,async()=>{
  assert.deepEqual((await l1(n)).errors,[]);const b=await approved(n);assert.equal(b.rows.length,counts[n-1]);
  for(const truth of ['true','half','false'])assert.ok(b.rows.some(r=>r.truth===truth));
  for(const row of b.rows)assert.deepEqual(b.world.rumors.find(r=>r.id===row.id),row);
  if(n===6){const all=[...b.world.rumors,...b.world.settlementProfiles.flatMap(p=>p.details?.rumors??[])];assert.ok(new Set(all.map(r=>r.claim)).size>=300);}
 });
 test(`T${116+n}: 每条经登记关系沿真实道路携信，再由玩家实际移动交谈取得`,async()=>{
  const b=await batchContext(n),engine=new WorldEngine(b.world),initial=engine.createCharacter(seed,{},`rumors-${n}`),unchanged=digest(b.world);
  for(const r of b.rows){
   assert.ok(npcRumors(engine,r.source,initial).some(x=>x.id===r.id));assert.ok(!npcRumors(engine,r.delivery.to,initial).some(x=>x.id===r.id));
   assert.ok(!JSON.stringify(initial.memories).includes(r.claim));
   const d=draft(initial),memory=npcRumorSeeds(engine,r.source).find(m=>m.rumor===r.id),before=d.get('state','minute');
   const trip=shareNpcMemory(d,engine,{from:r.source,to:r.delivery.to,memoryId:memory.id,channel:r.delivery.channel,eventId:`send_${r.id}`});
   const message=d.get('state','npcCognition','messages',trip.messageId);assert.ok(message.routeEdges.length>0,r.id);
   for(const id of message.routeEdges)assert.ok(b.world.routes.some(route=>route.id===id),`${r.id}/${id}`);
   assert.ok(!npcRumors(engine,r.delivery.to,d.document).some(x=>x.id===r.id));
   advanceNpcSchedules(d,engine,before,message.arrive);d.set(['state','minute'],message.arrive);advanceNpcCognition(d,engine,before,message.arrive,`arrive_${r.id}`);
   assert.equal(d.get('state','npcCognition','messages',trip.messageId,'status'),'已交付',r.id);
   const received=npcRumors(engine,r.delivery.to,d.document).find(x=>x.id===r.id);assert.ok(received,r.id);assert.ok(!JSON.stringify(received).includes(r.fact));
   const moved=await run(engine,d.document,'world_move',{destination:d.get('state','npcs',r.delivery.to,'location')},`move_${r.id}`);
   assert.equal(moved.document.state.location,moved.document.state.npcs[r.delivery.to].location,r.id);
   const scene=engine.scene(moved.document,received.claim);assert.ok(!scene.includes(r.fact),r.id);
   const args={subject:'player',key:r.id,rumor:r.id,source:r.delivery.to,content:received.claim};
   await assert.rejects(run(engine,moved.document,'world_remember',{...args,content:r.fact},`fact_${r.id}`),/登记claim|真相|改写/);
   const heard=await run(engine,moved.document,'world_remember',args,`hear_${r.id}`),m=Object.values(heard.document.memories).find(x=>x.rumor===r.id);
   assert.ok(m?.content.includes(received.claim),r.id);assert.equal(m.source,r.delivery.to);assert.equal(m.rootMemoryId,memory.rootMemoryId);assert.equal(m.transmissionChain.at(-2).channel,'carry');assert.equal(m.transmissionChain.at(-1).to,'player');assert.ok(!JSON.stringify(heard.result).includes(r.fact));
  }
  assert.equal(digest(b.world),unchanged);
 });
 test(`T${116+n}: world_upgrade保留战役变化并开放本批传闻，重复升级不发知识`,async()=>{
  const b=await batchContext(n),ids=new Set(b.rows.map(r=>r.id)),old={...b.world,rumors:(b.world.rumors??[]).filter(r=>!ids.has(r.id))},oldEngine=new WorldEngine(old),document=oldEngine.createCharacter(seed,{},`before-${n}`);
  document.state.player.coins=4321;document.state.records.rumor_marker={value:7};document.memories.rumor_note={subject:'player',key:'rumor_note',content:'自己记下的原话'};
  const upgrade=planWorldUpgrade(document,old,b.world,{worldHash:digest(b.world),eventId:`upgrade-${n}`}),next=applyPatches(document,upgrade.patches),engine=new WorldEngine(b.world);
  assert.equal(next.state.player.coins,4321);assert.deepEqual(next.state.records.rumor_marker,document.state.records.rumor_marker);assert.deepEqual(next.memories,document.memories);
  for(const r of b.rows){assert.ok(!npcRumors(oldEngine,r.source,document).some(x=>x.id===r.id));assert.ok(npcRumors(engine,r.source,next).some(x=>x.id===r.id));assert.ok(!npcRumors(engine,r.delivery.to,next).some(x=>x.id===r.id));}
  const repeat=planWorldUpgrade(next,b.world,b.world,{worldHash:digest(b.world),eventId:`repeat-${n}`});assert.deepEqual(applyPatches(next,repeat.patches).memories,next.memories);
 });
}
