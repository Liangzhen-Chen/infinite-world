import {questPublisher} from '../server-plugin/entity-view.mjs';
// D1 系统数据铺开：按地点、势力阶段与节日 ID 核对默认数据确实接上了已有系统。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyEffects} from '../server-plugin/effects.mjs';
import {validateHazardRules,assertHazardRules} from '../server-plugin/seasonal-hazards.mjs';
import {assertQuestSources} from '../server-plugin/quest-sources.mjs';
import {factionClockRules} from '../server-plugin/faction-clock.mjs';
import {festivalCalendar} from '../server-plugin/festival.mjs';
import {generateCounty,remoteWorld,remoteCountyOf} from '../server-plugin/remote-generation.mjs';
import {derivedHabitatId} from '../server-plugin/wildlife-habitats.mjs';
import {applyD1} from '../tools/d1-system-data.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world);
const CORE=['loc_hw','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban','loc_bs'];
const SOCIETIES={loc_ms_tanjie:'faction_ms_tanjie',loc_ms_taideng:'faction_ms_taideng',loc_ms_yugen:'faction_ms_yugen',loc_ms_lielu:'faction_ms_lielu'};
const clock=id=>world.rules.hazardClock.clocks.find(r=>r.id===id);

test('D1 数据由设计稿生成：rules.json 与设计数据一致',()=>{
 assert.deepEqual(applyD1(world.rules),world.rules);
});

test('灾害时钟：每个核心聚落有汛期、疫病、冬荒、物价四类，聚居地按食物来源有冬荒与疫病',()=>{
 assert.deepEqual(validateHazardRules(world),[]);
 for(const id of CORE)for(const kind of ['flood','epidemic','famine','price']){
  const r=clock(`${kind}:${id}`);assert.ok(r,`${kind}:${id}`);assert.equal(r.kind,kind);assert.equal(r.settlement,id);
 }
 for(const id of Object.keys(SOCIETIES))for(const kind of ['famine','epidemic'])assert.equal(clock(`${kind}:${id}`)?.settlement,id,`${kind}:${id}`);
 // Places differ: 砾泉 floods least and has a drought price clock; 苇汀 floods most.
 const crest=id=>clock(`flood:${id}`).stages.find(s=>s.id==='crest').probability;
 for(const id of CORE.filter(id=>id!=='loc_bs_liquan'))assert.ok(crest('loc_bs_liquan')<crest(id),id);
 assert.ok(CORE.every(id=>crest('loc_bs_weiting')>=crest(id)));
 assert.ok(clock('price:loc_bs_liquan').stages.some(s=>s.effects.some(e=>e.kind==='crop_damage')),'砾泉旱情减产');
 const days=id=>clock(`famine:${id}`).stages[0].condition.days;
 assert.ok(days('loc_bs_liquan')>days('loc_bs_yupo')&&days('loc_bs_weiting')<days('loc_bs_yupo'));
 // Monster settlements follow their own food source, not a village granary.
 assert.deepEqual(clock('famine:loc_ms_tanjie').stages[0].condition,{kind:'hazard_phase',clock:'famine:loc_bs',minimum:1});
 assert.deepEqual(clock('famine:loc_ms_lielu').stages[0].condition,{kind:'hazard_phase',clock:'famine:loc_bs_liquan',minimum:1});
});

test('公告栏与公账：核心聚落各有主事人与公账，聚居地用组织公库',()=>{
 assertQuestSources(engine);
 const t=world.rules.questSources,doc=engine.createCharacter(seed,{},'d1-ledgers');
 for(const id of [...CORE,...Object.keys(SOCIETIES)]){
  const npc=world.npcs.find(n=>n.id===questPublisher(engine,doc.state,id).value);
  assert.ok(npc,id);assert.equal(npc.tier,'full',id);
  let at=npc.location,inside=false;for(const seen=new Set();at&&!seen.has(at);at=engine.byId.get(at)?.parent){seen.add(at);if(at===id)inside=true;}
  assert.ok(inside||npc.settlement===id,`${id}主事人住在本地`);
 }
 for(const id of CORE){const s=doc.state.settlements[id];assert.ok(Number.isSafeInteger(s?.treasury)&&s.treasury>0,id);}
 assert.equal(doc.state.settlements.loc_bs.granary,false);
 for(const [id,faction] of Object.entries(SOCIETIES)){assert.equal(t.funds[id],faction);assert.equal(doc.state.settlements[id],undefined);}
});

test('白石镇公账只记钱，不进每日口粮结算；公事委托从公账托管',async()=>{
 let doc=engine.createCharacter(seed,{},'d1-town');const before=doc.state.settlements.loc_bs;
 // T155 may escrow a public wildlife commission during the wait. Food and
 // production remain unchanged; every copper spent must fund an actual quest.
 const spent=doc=>Object.values(doc.state.quests).filter(q=>q.fundedBy?.treasury==='loc_bs').reduce((sum,q)=>sum+q.escrow+(q.rewardPaid??0),0);
 const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:3*1440},eventId:'wait-1'});doc=applyPatches(doc,out.patches);
 assert.deepEqual(doc.state.settlements.loc_bs,{...before,treasury:before.treasury-spent(doc)});
 doc.state.records['hazard-flood:loc_bs_hebu']={category:'hazard_flood',location:'loc_bs_hebu',since:doc.state.minute,until:doc.state.minute+1440*4,soaked:[],sourceEvent:'test-flood'};
 const next=applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes:1440},eventId:'wait-2'})).patches);
 const q=Object.values(next.state.quests).find(q=>q.source?.cause==='hazard-flood:loc_bs_hebu');
 assert.ok(q);assert.equal(q.location,'loc_bs');assert.equal(q.publisher,'npc_bs_031_1');assert.equal(q.fundedBy.treasury,'loc_bs');
 assert.equal(next.state.settlements.loc_bs.treasury,before.treasury-spent(next));
});

test('势力委托：至少15个势力时钟阶段挂了委托，且能按阶段实际张贴',()=>{
 const rules=factionClockRules(engine),hooks=world.rules.questSources.commissions.filter(h=>h.effects.some(e=>e.kind==='quest_post'));
 assert.ok(!world.rules.effectTable.hooks.some(h=>h.effects.some(e=>e.kind==='quest_post')),'K6 效果表不挂委托');
 const stages=new Set(hooks.map(h=>`${h.owner}/${h.stage}`));
 assert.ok(stages.size>=15,String(stages.size));
 for(const h of hooks)assert.ok(rules.find(r=>r.id===h.owner)?.stages.some(s=>s.id===h.stage),`${h.owner}/${h.stage}`);
 const doc=engine.createCharacter(seed,{},'d1-commission'),d={document:structuredClone(doc),get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
  set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};
 for(const [owner,stage] of [['clock_saltboat','s1'],['clock_furroworder','s1']]){
  const rule=rules.find(r=>r.id===owner),effects=hooks.find(h=>h.owner===owner&&h.stage===stage).effects;
  const receipt=applyEffects(d,engine,effects,{settlement:rule.settlement,faction:rule.faction,minute:d.get('state','minute'),sourceEvent:`test:${owner}:${stage}`},'faction');
  assert.equal(receipt.applied,true);assert.equal(receipt.effects[0].posted,true,owner);
  const q=d.get('state','quests',receipt.effects[0].quest);assert.equal(q.fundedBy.faction,rule.faction);assert.equal(q.publisher,questPublisher(engine,d.get('state'),q.location).value);
 }
});

test('节日：核心区正式节日有常住主办人；远方节日由到访生成的治所主办人主持',()=>{
 const home=world.festivals.filter(f=>!remoteCountyOf(world,f.venue.location)&&f.runtime.status==='active');
 assert.deepEqual(home.map(f=>f.id).sort(),['festival_borrowbench','festival_ditchmeal','festival_orchardshare','festival_threshold']);
 for(const f of home){const n=world.npcs.find(n=>n.id===f.runtime.host);assert.equal(n?.tier,'full',f.id);}
 const remote=world.festivals.filter(f=>remoteCountyOf(world,f.venue.location));
 assert.equal(remote.length,20);
 const counties=[...new Set(remote.map(f=>remoteCountyOf(world,f.venue.location)))];
 const skeletons=counties.map(c=>generateCounty(world,c,'d1-festivals'));
 for(const f of remote){
  const host=skeletons.flatMap(s=>s.people).find(p=>p.festivalHost===f.id);
  assert.ok(host,f.id);assert.equal(host.remoteRole,'festival_host');assert.equal(host.location,f.venue.location);
  const slot=host.schedule.default.find(s=>s.start<=f.runtime.startMinute&&f.runtime.startMinute+f.runtime.durationMinutes<=s.end);
  assert.equal(slot?.location,f.venue.location,f.id);assert.doesNotMatch(slot.activity,/睡/);
 }
 // The base world still has no host for them; the generated county brings one.
 assert.ok(!festivalCalendar(engine).some(f=>f.publishedId==='festival_steps'));
 const s=skeletons[counties.indexOf('county_zhonglu_wangji')];
 const state={remote:{county_zhonglu_wangji:{county:'county_zhonglu_wangji',hash:'d1',revision:0,profiles:{},skeleton:s}}};
 const overlay=new WorldEngine(remoteWorld(world,state));
 const steps=festivalCalendar(overlay).find(f=>f.publishedId==='festival_steps');
 assert.equal(steps?.host,'npc_rg_zhonglu_wangji_fh_steps');
});

test('远方生成：每个生成聚落带灾害时钟、公告栏主事人与公账，参数随郡地形产业变化',()=>{
 for(const county of ['county_jingzhao_luyu','county_xingwan_xuedeng','county_hanlu_zheya','county_zhonglu_wangji']){
  const s=generateCounty(world,county,'d1-remote');
  const overlay=new WorldEngine(remoteWorld(world,{remote:{[county]:{county,hash:'d1',revision:0,profiles:{},skeleton:s}}}));
  assertHazardRules(overlay);assertQuestSources(overlay);
  for(const place of s.settlements){
   for(const kind of ['epidemic','famine','price'])assert.ok(s.hazards.some(h=>h.id===`${kind}:${place.id}`),`${county} ${kind}:${place.id}`);
   const official=s.people.find(p=>p.id===s.publishers[place.id]);
   assert.equal(official?.remoteRole,'official');assert.equal(official.settlement,place.id);
   assert.ok(overlay.world.npcs.some(n=>n.id===official.id),'公告栏主事人可张贴');
   const l=s.ledgers[place.id];assert.ok(Number.isSafeInteger(l.treasury)&&l.treasury>0&&l.population===s.profiles.find(p=>p.id===place.id).population);
  }
 }
 const luyu=generateCounty(world,'county_jingzhao_luyu','d1-remote'),zheya=generateCounty(world,'county_hanlu_zheya','d1-remote');
 assert.ok(luyu.hazards.some(h=>h.kind==='flood'),'泥沼芦滩有汛期');assert.ok(!zheya.hazards.some(h=>h.kind==='flood'),'干旱峡谷无汛期');
 assert.equal(luyu.hazards.find(h=>h.kind==='epidemic').disease,'disease_river_flux');
 assert.equal(generateCounty(world,'county_xingwan_xuedeng','d1-remote').hazards.find(h=>h.kind==='epidemic').disease,'disease_cold_cough');
});

test('地形：五村田地、果园补上群落与面积后派生栖地，长出农田野物',()=>{
 const habitats=engine.rules.wildlife.habitats;
 for(const id of ['loc_yp_fields','loc_wt_garden','loc_lq_fields','loc_sb_fields','loc_sb_orchard']){
  const l=engine.byId.get(id);assert.ok(l.biome?.length&&l.areaKm2>0,id);
  const h=habitats.find(h=>h.id===derivedHabitatId(id));
  assert.ok(h,id);assert.ok(h.types.includes('open'));assert.ok(h.species.monster_mottled_field_mouse?.population>=1,id);
 }
 // Authored field habitats (河湾) stay as they are.
 assert.ok(habitats.some(h=>h.id==='habitat_hw_field'&&!h.derived));assert.ok(!habitats.some(h=>h.id===derivedHabitatId('loc_hw_fields')));
});
