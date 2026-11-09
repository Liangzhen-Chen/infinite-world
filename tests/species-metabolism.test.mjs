// 物种代谢系数（nature.metabolism）：木精等不进食的物种，饱食需求由规则整类推出为 0。数值一律由规则表与引擎读出，不手填。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {bodyRule,bodyDrain,readBodyState} from '../server-plugin/primitives-body.mjs';
import {householdMealPlan} from '../server-plugin/household-budget.mjs';
import {saleableStock} from '../server-plugin/market.mjs';
import {societyForageNeed} from '../server-plugin/wildlife-society.mjs';
import {explainDerived} from '../server-plugin/derived.mjs';
import {settlementMouths,settlementMealRatio,mealMouthsOf} from '../server-plugin/primitives-body.mjs';
import {batchIds,places} from '../world/design/creatures-mixed.mjs';
import {generateCounty} from '../server-plugin/remote-generation.mjs';
import {mouthWeight} from '../server-plugin/household-subsistence.mjs';
import {readMixedPublication,mergeMixedPublication} from '../tools/publish-creatures-mixed.mjs';
import {validateCreatureNature} from '../server-plugin/creature-nature.mjs';

const DAY=1440,ELM='monster_knot_elm_sprite',HAZELNUT='item_hazelnut';
const world=await loadWorld();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(world);let document=engine.createCharacter(seed,{},'species-metabolism');
 document=applyPatches(document,planBossMigration(document,world.rules,world.bosses,world));
 const run=async(doc,tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result};};
 return{engine,document,run};
}
// 户成员与具名居民不一定都已落到 state.npcs（未落实者取目录里的物种），与 metabolismFactor 同口径。
const speciesOf=(engine,state,id)=>state.npcs?.[id]?.species??engine.byId.get(id)?.species;
const stockOf=(d,id,item)=>{const x=d.state.npcs[id].inventory?.[item];return typeof x==='number'?x:x?.quantity??0;};
// 持有榛仁的木精居民与一个不带代谢系数的居民，都由数据挑出。
function pick(f){
 const state=f.document.state,ids=Object.keys(state.npcs);
 const elm=ids.find(id=>speciesOf(f.engine,state,id)===ELM&&stockOf(f.document,id,HAZELNUT)>0);
 const plain=ids.find(id=>id!==elm&&f.engine.byId.get(speciesOf(f.engine,state,id))?.nature?.metabolism===undefined);
 assert.ok(elm&&plain);return {elm,plain};
}

test('代谢系数校验：只允许饱食/水分两键，取值 0 到 4；正式数据全部通过',()=>{
 assert.deepEqual(validateCreatureNature(world),[]);
 const base=world.monsters.find(m=>m.id===ELM);assert.deepEqual(base.nature.metabolism,{satiety:0});
 for(const bad of [{satiety:0.001},{satiety:5},{satiety:-1},{foo:1},{},{satiety:'0'},[0],null]){
  const errors=validateCreatureNature({...world,monsters:[{...base,nature:{...base.nature,metabolism:bad}}]});
  assert.ok(errors.some(e=>e.includes(ELM)&&/代谢系数/.test(e)),JSON.stringify(bad));
 }
 assert.deepEqual(validateCreatureNature({...world,monsters:[{...base,nature:{...base.nature,metabolism:{satiety:0.5,hydration:4}}}]}),[]);
});

test('统一入口：不进食者饱食消耗为 0、水分仍按规则表；无物种与玩家按规则表',()=>{
 const f=fixture(),{elm,plain}=pick(f),state=f.document.state;
 assert.equal(bodyDrain(f.engine,state,elm,'satiety'),0);
 assert.equal(bodyDrain(f.engine,state,elm,'hydration'),bodyRule(f.engine,'hydration').drainPerHour.light);
 for(const who of [plain,'player'])for(const need of ['satiety','hydration','stamina'])assert.equal(bodyDrain(f.engine,state,who,need),bodyRule(f.engine,need).drainPerHour.light);
});

test('饱食不随时间下降且不触发饥饿；人形 NPC 照常下降',async()=>{
 const f=fixture(),{elm,plain}=pick(f),d=structuredClone(f.document),minute=d.state.minute;
 for(const id of [elm,plain])d.state.npcs[id].body={satiety:{value:100,asOf:minute,activity:'light'},hydration:{value:100,asOf:minute,activity:'light'}};
 const later=minute+3*DAY,rule=bodyRule(f.engine,'satiety');
 assert.equal(readBodyState(f.engine,d,elm,'satiety',later).value,100);
 assert.ok(readBodyState(f.engine,d,elm,'satiety',later).value>=rule.thresholds.hungry);
 assert.ok(readBodyState(f.engine,d,elm,'hydration',later).value<100,'木精的水分仍随时间下降');
 const human=readBodyState(f.engine,d,plain,'satiety',minute+DAY).value;
 assert.ok(Math.abs(human-(100-rule.drainPerHour.light*24))<0.01,`人形一日后饱食${human}`);
 // 真实推进数日：木精一户没有饱食口粮需求，饱食始终不动。
 const out=(await f.run(f.document,'world_time',{minutes:3*DAY},'metabolism-wait')).document;
 assert.equal(readBodyState(f.engine,out,elm,'satiety').value,readBodyState(f.engine,f.document,elm,'satiety').value);
});

test('木精一户的口粮需求：饱食分量为 0，水分按人形；榛仁没有饱食口粮预留',()=>{
 const f=fixture(),{elm}=pick(f),draft=f.engine.primitiveDraft(f.document),state=f.document.state;
 const plan=householdMealPlan(draft,f.engine,elm);
 assert.ok(plan.members.length>0);
 for(const id of plan.members)assert.equal(f.engine.byId.get(speciesOf(f.engine,state,id))?.nature?.metabolism?.satiety,0,id);
 assert.equal(plan.needs.satiety,0);assert.equal(plan.shortfall.satiety,0);
 assert.ok(plan.needs.hydration>0);
 // 水分需求由规则精确推出：各成员按人形规则表每日 light×24，经同一 body:drain 派生求和。
 const rule=bodyRule(f.engine,'hydration');
 assert.equal(plan.needs.hydration,plan.members.reduce((n,id)=>n+explainDerived(f.engine,draft.document,'body:drain',id,{base:rule.drainPerHour.light*24}).value,0));
 const sale=saleableStock(draft,f.engine,elm,HAZELNUT);
 assert.equal(sale.available,sale.stock-sale.retained);assert.ok(sale.retained<sale.stock);assert.ok(sale.available>=1);
});

test('公共口粮人头按饱食代谢加权：不进食者权重 0，其余为 1；后补的代谢字段不使重新发布判冲突',async()=>{
 const f=fixture(),{elm,plain}=pick(f),state=f.document.state;
 assert.equal(mouthWeight(f.engine,state,[elm]),0);
 assert.equal(mouthWeight(f.engine,state,[plain,'player']),2);
 assert.equal(mouthWeight(f.engine,state,[elm,plain]),1);
 // 正式目录里的 nature.metabolism 是后补字段：本批骨架不含它，合并不报“正式条目冲突”。
 const publication=await readMixedPublication();
 // 正式地点、物品等在本批之后另有补充，与本批骨架不逐字相同，那是既有口径；这里只验证物种：取出本批的地点、路线、物品、栖地后重新发布，物种目录（带 metabolism）不判冲突，且结果仍带 metabolism。
 const input=structuredClone(world),ids=batchIds;
 input.locations=input.locations.filter(l=>!ids.places.includes(l.id));input.routes=input.routes.filter(r=>!places.some(p=>p.route.id===r.id));
 input.items=input.items.filter(i=>!ids.items.includes(i.id));input.rules.wildlife.habitats=input.rules.wildlife.habitats.filter(h=>!ids.habitats.includes(h.id));
 const merged=mergeMixedPublication(input,publication);
 assert.equal(merged.monsters.find(m=>m.id===ELM).nature.metabolism.satiety,0);
});

test('精怪社会觅食需求按成员饱食代谢加权：不进食的游魂、沼火灵不占口粮',()=>{
 const f=fixture(),doc=structuredClone(f.document),per=f.engine.rules.wildlifeAwakening.society.foragePerMember;
 const spirits=world.monsters.filter(m=>m.nature?.spirit&&m.nature.metabolism?.satiety===0).map(m=>m.id),eaters=world.monsters.filter(m=>m.nature?.spirit&&m.nature.metabolism===undefined).map(m=>m.id);
 assert.ok(spirits.length>0&&eaters.length>0);
 doc.state.creatures??={};
 doc.state.creatures.t_fast=doc.state.creatures.t_fast??{species:spirits[0]};doc.state.creatures.t_eat={species:eaters[0]};
 const d=f.engine.primitiveDraft(doc);
 assert.equal(societyForageNeed(d,f.engine,['t_fast']),0);
 assert.equal(societyForageNeed(d,f.engine,['t_fast','t_eat']),per);
 assert.equal(societyForageNeed(d,f.engine,['t_eat','t_eat']),per*2);
});

// 人口：状态里有聚落账就取账上人口，否则取世界定义的具名加待生成总数。
const headCount=(state,p)=>state.settlements?.[p.id]?.population??(p.residentIds??[]).length+(p.pendingSpeciesStructure?Object.values(p.pendingSpeciesStructure).reduce((n,g)=>n+g.population,0):p.pendingPopulation??0);
// 期望口数由世界数据与运行时存活居民推出：存活具名居民按各自物种因子，余数按世界定义的物种构成均值。
function expectedMouths(f,state,p,population){
 const factor=sp=>f.engine.byId.get(sp)?.nature?.metabolism?.satiety??1;
 const alive=(p.residentIds??[]).filter(id=>!(state.npcs[id]?.status==='死亡'));
 const named=alive.reduce((n,id)=>n+factor(f.engine.byId.get(id)?.species),0);
 const pend=p.pendingSpeciesStructure?Object.entries(p.pendingSpeciesStructure):[],tot=pend.reduce((n,[,g])=>n+g.population,0);
 const share=tot>0?pend.reduce((n,[sp,g])=>n+g.population*factor(sp),0)/tot:1;
 return population<alive.length?named*population/alive.length:named+(population-alive.length)*share;
}
const mixedProfile=f=>world.settlementProfiles.find(p=>p.pendingSpeciesStructure&&Object.keys(p.pendingSpeciesStructure).some(sp=>f.engine.byId.get(sp)?.nature?.metabolism?.satiety===0));

test('聚落公仓口粮按存活居民与物种构成派生：人类聚落恰为 1，混居聚落为实数口数',()=>{
 const f=fixture(),state=f.document.state;let plain=0,mixed=0;
 for(const p of world.settlementProfiles){
  const pop=headCount(state,p);if(!(pop>0))continue;
  const mouths=settlementMouths(f.engine,state,p.id,pop),want=expectedMouths(f,state,p,pop);
  if(want===pop){plain++;assert.equal(mouths,pop,p.id);assert.equal(settlementMealRatio(f.engine,state,p.id),1);}
  else{mixed++;assert.ok(Math.abs(mouths-want)<1e-9,`${p.id} ${mouths} vs ${want}`);assert.ok(mouths<pop);}
 }
 assert.ok(plain>0&&mixed>0);
});

test('木精居民全部死亡后，聚落口数按剩余居民与世界构成重算；人口 1 的口数是实数而非取整为 0',()=>{
 const f=fixture(),p=mixedProfile(f),d=structuredClone(f.document),state=d.state,pop=headCount(state,p);
 const before=settlementMouths(f.engine,state,p.id,pop);
 for(const id of p.residentIds)if(f.engine.byId.get(id)?.species&&f.engine.byId.get(f.engine.byId.get(id).species)?.nature?.metabolism?.satiety===0)state.npcs[id]={...state.npcs[id],status:'死亡'};
 const after=settlementMouths(f.engine,state,p.id,pop);
 assert.ok(Math.abs(after-expectedMouths(f,state,p,pop))<1e-9);assert.ok(after>before,'不进食居民死亡后，占口粮的比例上升');
 // 人口 1：口数等于规则推出的实数份额，严格介于 0 与 1 之间，不被取整。
 const one=settlementMouths(f.engine,state,p.id,1),want=expectedMouths(f,state,p,1);
 assert.ok(Math.abs(one-want)<1e-9);assert.ok(one>0&&one<1&&!Number.isInteger(one));
 assert.equal(mealMouthsOf(f.engine,state,p.id,1),one);
});

test('远方生成的木精聚落人物按其物种计入加权：不进食者不占公仓口粮',()=>{
 const f=fixture(),county='county_wushan_shanyi',skeleton=generateCounty(world,county,'species-metabolism');
 const elms=skeleton.people.filter(p=>f.engine.byId.get(p.species)?.nature?.metabolism?.satiety===0);
 assert.ok(elms.length>0);
 const sid=elms[0].settlement,here=elms.filter(p=>p.settlement===sid);
 const d=structuredClone(f.document);d.state.remote={[county]:{skeleton}};
 for(const p of here)d.state.npcs[p.id]={species:p.species,materialized:{county,settlement:sid}};
 const population=here.length+5;
 // 世界里没有该聚落的档案：具名者按各自因子（0），其余人头按人形（1）；数值由规则推出。
 assert.equal(settlementMouths(f.engine,d.state,sid,population),population-here.length);
 for(const p of here)d.state.npcs[p.id].status='死亡';
 assert.equal(settlementMouths(f.engine,d.state,sid,population-here.length),population-here.length);
});
