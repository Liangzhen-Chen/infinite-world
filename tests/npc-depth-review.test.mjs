import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runDepthReview,reviewOptions,compactReviewRequest} from '../tools/npc-depth-review.mjs';
import {hashContent,readApprovedContent} from '../tools/content-pipeline.mjs';
import {migrateDepthBudget} from '../tools/content-budget.mjs';
import {depthFoundation} from '../tools/npc-depth.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {patchDraft,contextFor,buildReviewRequest,applyDepthDraft} from '../tools/npc-depth-content.mjs';
const exec=promisify(execFile),read=file=>fs.readFile(file,'utf8').then(JSON.parse),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10);
const hard={quote:'旧文字',field:'notes',severity:'hard',reason:'旧事实审查失败'};
const allocation={cardId:'T06',waveLimitYuan:20,incrementLimitYuan:2,startingSpentYuan:.94801504,startingReservedYuan:0,limitYuan:2.94801504};
function entryFor(id){const before={id,name:'测试人物',notes:'主持人不要让玩家凭空知道另一人的秘密。',relationships:[],memorySeeds:[{id:'old',event:'旧事',knownBy:[id]}],coins:3},patches=[{path:'notes',value:'她在院内与邻人核对过桌位，仍未商定先后。'}];return{id,contract:'audit-patch-v1',before,baseHash:hashContent(before),issues:[{id,field:'notes',code:'rule-wording'}],patches,facts:{...before,notes:patches[0].value}};}
async function fixture(t,{pending=false,ids,manualCount=1}={}){
 const dir=await fs.mkdtemp(path.join(tmpRoot(),'npc-depth-review-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const root=path.join(dir,'candidate'),budgetRoot=path.join(dir,'shared');await fs.mkdir(root);await fs.mkdir(budgetRoot);
 const entries=(ids??['npc_review_bad','npc_review_other']).map(entryFor);if(pending){Object.assign(entries[0].before,{sex:'女',workplace:{location:'loc_review'},goals:{mid:[{content:'当面请物主核对',progress:0,steps:[{content:'询问何时能一起看',status:'pending'}]}]}});entries[0].facts=applyDepthDraft(entries[0].before,patchDraft(entries[0]));}const world={npcs:entries.map(e=>e.before),residents:[],locations:[],settlementProfiles:[]},config={revision:'same-review-v1'},foundation=depthFoundation(entries,world,config.revision);
 const records=entries.map((entry,i)=>({id:entry.id,fingerprint:hashContent({entry,context:contextFor(entry,world),revision:config.revision}),status:i>=manualCount?'passed':'manual',attempts:3,draft:patchDraft(entry),review:{contradictions:i>=manualCount?[]:[hard]},errors:i>=manualCount?[]:[hard],warnings:[],feedback:i>=manualCount?null:[hard],measurements:[{costUpperYuan:.123}]}));
 const fingerprint=hashContent(records.map(({id,draft,review,status})=>({id,draft,review,status}))),batch={index:0,fingerprint,ids:records.map(r=>r.id),count:records.length,passed:records.length-manualCount,manual:records.slice(0,manualCount).map(r=>r.id),pending:[],flagged:[],sample:[records[manualCount].id],needsSystemicRepair:true,l4:{approved:false,notes:[{id:records[manualCount].id,note:'原阅读证据'}]}};
 const ledger=migrateDepthBudget({spentYuan:1.10760808,reservedYuan:.083736,limitYuan:2.94801504,origin:'mixed-history'},'T06',allocation);ledger.cards.T07={limitYuan:3,spentYuan:0,reservedYuan:0};ledger.requests.unrelated={card:'T07',status:'settled',costUpperYuan:0};
 const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');for(const record of records)await write(path.join(root,record.id+'.json'),record);
 await write(path.join(root,'allocation.json'),allocation);await write(path.join(root,'foundation.json'),foundation);await write(path.join(root,'batch-0.json'),batch);await write(path.join(root,'summary.json'),{total:records.length,passed:records.length-manualCount,manual:manualCount,pending:0,batches:[batch],scope:'L1/L2'});await write(path.join(budgetRoot,'budget.json'),ledger);
 const calls=[],client={spent:0,reserved:0,budgetYuan:20,estimateCostYuan:()=>.02,async generate(body,label){calls.push({body,label});this.spent+=.01;return{choices:[{message:{content:JSON.stringify({contradictions:[]})}}],measurement:{costUpperYuan:.01,usage:{completion_tokens:1}}};}};
 const options={root,budgetRoot,id:records[0].id,cardId:'T06',batch:'test'},dependencies={client,prepare:async()=>({config,entries,world,foundation})};
 return{dir,root,budgetRoot,entries,world,config,foundation,records,batch,ledger,write,calls,client,options,dependencies};
}
test('单失败id复审保留cards/requests/未知预留与失败历史，重绑定批次且L4仍必需',async t=>{
 const p=await fixture(t),other=await fs.readFile(path.join(p.root,p.records[1].id+'.json'),'utf8'),oldFoundation=await fs.readFile(path.join(p.root,'foundation.json'),'utf8');
 const result=await runDepthReview(p.options,p.dependencies),record=await read(path.join(p.root,p.options.id+'.json')),ledger=await read(path.join(p.budgetRoot,'budget.json'));
 assert.equal(result.status,'passed');assert.equal(p.calls.length,1);assert.match(p.calls[0].label,/T06.*npc_review_bad.*manual-review/);
 const body=JSON.parse(p.calls[0].body.messages[1].content);assert.equal(body.draft.id,p.options.id);assert.deepEqual(body.publishedFacts.revisions[0].after,p.entries[0].patches[0].value);
 assert.deepEqual(body.skeleton.facts,p.entries[0].facts);assert.equal(p.calls[0].body.max_tokens,1800);
 assert.equal(record.attempts,3);assert.equal(record.fingerprint,p.records[0].fingerprint);assert.deepEqual(record.draft,p.records[0].draft);assert.deepEqual(record.reviewRecovery.prior,p.records[0]);assert.equal(record.measurements.length,2);
 near(ledger.reservedYuan,.083736);near(ledger.cards.T06.reservedYuan,.083736);near(ledger.spentYuan,p.ledger.spentYuan+.01);near(ledger.cards.T06.spentYuan,p.ledger.cards.T06.spentYuan+.01);
 assert.deepEqual(ledger.cards.T07,p.ledger.cards.T07);assert.deepEqual(ledger.requests.legacyT06,p.ledger.requests.legacyT06);assert.deepEqual(ledger.requests.unrelated,p.ledger.requests.unrelated);assert.equal(ledger.origin,'mixed-history');assert.ok(ledger.cards.T06.reviewRecoveries[p.options.id]);
 assert.equal(await fs.readFile(path.join(p.root,p.records[1].id+'.json'),'utf8'),other);assert.equal(await fs.readFile(path.join(p.root,'foundation.json'),'utf8'),oldFoundation);
 const batch=await read(path.join(p.root,'batch-0.json')),summary=await read(path.join(p.root,'summary.json'));assert.equal(summary.passed,2);assert.equal(summary.manual,0);assert.equal(batch.l4.approved,false);assert.deepEqual(batch.l4History[0].notes,p.batch.l4.notes);assert.equal(summary.batches[0].fingerprint,batch.fingerprint);assert.equal(batch.foundationHash,hashContent(p.foundation));
 await assert.rejects(readApprovedContent(p.root,p.entries,{contextFor:e=>contextFor(e,p.world),revision:p.config.revision}),/L4/);
 const notes=await Promise.all(p.entries.map(async e=>{const r=await read(path.join(p.root,e.id+'.json'));return{id:e.id,note:'mock人工阅读',draftHash:hashContent(r.draft),reviewHash:hashContent(r.review)};}));const notesFile=path.join(p.dir,'notes.json');await p.write(notesFile,notes);
 await exec(process.execPath,[path.resolve('tools/npc-depth-l4.mjs'),'--design','mock-design.mjs','--root',p.root,'--notes',notesFile]);assert.equal((await readApprovedContent(p.root,p.entries,{contextFor:e=>contextFor(e,p.world),revision:p.config.revision})).length,2);
 await runDepthReview(p.options,p.dependencies);assert.equal(p.calls.length,1);
});
test('复审硬错、格式错或未知请求只允许一次，保留原attempts与错误证据',async t=>{
 for(const mode of ['hard','malformed','unknown']){const p=await fixture(t);p.client.generate=async()=>{p.calls.push(mode);if(mode==='unknown')throw Error('request terminated');return{choices:[{message:{content:JSON.stringify(mode==='hard'?{contradictions:[hard]}:{contradictions:[{severity:'hard'}]})}}],measurement:{costUpperYuan:.01}};};
 const result=await runDepthReview(p.options,p.dependencies),record=await read(path.join(p.root,p.options.id+'.json'));assert.equal(result.status,'manual');assert.equal(record.attempts,3);assert.deepEqual(record.reviewRecovery.prior,p.records[0]);assert.equal(record.reviewRecovery.status,'failed');await runDepthReview(p.options,p.dependencies);assert.equal(p.calls.length,1);
 const ledger=await read(path.join(p.budgetRoot,'budget.json'));near(ledger.reservedYuan,mode==='unknown'?.103736:.083736);near(ledger.cards.T06.reservedYuan,ledger.reservedYuan);}
});
test('passed零调用零写入，复审不能借旧记录副本和换目录再领机会',async t=>{
 const p=await fixture(t),passedFile=path.join(p.root,p.records[1].id+'.json'),before=await fs.readFile(passedFile,'utf8'),beforeBudget=await fs.readFile(path.join(p.budgetRoot,'budget.json'),'utf8');
 const skipped=await runDepthReview({...p.options,id:p.records[1].id},{client:p.client,prepare:async()=>{throw Error('passed不得准备');}});assert.equal(skipped.skipped,true);assert.equal(p.calls.length,0);assert.equal(await fs.readFile(passedFile,'utf8'),before);assert.equal(await fs.readFile(path.join(p.budgetRoot,'budget.json'),'utf8'),beforeBudget);
 const copy=path.join(p.dir,'new-directory');await fs.cp(p.root,copy,{recursive:true});p.client.generate=async()=>{p.calls.push('failure');throw Error('unknown');};await runDepthReview(p.options,p.dependencies);
 const again=await runDepthReview({...p.options,root:copy},p.dependencies);assert.equal(again.skipped,true);assert.equal(p.calls.length,1);assert.deepEqual(await read(path.join(copy,p.options.id+'.json')),p.records[0]);
});
test('单卡不足与共享不足都在mock调用前拒绝，T07费用不会吃掉T06额度',async t=>{
 for(const kind of ['card','wave','interleaved']){const p=await fixture(t),ledger=structuredClone(p.ledger);
 if(kind==='card'){ledger.spentYuan+=1.9-ledger.cards.T06.spentYuan;ledger.cards.T06.spentYuan=1.9;}
 if(kind==='wave')ledger.spentYuan=19.9;
 if(kind==='interleaved'){ledger.spentYuan+=2.99;ledger.cards.T07.spentYuan=2.99;}
 await p.write(path.join(p.budgetRoot,'budget.json'),ledger);const result=await runDepthReview(p.options,p.dependencies);
 if(kind==='interleaved'){assert.equal(result.status,'passed');assert.equal(p.calls.length,1);assert.equal(result.budgetAfter.cards.T07.spentYuan,2.99);}else{assert.equal(result.status,'manual');assert.equal(p.calls.length,0);assert.match((await read(path.join(p.root,p.options.id+'.json'))).reviewRecovery.error,/费用上限/);}
 near(result.budgetAfter.reservedYuan,.083736);}
});
test('新card、加额度、换revision、改foundation或无合法draft均拒绝调用',async t=>{
 for(const kind of ['new-card','extra','revision','foundation','draft','no-failure']){const p=await fixture(t);
 if(kind==='new-card')p.options.cardId='T08';if(kind==='extra')await p.write(path.join(p.root,'allocation.json'),{...allocation,incrementLimitYuan:3});
 if(kind==='revision')p.config.revision='other-revision';if(kind==='foundation')await p.write(path.join(p.root,'foundation.json'),{...p.foundation,revision:'changed'});
 if(kind==='draft'||kind==='no-failure'){const r=structuredClone(p.records[0]);if(kind==='draft')r.draft.patches[0].value='未授权内容';else r.errors=[];await p.write(path.join(p.root,r.id+'.json'),r);}
 await assert.rejects(runDepthReview(p.options,p.dependencies));assert.equal(p.calls.length,0);assert.deepEqual(await read(path.join(p.budgetRoot,'budget.json')),p.ledger);}
});
test('复审CLI明确单id与原card，拒绝额度参数及批量id',async()=>{
 const args=['--id','npc_review_bad','--root','world/drafts/test','--budget-root','world/drafts/shared','--card','T06'];const options=reviewOptions(args);assert.equal(options.id,'npc_review_bad');assert.equal(options.cardId,'T06');
 const legacy=reviewOptions(['npc_review_bad','world/drafts/shared','yupo-depth','--card','T06']);assert.equal(legacy.batch,'yupo-depth');
 for(const extra of [['--budget','3'],['--increment-limit','3'],['--recover-protocol','npc_review_bad']])assert.throws(()=>reviewOptions([...args,...extra]),/不支持/);
 assert.throws(()=>reviewOptions(['--id','npc_a,npc_b','--budget-root','world/drafts/shared','--card','T06']),/单条/);assert.throws(()=>reviewOptions(['--id']),/缺少/);
 assert.throws(()=>reviewOptions([...args,'--id','npc_extra']),/重复/);const attachments=reviewOptions([...args,'--source-evidence','world/drafts/sources.json','--compact-request']);assert.equal(attachments.compactRequest,true);assert.equal(attachments.sourceEvidence,path.resolve('world/drafts/sources.json'));
 const {stdout}=await exec(process.execPath,[path.resolve('tools/npc-depth-review.mjs'),'--help']);assert.match(stdout,/--card/);assert.match(stdout,/失败记录复审一次/);
});
test('来源附件逐字段核对冻结源，全文哈希留证，精简只去可重建的重复事实',async t=>{
 const p=await fixture(t),sourceEvidence=path.join(p.dir,'sources.json'),data={sourceRecords:p.world.npcs.map(r=>({id:r.id,name:r.name,notes:r.notes,memorySeeds:r.memorySeeds})),reviewBoundary:'步骤仍为pending；提议不等于同意，不降低事实与知情范围门槛。'};await p.write(sourceEvidence,data);
 const originalRequest=buildReviewRequest(p.entries[0],p.records[0].draft,contextFor(p.entries[0],p.world)),compact=compactReviewRequest(originalRequest),payload=JSON.parse(compact.messages[1].content);
 assert.deepEqual(applyDepthDraft(payload.skeleton.before,{id:payload.skeleton.id,contract:payload.skeleton.contract,patches:payload.skeleton.patches}),p.entries[0].facts);assert.equal(payload.skeleton.facts,undefined);assert.equal(payload.publishedFacts.revisions,undefined);
 for(const field of ['before','patches','issues'])assert.deepEqual(payload.skeleton[field],p.entries[0][field]);const oldContext=JSON.parse(originalRequest.messages[1].content).publishedFacts;for(const field of ['people','places','localProblems','rules'])assert.deepEqual(payload.publishedFacts[field],oldContext[field]);assert.equal(compact.max_tokens,1800);assert.ok(Buffer.byteLength(JSON.stringify(compact))<Buffer.byteLength(JSON.stringify(originalRequest)));
 await runDepthReview({...p.options,sourceEvidence,compactRequest:true},p.dependencies);assert.equal(p.calls.length,1);assert.deepEqual(JSON.parse(p.calls[0].body.messages.at(-1).content),data);assert.equal(p.calls[0].body.max_tokens,1800);
 const record=await read(path.join(p.root,p.options.id+'.json'));assert.deepEqual(record.reviewRecovery.sourceEvidence.data,data);assert.equal(record.reviewRecovery.sourceEvidence.contentHash,hashContent(data));assert.equal(record.reviewRecovery.sourceEvidence.rawHash,hashContent(await fs.readFile(sourceEvidence,'utf8')));assert.equal(record.reviewRecovery.requestHash,hashContent(p.calls[0].body));
});
test('来源结构、伪造源字段及不可重建冗余均拒绝，附件按UTF8全量预留不足时零调用',async t=>{
 for(const bad of ['extra','forged','missing']){const p=await fixture(t),file=path.join(p.dir,'source.json'),data={sourceRecords:[{id:p.options.id,name:'测试人物'}],reviewBoundary:'保持事实边界'};if(bad==='extra')data.extra='不支持';if(bad==='forged')data.sourceRecords[0].name='伪造姓名';if(bad==='missing')data.sourceRecords=[{id:p.records[1].id,name:'测试人物'}];await p.write(file,data);await assert.rejects(runDepthReview({...p.options,sourceEvidence:file},p.dependencies));assert.equal(p.calls.length,0);assert.deepEqual(await read(path.join(p.budgetRoot,'budget.json')),p.ledger);}
 const p=await fixture(t),request=buildReviewRequest(p.entries[0],p.records[0].draft,contextFor(p.entries[0],p.world)),payload=JSON.parse(request.messages[1].content);payload.publishedFacts.revisions[0].source='额外来源';request.messages[1].content=JSON.stringify(payload);assert.throws(()=>compactReviewRequest(request),/不可去重/);
 const file=path.join(p.dir,'large-sources.json'),data={sourceRecords:[{id:p.options.id,name:'测试人物'}],reviewBoundary:'核对实际原始来源与边界。'.repeat(6000)};await p.write(file,data);
 const ledger=structuredClone(p.ledger);ledger.cards.T06.spentYuan=2-.083736-.09774424;ledger.spentYuan=ledger.historicalUnallocatedSpentYuan+ledger.cards.T06.spentYuan;await p.write(path.join(p.budgetRoot,'budget.json'),ledger);
 delete p.client.estimateCostYuan;p.client.rates={miss:2,hit:.04,output:8};const result=await runDepthReview({...p.options,sourceEvidence:file,compactRequest:true},p.dependencies);assert.equal(result.status,'manual');assert.equal(p.calls.length,0);near(result.budgetAfter.cards.T06.spentYuan,ledger.cards.T06.spentYuan);near(result.budgetAfter.reservedYuan,.083736);assert.deepEqual(result.budgetAfter.requests,ledger.requests);
 const record=await read(path.join(p.root,p.options.id+'.json'));assert.match(record.reviewRecovery.error,/费用上限/);assert.equal(record.reviewRecovery.sourceEvidence.contentHash,hashContent(data));
});
// No candidate rewrite is required to give a future question its old goal context.
test('未知询问与pending步骤不升为已经获授权；审核来源附件包含真实目标但不公开秘密',async t=>{
 const p=await fixture(t,{pending:true});
 const sourceEvidence=path.join(p.dir,'pending-sources.json'),data={sourceRecords:[{id:p.options.id,name:p.world.npcs[0].name,sex:'女',workplace:p.world.npcs[0].workplace,goals:p.world.npcs[0].goals}],reviewBoundary:'询问何时能看是未定同意，pending步骤尚未发生；不能因此完成原目标或扩大任何秘密knownBy。'};await p.write(sourceEvidence,data);await runDepthReview({...p.options,sourceEvidence},p.dependencies);
 assert.equal(p.calls.length,1);assert.deepEqual(JSON.parse(p.calls[0].body.messages.at(-1).content),data);assert.equal(data.sourceRecords[0].goals.mid[0].progress,0);assert.equal(data.sourceRecords[0].goals.mid[0].steps[0].status,'pending');
});

test('许苓补件可包含陶芷冻结原notes，篡改notes及原源不存在字段在请求前拒绝',async t=>{
 const world=await loadWorld(),taozhi=world.npcs.find(n=>n.id==='npc_hw_taozhi');assert.match(taozhi.notes,/照顾患关节病的母亲/);
 for(const mode of ['legal','forged-notes','absent-field']){
  const p=await fixture(t,{ids:['npc_hw_xuling','npc_review_other']}),sourceEvidence=path.join(p.dir,'xuling-notes.json');p.world.npcs.push(structuredClone(taozhi));
  const data={sourceRecords:[{id:p.options.id,name:p.entries[0].before.name},{id:taozhi.id,name:taozhi.name,notes:taozhi.notes}],reviewBoundary:'陶芷notes只作为冻结原私有出处核验，不因此公开母亲病情或授予许苓其他秘密。'};
  if(mode==='forged-notes')data.sourceRecords[1].notes+='伪造新事实';if(mode==='absent-field')data.sourceRecords[1].inventedSourceField='候选自证';await p.write(sourceEvidence,data);
  if(mode==='legal'){assert.equal((await runDepthReview({...p.options,sourceEvidence,compactRequest:true},p.dependencies)).status,'passed');assert.deepEqual(JSON.parse(p.calls[0].body.messages.at(-1).content),data);const saved=await read(path.join(p.root,p.options.id+'.json'));assert.equal(saved.reviewRecovery.sourceEvidence.contentHash,hashContent(data));}
  else{await assert.rejects(runDepthReview({...p.options,sourceEvidence},p.dependencies),/来源字段与冻结 world 不符|来源没有该字段/);assert.equal(p.calls.length,0);assert.deepEqual(await read(path.join(p.budgetRoot,'budget.json')),p.ledger);}
 }
});

test('T10 mock 19个passed零请求，13失败白名单沿原入口各一次且保留原历史预算与T06停止状态',async t=>{
 const ids=Array.from({length:32},(_,i)=>'npc_t10_mock_'+i),p=await fixture(t,{ids,manualCount:13}),failed=new Set(ids.slice(0,13)),passed=p.records.slice(13);
 const ledger=structuredClone(p.ledger);ledger.cards.T10={limitYuan:3,spentYuan:1.99097608,reservedYuan:0};ledger.spentYuan+=1.99097608;ledger.cards.T06.reviewRecoveries={stopped:{fingerprint:'frozen-stop'}};ledger.requests.stopped={card:'T06',status:'unknown',reservedYuan:0};
 await p.write(path.join(p.budgetRoot,'budget.json'),ledger);await p.write(path.join(p.root,'allocation.json'),{cardId:'T10',incrementLimitYuan:3,waveLimitYuan:20});
 const options={...p.options,cardId:'T10'},saved=await Promise.all(passed.map(r=>fs.readFile(path.join(p.root,r.id+'.json'),'utf8')));
 for(const r of passed)assert.equal((await runDepthReview({...options,id:r.id},{client:p.client,prepare:async()=>{throw Error('passed不得准备');}})).skipped,true);
 assert.equal(p.calls.length,0);assert.deepEqual(await read(path.join(p.budgetRoot,'budget.json')),ledger);
 const generate=p.client.generate.bind(p.client);p.client.generate=async(request,label)=>{const id=JSON.parse(request.messages[1].content).draft.id;assert.ok(failed.has(id),'不得请求白名单以外id');return generate(request,label);};
 for(const id of failed){assert.equal((await runDepthReview({...options,id},p.dependencies)).status,'passed');await runDepthReview({...options,id},p.dependencies);const record=await read(path.join(p.root,id+'.json'));assert.equal(record.attempts,3);assert.deepEqual(record.reviewRecovery.prior,p.records.find(r=>r.id===id));assert.equal(record.reviewRecovery.prior.errors[0].severity,'hard');}
 assert.equal(p.calls.length,13);assert.deepEqual(new Set(p.calls.map(c=>JSON.parse(c.body.messages[1].content).draft.id)),failed);
 for(const [i,r] of passed.entries())assert.equal(await fs.readFile(path.join(p.root,r.id+'.json'),'utf8'),saved[i]);
 const after=await read(path.join(p.budgetRoot,'budget.json'));near(after.cards.T10.spentYuan,ledger.cards.T10.spentYuan+.13);near(after.reservedYuan,ledger.reservedYuan);assert.deepEqual(after.cards.T06,ledger.cards.T06);assert.deepEqual(after.requests.legacyT06,ledger.requests.legacyT06);assert.deepEqual(after.requests.stopped,ledger.requests.stopped);assert.equal(after.cards.T10.limitYuan,3);assert.equal(Object.keys(after.cards.T10.reviewRecoveries).length,13);assert.equal((await read(path.join(p.root,'batch-0.json'))).l4.approved,false);
});
