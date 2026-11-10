// setRecordRow：对本地快照里 state.records 原地写一行时，索引与记忆只更新这行影响到的部分，结果与不缓存时逐行相同；
// 状态改动后读到新值（缓存作废），无关分类的索引桶不重建。复核口径（FIELDS_INDEX_CHECK）开启，任何过期都会抛。
import test from 'node:test';
import assert from 'node:assert/strict';
import {withRecordIndex,recordsWhere,recordEntriesWhere,recordsMemo,stateMemo,setRecordRow,setRecordIndexCheck,recordIndexCheck} from '../server-plugin/storage.mjs';

const fresh=()=>({records:{
 'a:1':{id:'a:1',category:'alpha',kind:'k',n:1},
 'b:1':{id:'b:1',category:'beta',kind:'k',n:2},
 'a:2':{id:'a:2',category:'alpha',kind:'k',n:3},
 'c:1':{id:'c:1',category:'gamma',kind:'k',n:4}
}});
const scan=(records,category)=>Object.values(records).filter(r=>r?.category===category);
const run=task=>{
 setRecordIndexCheck(true);recordIndexCheck.violations.length=0;
 try{return withRecordIndex(task);}finally{setRecordIndexCheck(false);}
};
// 记忆计数的测试不开复核口径：复核命中时会再建一次来比较，计数会多出来。
const plain=task=>withRecordIndex(task);
// 建桶需要同一分类被查两次（第一次扫描，第二次建桶）。
const warm=(records,...categories)=>{for(const c of categories){recordsWhere(records,'category',c);recordsWhere(records,'category',c);recordEntriesWhere(records,'category',c);recordEntriesWhere(records,'category',c);}};

test('setRecordRow：同分类改写一行，索引读到新行且与扫描一致，无关分类的桶保持原数组',()=>{
 const state=fresh();
 run(()=>{
  warm(state.records,'alpha','beta');
  const beta=recordsWhere(state.records,'category','beta');
  const next={id:'a:2',category:'alpha',kind:'k',n:30};
  setRecordRow(state,'a:2',next);
  assert.equal(state.records['a:2'],next);
  const alpha=recordsWhere(state.records,'category','alpha');
  assert.deepEqual(alpha,scan(state.records,'alpha'));
  assert.equal(alpha[1],next);
  assert.deepEqual(recordEntriesWhere(state.records,'category','alpha').map(([id,r])=>[id,r.n]),[['a:1',1],['a:2',30]]);
  assert.equal(recordsWhere(state.records,'category','beta'),beta);
  assert.equal(recordIndexCheck.violations.length,0);
 });
});
test('setRecordRow：新增一行与改分类都让索引与扫描一致',()=>{
 const state=fresh();
 run(()=>{
  warm(state.records,'alpha','beta');
  setRecordRow(state,'a:3',{id:'a:3',category:'alpha',kind:'k',n:5});
  assert.deepEqual(recordsWhere(state.records,'category','alpha'),scan(state.records,'alpha'));
  setRecordRow(state,'a:1',{id:'a:1',category:'beta',kind:'k',n:1});
  assert.deepEqual(recordsWhere(state.records,'category','alpha'),scan(state.records,'alpha'));
  assert.deepEqual(recordsWhere(state.records,'category','beta'),scan(state.records,'beta'));
  assert.deepEqual(recordEntriesWhere(state.records,'category','beta').map(([id])=>id),Object.keys(state.records).filter(id=>state.records[id].category==='beta'));
  assert.equal(recordIndexCheck.violations.length,0);
 });
});
test('setRecordRow：依赖这行的记忆作废并重建，值与不缓存时相同；声明不读该分类的记忆保留',()=>{
 const state=fresh(),sumKey={},otherKey={};let builds=0,otherBuilds=0;
 const sum=()=>recordsMemo(state.records,sumKey,()=>{builds++;return scan(state.records,'alpha').reduce((n,r)=>n+r.n,0);});
 const other=()=>recordsMemo(state.records,otherKey,()=>{otherBuilds++;return scan(state.records,'gamma').length;},{categories:['gamma']});
 plain(()=>{
  assert.equal(sum(),4);assert.equal(sum(),4);assert.equal(builds,1);
  assert.equal(other(),1);assert.equal(other(),1);assert.equal(otherBuilds,1);
  setRecordRow(state,'a:2',{id:'a:2',category:'alpha',kind:'k',n:30});
  assert.equal(sum(),31);
  assert.equal(builds,2);
  assert.equal(other(),1);
  assert.equal(otherBuilds,1);
 });
});
test('setRecordRow：stateMemo 在状态改动后作废，值与不缓存时相同',()=>{
 const state=fresh();let builds=0;
 const read=()=>stateMemo(state,'scope',['x'],()=>{builds++;return Object.values(state.records).filter(r=>r.category==='alpha').length;});
 plain(()=>{
  assert.equal(read(),2);assert.equal(read(),2);assert.equal(builds,1);
  setRecordRow(state,'a:3',{id:'a:3',category:'alpha',kind:'k',n:5});
  assert.equal(read(),3);
  assert.equal(builds,2);
 });
});
test('setRecordRow：没有索引作用域时也只是普通写入',()=>{
 const state=fresh();
 setRecordRow(state,'a:1',{id:'a:1',category:'alpha',kind:'k',n:9});
 assert.equal(state.records['a:1'].n,9);
 assert.deepEqual(recordsWhere(state.records,'category','alpha'),scan(state.records,'alpha'));
});
