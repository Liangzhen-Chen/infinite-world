import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {hashContent,rowFingerprintShape} from '../tools/content-pipeline.mjs';
import {applyDerivedDuration} from '../tools/content-numerals.mjs';
import {manualRewrite} from '../tools/manual-rewrite.mjs';
import {manualRewriteProfile,validateTradesDraft,tradesRoot,tradesRevision} from '../tools/w3-trades.mjs';
import {manualRewriteProfile as journeyProfile} from '../tools/w3-journey.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {differences,buildEntries,readAuthorization,verifyApproval,runRevision,draftFor,contextFor,validateDraft,applyCandidate,isPublished,revision,root,via,authorizationFile} from '../world/design/w3-trades-text-revision.mjs';
import {APPROVAL_SOURCES,readApprovedSupersedes} from '../tools/approved-revisions.mjs';

const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const tmp=()=>fs.mkdtemp(path.join(os.tmpdir(),'w3tt-'));

// ---------------------------------------------------------------- manualRewriteProfile 能被人工改写工具使用
test('行当批 manualRewriteProfile：形状与 journey 的相同，校验就是 validateTradesDraft，kind 不对报错', async()=>{
 const profile=await manualRewriteProfile('recipes'),journey=await journeyProfile('recipes');
 assert.deepEqual(Object.keys(profile).sort(),Object.keys(journey).sort());
 assert.ok(Array.isArray(profile.entries)&&profile.entries.length>0);
 assert.equal(typeof profile.contextFor,'function');
 assert.equal(typeof profile.validateDraft,'function');
 assert.ok((await manualRewriteProfile('items')).entries.length>0);
 await assert.rejects(manualRewriteProfile('nope'),/--kind 须为 items 或 recipes/);
 const entry=profile.entries[0],context=profile.contextFor(entry),block=await read('world/meta/blocklist.json'),draft={id:entry.id,process:'太短'};
 assert.deepEqual(profile.validateDraft(draft,entry,context),validateTradesDraft(draft,entry,block,context));
});

// 夹具：把某条配方登记成 manual 记录（临时目录），草稿经 profile 的校验。
async function rewriteFixture(t,entry,context){
 const dir=await fs.mkdtemp(path.join(tmpRoot(),'w3tt-rewrite-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const rec={id:entry.id,fingerprint:hashContent({entry,context,revision:tradesRevision}),status:'manual',attempts:3,draft:{id:entry.id,process:'旧稿'},review:{contradictions:[]}};
 const batch={index:0,fingerprint:hashContent([rec].map(rowFingerprintShape)),count:1,passed:0,ids:[entry.id],manual:[entry.id],pending:[],flagged:[],sample:[],l4:{approved:false,notes:[]}};
 await fs.writeFile(path.join(dir,`${entry.id}.json`),JSON.stringify(rec,null,2)+'\n');
 await fs.writeFile(path.join(dir,'batch-0.json'),JSON.stringify(batch,null,2)+'\n');
 await fs.writeFile(path.join(dir,'summary.json'),JSON.stringify({total:1,passed:0,manual:1,pending:0,batches:[batch]},null,2)+'\n');
 return dir;
}
const snapshot=async dir=>Object.fromEntries(await Promise.all((await fs.readdir(dir)).sort().map(async n=>[n,await fs.readFile(path.join(dir,n),'utf8')])));
const args=(dir,profile,entry,draft)=>({root:dir,drafts:[{id:entry.id,draft}],by:'改写者甲',reason:'按骨架人工改写',headCommit:'abcdef1',entries:profile.entries,validateDraft:profile.validateDraft,contextFor:profile.contextFor,now:()=>'2026-11-10T00:00:00.000Z'});

test('manual-rewrite 用行当批 profile：L1 不过整批拒绝零写盘；L1 过则换入新稿并留历史', async t=>{
 const profile=await manualRewriteProfile('recipes'),world=await loadWorld();
 // 找一条现行正文能过行当 L1 的配方（取当前正式正文作新稿）：同一个 profile 校验，不绕过。
 let pick;
 for(const entry of profile.entries){
  const official=world.recipes.find(r=>r.id===entry.id);if(!official)continue;
  const draft=applyDerivedDuration({id:entry.id,process:official.process},entry),result=profile.validateDraft(draft,entry,profile.contextFor(entry));
  if(!result.errors.length){pick={entry,draft:{id:entry.id,process:official.process}};break;}
 }
 assert.ok(pick,'行当批里没有任何配方现行正文能过 L1，无法构造夹具');
 const {entry,draft}=pick,context=profile.contextFor(entry);
 const bad=await rewriteFixture(t,entry,context),before=await snapshot(bad);
 await assert.rejects(manualRewrite(args(bad,profile,entry,{id:entry.id,process:'太短'})),/L1 未通过/);
 assert.deepEqual(await snapshot(bad),before);
 const dir=await rewriteFixture(t,entry,context);
 await manualRewrite(args(dir,profile,entry,draft));
 const record=await read(path.join(dir,`${entry.id}.json`));
 assert.equal(record.status,'passed');
 assert.equal(record.manualRewrite.length,1);
 assert.equal(record.manualRewrite[0].priorStatus,'manual');
 assert.equal(record.draft.id,entry.id);
 assert.equal(record.review.kind,'manual-rewrite-no-l2');
});

// ---------------------------------------------------------------- 行当批修订批
const auth=ids=>({approvedBy:'李白',ref:'批复 X',at:'2026-11-10',ids});
const recOf=()=>({fingerprint:'fp',attempts:1,l4Rejection:{ids:['r1']}});
const world={items:[],recipes:[{id:'r1',process:'旧正文',minutes:30},{id:'r2',process:'旧二',minutes:5},{id:'r3',process:'同',minutes:7}]};
const rows=[{kind:'recipes',draft:{id:'r1',process:'新正文'}},{kind:'recipes',draft:{id:'r2',process:'新二'}},{kind:'recipes',draft:{id:'r3',process:'同'}}];

test('行当批配置：revision、根目录、授权清单路径、登记的审批来源', async()=>{
 assert.equal(revision,'w3-trades-text-1');
 assert.equal(root,'world/drafts/w3-trades-text');
 assert.equal(authorizationFile,`${root}/authorization.json`);
 assert.equal(via,'w3-trades-text');
 const source=await APPROVAL_SOURCES[via]();
 assert.equal(typeof source.verifyFrozen,'function');
 assert.equal(source.revision,revision);
});

test('只为授权清单里且正文有差异的条目生成修订条目；来源记录指向行当批', async()=>{
 const diffs=await differences(world,rows,recOf);
 assert.deepEqual(diffs.map(d=>d.id),['r1','r2']);
 const entries=buildEntries(world,diffs.filter(d=>d.id==='r1'),auth(['r1']));
 assert.equal(entries.length,1);
 const [e]=entries;
 assert.deepEqual([e.target,e.file,e.path,e.before,e.after],['r1','world/meta/recipes.json',['process'],'旧正文','新正文']);
 assert.equal(e.supersedes[0].receipt,`${tradesRoot}/recipes/r1.json#r1`);
 assert.equal(e.facts.trades.revision,tradesRevision);
 assert.equal(e.facts.journey,undefined);
 // r2 有差异却不在清单里：整批停下，不生成任何条目
 assert.throws(()=>buildEntries(world,diffs,auth(['r1'])),/有 1 处差异.*r2\.process.*不生成任何修订条目/);
});

test('授权清单缺失：按审批未齐处理（code APPROVAL_INCOMPLETE）；格式不对是普通错误', async()=>{
 const dir=await tmp(),file=path.join(dir,'authorization.json');
 await assert.rejects(readAuthorization(file),e=>e.code==='APPROVAL_INCOMPLETE'&&/缺少或无法读取授权清单/.test(e.message));
 await fs.writeFile(file,'{"approvedBy":"李白"}');
 await assert.rejects(readAuthorization(file),e=>e.code!=='APPROVAL_INCOMPLETE'&&/授权清单格式不对/.test(e.message));
 await fs.writeFile(file,JSON.stringify(auth(['r1'])));
 assert.deepEqual((await readAuthorization(file)).ids,['r1']);
});

const entryFor=over=>({id:'r1-process',target:'r1',file:'world/meta/recipes.json',path:['process'],field:'process',before:'旧正文',after:'新正文',
 basis:['b'],facts:{},supersedes:[{receipt:`${tradesRoot}/recipes/r1.json#r1`,field:'process'}],boundary:'只改这一个字段',...over});
const approvedRows=[{kind:'recipes',draft:{id:'r1',process:'新正文'}},{kind:'recipes',draft:{id:'r3',process:'同'}}];

test('verifyApproval：只认已审批记录里的正文；未审批条目、别的字段、别的文件都拒绝', async()=>{
 await assert.rejects(verifyApproval([entryFor()],world,async()=>{throw new Error('批 1 尚未完成 L4');}),/尚未完成 L4/);
 await verifyApproval([entryFor()],world,async()=>approvedRows);
 await assert.rejects(verifyApproval([entryFor({target:'r2',id:'r2-process'})],world,async()=>approvedRows),/trades 没有已审批记录 r2/);
 await assert.rejects(verifyApproval([entryFor({after:'别的'})],world,async()=>approvedRows),/已审批正文与修订条目不符/);
 await assert.rejects(verifyApproval([entryFor({file:'world/meta/items.json'})],world,async()=>approvedRows),/文件不是 recipes/);
 await assert.rejects(verifyApproval([entryFor({path:['minutes'],field:'minutes'})],world,async()=>approvedRows),/字段不是 recipes 的正文字段/);
});

// 发布：工作目录换成临时目录，文件与回执都写在那里。
const cfgFor=(entries,verify)=>({revision,root:'rev',CARD:'W3TT',limitYuan:0,frozen:{revision,entries},buildEntries:async()=>entries,draftFor,contextFor,validateDraft,applyCandidate,isPublished,
 approval:{via,receipt:tradesRoot,verify}});
async function inTmp(fn){
 const dir=await tmp(),old=process.cwd();
 await fs.mkdir(path.join(dir,'world/meta'),{recursive:true});
 await fs.mkdir(path.join(dir,'rev'),{recursive:true});
 await fs.writeFile(path.join(dir,'world/meta/recipes.json'),JSON.stringify(world.recipes,null,2)+'\n');
 process.chdir(dir);
 try{await fn(dir);}finally{process.chdir(old);}
}
test('--publish 只发布授权清单内、已审批的条目：其余条目一字不动，回执指向行当批', async()=>{
 await inTmp(async()=>{
  // 候选只含清单内的 r1；r2（有差异但未授权）与 r3（无差异）都不在候选里
  const entries=buildEntries(world,(await differences(world,rows,recOf)).filter(d=>d.id==='r1'),auth(['r1']));
  await runRevision(cfgFor(entries,(es,w)=>verifyApproval(es,w,async()=>approvedRows)),['--publish']);
  const after=await read('world/meta/recipes.json');
  assert.deepEqual(after,[{id:'r1',process:'新正文',minutes:30},{id:'r2',process:'旧二',minutes:5},{id:'r3',process:'同',minutes:7}]);
  const pub=await read('rev/publication.json');
  assert.equal(pub.receipt,tradesRoot);
  assert.deepEqual(pub.entries.map(x=>x.target),['r1']);
 });
 // 候选里混入未审批条目：核验失败，什么都不写
 await inTmp(async()=>{
  const entries=[entryFor(),entryFor({id:'r2-process',target:'r2',before:'旧二',after:'新二'})];
  await assert.rejects(runRevision(cfgFor(entries,(es,w)=>verifyApproval(es,w,async()=>approvedRows)),['--publish']),/没有已审批记录 r2/);
  assert.deepEqual(await read('world/meta/recipes.json'),world.recipes);
 });
});

test('readApprovedSupersedes 读取行当批回执：走登记的 w3-trades-text 审批来源；来源未登记即报错', async()=>{
 const dir=await tmp(),batch=path.join(dir,'w3-trades-text'),e=entryFor();
 await fs.mkdir(batch,{recursive:true});
 await fs.writeFile(path.join(batch,'candidate.json'),JSON.stringify({revision,approval:{via},entries:[e],drafts:[draftFor(e)],contexts:[contextFor(e)]}));
 const entry={id:e.id,target:e.target,file:e.file,field:e.field,before:e.before,after:e.after,supersedes:e.supersedes};
 await fs.writeFile(path.join(batch,'publication.json'),JSON.stringify({revision,publishedAt:'t',entries:[entry],receipt:tradesRoot}));
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
