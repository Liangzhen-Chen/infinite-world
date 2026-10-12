import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {validateNpcDepth} from '../tools/npc-profile-validation.mjs';
import {depthEntries,contextFor,patchDraft,buildDraftRequest,buildReviewRequest} from '../tools/npc-depth-content.mjs';
import {depthFoundation,runDepth,depthOptions} from '../tools/npc-depth.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {publishNpcDepth} from '../tools/publish-npc-depth.mjs';
import {compactReviewRequest,prepareFirstSourceEvidence} from '../tools/npc-depth-source-evidence.mjs';
const source=await loadWorld(),ids=['npc_yp_qinli','npc_yp_gaoxin'];
const read=file=>fs.readFile(file,'utf8').then(JSON.parse),write=(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n');
async function fixture(t,{compact=false,noEvidence=false}={}){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'npc-depth-batch-')),worldRoot=path.join(temp,'world');
 t.after(async()=>{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});});
 for(const folder of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',folder),path.join(worldRoot,folder),{recursive:true});
 const world=structuredClone(source);
 for(const id of ids){const n=world.npcs.find(n=>n.id===id);n.notes='主持人不要让玩家查看旧账页。';}
 const baseline=path.join(worldRoot,'people/baseline.json');await write(baseline,world.npcs);
 for(const [index,id] of ids.slice(0,1).entries()){
  const before=world.npcs.find(n=>n.id===id),issues=validateNpcDepth(world).issues.filter(i=>i.id===id),patches=[];
  for(const issue of issues){
   if(issue.code==='rule-wording')patches.push({path:issue.field,value:'曾在坡口议事屋核对桌位，轮换次序仍未商定。'});
   else if(issue.code==='unknown-specific')patches.push({path:issue.field,value:`坡口议事屋是否有${index===0?'旧磨架记号':'抄地名的纸页'}可供核对`});
   else if(issue.code==='memory-shared'&&issue.field==='memorySeeds')patches.push({path:`memorySeeds[${before.memorySeeds.length}]`,value:{id:'memory_batch_table',event:'在坡口议事屋核对桌位，还没商定轮换次序。',salience:4,knownBy:ids,location:'bld_yp_hall',reliability:'亲历'}});
   else assert.fail('未预期fixture缺口 '+JSON.stringify(issue));
  }
  const config={revision:`test-complete-card-${index}`,incrementLimitYuan:2,patchRows:[{id,before:structuredClone(before),baseHash:hashContent(before),issues:issues.map(({id,field,code})=>({id,field,code})),patches}]};
  const root=path.join(worldRoot,`drafts/card-${index}`),design=path.join(worldRoot,`design/card-${index}.mjs`);await fs.mkdir(root,{recursive:true});await fs.mkdir(path.dirname(design),{recursive:true});
  await fs.writeFile(design,`export const revision=${JSON.stringify(config.revision)};\nexport const incrementLimitYuan=2;\nexport const patchRows=${JSON.stringify(config.patchRows)};\n`);
  const entries=depthEntries([before],config,world),foundation=depthFoundation(entries,world,config.revision),manifest={contract:'audit-patch-v1',design:`design/card-${index}.mjs`,root:`drafts/card-${index}`,worldRoot:'../..',foundationHash:hashContent(foundation)};
  await write(path.join(root,'base.json'),[before]);await write(path.join(root,'candidate.json'),entries.map(patchDraft));await write(path.join(root,'foundation.json'),foundation);await write(path.join(root,'manifest.json'),manifest);
  const sourceFile=path.join(root,'source.json'),mapFile=path.join(root,'source-map.json'),data={sourceRecords:ids.map(id=>{const n=world.npcs.find(n=>n.id===id);return{id,name:n.name,sex:n.sex,notes:n.notes};}),reviewBoundary:'仅核对原性别和原notes；秘密不能传播，提议仍未获同意。'};
  await write(sourceFile,data);await write(mapFile,{[id]:'source.json'});
  const budgetRoot=path.join(worldRoot,'drafts/shared');await fs.mkdir(budgetRoot);const ledger={spentYuan:.4,reservedYuan:.02,limitYuan:20,waveLimitYuan:20,cards:{TOLD:{spentYuan:.4,reservedYuan:.02,limitYuan:1}},requests:{unknown:{card:'TOLD',status:'unknown',reservedYuan:.02}}};await write(path.join(budgetRoot,'budget.json'),ledger);
  const calls=[],client={spent:0,reserved:0,budgetYuan:20,rates:{miss:2,output:3},async generate(body,label){calls.push({body:structuredClone(body),label});const input=JSON.parse(body.messages[1].content);return{choices:[{message:{content:JSON.stringify(input.candidate??{contradictions:[]})}}],measurement:{costUpperYuan:.001}};}};
  const options={root,worldRoot,design,budgetRoot,cardId:'T45',batch:'mock',...(noEvidence?{}:{sourceEvidenceMap:mapFile}),...(compact?{compactRequest:true}:{})};
  t.mock.method(console,'log',()=>{});
  return{root,worldRoot,world,baseline,entries,foundation,config,data,sourceFile,mapFile,budgetRoot,ledger,calls,client,options,manifest:path.join(root,'manifest.json')};
 }
}
async function approve(p){
 const record=await read(path.join(p.root,ids[0]+'.json')),batch=await read(path.join(p.root,'batch-0.json'));
 batch.l4={approved:true,notes:[{id:record.id,note:'离线替身逐字段核验测试，非真实L4。',draftHash:hashContent(record.draft),reviewHash:hashContent(record.review)}]};await write(path.join(p.root,'batch-0.json'),batch);
}
const frozenFiles=['base.json','foundation.json','candidate.json','manifest.json'];
const frozen=p=>Promise.all(frozenFiles.map(name=>fs.readFile(path.join(p.root,name),'utf8')));

test('首次官方full/compact draft和L2实际出站含对应sex/notes，原指纹不变，preview/apply重放且JSON换行不冒充值变更',async t=>{
 for(const compact of [false,true]){
  const p=await fixture(t,{compact}),before=await frozen(p),result=await runDepth(p.options,{client:p.client});assert.equal(result.summary.passed,1);assert.equal(p.calls.length,2);assert.deepEqual(await frozen(p),before);
  for(const {body} of p.calls)assert.deepEqual(JSON.parse(body.messages.at(-1).content),p.data);
  const context=contextFor(p.entries[0],p.world),draft=patchDraft(p.entries[0]),record=await read(path.join(p.root,ids[0]+'.json'));
  assert.equal(record.fingerprint,hashContent({entry:p.entries[0],context,revision:p.config.revision}));
  const expectedDraft=buildDraftRequest(p.entries[0],null,context),expectedReview=compact?compactReviewRequest(buildReviewRequest(p.entries[0],draft,context)):buildReviewRequest(p.entries[0],draft,context);
  for(const body of [expectedDraft,expectedReview])body.messages.push({role:'user',content:JSON.stringify(p.data)});
  assert.deepEqual(p.calls.map(c=>c.body),[expectedDraft,expectedReview]);
  const ledger=await read(path.join(p.budgetRoot,'budget.json'));assert.ok(Math.abs(ledger.reservedYuan-.02)<1e-10);assert.deepEqual(ledger.requests.unknown,p.ledger.requests.unknown);
  const encoded={model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...expectedDraft};const reservation=(Buffer.byteLength(JSON.stringify(encoded))*2+expectedDraft.max_tokens*3)/1e6;
  assert.equal(Object.values(ledger.requests).find(r=>r.label?.endsWith('draft0')).reservedYuan,reservation);
  for(const row of Object.values(ledger.requests).filter(r=>r.status==='settled')){
   const evidence=await read(path.join(p.budgetRoot,row.responseEvidence.file));assert.equal(evidence.requestHash,hashContent(evidence.request));assert.equal(evidence.responseHash,hashContent(evidence.response));assert.deepEqual(JSON.parse(evidence.request.messages.at(-1).content),p.data);assert.deepEqual(evidence.measurement,{costUpperYuan:.001});
  }
  await approve(p);const bytes=await fs.readFile(p.baseline,'utf8');await publishNpcDepth({manifest:p.manifest});assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);
  // Preserve the original emitted bytes/hash while accepting checkout formatting.
  await fs.writeFile(p.sourceFile,(await fs.readFile(p.sourceFile,'utf8')).replace(/\n/g,'\r\n'));await fs.writeFile(p.mapFile,(await fs.readFile(p.mapFile,'utf8')).replace(/\n/g,'\r\n'));
  await runDepth(p.options,{client:p.client});assert.equal(p.calls.length,2);
  await publishNpcDepth({manifest:p.manifest,publish:true});assert.deepEqual((await publishNpcDepth({manifest:p.manifest,publish:true})).changed,[]);
 }
});

test('增附件后的实际UTF8预留不足零出站，spent和未知预留不变，失败请求凭证保留',async t=>{
 const p=await fixture(t);p.data.reviewBoundary+='核对'.repeat(150000);await write(p.sourceFile,p.data);const allocation={cardId:'T45',waveLimitYuan:20,startingSpentYuan:.4,startingReservedYuan:.02,incrementLimitYuan:2};await write(path.join(p.root,'allocation.json'),allocation);
 const ledger={...p.ledger,cards:{...p.ledger.cards,T45:{limitYuan:2,spentYuan:1.8,reservedYuan:0}},spentYuan:2.2};await write(path.join(p.budgetRoot,'budget.json'),ledger);
 const base=buildDraftRequest(p.entries[0],null,contextFor(p.entries[0],p.world));assert.ok((Buffer.byteLength(JSON.stringify({model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...base}))*2+base.max_tokens*3)/1e6<.2);
 const result=await runDepth(p.options,{client:p.client});assert.equal(result.summary.pending,1);assert.equal(p.calls.length,0);const after=await read(path.join(p.budgetRoot,'budget.json'));assert.equal(after.spentYuan,ledger.spentYuan);assert.equal(after.reservedYuan,.02);assert.deepEqual(after.requests,ledger.requests);
 const record=await read(path.join(p.root,ids[0]+'.json'));assert.equal(record.firstSourceEvidence.requests[0].status,'failed');assert.match(record.firstSourceEvidence.requests[0].error,/费用上限/);assert.equal(record.firstSourceEvidence.requests[0].requestHash,hashContent(record.firstSourceEvidence.requests[0].request));
});

test('完整附件draft和review各自够预算但合计不足时官方入口零请求，full/compact均保留隐私范围',async t=>{
 for(const compact of [false,true]){
  const p=await fixture(t,{compact}),context=contextFor(p.entries[0],p.world),draft=patchDraft(p.entries[0]);
  const requests=[buildDraftRequest(p.entries[0],null,context),compact?compactReviewRequest(buildReviewRequest(p.entries[0],draft,context)):buildReviewRequest(p.entries[0],draft,context)];
  requests.forEach(request=>request.messages.push({role:'user',content:JSON.stringify(p.data)}));
  const costs=requests.map(body=>(Buffer.byteLength(JSON.stringify({model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...body}))*p.client.rates.miss+body.max_tokens*p.client.rates.output)/1e6);
  const available=costs[0]+costs[1]-Math.min(...costs)/2;assert.ok(costs.every(cost=>cost<available));
  const allocation={cardId:'T45',waveLimitYuan:20,startingSpentYuan:.4,startingReservedYuan:.02,incrementLimitYuan:2};await write(path.join(p.root,'allocation.json'),allocation);
  const spent=2-available,ledger={...p.ledger,spentYuan:p.ledger.spentYuan+spent,cards:{...p.ledger.cards,T45:{limitYuan:2,spentYuan:spent,reservedYuan:0}}};await write(path.join(p.budgetRoot,'budget.json'),ledger);
  const originals=await frozen(p),result=await runDepth(p.options,{client:p.client});assert.equal(p.calls.length,0);assert.equal(result.summary.pending,1);assert.equal(result.results[0].attempts,0);assert.deepEqual(await frozen(p),originals);
  const after=await read(path.join(p.budgetRoot,'budget.json'));assert.deepEqual(after.requests,ledger.requests);assert.equal(after.spentYuan,ledger.spentYuan);assert.equal(after.reservedYuan,.02);
  assert.deepEqual(result.results[0].firstSourceEvidence.requests[0].request,requests[0]);
 }
});

test('首次登记不许替换索引/compact或删选项；部分逐ID附件时其余L2仍按显式compact执行',async t=>{
 const p=await fixture(t,{compact:true});await runDepth(p.options,{client:p.client});const recordFile=path.join(p.root,ids[0]+'.json'),before=await fs.readFile(recordFile,'utf8');
 await assert.rejects(runDepth({...p.options,compactRequest:false},{client:p.client}),/冻结/);
 const {sourceEvidenceMap,...removed}=p.options;await assert.rejects(runDepth(removed,{client:p.client}),/不得删除/);
 const copy=path.join(p.root,'copy-map.json');await fs.copyFile(p.mapFile,copy);await assert.rejects(runDepth({...p.options,sourceEvidenceMap:copy},{client:p.client}),/冻结/);
 assert.equal(p.calls.length,2);assert.equal(await fs.readFile(recordFile,'utf8'),before);
 const hook=await prepareFirstSourceEvidence(p.options,{entries:p.entries,world:p.world,foundation:p.foundation,config:p.config},e=>contextFor(e,p.world));
 const other={...p.entries[0],id:ids[1],before:{...p.entries[0].before,id:ids[1]},facts:{...p.entries[0].facts,id:ids[1]}},body=buildReviewRequest(other,patchDraft(other),contextFor(other,p.world)),transformed=await hook.transform({entry:other,phase:'review',body,record:{}});
 assert.deepEqual(transformed.body,compactReviewRequest(body));assert.equal(transformed.receipt,undefined);
});

test('伪造sex/notes、陌生字段/ID、重复ID、缺本人、错候选和world外索引全部在出站前拒绝',async t=>{
 for(const mode of ['sex','notes','field','id','duplicate','self','candidate','outside']){
  const p=await fixture(t),before=await frozen(p);
  if(mode==='sex')p.data.sourceRecords[1].sex='伪造';if(mode==='notes')p.data.sourceRecords[1].notes+='伪造';if(mode==='field')p.data.sourceRecords[0].unknown='伪造';if(mode==='id')p.data.sourceRecords[1].id='npc_unknown';if(mode==='duplicate')p.data.sourceRecords.push(p.data.sourceRecords[0]);if(mode==='self')p.data.sourceRecords.shift();await write(p.sourceFile,p.data);
  if(mode==='candidate')await write(p.mapFile,{npc_unknown:'source.json'});
  if(mode==='outside'){const file=path.join(path.dirname(p.worldRoot),'map.json');await write(file,{[ids[0]]:'world/drafts/card-0/source.json'});p.options.sourceEvidenceMap=file;}
  await assert.rejects(runDepth(p.options,{client:p.client}));assert.equal(p.calls.length,0);assert.deepEqual(await frozen(p),before);assert.deepEqual(await read(path.join(p.budgetRoot,'budget.json')),p.ledger);
 }
});

test('正式发布拒绝篡改/删除附件、索引、请求、绑定和收据，apply预演后仍重验',async t=>{
 const p=await fixture(t);await runDepth(p.options,{client:p.client});await approve(p);const bytes=await fs.readFile(p.baseline,'utf8'),recordFile=path.join(p.root,ids[0]+'.json'),registration=path.join(p.root,'first-source-evidence.json');
 for(const [file,mutate] of [[p.sourceFile,v=>v.sourceRecords[0].sex='伪造'],[p.mapFile,v=>{v.npc_unknown=v[ids[0]];delete v[ids[0]];}],[recordFile,v=>delete v.firstSourceEvidence],[recordFile,v=>v.firstSourceEvidence.requests.pop()],[recordFile,v=>v.firstSourceEvidence.requests[0].request.messages.pop()],[recordFile,v=>v.firstSourceEvidence.requests[0].entryHash='bad'],[registration,v=>v.sources[0].evidence.rawHash='bad']]){
  const saved=await fs.readFile(file,'utf8'),data=JSON.parse(saved);mutate(data);await write(file,data);await assert.rejects(publishNpcDepth({manifest:p.manifest,publish:true}));assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);await fs.writeFile(file,saved);
 }
 for(const file of [p.sourceFile,p.mapFile,registration]){const saved=await fs.readFile(file,'utf8');await fs.unlink(file);await assert.rejects(publishNpcDepth({manifest:p.manifest}));await fs.writeFile(file,saved);}
 const {prepareNpcDepthBatch}=await import('../tools/publish-npc-depth.mjs');const prepared=await prepareNpcDepthBatch({manifest:p.manifest});await fs.unlink(p.sourceFile);await assert.rejects(prepared.apply());assert.equal(await fs.readFile(p.baseline,'utf8'),bytes);
});

test('无附件旧协议逐字不变且既有passed记录不因新增选项重跑改写',async t=>{
 const p=await fixture(t,{noEvidence:true}),result=await runDepth(p.options,{client:p.client}),recordFile=path.join(p.root,ids[0]+'.json'),before=await fs.readFile(recordFile,'utf8'),original=await frozen(p),context=contextFor(p.entries[0],p.world);
 assert.deepEqual(p.calls.map(c=>c.body),[buildDraftRequest(p.entries[0],null,context),buildReviewRequest(p.entries[0],patchDraft(p.entries[0]),context)]);assert.ok(!JSON.parse(before).firstSourceEvidence);assert.equal(result.summary.passed,1);
 await runDepth(p.options,{client:p.client});assert.equal(p.calls.length,2);assert.equal(await fs.readFile(recordFile,'utf8'),before);
 await assert.rejects(runDepth({...p.options,sourceEvidenceMap:p.mapFile},{client:p.client}),/原受控路径/);assert.equal(p.calls.length,2);assert.equal(await fs.readFile(recordFile,'utf8'),before);assert.deepEqual(await frozen(p),original);await approve(p);await publishNpcDepth({manifest:p.manifest});
 assert.equal(depthOptions(['--source-evidence-map',p.mapFile,'--compact-request']).compactRequest,true);
});

test('未知出站保留actual request与未知预算，隐私hard仍失败并拒发布',async t=>{
 for(const mode of ['unknown','hard']){
  const p=await fixture(t);p.client.generate=async body=>{p.calls.push({body});if(mode==='unknown')throw Error('fetch failed: unknown');return{choices:[{message:{content:JSON.stringify(JSON.parse(body.messages[1].content).candidate??{contradictions:[{severity:'hard',quote:'秘密',field:'knowledge',reason:'越过本人秘密边界'}]})}}],measurement:{costUpperYuan:.001}};};
  const result=await runDepth(p.options,{client:p.client}),record=await read(path.join(p.root,ids[0]+'.json'));
  assert.equal(result.summary.passed,0);assert.ok(record.firstSourceEvidence.requests.length);assert.equal(record.firstSourceEvidence.requests[0].requestHash,hashContent(p.calls[0].body));
  if(mode==='unknown'){assert.equal(record.firstSourceEvidence.requests[0].status,'failed');assert.ok((await read(path.join(p.budgetRoot,'budget.json'))).reservedYuan>.02);}else assert.equal(record.status,'manual');
  await assert.rejects(publishNpcDepth({manifest:p.manifest}));
 }
});
