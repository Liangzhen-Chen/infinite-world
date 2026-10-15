import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {publishR10A,reviewR10A} from '../tools/r10a-review.mjs';

const world=await loadWorld(),{entries}=JSON.parse(await fs.readFile('world/drafts/r10a/entries.json','utf8'));
const l2=JSON.parse(await fs.readFile('world/drafts/r10a/l2.json','utf8'));
const at=(keys)=>keys[0]==='items'?world.items.find(i=>i.id===keys[1]):keys.slice(1).reduce((o,k)=>o?.[k],world.rules);

test('正式世界只含L2通过的审核原文；L2两次仍有硬事实的条目不发布',()=>{
 for(const e of entries){
  const r=l2.rows.find(x=>x.id===e.id);
  if(r.passed)assert.deepEqual(at(e.target),e.value,e.id);
  else{assert.equal(r.attempts.filter(a=>(a.revision??1)===(e.revision??1)).length,2,e.id);assert.notDeepEqual(at(e.target),e.value,e.id);}
 }
 assert.equal(world.rules.law.activityPenalties.illegal_mining,undefined);
});

test('临时目录重发零改动；审核后改正文或L4不达标在写入前拒绝',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'r10a-publish-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const folder of ['meta','people','geo','lore','drafts/r10a'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 const out=await publishR10A({root,publish:true});
 assert.deepEqual(out.changed,[]);assert.deepEqual(out.withheld,l2.rows.filter(r=>!r.passed).map(r=>r.id));assert.ok(out.l4.average>=4&&out.l4.minimum>=3);
 for(const [file,mutate,reason]of [
  ['entries.json',d=>{d.entries.find(e=>e.id==='u15_custom_lielu').value.offenses.illegal_mining.standing=-1;},/审核后内容已改变/],
  ['l4.json',d=>{d.rows[0].scores[0]=2;},/L4/],
 ]){
  const target=path.join(root,'drafts/r10a',file),original=await fs.readFile(target,'utf8'),row=JSON.parse(original);mutate(row);await fs.writeFile(target,JSON.stringify(row));
  await assert.rejects(publishR10A({root,publish:true}),reason);await fs.writeFile(target,original);
 }
});

test('L2续跑不重复调用已通过条目，被否决条目最多重跑一次',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'r10a-l2-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const write=(name,v)=>fs.writeFile(path.join(root,name),JSON.stringify(v));
 await write('entries.json',{entries:[{id:'a',target:['rules','x'],value:{text:'甲'}}]});
 let calls=0;const client={spent:0,reserved:0,generate:async()=>{calls++;return{choices:[{message:{content:'{"contradictions":[{"quote":"甲","field":"text","severity":"硬事实","reason":"冲突"}]}'}}],measurement:{costUpperYuan:0.001}};}};
 for(let i=0;i<3;i++)await reviewR10A({root,client});
 const rows=JSON.parse(await fs.readFile(path.join(root,'l2.json'),'utf8')).rows;
 assert.equal(calls,2);assert.equal(rows[0].passed,false);assert.equal(rows[0].attempts.length,2);
});
