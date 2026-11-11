// 复核口径：记忆可声明身份投影，复核命中时只比投影；懒填充的缓存字段不参与比较，身份字段变了要报；没声明的照旧全量比较。
import test from 'node:test';
import assert from 'node:assert/strict';
import {withRecordIndex,stateMemo,recordsMemo,setRecordIndexCheck,recordIndexCheck} from '../server-plugin/storage.mjs';

const identity=v=>({id:v.id});
const run=task=>{
 setRecordIndexCheck(true);recordIndexCheck.violations.length=0;
 try{return withRecordIndex(task);}finally{setRecordIndexCheck(false);}
};
test('stateMemo：懒填充字段变化不报误报，身份字段变了要报，没声明投影的照旧全量比较',()=>{
 const state={};
 run(()=>{
  const build=()=>({id:'a',lazy:new Map()});
  const first=stateMemo(state,'s',['k'],build,null,identity);
  first.lazy.set('x',1);
  assert.equal(stateMemo(state,'s',['k'],build,null,identity),first);
  assert.equal(recordIndexCheck.violations.length,0);
  assert.throws(()=>stateMemo(state,'s',['k'],()=>({id:'b',lazy:new Map()}),null,identity));
  assert.equal(recordIndexCheck.violations.length,1);
 });
 run(()=>{
  const build=()=>({id:'a',lazy:new Map()});
  const first=stateMemo(state,'full',['k'],build);
  first.lazy.set('x',1);
  assert.throws(()=>stateMemo(state,'full',['k'],build));
  assert.equal(recordIndexCheck.violations.length,1);
 });
});
test('recordsMemo：同样支持身份投影',()=>{
 const records={};
 run(()=>{
  const key={},build=()=>({id:'a',lazy:new Map()});
  const first=recordsMemo(records,key,build,null,identity);
  first.lazy.set('x',1);
  assert.equal(recordsMemo(records,key,build,null,identity),first);
  assert.equal(recordIndexCheck.violations.length,0);
  assert.throws(()=>recordsMemo(records,key,()=>({id:'b',lazy:new Map()}),null,identity));
 });
});
