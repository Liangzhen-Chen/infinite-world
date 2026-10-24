import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,canonical} from '../server-plugin/storage.mjs';
import {advanceRegistry,registerAdvance} from '../server-plugin/advance-registry.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const hash=value=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
// Each step: [tool,args]. The full trace (state + patches + messages per step) is hashed.
async function trace({quiet=false,seed='advance-registry',steps,historical=false}){
 const w=structuredClone(world);if(quiet)for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const engine=new WorldEngine(w);let doc=engine.createCharacter(legacy,{},seed);const out=[];
 for(const [i,[tool,args]]of steps.entries()){
  const versions={laborMarketVersion:1,medicineVersion:1,educationVersion:1,npcCrimeVersion:1,legalProcedureVersion:1,worldEventVersion:1,npcIntelligenceVersion:1,factionClockVersion:1,questSourcesVersion:1,tribalAwakeningVersion:1,militaryVersion:1,warVersion:1,villageWildlifeVersion:1,sovereigntyVersion:1,wildlifeEncounterVersion:1};
  const r=await engine.reduce(doc,{tool,args,eventId:`step_${i}`},historical?{replay:true,result:versions}:{});doc=applyPatches(doc,r.patches);
  // S1a: the books (document.ledger, a sibling of state) are checked by tests/ledger-reconcile.test.mjs;
  // the golden hashes cover the game state and its patches, which the ledger must leave unchanged.
  // S2a: likewise the holding store (document.holdings), checked by tests/holdings-reconcile.test.mjs.
  out.push(hash({state:doc.state,patches:r.patches.filter(p=>p.path[0]!=='ledger'&&p.path[0]!=='holdings'),messages:r.messages}));
 }
 return out;
}
const days=n=>Array.from({length:n},()=>['world_time',{minutes:DAY}]);
test('unrelated ticks skip midnight clocks and retain undeclared legacy work',async()=>{
 const counts={daily:0,shop_restock:0,legacy:0};
 const originals=new Map(['daily','shop_restock'].map(id=>{const s=advanceRegistry.find(s=>s.id===id);return[s,s.advance];}));
 for(const [s,advance]of originals)s.advance=(...args)=>{counts[s.id]++;return advance(...args);};
 const unregister=registerAdvance({id:'r38_legacy_probe',order:1e9,nextMinute:(e,d,now)=>now+1,advance:()=>counts.legacy++});
 try{
  const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'r38-clocks');
  await engine.reduce(doc,{tool:'world_time',args:{minutes:3},eventId:'r38-clock'});
  assert.deepEqual(counts,{daily:0,shop_restock:0,legacy:3});
 }finally{unregister();for(const [s,advance]of originals)s.advance=advance;}
});
// Golden hashes: first recorded from the hand-written advance() before the registry refactor (K7, equivalence verified at merge).
// They are now a regression snapshot; after an intended behaviour change regenerate with UPDATE_ADVANCE_GOLDEN=1.
// A3 content refresh: 10 §10.5 permits per-stage regeneration. PLAN records the
// new examiners, actual travel and resulting occupancy wear; historical service
// versions still use their own complete state + patches + messages fixture.
// S4 refresh: the initial calendar and institution offices change the full
// state and holding-transition event IDs. Both service-version fixtures are
// regenerated; deterministic traces and complete hashes remain mandatory.
const GOLDEN=JSON.parse(await fs.readFile(new URL('./fixtures/advance-registry-golden.json',import.meta.url),'utf8'));
const HISTORICAL=JSON.parse(await fs.readFile(new URL('./fixtures/advance-registry-pre-s3-services.json',import.meta.url),'utf8'));
const SCENARIOS={
 full:{steps:[...days(3),['world_time',{minutes:17*60+13}],['world_time',{minutes:5*DAY}]]},
 quiet:{quiet:true,seed:'advance-quiet',steps:[...days(2),['world_time',{minutes:14*DAY}],['world_time',{minutes:37}]]},
};
for(const [name,scenario]of Object.entries(SCENARIOS))test(`对照：${name}存档推进结果可重放且与快照逐字节相同`,async()=>{
 const got=await trace(scenario);assert.deepEqual(await trace(scenario),got);
 if(process.env.UPDATE_ADVANCE_GOLDEN){GOLDEN[name]=got;await fs.writeFile(new URL('./fixtures/advance-registry-golden.json',import.meta.url),JSON.stringify(GOLDEN,null,1)+'\n');return;}
 assert.deepEqual(got,GOLDEN[name]);
});
for(const [name,scenario]of Object.entries(SCENARIOS))test(`历史服务回执：${name}仍逐字节回放S3之前的推进`,async()=>{
 const got=await trace({...scenario,historical:true});
 // Same per-stage regeneration rule as the golden (10 §10.5): the complete state hash moves with any world/engine content change.
 if(process.env.UPDATE_ADVANCE_GOLDEN){HISTORICAL[name]=got;await fs.writeFile(new URL('./fixtures/advance-registry-pre-s3-services.json',import.meta.url),JSON.stringify(HISTORICAL,null,1)+'\n');return;}
 assert.deepEqual(got,HISTORICAL[name]);
});
test('注册表按order排序、编号唯一，并覆盖原有推进系统',()=>{
 const orders=advanceRegistry.map(s=>s.order),ids=advanceRegistry.map(s=>s.id);
 assert.deepEqual(orders,[...orders].sort((a,b)=>a-b));assert.equal(new Set(ids).size,ids.length);
 for(const id of ['npc_obligations','contracts','summons','law','daily','agriculture_expiry','settlement_trade','npc_cognition','npc_autonomy','npc_life','world_clock','faction_clock','society_news','festival','magic_area','wildlife_encounter'])assert.ok(ids.includes(id),id);
});
test('新注册的系统会参与下一事件时刻计算并按order推进',async()=>{
 const calls=[];
 const unregister=registerAdvance({id:'test_probe',order:1e9,
  active:()=>true,
  nextMinute:(engine,d,now)=>Math.floor(now/600)*600+600,
  advance:(engine,d,{before,after})=>calls.push([before,after,d.get('state','minute')])});
 try{
  assert.equal(advanceRegistry.at(-1).id,'test_probe');
  const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
  const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'advance-probe'),start=doc.state.minute;
  await engine.reduce(doc,{tool:'world_time',args:{minutes:1500},eventId:'probe'});
  assert.ok(calls.length>=3,'一次长时间推进被新系统切成多段');
  assert.equal(calls[0][0],start);assert.equal(calls.at(-1)[1],start+1500);
  for(const [i,[before,after,minute]]of calls.entries()){
   assert.equal(minute,after);if(i)assert.equal(before,calls[i-1][1]);
   assert.ok(after%600===0||after===start+1500||after%DAY===0,`${after}落在事件边界`);
  }
 }finally{unregister();}
 assert.ok(!advanceRegistry.some(s=>s.id==='test_probe'));
});
