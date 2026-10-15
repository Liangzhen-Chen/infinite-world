// T110（B4）：按本批20个势力ID核对可执行时钟、资源代价、自动推进、玩家干预与旧档升级。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {assertFactionClockRules,factionClockRules} from '../server-plugin/faction-clock.mjs';
import {planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {batchIds,REVERSE} from '../world/design/w5-clock-1.mjs';
import {withoutClockBatch} from '../tools/w5-clock-publication.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const faction=id=>world.factions.find(f=>f.id===id);
function quiet(mutate=()=>{}){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 // Isolate stage costs from D1's separately tested commission escrow.
 w.rules.questSources.commissions=[];mutate(w);
 const engine=new WorldEngine(w);return {w,engine,doc:engine.createCharacter(seed,{},'w5-clock-1')};
}
const run=async(engine,doc,tool,args,eventId)=>applyPatches(doc,(await engine.reduce(doc,{tool,args,eventId})).patches);
// world_time accepts at most thirty days per call.
async function wait(engine,doc,minutes,id='wait'){for(let i=0;minutes>0;i++){const step=Math.min(minutes,30*DAY);doc=await run(engine,doc,'world_time',{minutes:step},`${id}-${i}`);minutes-=step;}return doc;}
const clock=(doc,id)=>doc.state.records[`faction-clock:${faction(id).clock.id}`];
const assets=(doc,id)=>doc.state.records[`faction-assets:${id}`];

test('T110：本批20个势力都有可执行时钟，阶段沿用已审核计划，条件、代价与干预齐全',()=>{
 assert.equal(batchIds.length,20);assert.equal(validateWorld(world,{stage:'release'}).ok,true);
 const engine=new WorldEngine(world);assert.doesNotThrow(()=>assertFactionClockRules(engine));
 const rules=factionClockRules(engine);
 for(const id of batchIds){
  const f=faction(id),rule=rules.find(r=>r.faction===id);assert.ok(rule,id);
  assert.deepEqual(rule.stages.slice(0,3).map(s=>s.name),f.clock.stageEffects.map(s=>s.effect),id);
  assert.equal(rule.stages.at(-1).condition.kind,'intervention');assert.equal(rule.contact.location,f.contactAnchor);
  const spend=rule.stages.slice(0,3).reduce((n,s)=>n+(s.cost.coins??0),0);
  assert.ok(spend>0&&spend<=f.resources.treasuryCopper,`${id} 阶段代价须真实且公库付得起`);
  assert.deepEqual(rule.interventions.map(a=>a.effect).sort(),['pause','redirect','resume']);
  assert.ok(rule.interventions.every(a=>a.name&&a.location===f.contactAnchor));
  assert.ok(rule.stages.flatMap(s=>s.effects).some(e=>e.kind==='rumor'),id);
  assert.doesNotMatch(f.clock.execution,/声明式/);
 }
 // Reverse relation entries are present and the reputation copies stay equal.
 for(const [target,source] of REVERSE){
  const r=faction(target).relations.find(x=>x.faction===source),s=faction(source).relations.find(x=>x.faction===target);
  assert.ok(r&&s,`${target}<${source}`);assert.equal(r.score,s.score);
  const copy=world.rules.reputation.factions.find(x=>x.id===target);if(copy)assert.deepEqual(copy.relations,faction(target).relations);
 }
});

test('T110：时钟随时间自动推进，阶段扣势力公库并留下传述；资源不足停在原阶段',async()=>{
 const {engine,doc}=quiet(),after=await wait(engine,doc,180*DAY-doc.state.minute);
 const moved=batchIds.filter(id=>clock(after,id)?.phase>0);
 assert.ok(moved.length>=16,`推进势力 ${moved.length}/20`);
 for(const id of moved){
  const c=clock(after,id),a=assets(after,id),rule=factionClockRules(engine).find(r=>r.faction===id);
  const spent=c.history.reduce((n,e)=>n+(rule.stages.find(s=>s.id===e.stage).cost.coins??0),0);
  assert.equal(a.coins,faction(id).resources.treasuryCopper-spent,id);
  const first=rule.stages[0].effects.find(e=>e.kind==='rumor');
  if(first)assert.ok(first.carriers.some(n=>after.state.npcs[n].memoryStream?.some(m=>m.content===first.claim)),id);
 }
 assert.equal(after.state.player.coins,doc.state.player.coins);
 const poor=quiet(w=>{w.factions.find(f=>f.id==='faction_fieldguild').resources.treasuryCopper=100;});
 const stuck=await wait(poor.engine,poor.doc,120*DAY);
 assert.equal(clock(stuck,'faction_fieldguild').phase,0);assert.equal(assets(stuck,'faction_fieldguild').coins,100);assert.equal(assets(stuck,'faction_fieldguild').ledger.length,0);
});

test('T110：玩家在登记联络点暂缓、撤回与改道，代价从玩家自有钱物扣除，后续阶段随之改变',async()=>{
 const sure=w=>{for(const f of w.factions)if(['faction_fieldguild','faction_civicartisans'].includes(f.id))f.clock.probability=1;};
 // Pause: the second stage stops until the player withdraws the request.
 let s=quiet(sure),d=await wait(s.engine,s.doc,7*DAY-s.doc.state.minute,'first');
 assert.equal(clock(d,'faction_fieldguild').phase,1);
 d.state.location='loc_bs';
 const look=(await s.engine.reduce(d,{tool:'world_settlement',args:{operation:'faction_inspect',faction:'原径冒险公所'},eventId:'look'})).result;
 assert.deepEqual(look.choices.map(c=>c.id),['pause','resume']);assert.ok(look.choices.every(c=>c.name));
 const coins=d.state.player.coins;d=await run(s.engine,d,'world_settlement',{operation:'faction_intervene',faction:'原径冒险公所',choice:'pause'},'pause');
 assert.equal(d.state.player.coins,coins-30);assert.equal(clock(d,'faction_fieldguild').paused,true);
 d=await wait(s.engine,d,21*DAY,'paused');assert.equal(clock(d,'faction_fieldguild').phase,1);
 d=await run(s.engine,d,'world_settlement',{operation:'faction_intervene',faction:'原径冒险公所',choice:'resume'},'resume');
 d=await wait(s.engine,d,7*DAY,'resumed');assert.equal(clock(d,'faction_fieldguild').phase,2);
 // Redirect: own timber turns the conclusion into the player-steered outcome.
 s=quiet(sure);d=await wait(s.engine,s.doc,14*DAY-s.doc.state.minute,'two');assert.equal(clock(d,'faction_civicartisans').phase,2);
 d.state.location='loc_capital';d.state.inventory.item_wood={quantity:4};
 await assert.rejects(s.engine.reduce(structuredClone(d),{tool:'world_settlement',args:{operation:'faction_intervene',faction:'细嵌匠户联社',choice:'pause'},eventId:'late'}),/当前阶段没有该干预/);
 d=await run(s.engine,d,'world_settlement',{operation:'faction_intervene',faction:'细嵌匠户联社',choice:'redirect'},'redirect');
 assert.equal(d.state.inventory.item_wood?.quantity??d.state.inventory.item_wood??0,0);
 d=await wait(s.engine,d,7*DAY,'alt');const c=clock(d,'faction_civicartisans');
 assert.equal(c.history.at(-1).stage,'alt');assert.equal(c.phase,4);
 assert.ok(!c.history.some(e=>e.stage==='s3'),'改道后不再执行原结局');
 // Away from the registration point nothing can be lodged.
 const away=structuredClone(d);away.state.location='loc_hw';
 await assert.rejects(s.engine.reduce(away,{tool:'world_settlement',args:{operation:'faction_inspect',faction:'细嵌匠户联社'},eventId:'away'}),/登记地点/);
});

test('T110：旧存档升级后时钟从升级时起步，不补造过去的阶段，原有变化保留',async()=>{
 const old=withoutClockBatch(world,1);assert.ok(!factionClockRules(new WorldEngine(old)).some(r=>batchIds.includes(r.faction)));
 const oldEngine=new WorldEngine(old);let doc=oldEngine.createCharacter(seed,{},'w5-clock-1-upgrade');
 doc=await wait(oldEngine,doc,40*DAY,'before');doc.state.player.coins=321;doc.state.records.t110_marker={category:'note',text:'升级前'};
 const upgraded=applyPatches(doc,planWorldUpgrade(doc,old,world,{worldHash:'t110',eventId:'t110-upgrade'}).patches);
 assert.equal(upgraded.state.player.coins,321);assert.deepEqual(upgraded.state.records.t110_marker,doc.state.records.t110_marker);
 const engine=new WorldEngine(world),next=await wait(engine,upgraded,30*DAY,'after');
 for(const id of batchIds){const c=clock(next,id);assert.ok(c,id);assert.ok(c.initializedAt>doc.state.minute,id);assert.ok(c.history.every(e=>e.minute>doc.state.minute));}
});
