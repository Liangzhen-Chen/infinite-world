import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from './content-pipeline.mjs';
import {educationRules,entries,draftFor,revision} from '../world/design/rw05-education.mjs';
const root=path.resolve('world/drafts/rw05-education'),world=await loadWorld();
const contextFor=()=>({cultures:world.cultures.map(c=>({id:c.id,name:c.name})),
 appointment:world.rules.governance.authority.offices,training:world.rules.training.institutions,
 boundary:'本批是授权新增的考核制度。通过仅形成任职申请凭据，不能绕过既有贡献、举荐、住户意见、上级审定、职业任务、入门守戒。不得赋予未登记机构任命权。'});
const blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
const validateDraft=(d,e)=>({errors:[...(d.id!==e.id||d.text!==e.text?['定稿不一致']:[]),...(!world.cultures.some(c=>c.id===e.culture)?['文化不存在']:[]),...[...blocklist.names,...blocklist.realPeople].filter(w=>d.text.includes(w)).map(w=>`原创屏蔽词:${w}`)],warnings:[]});
if(process.argv.includes('--l1')){const errors=entries.flatMap(e=>validateDraft(draftFor(e),e).errors);if(errors.length)throw Error(errors.join('\n'));console.log('RW05 L1 passed');}
if(process.argv.includes('--review')){
 await fs.mkdir(root,{recursive:true});try{await fs.access(path.join(root,'budget.json'));}catch{await fs.writeFile(path.join(root,'budget.json'),JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:.6,note:'RW-05 地方考核独立预算，上限0.6元；前轮未发生模型费用'}));}
 const {summary:s}=await runContentPipeline({entries,root,budgetRoot:root,revision,contextFor,validateDraft,reviewDraftFor:draftFor,reuseFrozenDrafts:true,
  cardId:'RW05',allocation:{cardId:'RW05',incrementLimitYuan:.6,waveLimitYuan:25,maxRequests:36,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:30,
  retryManual:process.argv.includes('--retry-manual'),client:new DeepSeekClient({budgetYuan:.6,logFile:path.join(root,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('使用固定草稿');},buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.max_tokens=700;r.messages[0].content+=' 核对一致的句子不输出。若理由判断含义一致，不得写入contradictions。新增规则本身已获授权，核对是否与既有规则冲突。';return r;},
  requestTransform:async({body,entry})=>{const b=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));if(Object.values(b.requests??{}).filter(r=>r.label?.includes(`-${entry.id}-review`)&&['sent','settled','unknown'].includes(r.status)).length>=2)throw Object.assign(Error('同条L2最多两次'),{code:'CONTENT_BUDGET_STOP'});return {body};}});
 console.log(JSON.stringify({passed:s.passed,manual:s.manual,pending:s.pending,budget:s.budget.cards.RW05}));
}
if(process.argv.includes('--publish')){
 const approved=await readApprovedContent(root,entries,{revision,contextFor}),b=JSON.parse(await fs.readFile(path.join(root,'batch-0.json'),'utf8'));
 if(approved.length!==entries.length||b.l4.wave?.length!==10||new Set(b.l4.wave.map(r=>r.id)).size!==10||b.l4.wave.some(r=>r.scores?.length!==6||r.scores.some(n=>n<3||n>5))||b.l4.wave.flatMap(r=>r.scores).reduce((a,v)=>a+v,0)/60<4)throw Error('尚未完成L4随机十条六项评分');
 const file='world/meta/rules.json',rules=JSON.parse(await fs.readFile(file,'utf8'));rules.education=educationRules;await fs.writeFile(file,JSON.stringify(rules,null,2)+'\n');console.log('RW05 education rules published');
}
