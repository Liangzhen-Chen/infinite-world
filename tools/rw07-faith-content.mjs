import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from './content-pipeline.mjs';
import {faithRules,entries,draftFor,revision} from '../world/design/rw07-faith.mjs';
const root=path.resolve('world/drafts/rw07-faith'),world=await loadWorld();
const contextFor=()=>({rules:faithRules,existingDeities:world.deities.map(d=>({id:d.id,taboo:d.taboo,miracle:d.miracle})),institutions:world.rules.training.institutions,
 boundary:'本批为新地方规则。显兆是新增有限回应，不替代神祇既有神迹；不能裁定真相。改宗法律没有新增罪名。施药为真实交药。'});
const blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
const validateDraft=(d,e)=>({errors:[...(d.id!==e.id||d.text!==e.text?['定稿不一致']:[]),...[...blocklist.names,...blocklist.realPeople].filter(w=>d.text.includes(w)).map(w=>`原创屏蔽词:${w}`)],warnings:[]});
if(process.argv.includes('--l1')){const errors=entries.flatMap(e=>validateDraft(draftFor(e),e).errors);if(errors.length)throw Error(errors.join('\n'));console.log('RW07 L1 passed');}
if(process.argv.includes('--review')){
 await fs.mkdir(root,{recursive:true});try{await fs.access(path.join(root,'budget.json'));}catch{await fs.writeFile(path.join(root,'budget.json'),JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:1.2,note:'RW-07 独立预算，上限1.2元'}));}
 const {summary:s}=await runContentPipeline({entries,root,budgetRoot:root,revision,contextFor,validateDraft,reviewDraftFor:draftFor,reuseFrozenDrafts:true,
  cardId:'RW07',allocation:{cardId:'RW07',incrementLimitYuan:1.2,waveLimitYuan:25,maxRequests:24,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:30,
  retryManual:process.argv.includes('--retry-manual'),client:new DeepSeekClient({budgetYuan:1.2,logFile:path.join(root,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('使用执行会话固定草稿');},buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.max_tokens=1000;r.messages[0].content+=' 核对一致的句子不输出。若理由判断数值或含义一致，不得写入contradictions。仅核对本条与提供的既有事实或机制是否矛盾；本批机制是获授权的新增规则，不要求旧设定已记载本批规则。';return r;},
  requestTransform:async({body,entry})=>{const b=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));if(Object.values(b.requests??{}).filter(r=>r.label?.includes(`-${entry.id}-review`)&&['sent','settled','unknown'].includes(r.status)).length>=2)throw Object.assign(Error('同条L2最多两次'),{code:'CONTENT_BUDGET_STOP'});return {body};}});
 console.log(JSON.stringify({passed:s.passed,manual:s.manual,pending:s.pending,budget:s.budget.cards.RW07}));
}
if(process.argv.includes('--publish')){
 const approved=await readApprovedContent(root,entries,{revision,contextFor}),b=JSON.parse(await fs.readFile(path.join(root,'batch-0.json'),'utf8'));
 if(approved.length!==entries.length||b.l4.wave?.length!==10||new Set(b.l4.wave.map(r=>r.id)).size!==10||b.l4.wave.some(r=>!entries.some(e=>e.id===r.id)||r.scores?.length!==6||r.scores.some(n=>n<3||n>5))||b.l4.wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('未满足完整审核与L4随机十条六项标准');
 // The reviewed draft names the material 木料. Bind its drafting identifier to
 // the existing item_wood; no new inventory kind is authored by this card.
 const runtime=structuredClone(faithRules);runtime.uses.repair.items={item_wood:1};
 await fs.writeFile('world/lore/faith.json',JSON.stringify({...runtime,practices:approved},null,2)+'\n');console.log('RW07 faith published');
}
