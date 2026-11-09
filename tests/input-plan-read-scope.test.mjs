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
function repair(){
 const f=fixture({at:inn});f.doc.state.location='loc_hw';
 f.doc.state.buildings[inn].condition=59;
 f.doc.state.npcs[host].inventory.item_wood={quantity:4};
 f.doc.state.npcs[seller].inventory.item_stone={quantity:2};
 f.doc=withLedger(f.e,f.doc).document;
 const d=f.draft();d.set(['state','minute'],600);
 return {f,document:d.document};
}
function counted(task){
 const original=registerHouseholdFoodSources.fn,calls=[];
 registerHouseholdFoodSources.fn=(d,engine,owner,options)=>{calls.push(owner);return original(d,engine,owner,options);};
 try{return {result:task(),calls};}finally{registerHouseholdFoodSources.fn=original;}
}
// 每次用新的主观视图（视图本身按观察者重建），连续规划两次，如同一日内相邻居民/步骤。
const plan=({f,document})=>[0,1].map(()=>facilityRuntime().inputProcurement(f.e,document,subjectiveView(f.e,document,host),[]));
test('inputProcurement 在作用域内与独立重算逐字一致，且重复读命中',{timeout:600000},()=>{
 const a=repair(),b=repair();
 const scoped=counted(()=>withReadScope(()=>plan(a))),fresh=counted(()=>plan(b));
 assert.ok(scoped.result[0].candidates.some(c=>c.id.startsWith('repair_material:')),'夹具应产生真实的筹料候选');
 assert.deepEqual(plain(scoped.result),plain(fresh.result));
 assert.ok(fresh.calls.length>0);
 assert.ok(scoped.calls.length<fresh.calls.length,`作用域内应命中：${scoped.calls.length} vs ${fresh.calls.length}`);
});
