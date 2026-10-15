import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from './content-pipeline.mjs';
import {sovereigntyRules,entries,draftFor,revision} from '../world/design/u16-sovereignty.mjs';
const root=path.resolve('world/drafts/u16-sovereignty'),world=await loadWorld();
const contextFor=()=>({rules:sovereigntyRules,regions:world.regions.map(r=>({id:r.id,level:r.level,polity:r.ruler?.polity,control:r.control})),titles:world.rules.governance.authority.titles,boundary:'Authorized new founding, royal-service and appointment rules. Keep existing evidence requirements, unified accounts, military ledgers and nonhuman autonomy.'});
const blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
const validateDraft=(d,e)=>({errors:[...(d.id!==e.id||d.text!==e.text?['定稿不一致']:[]),...[...blocklist.names,...blocklist.realPeople].filter(w=>d.text.includes(w)).map(w=>`原创屏蔽词:${w}`)],warnings:[]});
if(process.argv.includes('--l1')){const errors=entries.flatMap(e=>validateDraft(draftFor(e),e).errors);if(errors.length)throw Error(errors.join('\n'));console.log(`U16 L1 passed: ${entries.length}`);}
if(process.argv.includes('--review')){
 await fs.mkdir(root,{recursive:true});try{await fs.access(path.join(root,'budget.json'));}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(path.join(root,'budget.json'),JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:1,note:'U16 独立预算，上限1元'}));}
 const {summary:s}=await runContentPipeline({entries,root,budgetRoot:root,revision,contextFor,validateDraft,reviewDraftFor:draftFor,reuseFrozenDrafts:true,
  cardId:'U16',allocation:{cardId:'U16',incrementLimitYuan:1,waveLimitYuan:25,maxRequests:entries.length*2,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:30,
  retryManual:process.argv.includes('--retry-manual'),client:new DeepSeekClient({budgetYuan:1,logFile:path.join(root,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('使用固定草稿');},buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.max_tokens=1100;r.messages[0].content+=' 核对一致的句子不输出。仅核对与既有事实或规则的矛盾；本批获授权新增规则，不要求旧设定已记载。';return r;},
  requestTransform:async({body,entry})=>{const b=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));if(Object.values(b.requests??{}).filter(r=>r.label?.includes(`-${entry.id}-review`)&&['sent','settled','unknown'].includes(r.status)).length>=2)throw Object.assign(Error('同条L2最多两次'),{code:'CONTENT_BUDGET_STOP'});return {body};}});
 console.log(JSON.stringify({passed:s.passed,manual:s.manual,pending:s.pending,budget:s.budget.cards.U16}));
}
if(process.argv.includes('--publish')){
 const approved=await readApprovedContent(root,entries,{revision,contextFor}),b=JSON.parse(await fs.readFile(path.join(root,'batch-0.json'),'utf8'));
 if(approved.length!==entries.length||b.l4.wave?.length!==10||new Set(b.l4.wave.map(r=>r.id)).size!==10||b.l4.wave.some(r=>!entries.some(e=>e.id===r.id)||r.scores?.length!==6||r.scores.some(n=>n<3||n>5))||b.l4.wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('未满足L4随机十条六项标准');
 await fs.writeFile('world/lore/sovereignty.json',JSON.stringify({...sovereigntyRules,practices:approved},null,2)+'\n');console.log('U16 sovereignty published');
}
