import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runDepth,prepareDepth} from '../../../../tools/npc-depth.mjs';
import {prepareFirstSourceEvidence,compactReviewRequest} from '../../../../tools/npc-depth-source-evidence.mjs';
import {contextFor,patchDraft,buildDraftRequest,buildReviewRequest,validateDraft,checkIncrementalReview,getPath} from '../../../../tools/npc-depth-content.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';

const root=path.resolve('world/drafts/w1/lq-depth/author-v2/first-review');
try{await fs.access(path.join(root,'T45-official-preflight.json'));throw Error('首审预检已冻结，不得在真实审核后重建期初证据');}catch(e){if(e.code!=='ENOENT')throw e;}
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=(name,data)=>fs.writeFile(path.join(root,name),JSON.stringify(data,null,2)+'\n');
const options={root,worldRoot:path.resolve('world'),design:path.resolve('world/design/w1-lq-depth.mjs'),authoredBackground:path.join(root,'authored-background.json'),sourceEvidenceMap:path.join(root,'source-evidence-map.json'),compactRequest:true,budgetRoot:'F:/dnd/world/drafts/m4-object',cardId:'T08',prepare:true};
const oldReport=await read(path.join(root,'T26-contract-preflight.json'));
const map=Object.fromEntries(oldReport.sexSupplements.map(s=>[s.id,s.file]));
try{assert.deepEqual(await read(options.sourceEvidenceMap),map);}catch(e){if(e.code!=='ENOENT')throw e;await write('source-evidence-map.json',map);}
const frozen=[];
async function scan(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(!['first-source-evidence.json','source-evidence-map.json'].includes(entry.name)&&!entry.name.startsWith('T45-')){const raw=await fs.readFile(file,'utf8'),lf=raw.replace(/\r\n/g,'\n');frozen.push({file:path.relative(path.resolve('world'),file).replaceAll('\\','/'),sha256LF:createHash('sha256').update(lf).digest('hex'),...(entry.name.endsWith('.json')?{contentHash:hashContent(JSON.parse(raw))}:{})});}}}
// This snapshot precedes the first real records; it is never regenerated later.
await scan(path.resolve('world/drafts/w1/lq-depth/author-v2'));
for(const file of ['world/design/w1-lq-depth.mjs','world/drafts/w1/lq-depth/author-background.mjs']){const lf=(await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n');frozen.push({file:path.relative(path.resolve('world'),path.resolve(file)).replaceAll('\\','/'),sha256LF:createHash('sha256').update(lf).digest('hex')});}
await runDepth(options,{client:{generate(){throw Error('零模型预检禁止 generate');}}});
const prepared=await prepareDepth(options);
const adapter=await prepareFirstSourceEvidence(options,prepared,e=>contextFor(e,prepared.world));
const ledgerRaw=await fs.readFile(path.join(options.budgetRoot,'budget.json'),'utf8'),ledger=JSON.parse(ledgerRaw);
const previousRequests=Object.entries(ledger.requests??{}).filter(([,r])=>r.card==='T08'||/npc_lq_|lq-depth/.test(r.label??''));
assert.equal(previousRequests.length,0,'已有T08请求，必须先核齐原卡历史');
assert.ok(!ledger.cards?.T08||ledger.cards.T08.spentYuan===0&&ledger.cards.T08.reservedYuan===0,'原卡额度不得重领');
assert.equal(ledger.waveLimitYuan,20);
const requests=[];let checkedSources=0;
const encode=body=>({model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...body});
const cost=body=>{const final=encode(body);return{utf8Bytes:Buffer.byteLength(JSON.stringify(final)),maxTokens:final.max_tokens,ceilingYuan:(Buffer.byteLength(JSON.stringify(final))*2+final.max_tokens*8)/1e6};};
for(const entry of prepared.entries){
 const context=contextFor(entry,prepared.world),draft=patchDraft(entry);
 assert.deepEqual(validateDraft(draft,entry,context).errors,[]);
 for(const event of context.authoredBackground.events)for(const ref of event.originalSources){assert.deepEqual(ref.value,getPath(prepared.world[ref.collection].find(s=>s.id===ref.id),ref.field));checkedSources++;}
 const full=buildReviewRequest(entry,draft,context),supplement=map[entry.id]?await read(path.join(root,map[entry.id])):null;
 const append=body=>{const copy=structuredClone(body);if(supplement)copy.messages.push({role:'user',content:JSON.stringify(supplement)});return copy;};
 const draftRequest=append(buildDraftRequest(entry,null,context)),fullRequest=append(full),compactRequest=append(compactReviewRequest(full));
 for(const [phase,body] of [['draft',buildDraftRequest(entry,null,context)],['review',full]]){const result=await adapter.transform({entry,context,phase,body,feedback:null,draft,record:{}});assert.deepEqual(result.body,phase==='draft'?draftRequest:compactRequest);}
 const tasks=JSON.parse(full.messages[0].content.split('本条待审清单：')[1].split('。')[0]);
 assert.deepEqual(tasks.patchPaths,entry.patches.map(p=>p.path));
 const fixture={contradictions:[],reviewedPaths:tasks.patchPaths,backgroundReviews:tasks.backgrounds.map(b=>({eventId:b.eventId,sourceHash:b.sourceHash,reviewedRiskPaths:b.riskPaths,contradictions:[]}))};
 assert.deepEqual(checkIncrementalReview(fixture,entry,context),[],'只验证合同fixture，不是L2批准');
 for(const body of [draftRequest,fullRequest,compactRequest])if(supplement)assert.deepEqual(JSON.parse(body.messages.at(-1).content),supplement);
 requests.push({id:entry.id,paths:tasks.patchPaths,backgrounds:tasks.backgrounds,hasSupplement:!!supplement,draft:{request:draftRequest,...cost(draftRequest)},full:{request:fullRequest,...cost(fullRequest)},compact:{request:compactRequest,...cost(compactRequest)}});
}
assert.equal(requests.length,30);assert.equal(requests.filter(r=>r.hasSupplement).length,15);
assert.equal(await fs.readFile(path.join(options.budgetRoot,'budget.json'),'utf8'),ledgerRaw,'零模型不得改共享账');
const maxRequest=Math.max(...requests.flatMap(r=>[r.draft.ceilingYuan,r.compact.ceilingYuan]));
const report={kind:'T45-official-first-request-preflight',createdAt:new Date().toISOString(),modelCalls:0,l2Approved:false,l1:'passed',frozen,sourceEvidenceMapHash:hashContent(map),registrationHash:hashContent(await read(path.join(root,'first-source-evidence.json'))),checkedSources,entries:30,changedLeaves:requests.reduce((n,r)=>n+r.paths.length,0),eventIds:[...new Set(requests.flatMap(r=>r.backgrounds.map(b=>b.eventId)))],supplements:15,sexPeople:oldReport.referencedSexPeople,requests,encodedDefaults:{model:'deepseek-flash',stream:false,thinking:{type:'disabled'}},rates:{miss:2,output:8},costBasis:'Final encoded UTF-8 bytes as conservative input token ceiling; actual usage settles each reservation',maxRequestCeilingYuan:maxRequest,totalCompactDraftCeilingYuan:requests.reduce((n,r)=>n+r.draft.ceilingYuan+r.compact.ceilingYuan,0),budgetBefore:{spentYuan:ledger.spentYuan,reservedYuan:ledger.reservedYuan,waveLimitYuan:20,card:ledger.cards?.T08??{limitYuan:3,spentYuan:0,reservedYuan:0},previousRequests},apiKeyConfigured:!!process.env.DEEPSEEK_API_KEY,perRequestBudgetSufficient:ledger.spentYuan+ledger.reservedYuan+maxRequest<=20&&maxRequest<=3};
await write('T45-official-preflight.json',report);
console.log(JSON.stringify({entries:30,modelCalls:0,l1:report.l1,supplements:15,leaves:report.changedLeaves,maxRequestCeilingYuan:maxRequest,totalCompactDraftCeilingYuan:report.totalCompactDraftCeilingYuan,budgetBefore:report.budgetBefore,apiKeyConfigured:report.apiKeyConfigured,perRequestBudgetSufficient:report.perRequestBudgetSufficient}));
