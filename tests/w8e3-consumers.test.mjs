import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {personal} from '../server-plugin/ui-personal.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';
import {tillageArea} from '../server-plugin/environment-state.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {skipTo} from './fixtures/skip-clock.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {beginSleep,finishSleep} from '../server-plugin/body-needs.mjs';
import {appliedEffects} from '../server-plugin/applied-effects.mjs';
import {actionLines} from '../server-plugin/action-text.mjs';

const base=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(configure=()=>{}){
 const world=structuredClone(base);configure(world);
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'w8e3');
 return {world,engine,doc,seq:0};
}
async function run(f,tool,args,eventId=`e3-${++f.seq}`){
 const out=await f.engine.reduce(f.doc,{tool,args,eventId});f.doc=applyPatches(f.doc,out.patches);return out.result;
}
const act=(f,action,slots={},id)=>run(f,'world_act',{action:`core:${action}`,slots},id);
const rest=(f,minutes)=>act(f,'time.rest',{minutes});
function atMinute(f,minute){
 for(const row of Object.values(f.doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(minute/1440)-1;
 skipTo(f.engine,f.doc,minute);
}
const wound=(extra={})=>({bloodMl:4500,pain:0,wounds:[{id:'cut',simple:true,depthMm:2,areaCm2:5,bleedingMlPerMinute:0,contamination:0,infectionRisk:0,closed:true,...extra}],symptoms:[]});

test('W8-E3 wound recovery: five-day course replaces the fixed rest grant and composes across split/restored sessions',async()=>{
 const make=()=>{const f=fixture(w=>{delete w.rules.weather;});f.doc.state.location='bld_hw_herbs';Object.assign(f.doc.state.player,{hp:60,maxHp:80,medical:wound()});return f;};
 const whole=make(),split=make();
 // health.json light = 5 days: one full day restores floor(20*(1-.8)) = 4 HP.
 await rest(whole,1440);assert.equal(whole.doc.state.player.hp,64);
 for(let i=0;i<3;i++){
  await rest(split,480);
  split.doc=JSON.parse(JSON.stringify(split.doc));split.engine=new WorldEngine(split.world);
 }
 assert.equal(split.doc.state.player.hp,64);
 assert.deepEqual(split.doc.state.player.medical.recovery,whole.doc.state.player.medical.recovery);
 // Two days restore floor(20*(1-.8^2)) = 7, rather than the native +96.
 await rest(whole,1440);assert.equal(whole.doc.state.player.hp,67);
});

test('W8-E3 wound recovery reads severe/fracture courses and the health:recoveryRate modifier',async()=>{
 for(const [injury,modifier,expected]of [[{depthMm:5},1,120],[{fracture:true},1,115],[{depthMm:2},2,460]]){
  const f=fixture(w=>{delete w.rules.weather;if(modifier!==1)w.derived.modifiers.push({id:'recovery-care',pack:'core',target:'health:recoveryRate',stage:'mul',value:modifier});});
  f.doc.state.location='bld_hw_herbs';Object.assign(f.doc.state.player,{hp:100,maxHp:1000,medical:wound(injury)});
  // Severe: 900/45=20/day; fracture: 900/60=15/day; light mul 2: 900*.2*2=360.
  // Use the exact light baseline for the modifier anchor; RX modifiers quantize
  // nonterminating 1/45 to four decimal places by the existing derived contract.
  await rest(f,1440);assert.equal(f.doc.state.player.hp,expected);
 }
});

test('W8-E3 recovery replaces only the native rest grant and preserves intervening actual health damage',()=>{
 const f=fixture(w=>{delete w.rules.weather;});f.doc.state.location='bld_hw_herbs';Object.assign(f.doc.state.player,{hp:60,maxHp:80,medical:wound()});
 const e=f.engine.scoped(f.doc),d=e.primitiveDraft(f.doc),span=beginSleep(d,e);
 e.health(d,{delta:-10},'e3-injury');e.time(d,{minutes:1440,activity:'休息'},'e3-interrupted-rest');
 const cost=finishSleep(d,e,span);
 // 60 - 10 damage = 50; missing 30 * .2 = 6 restored. The native +48
 // would have capped at 80, so subtracting it blindly would erase real damage.
 assert.equal(d.get('state','player','hp'),56);assert.equal(d.get('state','player','medical','recovery','gained'),6);
 assert.equal(d.patches.filter(p=>p.path.join('/')==='state/player/hp').length,2,'one damage write and one recovery write');
});

test('W8-E3 unwounded rest retains the original half-hour rate without a wound segment',async()=>{
 const f=fixture(w=>{delete w.rules.weather;});f.doc.state.location='bld_hw_herbs';Object.assign(f.doc.state.player,{hp:60,maxHp:80});
 // Rework design: one current recovery rule; no receipt/replay compatibility.
 await rest(f,480);
 assert.equal(f.doc.state.player.hp,76);assert.equal(f.doc.state.player.medical?.recovery,undefined);
});

test('W8-E3 species stocks regenerate separately across a season and survive restored gathering carries',async()=>{
 const f=fixture(w=>{delete w.rules.weather;});f.doc.state.location='loc_hw_northwood';atMinute(f,20*1440+9*60);
 await act(f,'site.enter');
 await act(f,'site.gather_session',{target:'nw_plantain',minutes:240});
 await act(f,'site.gather_session',{target:'nw_honeysuckle',minutes:120});
 const start=f.doc.state.minute;
 let site=f.doc.state.records['site:loc_hw_northwood'];
 assert.equal(site.remaining.nw_plantain,10);assert.equal(site.remaining.nw_honeysuckle,18);
 f.doc=JSON.parse(JSON.stringify(f.doc));f.engine=new WorldEngine(f.world);
 await act(f,'site.gather_session',{target:'nw_honeysuckle',minutes:120});
 site=f.doc.state.records['site:loc_hw_northwood'];assert.equal(site.remaining.nw_honeysuckle,15);
 const beforeWait=f.doc.state.minute;
 for(let month=0;month<3;month++)await run(f,'world_time',{minutes:30*1440});
 // Daily background settlement stops at midnight; a real site visit settles
 // the final partial day before comparing the exact elapsed-time anchor.
 await act(f,'site.enter');
 site=f.doc.state.records['site:loc_hw_northwood'];
 // r=1/(20*20), K=20: N=10 after 90 days -> floor(20/(1+exp(-.225)))=11.
 // Honey spends the remaining spring at r/2 and summer at r, from N=15 -> 15.
 assert.equal(site.remaining.nw_plantain,11);assert.equal(site.remaining.nw_honeysuckle,15);assert.equal(site.remaining.nw_herb,20);
 assert.equal(site.changes.nw_plantain_regrow,beforeWait+90*1440);assert.equal(site.changes.nw_honeysuckle_regrow,beforeWait+90*1440);
 assert.equal(site.growthAnchors.nw_plantain_regrow.rate,1/400);
 assert.equal(site.growthAnchors.nw_honeysuckle_regrow.rate,1/400,'summer density now applies to honey independently');
 assert.ok(start<beforeWait);
});

function rainFixture(configure){
 const f=fixture(configure);f.doc.randomSeed='daily-b2-d09-98';
 f.doc.state.location='loc_hw';atMinute(f,((6-1)*30+20-1)*1440+7*60);
 // Use the shipped climate and the existing D09 seed: rain today, clear tomorrow.
 assert.equal(weatherAt(f.engine,f.doc.randomSeed,'loc_hw',f.doc.state.minute).kind,'rain');return f;
}
test('W8-E3 weather_exposure: real waiting gets wet; a move indoors and two sheltered hours dry it; receipt and panel show it',async()=>{
 const f=rainFixture(),before=structuredClone(f.doc),wet=await run(f,'world_time',{minutes:1});
 const wetEffects=appliedEffects(before,f.doc,{result:wet});
 assert.equal(wetEffects.find(e=>e.op==='exposure').sourceEvent,wet.weatherExposure.sourceEvent);
 assert.ok(actionLines({engine:f.engine,action:{id:'core:time.wait'},before,after:f.doc,args:{minutes:1},result:wet}).lines.some(l=>l.includes('你已淋湿')));
 assert.equal(wet.weatherExposure.status,'wet');assert.equal(personal(f.engine,f.doc).player.exposures[0].name,'淋湿');
 assert.equal(personal(f.engine,f.doc).player.status,'正常 · 淋湿');assert.equal(f.doc.state.player.status,'正常');
 await act(f,'move',{destination:'bld_hw_qingdeng'});
 const at=f.doc.state.minute;await run(f,'world_time',{minutes:119});
 assert.equal(f.doc.state.records['weather_exposure:player'].wet,true);
 const damp=structuredClone(f.doc),dry=await run(f,'world_time',{minutes:1});
 assert.ok(actionLines({engine:f.engine,action:{id:'core:time.wait'},before:damp,after:f.doc,args:{minutes:1},result:dry}).lines.some(l=>l.includes('淋湿状态消退')));
 assert.equal(f.doc.state.minute-at,120);assert.equal(dry.weatherExposure.name,'已干燥');
 assert.deepEqual(personal(f.engine,f.doc).player.exposures,[]);
});

test('W8-E3 weather_exposure: indoor waiting never gets wet and four clear outdoor hours dry existing wetness',async()=>{
 const indoor=rainFixture();indoor.doc.state.location='bld_hw_qingdeng';
 await run(indoor,'world_time',{minutes:120});assert.equal(indoor.doc.state.records['weather_exposure:player'],undefined);
 const f=rainFixture();await run(f,'world_time',{minutes:1});
 const nextDay=Math.floor(f.doc.state.minute/1440)*1440+1440;
 await run(f,'world_time',{minutes:nextDay-f.doc.state.minute+239});assert.equal(f.doc.state.records['weather_exposure:player'].wet,true);
 await run(f,'world_time',{minutes:1});assert.equal(f.doc.state.records['weather_exposure:player'].wet,false);
});

test('W8-E3 rain protection requires actually wearing the rainproof item; carrying it alone does not shelter',async()=>{
 // An authored trait on the existing clothes item exercises the A.18 item
 // consumer; no new item, location or actor is introduced. Wear/unwear are real actions.
 const f=rainFixture(w=>w.items.find(r=>r.id==='item_clothes').tags.push('rainproof'));
 const prepared=applyIntentSetup(f.engine,f.doc,{location:'bld_hw_qingdeng',itemInstances:[{id:'coat',item:'item_clothes',template:'thing',kind:'item',name:'普通衣服',owner:'player',carriedBy:'player',location:'bld_hw_qingdeng',condition:100,inventoryBinding:{item:'item_clothes',quantity:1,mode:'same_stock'}}]});
 assert.deepEqual(prepared.setupUnmet,[]);f.doc=prepared.document;const coat=prepared.bindings.coat;
 await run(f,'world_environment',{operation:'wear',target:coat});
 await act(f,'move',{destination:'loc_hw'});await run(f,'world_time',{minutes:120});
 assert.equal(f.doc.state.records['weather_exposure:player'],undefined);
 await run(f,'world_environment',{operation:'unwear',target:coat});
 // Both waits see the same rainy day; one unprotected minute produces wet.
 await run(f,'world_time',{minutes:1});assert.equal(f.doc.state.records['weather_exposure:player'].wet,true);
});

test('W8-E3 cultivation: real hoe-and-seed work records exact mu area and yields through the existing crop derivation',async()=>{
 const f=fixture(w=>{delete w.rules.weather;w.rules.agriculture.crop.sowDays=[0,359];w.rules.agriculture.crop.growthDays=2;w.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw').farmWorkers=0;});
 f.doc.state.location='loc_hw_fields';atMinute(f,7*1440+480);
 f.doc.state.buildings.loc_hw_fields={owner:'player',condition:100};
 f.doc.state.inventory.item_wheat_seed={quantity:4};f.doc.state.inventory.item_hoe={quantity:1,durability:100};
 const sow=await act(f,'farm.private_sow',{areaMu:2},'e3-real-sow');
 // 2 mu = 20000/15 = 4000/3 m²; 0.5 workday/mu * 2 * 480 = 480 minutes.
 const fact=f.doc.state.records['cultivation:private-farm:loc_hw_fields'];
 assert.deepEqual(fact.tilledAreaM2,{numerator:'4000',denominator:'3'});assert.equal(fact.sourceEvent,'e3-real-sow');assert.equal(sow.laborMinutes,480);
 assert.equal(tillageArea(f.doc.state,'private-farm:loc_hw_fields'),4000/3);
 await run(f,'world_time',{minutes:3*1440});
 const farm=f.doc.state.records['private-farm:loc_hw_fields'];assert.equal(farm.status,'ready');
 // Shipped wheat: 150 jin/mu * 2 mu * .5 kg/jin / .5 kg portion = 300 portions,
 // scaled only by the actual weather/water quality already accumulated on the crop.
 assert.equal(farm.yield,Math.floor(300*farm.qualitySum/farm.qualityDays));
});

test('W8-E3 an archived yield table without cultivation support keeps the old sow receipt and records',async()=>{
 const f=fixture(w=>{delete w.rules.weather;w.primitiveTables.yields.params=w.primitiveTables.yields.params.filter(r=>r.id!=='field.cultivation');w.rules.agriculture.crop.sowDays=[0,359];w.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw').farmWorkers=0;});
 f.doc.state.location='loc_hw_fields';atMinute(f,7*1440+480);f.doc.state.buildings.loc_hw_fields={owner:'player',condition:100};
 f.doc.state.inventory.item_wheat_seed={quantity:4};f.doc.state.inventory.item_hoe={quantity:1,durability:100};
 const sow=await act(f,'farm.private_sow',{areaMu:2});
 // The same two mu still spend four seeds and 480 work minutes; no new
 // cultivation record/receipt field is injected into that archived edition.
 assert.equal(sow.farm.seed,4);assert.equal(sow.laborMinutes,480);assert.equal(Object.hasOwn(sow,'tillage'),false);
 assert.equal(f.doc.state.records['cultivation:private-farm:loc_hw_fields'],undefined);
});
