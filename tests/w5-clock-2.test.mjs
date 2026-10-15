// T111（B5）：按本批20个W5势力ID与T142三个非人势力（第三批）核对可执行时钟、自动推进、干预与旧档升级。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {assertFactionClockRules,factionClockRules} from '../server-plugin/faction-clock.mjs';
import {planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {batchIds,farIds,REVERSE,LOCKED_REVERSE} from '../world/design/w5-clock-2.mjs';
import {buildBatch} from '../world/design/t142-provinces.mjs';
import {withoutClockBatch} from '../tools/w5-clock-publication.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const faction=id=>world.factions.find(f=>f.id===id),ALL=[...batchIds,...farIds];
function quiet(mutate=()=>{}){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 // Isolate stage costs from D1's separately tested commission escrow.
 w.rules.questSources.commissions=[];mutate(w);
 const engine=new WorldEngine(w);return {w,engine,doc:engine.createCharacter(seed,{},'w5-clock-2')};
}
const run=async(engine,doc,tool,args,eventId)=>applyPatches(doc,(await engine.reduce(doc,{tool,args,eventId})).patches);
// world_time accepts at most thirty days per call.
async function wait(engine,doc,minutes,id='wait'){for(let i=0;minutes>0;i++){const step=Math.min(minutes,30*DAY);doc=await run(engine,doc,'world_time',{minutes:step},`${id}-${i}`);minutes-=step;}return doc;}
const clock=(doc,id)=>doc.state.records[`faction-clock:${faction(id).clock.id}`];
const assets=(doc,id)=>doc.state.records[`faction-assets:${id}`];

test('T111：本批20个势力与三个非人势力都有可执行时钟；T142条目原样保留，时钟作为独立数据接入推进',()=>{
 assert.equal(batchIds.length,20);assert.equal(farIds.length,3);assert.equal(validateWorld(world,{stage:'release'}).ok,true);
 const engine=new WorldEngine(world);assert.doesNotThrow(()=>assertFactionClockRules(engine));
 const rules=factionClockRules(engine);
 for(const id of ALL){
  const f=faction(id),rule=rules.find(r=>r.faction===id);assert.ok(rule,id);
  assert.deepEqual(rule.stages.slice(0,3).map(s=>s.name),f.clock.stageEffects.map(s=>s.effect),id);
  assert.equal(rule.stages.at(-1).condition.kind,'intervention');assert.equal(rule.contact.location,f.contactAnchor);
  assert.deepEqual(rule.interventions.map(a=>a.effect).sort(),['pause','redirect','resume']);
  assert.ok(rule.stages.flatMap(s=>s.effects).some(e=>e.kind==='rumor'),id);
  assert.ok(rule.stages.slice(0,3).reduce((n,s)=>n+(s.cost.coins??0),0)<=f.resources.treasuryCopper,id);
 }
 for(const row of buildBatch().factions)assert.deepEqual(faction(row.id),row,`T142 ${row.id} 原样`);
 for(const id of farIds){const rule=world.rules.factionClock.clocks.find(c=>c.faction===id);
  assert.equal(rule.id,faction(id).clock.id);assert.equal(rule.intervalDays,faction(id).clock.intervalDays);assert.equal(rule.cycle,'year');}
 for(const [target,source] of REVERSE){const r=faction(target).relations.find(x=>x.faction===source);assert.ok(r,`${target}<${source}`);
  assert.equal(r.score,faction(source).relations.find(x=>x.faction===target).score);}
 for(const [target,source] of LOCKED_REVERSE)assert.ok(!faction(target).relations?.some(x=>x.faction===source),'T159 条目不改');
 for(const r of world.rules.reputation.factions){const f=faction(r.id);if(f)assert.deepEqual(r.relations,f.relations??[],r.id);}
});

test('T111：一年内各势力时钟自动推进并真实扣公库；野物躁动与传述按效果表落地',async()=>{
 const {engine,doc}=quiet(),after=await wait(engine,doc,360*DAY-doc.state.minute);
 const moved=ALL.filter(id=>clock(after,id)?.history.length>0);
 assert.ok(moved.length>=20,`推进势力 ${moved.length}/23`);
 for(const id of farIds)assert.ok(clock(after,id),`${id} 时钟已接入推进`);
 for(const id of moved){
  const c=clock(after,id),rule=factionClockRules(engine).find(r=>r.faction===id);
  const spent=c.history.reduce((n,e)=>n+(rule.stages.find(s=>s.id===e.stage).cost.coins??0),0);
  const account=assets(after,id);
  // U12 military spending and war escrow also use the faction treasury.
  assert.equal(0-account.ledger.filter(e=>e.kind==='stage_cost').reduce((n,e)=>n+e.coins,0),spent,id);
  assert.equal(account.coins,faction(id).resources.treasuryCopper+account.ledger.reduce((n,e)=>n+e.coins,0),id);
 }
 const star=clock(after,'faction_starpact');
 if(star.history.length)assert.ok(star.history[0].effects.some(e=>e.kind==='wildlife_stir'));
 assert.equal(after.state.player.coins,doc.state.player.coins);
});

test('T111：远方势力的干预只能在其登记点办理；改道补盐从玩家自有物品扣除',async()=>{
 const sure=w=>{w.rules.factionClock.clocks.find(c=>c.faction==='faction_far_orcmoot').probability=1;};
 const s=quiet(sure);let d=await wait(s.engine,s.doc,60*DAY-s.doc.state.minute,'two');
 assert.equal(clock(d,'faction_far_orcmoot').phase,2);
 d.state.inventory.item_salt={quantity:20};
 await assert.rejects(s.engine.reduce(structuredClone(d),{tool:'world_settlement',args:{operation:'faction_intervene',faction:'赭牙部盟',choice:'redirect'},eventId:'far'}),/登记地点/);
 d.state.location='loc_far_duanqi';
 d=await run(s.engine,d,'world_settlement',{operation:'faction_intervene',faction:'赭牙部盟',choice:'redirect'},'salt');
 assert.equal(d.state.inventory.item_salt?.quantity??d.state.inventory.item_salt??0,0);
 d=await wait(s.engine,d,30*DAY,'alt');assert.equal(clock(d,'faction_far_orcmoot').history.at(-1).stage,'alt');
});

test('T111：旧存档升级后本批时钟从升级时起步，原有变化保留',async()=>{
 const old=withoutClockBatch(world,2);assert.ok(!factionClockRules(new WorldEngine(old)).some(r=>ALL.includes(r.faction)));
 const oldEngine=new WorldEngine(old);let doc=oldEngine.createCharacter(seed,{},'w5-clock-2-upgrade');
 doc=await wait(oldEngine,doc,40*DAY,'before');doc.state.records.t111_marker={category:'note',text:'升级前'};
 const upgraded=applyPatches(doc,planWorldUpgrade(doc,old,world,{worldHash:'t111',eventId:'t111-upgrade'}).patches);
 assert.deepEqual(upgraded.state.records.t111_marker,doc.state.records.t111_marker);
 const next=await wait(new WorldEngine(world),upgraded,40*DAY,'after');
 for(const id of ALL){const c=clock(next,id);assert.ok(c,id);assert.ok(c.initializedAt>doc.state.minute,id);}
});
