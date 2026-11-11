import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {manualRewriteProfile,householdRoot,w3Revision} from '../tools/w3-household.mjs';
import {validateTradesDraft} from '../tools/w3-trades.mjs';
import {manualRewriteProfile as journeyProfile} from '../tools/w3-journey.mjs';
import {itemTextIssues} from '../tools/w3-item-check.mjs';
import {differences,buildEntries,readAuthorization,verifyApproval,runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished,revision,root,via,authorizationFile,KINDS} from '../world/design/w3-household-text-revision.mjs';
import {APPROVAL_SOURCES,readApprovedSupersedes} from '../tools/approved-revisions.mjs';

const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const tmp=()=>fs.mkdtemp(path.join(os.tmpdir(),'w3hh-'));

test('基础批 manualRewriteProfile：形状同 journey；物品 L1 含 ITEMCK 与用量检查，与行当批同一校验', async()=>{
 const profile=await manualRewriteProfile('items'),journey=await journeyProfile('items');
 assert.deepEqual(Object.keys(profile).sort(),Object.keys(journey).sort());
 assert.ok(profile.entries.length>0&&profile.entries.every(e=>e.id.startsWith('item_')));
 assert.ok((await manualRewriteProfile('recipes')).entries.length>0);
 await assert.rejects(manualRewriteProfile('nope'),/--kind 须为 items 或 recipes/);
 assert.equal(householdRoot,'world/drafts/w3');
 assert.equal(typeof w3Revision,'string');
 const block=await read('world/meta/blocklist.json');
 // L1 结果必须等于 validateTradesDraft（含 itemTextIssues、itemClaimIssues、unitlessMeasureIssues），且 itemTextIssues 的报错被带入
 for(const entry of profile.entries){
  const context=profile.contextFor(entry),draft={id:entry.id,description:'太短',inspection:'太短',storage:'太短'};
  const got=profile.validateDraft(draft,entry,context);
  assert.deepEqual(got,validateTradesDraft(draft,entry,block,context));
  for(const message of itemTextIssues(draft,entry,context))assert.ok(got.errors.includes(message),message);
 }
});

const auth=ids=>({approvedBy:'李白',ref:'批复 X',at:'2026-11-10',ids});
const recOf=()=>({fingerprint:'fp',attempts:1,l4Rejection:{ids:['r1']}});
const world={items:[],recipes:[{id:'r1',process:'旧正文',minutes:30},{id:'r2',process:'旧二',minutes:5},{id:'r3',process:'同',minutes:7}]};
const rows=[{kind:'recipes',draft:{id:'r1',process:'新正文'}},{kind:'recipes',draft:{id:'r2',process:'新二'}},{kind:'recipes',draft:{id:'r3',process:'同'}}];

test('基础批修订批配置：revision、根目录、字段、授权清单路径、登记的审批来源', async()=>{
 assert.equal(revision,'w3-household-text-1');
 assert.equal(root,'world/drafts/w3-household-text');
 assert.equal(authorizationFile,`${root}/authorization.json`);
 assert.equal(via,'w3-household-text');
 assert.deepEqual(KINDS.items.fields,['description','inspection','storage']);
 assert.deepEqual(KINDS.recipes.fields,['process']);
 const source=await APPROVAL_SOURCES[via]();
 assert.equal(typeof source.verifyFrozen,'function');
 assert.equal(source.revision,revision);
});

test('只认授权清单里的 id：未列出的差异整批停下；来源记录指向基础批', async()=>{
 const diffs=await differences(world,rows,recOf);
 assert.deepEqual(diffs.map(d=>d.id),['r1','r2']);
 const [e]=buildEntries(world,diffs.filter(d=>d.id==='r1'),auth(['r1']));
 assert.equal(e.supersedes[0].receipt,`${householdRoot}/recipes/r1.json#r1`);
 assert.equal(e.facts.household.revision,w3Revision);
 assert.throws(()=>buildEntries(world,diffs,auth(['r1'])),/有 1 处差异.*r2\.process.*不生成任何修订条目/);
});

test('没有授权清单：按审批未齐拒绝（APPROVAL_INCOMPLETE），格式不对是普通错误', async()=>{
 const dir=await tmp(),file=path.join(dir,'authorization.json');
 await assert.rejects(readAuthorization(file),e=>e.code==='APPROVAL_INCOMPLETE'&&/缺少或无法读取授权清单/.test(e.message));
 await fs.writeFile(file,'{"approvedBy":"李白"}');
 await assert.rejects(readAuthorization(file),e=>e.code!=='APPROVAL_INCOMPLETE'&&/授权清单格式不对/.test(e.message));
 await fs.writeFile(file,JSON.stringify(auth(['r1'])));
 assert.deepEqual((await readAuthorization(file)).ids,['r1']);
});

const entryFor=over=>({id:'r1-process',target:'r1',file:'world/meta/recipes.json',path:['process'],field:'process',before:'旧正文',after:'新正文',
 basis:['b'],facts:{},supersedes:[{receipt:`${householdRoot}/recipes/r1.json#r1`,field:'process'}],boundary:'只改这一个字段',...over});
const approvedRows=[{kind:'recipes',draft:{id:'r1',process:'新正文'}},{kind:'recipes',draft:{id:'r3',process:'同'}}];

test('verifyApproval：只认已审批记录里的正文', async()=>{
 await assert.rejects(verifyApproval([entryFor()],world,async()=>{throw new Error('批 1 尚未完成 L4');}),/尚未完成 L4/);
 await verifyApproval([entryFor()],world,async()=>approvedRows);
 await assert.rejects(verifyApproval([entryFor({target:'r2',id:'r2-process'})],world,async()=>approvedRows),/household 没有已审批记录 r2/);
 await assert.rejects(verifyApproval([entryFor({after:'别的'})],world,async()=>approvedRows),/已审批正文与修订条目不符/);
});

const cfgFor=(entries,verify)=>({revision,root:'rev',CARD:'W3HH',limitYuan:0,frozen:{revision,entries},buildEntries:async()=>entries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 approval:{via,receipt:householdRoot,verify}});
async function inTmp(fn){
 const dir=await tmp(),old=process.cwd();
 await fs.mkdir(path.join(dir,'world/meta'),{recursive:true});
 await fs.mkdir(path.join(dir,'rev'),{recursive:true});
 await fs.writeFile(path.join(dir,'world/meta/recipes.json'),JSON.stringify(world.recipes,null,2)+'\n');
 process.chdir(dir);
 try{await fn(dir);}finally{process.chdir(old);}
}
test('--publish 只发布清单内已审批条目，其余不动，回执指向基础批；混入未审批条目则什么都不写', async()=>{
 await inTmp(async()=>{
  const entries=buildEntries(world,(await differences(world,rows,recOf)).filter(d=>d.id==='r1'),auth(['r1']));
  await runRevision(cfgFor(entries,(es,w)=>verifyApproval(es,w,async()=>approvedRows)),['--publish']);
  assert.deepEqual(await read('world/meta/recipes.json'),[{id:'r1',process:'新正文',minutes:30},{id:'r2',process:'旧二',minutes:5},{id:'r3',process:'同',minutes:7}]);
  const pub=await read('rev/publication.json');
  assert.equal(pub.receipt,householdRoot);
  assert.deepEqual(pub.entries.map(x=>x.target),['r1']);
 });
 await inTmp(async()=>{
  const entries=[entryFor(),entryFor({id:'r2-process',target:'r2',before:'旧二',after:'新二'})];
  await assert.rejects(runRevision(cfgFor(entries,(es,w)=>verifyApproval(es,w,async()=>approvedRows)),['--publish']),/没有已审批记录 r2/);
  assert.deepEqual(await read('world/meta/recipes.json'),world.recipes);
 });
});

test('readApprovedSupersedes 发现基础批修订批：走登记的 w3-household-text 审批来源；来源未登记即报错', async()=>{
 const dir=await tmp(),batch=path.join(dir,'w3-household-text'),e=entryFor();
 await fs.mkdir(batch,{recursive:true});
 await fs.writeFile(path.join(batch,'candidate.json'),JSON.stringify({revision,approval:{via},entries:[e],drafts:[draftFor(e)],contexts:[contextFor(e)]}));
 const entry={id:e.id,target:e.target,file:e.file,field:e.field,before:e.before,after:e.after,supersedes:e.supersedes};
 await fs.writeFile(path.join(batch,'publication.json'),JSON.stringify({revision,publishedAt:'t',entries:[entry],receipt:householdRoot}));
 const saved=APPROVAL_SOURCES[via];
 try{
  const seen=[];
  APPROVAL_SOURCES[via]=async()=>({verifyFrozen:async es=>{seen.push(es.map(x=>x.id));}});
  const out=await readApprovedSupersedes(dir);
  assert.deepEqual(seen,[['r1-process']]);
  assert.deepEqual(out.map(s=>[s.targetId,s.label,s.before,s.after]),[['r1','process','旧正文','新正文']]);
  delete APPROVAL_SOURCES[via];
  await assert.rejects(readApprovedSupersedes(dir),/审批来源未登记/);
 }finally{APPROVAL_SOURCES[via]=saved;}
});

test('正式值来自已审批整行回执的差异不算本批差异（归因到回执的不发布、不被旧草稿覆盖）；没归因的照常列出', async()=>{
 const resolveRow=async(id,field,value)=>id==='r2'&&field==='process'&&value==='旧二'?'a3-world 已批整行回执':null;
 const diffs=await differences(world,rows,recOf,{resolveRow});
 assert.deepEqual(diffs.map(d=>d.id),['r1']);
 // 不传解析器时不按回执归因：r2 照常是差异，仍受授权清单约束。
 assert.deepEqual((await differences(world,rows,recOf)).map(d=>d.id),['r1','r2']);
 // 解析器核验失败抛错时整体失败，不当作有来源。
 await assert.rejects(differences(world,rows,recOf,{resolveRow:async()=>{throw new Error('回执核验不通过');}}),/回执核验不通过/);
});
