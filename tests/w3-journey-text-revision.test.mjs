import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {differences,buildEntries,guardDifferences,readAuthorization,verifyApproval,runRevision,KINDS,revision,via} from '../world/design/w3-journey-text-revision.mjs';
import {editJSONText,draftFor,contextFor,validateDraft,applyCandidate,isPublished} from '../world/design/p1-revision-approval.mjs';
import {APPROVAL_SOURCES,readApprovedSupersedes} from '../tools/approved-revisions.mjs';

const world={items:[{id:'i1',description:'旧',inspection:'a',storage:'b'}],recipes:[{id:'r1',process:'旧正文',minutes:30,name:'甲'},{id:'r2',process:'同',minutes:5}]};
const rows=[{kind:'recipes',draft:{id:'r1',process:'新正文'}},{kind:'recipes',draft:{id:'r2',process:'同'}},{kind:'items',draft:{id:'i1',description:'旧',inspection:'a',storage:'b'}}];
const rec=()=>({fingerprint:'fp',attempts:1});
const auth=ids=>({approvedBy:'李白',ref:'批复 X',at:'2026-11-10',ids});
const tmp=()=>fs.mkdtemp(path.join(os.tmpdir(),'w3jt-'));

test('只为正文不同且在授权清单里的条目生成修订条目', async()=>{
 const diffs=await differences(world,rows,rec);
 assert.deepEqual(diffs.map(d=>`${d.id}.${d.field}`),['r1.process']);
 const entries=buildEntries(world,diffs,auth(['r1']));
 assert.equal(entries.length,1);
 const [e]=entries;
 assert.deepEqual([e.target,e.file,e.path,e.before,e.after],['r1','world/meta/recipes.json',['process'],'旧正文','新正文']);
 assert.ok(e.supersedes.length&&e.basis.length&&e.boundary);
});
test('items 的三个正文字段各自比较', async()=>{
 const diffs=await differences(world,[{kind:'items',draft:{id:'i1',description:'旧',inspection:'改',storage:'改2'}}],rec);
 assert.deepEqual(diffs.map(d=>d.field),KINDS.items.fields.filter(f=>f!=='description'));
});
test('有差异但不在授权清单里：报数量与例子，不生成任何条目', async()=>{
 const diffs=await differences(world,rows,rec);
 assert.throws(()=>buildEntries(world,diffs,auth([])),/有 1 处差异.*r1\.process.*不生成任何修订条目/);
 const two=[{id:'a',field:'process'},{id:'b',field:'process'}];
 assert.throws(()=>guardDifferences(two,auth(['a'])),/有 1 处差异.*b\.process/);
});
test('在清单里但没有差异：照实列出，不报错', ()=>{
 assert.deepEqual(guardDifferences([{id:'a',field:'process'}],auth(['a','z'])),['z']);
});
test('授权清单缺失或格式不对：报错', async()=>{
 const dir=await tmp(),file=path.join(dir,'authorization.json');
 await assert.rejects(readAuthorization(file),/缺少或无法读取授权清单/);
 for(const bad of ['{}','{"approvedBy":"李白","ref":"r","at":"t","ids":"r1"}','{"approvedBy":"李白","ref":"r","at":"t","ids":["a","a"]}','{"approvedBy":"","ref":"r","at":"t","ids":[]}','[1]']){
  await fs.writeFile(file,bad);
  await assert.rejects(readAuthorization(file),/授权清单格式不对/,bad);
 }
 await fs.writeFile(file,JSON.stringify(auth(['r1'])));
 assert.deepEqual((await readAuthorization(file)).ids,['r1']);
});

const entryFor=over=>({id:'r1-process',target:'r1',file:'world/meta/recipes.json',path:['process'],field:'process',before:'旧正文',after:'新正文',
 basis:['b'],facts:{},supersedes:[{receipt:'world/drafts/w3/journey/recipes/r1.json#r1',field:'process'}],boundary:'只改这一个字段',...over});
const approvedRows=[{kind:'recipes',draft:{id:'r1',process:'新正文'}},{kind:'items',draft:{id:'i1',description:'D',inspection:'I',storage:'S'}}];

test('verifyApproval：审批读不出就报错；after 与已审批草稿不等就报错；file/path 必须属于该类型', async()=>{
 await assert.rejects(verifyApproval([entryFor()],world,async()=>{throw new Error('批 1 尚未完成 L4');}),/尚未完成 L4/);
 await verifyApproval([entryFor()],world,async()=>approvedRows);
 await assert.rejects(verifyApproval([entryFor({after:'别的'})],world,async()=>approvedRows),/已审批正文与修订条目不符/);
 await assert.rejects(verifyApproval([entryFor({target:'zz'})],world,async()=>approvedRows),/没有已审批记录/);
 await assert.rejects(verifyApproval([entryFor({file:'world/meta/items.json'})],world,async()=>approvedRows),/文件不是 recipes/);
 await assert.rejects(verifyApproval([entryFor({path:['minutes'],field:'minutes'})],world,async()=>approvedRows),/字段不是 recipes 的正文字段/);
 await assert.rejects(verifyApproval([entryFor({target:'i1',file:'world/meta/items.json',path:['basePrice'],field:'basePrice'})],world,async()=>approvedRows),/字段不是 items 的正文字段/);
});

test('发布只改指名的 process 字段；before 与现状不符时报错', ()=>{
 const text=JSON.stringify([{id:'r1',process:'旧正文',minutes:30},{id:'r2',process:'同',minutes:5}],null,2)+'\n';
 const edit={target:'r1',path:['process'],before:'旧正文',after:'新正文'};
 const out=editJSONText(text,[edit]);
 assert.deepEqual(JSON.parse(out),[{id:'r1',process:'新正文',minutes:30},{id:'r2',process:'同',minutes:5}]);
 assert.equal(out.replace('新正文','旧正文'),text);
 assert.throws(()=>editJSONText(text,[{...edit,before:'别的'}]),/发布前事实已改变/);
});

// runRevision 的 approval 分支：工作目录换成临时目录，文件与回执都写在那里；世界仍读真实正式世界（目标 id 不在其中，故 isPublished 为假）。
const cfgFor=(entries,verify)=>({revision,root:'rev',CARD:'W3JT',limitYuan:0,frozen:{revision,entries},buildEntries:async()=>entries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 approval:{via,receipt:'world/drafts/w3/journey',verify}});
async function inTmp(fn){
 const dir=await tmp(),old=process.cwd();
 await fs.mkdir(path.join(dir,'world/meta'),{recursive:true});
 await fs.mkdir(path.join(dir,'rev'),{recursive:true}); // 真实流程里 --prepare 已建好批目录（candidate.json 所在）；夹具注入 frozen，须自己建同一目录
 await fs.writeFile(path.join(dir,'world/meta/recipes.json'),JSON.stringify([{id:'r1',process:'旧正文',minutes:30}],null,2)+'\n');
 process.chdir(dir);
 try{await fn(dir);}finally{process.chdir(old);}
}
test('approval 分支 --publish：先核验审批，只改 process，写回执（receipt 指向 journey）', async()=>{
 await inTmp(async()=>{
  const calls=[];
  await runRevision(cfgFor([entryFor()],async entries=>{calls.push(entries.length);}),['--publish']);
  assert.deepEqual(calls,[1]);
  assert.deepEqual(JSON.parse(await fs.readFile('world/meta/recipes.json','utf8')),[{id:'r1',process:'新正文',minutes:30}]);
  const pub=JSON.parse(await fs.readFile('rev/publication.json','utf8'));
  assert.equal(pub.receipt,'world/drafts/w3/journey');
  assert.deepEqual(pub.entries.map(x=>[x.id,x.before,x.after]),[['r1-process','旧正文','新正文']]);
 });
 await inTmp(async()=>{
  await assert.rejects(runRevision(cfgFor([entryFor()],async()=>{throw new Error('审批不通过');}),['--publish']),/审批不通过/);
  assert.equal(JSON.parse(await fs.readFile('world/meta/recipes.json','utf8'))[0].process,'旧正文');
 });
 await inTmp(async()=>{
  await assert.rejects(runRevision(cfgFor([entryFor({before:'不是现状'})],async()=>{}),['--publish']),/发布前事实已改变/);
 });
});
test('approval 分支 --verify 与 --review', async()=>{
 await inTmp(async()=>{
  await assert.rejects(runRevision(cfgFor([entryFor()],async()=>{}),['--verify']),/正式文件与回执不符/);
  await assert.rejects(runRevision(cfgFor([entryFor()],async()=>{throw new Error('审批不通过');}),['--verify']),/审批不通过/);
  await assert.rejects(runRevision(cfgFor([entryFor()],async()=>{}),['--review']),/本批不单独 L2/);
 });
});

test('readApprovedSupersedes 读取带 approval 的回执：走登记的审批来源；来源未登记或核验失败即报错', async()=>{
 const dir=await tmp(),batch=path.join(dir,'w3-journey-text'),e=entryFor();
 await fs.mkdir(batch,{recursive:true});
 await fs.writeFile(path.join(batch,'candidate.json'),JSON.stringify({revision,approval:{via},entries:[e],drafts:[draftFor(e)],contexts:[contextFor(e)]}));
 const entry={id:e.id,target:e.target,file:e.file,field:e.field,before:e.before,after:e.after,supersedes:e.supersedes};
 await fs.writeFile(path.join(batch,'publication.json'),JSON.stringify({revision,publishedAt:'t',entries:[entry],receipt:'world/drafts/w3/journey'}));
 const saved=APPROVAL_SOURCES[via];
 try{
  const seen=[];
  APPROVAL_SOURCES[via]=async()=>({verifyFrozen:async entries=>{seen.push(entries.map(x=>x.id));}});
  const out=await readApprovedSupersedes(dir);
  assert.deepEqual(seen,[['r1-process']]);
  assert.deepEqual(out.map(s=>[s.targetId,s.label,s.before,s.after]),[['r1','process','旧正文','新正文']]);
  APPROVAL_SOURCES[via]=async()=>({verifyFrozen:async()=>{throw new Error('审批读不出');}});
  await assert.rejects(readApprovedSupersedes(dir),/审批读不出/);
  delete APPROVAL_SOURCES[via];
  await assert.rejects(readApprovedSupersedes(dir),/审批来源未登记/);
 }finally{APPROVAL_SOURCES[via]=saved;}
});
