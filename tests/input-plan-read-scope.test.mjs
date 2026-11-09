import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,inn} from './helpers/finance.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {registerHouseholdFoodSources} from '../server-plugin/household-budget.mjs';
import {withReadScope} from '../server-plugin/read-scope.mjs';
import '../server-plugin/building-maintenance.mjs';

// npc-autonomy 的筹料规划（inputProcurement）是只读规划：作用域内与作用域外逐字相等，且重复读取命中。
const seller='npc_hw_ayan',plain=x=>JSON.parse(JSON.stringify(x));
// 已学配方的业主缺一份木料，在场的可知卖家手里有货：inputProcurement 的真实制作筹料前提（同 s5-law-procurement 的配方用例，卖家改在本地）。
function craft(){
 const f=fixture({at:inn});delete f.w.rules.weather;f.doc.state.location='loc_hw';
 Object.assign(f.w.rules.facilities.maintenance,{horizonDays:14,delayMaxPermille:0,stubbornPermille:0,noisePermille:0});
 f.e.byId.get(inn).lodging.rooms=20;
 f.w.rules.economy.rentalCopperPerNight=10;f.w.rules.economy.dailyIncomeBySkillStage[0]=[1,1];
 f.doc.state.buildings[inn].condition=100;
 const recipe=f.e.byId.get('recipe_wooden_pegs');
 f.doc.state.npcs=Object.fromEntries([host,seller].map(id=>[id,f.doc.state.npcs[id]]));
 f.e.byId.get(host).relationships=[];
 f.doc.state.npcs[host].recipes={[recipe.id]:true};
 f.doc.state.npcs[host].inventory={};
 for(const tool of recipe.tools)f.doc.state.npcs[host].inventory[tool]={quantity:1,durability:100};
 f.doc.state.npcs[seller].inventory={item_wood:{quantity:20}};
 f.e.byId.get(inn).fixtures=[{fixture:'workbench',id:'station_test_woodworking',owner:host,fee:0}];
 f.e.byId.get(recipe.output.item).basePrice=100;
 f.doc=withLedger(f.e,f.doc).document;
 return {f,recipe,document:f.doc};
}
function counted(task){
 const original=registerHouseholdFoodSources.fn,calls=[];
 registerHouseholdFoodSources.fn=(d,engine,owner,options)=>{calls.push(owner);return original(d,engine,owner,options);};
 try{return {result:task(),calls};}finally{registerHouseholdFoodSources.fn=original;}
}
// 每次用新的主观视图（视图本身按观察者重建），连续规划两次，如同一日内相邻居民/步骤。
const plan=({f,recipe,document})=>[0,1].map(()=>facilityRuntime().inputProcurement(f.e,document,subjectiveView(f.e,document,host),[{kind:'craft',recipe:recipe.id}]));
test('inputProcurement 在作用域内与独立重算逐字一致，且重复读命中',{timeout:600000},()=>{
 const a=craft(),b=craft();
 const scoped=counted(()=>withReadScope(()=>plan(a))),fresh=counted(()=>plan(b));
 assert.ok(scoped.result[0].candidates.some(c=>c.legacy?.purpose==='craft:recipe_wooden_pegs'),'夹具应产生真实的筹料候选');
 assert.deepEqual(plain(scoped.result),plain(fresh.result));
 assert.ok(fresh.calls.length>0);
 assert.ok(scoped.calls.length<fresh.calls.length,`作用域内应命中：${scoped.calls.length} vs ${fresh.calls.length}`);
});
