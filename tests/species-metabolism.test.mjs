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
const speciesOf=(engine,state,id)=>state.npcs[id].species??engine.byId.get(id)?.species;
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
 for(const bad of [{satiety:5},{satiety:-1},{foo:1},{},{satiety:'0'},[0],null]){
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
 // 水分需求按规则表：每名成员每日 light×24（无其他修正时），只断言不低于该基数。
 assert.ok(plan.needs.hydration>=plan.members.length*bodyRule(f.engine,'hydration').drainPerHour.light*24*0.999);
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
 assert.doesNotThrow(()=>mergeMixedPublication(world,publication));
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
