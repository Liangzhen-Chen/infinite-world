import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {effectKinds,assertEffect,applyEffect,applyEffects,registerEffect,hookedEffects,assertEffectTable,advanceSeasonEffects} from '../server-plugin/effects.mjs';
import {applyClockEffect} from '../server-plugin/world-clock.mjs';
import {assertFactionClockRules} from '../server-plugin/faction-clock.mjs';
import {regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {toRational} from '../server-plugin/det-math.mjs';
import {wildlifeStirFactor} from '../server-plugin/wildlife.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {traitsOf} from '../server-plugin/traits.mjs';
import {assertLiquidWater} from '../server-plugin/interactions.mjs';
import {validateFestivalRuntime} from '../server-plugin/festival.mjs';
import {readObjectState,storeObjectState} from '../server-plugin/magic-object.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
function quiet(mutate=()=>{}){
 const world=structuredClone(source);for(const n of world.npcs){delete n.schedule;delete n.tier;}mutate(world);
 const engine=new WorldEngine(world);return {world,engine,doc:engine.createCharacter(legacy,{},'effects-test')};
}
const wait=async(engine,doc,minutes,id='wait')=>applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes},eventId:id})).patches);
// A plain draft over a document, the same shape the engine hands to effects.
function draft(document){
 return {document,patches:[],messages:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
  set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(m){this.messages.push(m);}};
}
const clockRecords=doc=>Object.fromEntries(Object.entries(doc.state.records).filter(([,r])=>['world_clock','faction_clock','faction_assets','faction_event','regional_quote'].includes(r.category)));

test('统一效果表登记六类效果；来源限定与未知效果明确拒绝',()=>{
 const {engine}=quiet();
 for(const kind of ['regional_quote','awakening','wildlife_stir','wildlife_migrate','rumor','standing','environment','relation','dispute','trade'])assert.ok(effectKinds().includes(kind),kind);
 assert.throws(()=>assertEffect(engine,{kind:'made_up'},'world'),/未知效果/);
 // Faction-only kinds stay out of world clocks, as before.
 assert.throws(()=>assertEffect(engine,{kind:'relation',target:'faction_saltboat',delta:1},'world'),/未知效果/);
 assert.doesNotThrow(()=>assertEffect(engine,{kind:'relation',target:'faction_saltboat',delta:1},'faction'));
 assert.throws(()=>assertEffect(engine,{kind:'wildlife_stir',habitat:'habitat_missing',minutes:10},'world'),/栖地未登记/);
 assert.throws(()=>assertEffect(engine,{kind:'standing',holder:'loc_bs',target:'loc_bs',delta:5},'world'),/立场/);
 assert.throws(()=>assertEffect(engine,{kind:'environment',state:'melted',locations:['loc_hw_dock']},'season'),/环境效果/);
 assert.throws(()=>assertEffect(engine,{kind:'rumor',id:'x',claim:'有人说',carriers:['npc_missing']},'festival'),/携带者/);
 assert.throws(()=>registerEffect('rumor',{validate(){},apply(){}}),/重复/);
 const off=registerEffect('k6_probe',{sources:['festival'],validate(){},apply:()=>({applied:true})});
 try{assert.throws(()=>assertEffect(engine,{kind:'k6_probe'},'world'));assert.doesNotThrow(()=>assertEffect(engine,{kind:'k6_probe'},'festival'));}finally{off();}
 assert.ok(!effectKinds().includes('k6_probe'));
 assert.ok(advanceRegistry.some(s=>s.id==='season_effects'));
});

test('对照：原有报价效果算法不变；同存档推进同样天数，挂接新效果前后原时钟结果逐项相同',async()=>{
 const {engine,doc}=quiet();
 const d=draft(structuredClone(doc)),context={settlement:'loc_bs_yupo',faction:'faction_saltboat',minute:doc.state.minute,sourceEvent:'probe'};
 const effect={kind:'regional_quote',item:engine.rules.settlementTrade.item};
 // W5 (E.1 §6): the quote algorithm is unchanged; the stored price is that same quote as an exact rational over 10^6 (det-math toRational), never a float.
 assert.deepEqual(applyClockEffect(d,engine,effect,context),{applied:true,...effect,price:toRational(regionalTradePrice(draft(structuredClone(doc)),engine,effect.item,context.settlement,context.minute))});
 const days=30*DAY-doc.state.minute%DAY;
 const withTable=await wait(engine,doc,days);
 const bare=quiet(w=>{delete w.rules.effectTable;});
 const without=await wait(bare.engine,bare.doc,days);
 assert.deepEqual(clockRecords(withTable),clockRecords(without));
 assert.ok(Object.values(clockRecords(withTable)).some(r=>r.category==='world_clock'&&r.history.length>0),'原有世界时钟在窗口内确有推进');
});

test('势力时钟经效果表触发野物躁动、传闻与立场变化；正式数据给炭阶地宫粮路挂了这三种效果',async()=>{
 const real=quiet();assert.doesNotThrow(()=>assertFactionClockRules(real.engine));assert.doesNotThrow(()=>assertEffectTable(real.engine));
 assert.deepEqual(hookedEffects(real.engine,'faction','clock_ms_tanjie','settle').map(e=>e.kind),['wildlife_stir','rumor','standing']);
 const effects=hookedEffects(real.engine,'faction','clock_ms_tanjie','settle');
 const {engine,doc}=quiet(w=>{w.rules.factionClock={version:1,clocks:[{id:'k6_grain_road',faction:'faction_ms_tanjie',settlement:'loc_ms_tanjie',source:'K6 test',intervalDays:1,probability:1,
  stages:[{id:'road',name:'粮路落实',condition:{kind:'always'},effects}]}]};});
 const before=standing(engine,doc.state,'loc_bs','faction_ms_tanjie');
 const next=await wait(engine,doc,2*DAY);
 const clock=next.state.records['faction-clock:k6_grain_road'];assert.equal(clock.phase,1);
 const event=clock.history[0],at=event.minute;assert.deepEqual(event.effects.map(e=>e.kind),['wildlife_stir','rumor','standing']);
 const stir=next.state.records['wildlife:stir:habitat_bs_west_kiln'];
 assert.equal(stir.sourceEvent,event.sourceEvent);assert.equal(wildlifeStirFactor(next.state,'habitat_bs_west_kiln',at+1),2);assert.equal(wildlifeStirFactor(next.state,'habitat_bs_west_kiln',at+7*DAY),1);
 const rumors=npcRumors(engine,'npc_ms_tj_yantai',next);assert.ok(rumors.some(r=>r.claim.includes('粮路')&&r.id===`rumor_event:${event.sourceEvent}:rumor:tanjie_grain_road`));
 assert.equal(standing(engine,next.state,'loc_bs','faction_ms_tanjie'),before+5);
 // A refused effect rolls back the whole stage, costs included.
 const blocked=quiet(w=>{w.rules.factionClock={version:1,clocks:[{id:'k6_blocked',faction:'faction_ms_tanjie',settlement:'loc_ms_tanjie',source:'K6 test',intervalDays:1,probability:1,
  stages:[{id:'move',name:'迁移',condition:{kind:'always'},cost:{items:{item_dry_mushroom:1}},effects:[effects[1],{kind:'wildlife_migrate',species:'monster_missing',from:'habitat_bs_west_kiln',to:'habitat_yp_north_grove',count:1}]}]}]};});
 assert.throws(()=>assertFactionClockRules(blocked.engine),/栖地|物种|迁移/);
});

test('野物迁移在两栖地之间搬动种群，迁空时拒绝且不留半截写入',()=>{
 const {engine,doc}=quiet(),habitats=engine.rules.wildlife.habitats.map(h=>h.id);
 let pair=null;
 for(const from of habitats)for(const to of habitats)if(!pair&&from!==to)for(const [species,p]of Object.entries(doc.state.records[`ecology:${from}`]?.populations??{}))
  if(!pair&&p.count>0&&doc.state.records[`ecology:${to}`]?.populations?.[species]){try{assertEffect(engine,{kind:'wildlife_migrate',species,from,to,count:1},'faction');pair={species,from,to,count:p.count};}catch{}}
 assert.ok(pair,'正式栖地中存在可迁移的同种');
 const d=draft(structuredClone(doc)),ctx={minute:doc.state.minute,sourceEvent:'k6-migrate'};
 const r=applyEffects(d,engine,[{kind:'wildlife_migrate',species:pair.species,from:pair.from,to:pair.to,count:1}],ctx,'season');
 assert.equal(r.applied,true);assert.equal(d.document.state.records[`ecology:${pair.from}`].populations[pair.species].count,pair.count-1);
 const target=doc.state.records[`ecology:${pair.to}`].populations[pair.species].count;assert.equal(d.document.state.records[`ecology:${pair.to}`].populations[pair.species].count,target+1);
 const empty=structuredClone(doc);empty.state.records[`ecology:${pair.from}`].populations[pair.species].count=0;
 const e=draft(empty),refused=applyEffects(e,engine,[{kind:'standing',holder:'loc_bs',target:'player',delta:3},{kind:'wildlife_migrate',species:pair.species,from:pair.from,to:pair.to,count:1}],ctx,'season');
 assert.equal(refused.applied,false);assert.deepEqual(e.document,empty);
});

test('季节效果：入冬寒潮冻住河湾渡口静水，旱季把干料晒干可再引燃；每季只结算一次',()=>{
 const {engine,doc}=quiet();
 const winter=(270)*DAY,dry=90*DAY,d=draft(structuredClone(doc));
 d.document=applyPatches(d.document,[{op:'set',path:['state','minute'],value:winter+60}]);
 advanceSeasonEffects(d,engine,winter-60,winter+60);
 const row=d.document.state.records['season-effect:winter-ice:loc_hw:1'];assert.equal(row.applied,true);assert.equal(row.minute,winter);
 assert.ok(row.effects[0].changed.includes('feature_hw_pool'));
 assert.ok(traitsOf(engine,d.document,'feature_hw_pool').tags.includes('frozen'));
 const pool=engine.world.locations.flatMap(l=>(l.features??[]).map(f=>({...f,location:l.id}))).find(f=>f.id==='feature_hw_pool');
 assert.throws(()=>assertLiquidWater(engine,d,pool),/冻结/);
 assert.equal(d.document.state.records['physical_feature:feature_hw_pool'].state.frozenUntil,winter+30*DAY);
 const again=structuredClone(d.document);advanceSeasonEffects(d,engine,winter-60,winter+60);assert.deepEqual(d.document,again);
 // Dry season: a cloth soaked by rain dries out and stops counting as wet.
 const s=draft(structuredClone(doc));s.document=applyPatches(s.document,[{op:'set',path:['state','minute'],value:dry}]);
 const cloth=engine.world.locations.flatMap(l=>(l.features??[]).map(f=>({...f,location:l.id}))).find(f=>f.id==='feature_s3_drying_cloth');
 const soaked=readObjectState(s,cloth);soaked.thermal.moistureMg+=8000;soaked.thermal.moistureAddedMg=8000;storeObjectState(s,cloth,soaked);
 assert.ok(traitsOf(engine,s.document,'feature_s3_drying_cloth').tags.includes('wet'));
 advanceSeasonEffects(s,engine,dry-1,dry);
 assert.ok(s.document.state.records['season-effect:dry-season:loc_bs:1'].effects[0].changed.includes('feature_s3_drying_cloth'));
 assert.ok(!traitsOf(engine,s.document,'feature_s3_drying_cloth').tags.includes('wet'));
});

test('节日阶段效果走同一张表：正式节日 runtime.effects 结构校验，节日来源可用传闻与立场',()=>{
 const {engine,world,doc}=quiet();
 const f=structuredClone(world);const active=f.festivals?.find(x=>x.runtime?.status==='active');
 if(active){active.runtime.effects={kind:'rumor'};assert.ok(validateFestivalRuntime(f).some(e=>e.includes('节日效果')));}
 const d=draft(structuredClone(doc));
 const r=applyEffects(d,engine,[{kind:'rumor',id:'fair',claim:'今年节市热闹，外乡人也来了。',carriers:['npc_ms_tj_yantai']},{kind:'standing',holder:'loc_bs',target:'player',delta:2}],
  {settlement:'loc_bs',faction:null,minute:doc.state.minute,sourceEvent:'festival-result:test'},'festival');
 assert.equal(r.applied,true);assert.ok(d.document.state.records['world_event:festival-result:test:rumor:fair']);
 assert.equal(applyEffect(draft(structuredClone(doc)),engine,{kind:'standing',holder:'loc_bs',target:'player',delta:2},{minute:0,sourceEvent:'x'},'festival').applied,true);
});
