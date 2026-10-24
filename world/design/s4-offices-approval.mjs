import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from '../../tools/content-pipeline.mjs';

const root='world/drafts/s4-offices',revision='s4-offices-3',file='world/lore/factions.json';
const published=JSON.parse(await fs.readFile(file,'utf8'));
// Keep the actual L2 request's pre-publication facts stable on subsequent
// verification/publication runs; publishing must not change its own evidence.
let foundation;
try{foundation=JSON.parse(await fs.readFile(`${root}/foundation.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const factions=foundation?.organizations??published;
const policy=(org,seat,requires={})=>({issuer:`office_org:${org}:leader`,receiveAt:seat,decisionAfterMinutes:60,minimumStanding:0,requires,removal:'holder_request_or_judgment'});
const entries=[];
for(const org of ['faction_bs_government','faction_lampbridge']){
 const base=factions.find(f=>f.id===org),offices=structuredClone(base.offices??[]).filter(o=>!['office_lampbridge_membership','office_lampbridge_exam_registry'].includes(o.id));
 if(org==='faction_bs_government'){
  for(const office of offices)if(office.id!=='office_bs_town_head')office.appointment=policy(org,'bld_bs_office');
 }else{
  for(const office of offices)office.appointment=policy(org,'bld_bs_guild',{profession:office.authority.profession});
  offices.push({id:'office_lampbridge_exam_registry',name:'灯桥木工考核递件',holder:'npc_hw_yanzhe',seat:'bld_hw_mill',authority:{operations:['receive_application','refer_examiner'],profession:'profession_life_6',limits:['仅登记申请并转介当前合格木工考官，不认证、不裁判、不收费']},receptionHours:[[540,720]],appointment:policy(org,'bld_bs_guild'),source:'S4 05 §5.3：行会木工考核在既有尹葛考官席位所在地办理，增设独立递件席位，由既有商人严辙受理，任免归现任会长。'});
 }
 entries.push({id:org,kind:'office-charter',row:offices,source:{path:`${file}#${org}`,detail:base.method+'；'+base.demands},boundary:'本批明确补充任免制度：现任首领受理申请，满60分钟后依真实技能和现任首领对申请人的非负看法决定；申请不授职。仅持有人请求或已有犯罪裁定可提前免职。不得自任首领，不授予裁判权。木工考核独立递件席只转介当前考官。删去无实际会籍办理消费者的新增会籍席位；不增设缺少出生日期来源的年龄门槛。'});
}
const draftFor=e=>({id:e.id,row:e.row}),contextFor=e=>({organization:factions.find(f=>f.id===e.id),boundary:e.boundary});
const validateDraft=(d,e)=>{try{assert.deepEqual(d,draftFor(e));return [];}catch{return ['候选必须等于已冻结章程'];}};
// Verify the superseding charter before replaying an older exact-row gate.
export async function previousOfficeEdition(world, files = null){
 const approved=await readApprovedContent(root,entries,{revision,contextFor});
 assert.equal(approved.length,entries.length);
 const prior=structuredClone(world),priorFiles=files&&structuredClone(files);
 for(const draft of approved){
  assert.deepEqual(world.factions.find(f=>f.id===draft.id)?.offices,draft.row,`${draft.id} 正式文件与已审批的行不同`);
  if(files)assert.deepEqual(files.factions.find(f=>f.id===draft.id)?.offices,draft.row,`${draft.id} 正式文件与已审批的行不同`);
  const offices=draft.row.filter(o=>o.id!=='office_lampbridge_exam_registry').map(({appointment,...office})=>office);
  prior.factions.find(f=>f.id===draft.id).offices=structuredClone(offices);
  if(priorFiles)priorFiles.factions.find(f=>f.id===draft.id).offices=structuredClone(offices);
 }
 return {world:prior,files:priorFiles};
}
const args=process.argv.slice(2);
const main=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(main&&args.includes('--review')){
 await fs.mkdir(root,{recursive:true});
 if(!foundation)await fs.writeFile(`${root}/foundation.json`,JSON.stringify({revision,organizations:factions.filter(f=>entries.some(e=>e.id===f.id))},null,1)+'\n');
 try{await fs.access(`${root}/budget.json`);}catch{await fs.writeFile(`${root}/budget.json`,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:1,cards:{S404:{limitYuan:1,spentYuan:0,reservedYuan:0,maxRequests:30}},requests:{}}));}
 const {summary}=await runContentPipeline({entries,root,budgetRoot:root,revision,contextFor,validateDraft,reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('固定候选');},buildReviewRequest:defaultReviewRequest,client:new DeepSeekClient({budgetYuan:1,logFile:`${root}/usage.jsonl`}),cardId:'S404',allocation:{cardId:'S404',incrementLimitYuan:1,maxRequests:30,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:2});
 console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S404}));
}
if(main&&args.includes('--publish')){
 const approved=await readApprovedContent(root,entries,{revision,contextFor});assert.equal(approved.length,entries.length);
 let text=await fs.readFile(file,'utf8');
 for(const row of approved){const old=published.find(f=>f.id===row.id);text=text.replace(JSON.stringify(old),JSON.stringify({...old,offices:row.row}));}
 await fs.writeFile(file,text);console.log(JSON.stringify({published:approved.length}));
}
if(main&&args.includes('--verify')){
 const approved=await readApprovedContent(root,entries,{revision,contextFor});assert.equal(approved.length,entries.length);
 for(const row of approved)assert.deepEqual(published.find(f=>f.id===row.id).offices,row.row);
 console.log(JSON.stringify({verified:approved.length}));
}
