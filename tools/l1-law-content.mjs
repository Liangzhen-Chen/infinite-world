import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {lawTemplates,lawDraft} from '../world/design/l1-law-codes.mjs';
export const revision='l1-law-1',root=path.resolve('world/drafts/l1-law');
export const entries=lawTemplates.map(t=>({...t,category:'law_code'}));
const world=await loadWorld(),blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
export function contextFor(e){return {regions:world.regions.filter(r=>r.category==='county'&&(r.ruler.polity===e.polity||e.polity==='王国'&&r.ruler.polity.startsWith('王国'))&&(!e.province||r.province===e.province)).map(r=>({name:r.name,ruler:r.ruler,prose:r.prose})),
 cultures:world.cultures.filter(c=>/赭牙|杉根|砾耳/.test(c.name)&&/赭牙|杉根|砾耳/.test(e.polity)),facts:['新约为本卡授权制定的制度，数值以骨架为准。五村原法典保留。刑罚限期，不世袭、不转卖。','省郡是地理分区；非人政体不受王国法院管辖。']};}
export function validateDraft(d,e){const errors=[];if(hashContent(d)!==hashContent(lawDraft(e)))errors.push('正文与手写草案不符');
 const text=JSON.stringify(d);for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`原创屏蔽词：${word}`);
 for(const key of ['duel','magic','smuggling','mining','enslavement','trafficking'])if(!d.stances?.[key])errors.push(`缺少立场 ${key}`);
 if(e.courts.length!==3||!e.evidenceRequired||!e.penalties.fraud)errors.push('缺少可执行程序');return{errors,warnings:[]};}
export async function review(){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 await fs.mkdir(root,{recursive:true});
 try{await fs.access(path.join(root,'budget.json'));}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(path.join(root,'budget.json'),JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:25,note:'L1 新法典独立预算，用户授权≤1.5元'}));}
 return runContentPipeline({entries,root,budgetRoot:root,revision,cardId:'L1',allocation:{cardId:'L1',incrementLimitYuan:1.5,waveLimitYuan:25,maxRequests:entries.length*2,startingSpentYuan:0,startingReservedYuan:0},
 concurrency:1,batchSize:50,contextFor,validateDraft,reviewDraftFor:lawDraft,reuseFrozenDrafts:true,retryManual:process.argv.includes('--retry-manual'),
 client:new DeepSeekClient({budgetYuan:1.5,logFile:path.join(root,'usage.jsonl')}),buildDraftRequest:()=>{throw Error('禁止模型起草');},
 buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.max_tokens=1300;r.messages[0].content+='本卡授权制定新法典，草案中的程序、立场与刑罚本身可为新事实；与既有省郡、文化相矛盾才报错。核对一致的句子不输出。每处hard指出相反的两个值。';return r;},
 requestTransform:async({body,entry})=>{let b;try{b=JSON.parse(await fs.readFile(path.join(root,'budget.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const sent=Object.values(b?.requests??{}).filter(r=>r.label?.includes(entry.id)&&['sent','settled','unknown'].includes(r.status));
  if(sent.length>=2)throw Object.assign(Error(`同条审核已达两次：${entry.id}`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}
export async function publish(){
 const approved=await readApprovedContent(root,entries,{contextFor,revision});if(approved.length!==entries.length)throw Error('有条文未经审核');
 const batch=JSON.parse(await fs.readFile(path.join(root,'batch-0.json'),'utf8')),wave=batch.l4.wave;
 if(wave?.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!entries.some(e=>e.id===r.id)||r.scores?.length!==6||r.scores.some(x=>x<3||x>5))||wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('L4 随机十条六项评分不达标');
 for(const e of entries)if(validateDraft(approved.find(d=>d.id===e.id),e).errors.length)throw Error(`条文已改变：${e.id}`);
 const file='world/meta/rules.json',rules=JSON.parse(await fs.readFile(file,'utf8'));rules.law.templates=lawTemplates.map(t=>({...t,text:lawDraft(t)}));
 await fs.writeFile(file,JSON.stringify(rules,null,2)+'\n');console.log(JSON.stringify({published:entries.length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){
 if(process.argv.includes('--l1')){for(const e of entries){const v=validateDraft(lawDraft(e),e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}console.log(`L1 passed: ${entries.length}`);}
 if(process.argv.includes('--review')){const r=await review();console.log(JSON.stringify({passed:r.summary.passed,manual:r.summary.manual,pending:r.summary.pending}));}
 if(process.argv.includes('--publish'))await publish();
}

