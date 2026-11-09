import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {laborCandidates} from '../server-plugin/npc-labor.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {registerHouseholdFoodSources,householdResources} from '../server-plugin/household-budget.mjs';
import {withRecordIndex} from '../server-plugin/storage.mjs';

// 一次 laborCandidates 内，普通文档读取器（无游标、无 stateMemo）的家计读取在同一状态与账本下共享：
// 结果与不共享时逐字一致，同一买方在同一份状态里不被重复读。
const world=await loadRuntimeWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const smith='npc_hw_duanyan';
function start(){
 const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'labor-household-read-scope');
 return {engine,doc};
}
// 在真实的口粮来源解析入口计数：每次调用就是一次未命中的买方家计读取（解析器由 household-budget 注册，这里只包一层计数后原样转发）。
function counted(task){
 const original=registerHouseholdFoodSources.fn,calls=[];
 registerHouseholdFoodSources.fn=(d,engine,owner,options)=>{calls.push({owner,state:d.get('state')});return original(d,engine,owner,options);};
 try{return {result:task(),calls};}finally{registerHouseholdFoodSources.fn=original;}
}
const run=({engine,doc})=>laborCandidates(engine,subjectiveView(engine,doc,smith),doc);

test('同一次候选生成内：同一买方在同一份状态里的口粮来源解析不重复；结果与独立重算逐字一致',{timeout:600000},()=>{
 const a=start(),b=start();
 const {result,calls}=counted(()=>withRecordIndex(()=>run(a)));
 const seen=new Set();
 for(const c of calls){
  const key=`${c.owner}`;
  // 同一份状态对象下同一买方至多解析一次（不同状态对象，如各人投影，才允许各读一次）。
  const id=`${key}|${[...new Set(calls.map(x=>x.state))].indexOf(c.state)}`;
  assert.ok(!seen.has(id),`重复解析 ${id}`);seen.add(id);
 }
 // 独立重算：新引擎、新文档、不在索引推进内（stateMemo 关闭），结果必须逐字相同。
 assert.deepEqual(JSON.parse(JSON.stringify(result)),JSON.parse(JSON.stringify(run(b))));
});

test('生成结束后作用域丢弃：普通读取器的读取每次都是新算，重复读取结果相同',{timeout:600000},()=>{
 const f=start();
 run(f);
 const read=()=>householdResources({document:f.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],f.doc)},f.engine,smith,{marketSubstitution:false});
 const before=read();
 assert.notEqual(read(),before,'作用域外普通读取器不缓存');
 assert.deepEqual(read(),before);
});
