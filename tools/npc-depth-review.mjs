import fs from 'node:fs/promises';
import {DeepSeekClient} from './deepseek-client.mjs';
import {hashContent,parseModelJSON} from './content-pipeline.mjs';
import {loadWorld} from './load-world.mjs';
import {depthEntries,contextFor,buildReviewRequest,validateDraft,revision} from './npc-depth-content.mjs';
const root='world/drafts/w1/yupo-depth',id=process.argv[2],budgetRoot=process.argv[3];
if(!id||!budgetRoot)throw Error('需要单条id及共用预算目录');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
const [base,allocation,budget,record,world]=await Promise.all([read(`${root}/base.json`),read(`${root}/allocation.json`),read(`${budgetRoot}/budget.json`),read(`${root}/${id}.json`),loadWorld()]);
const entry=depthEntries(base).find(e=>e.id===id);if(!entry)throw Error('条目不属于本批');
const context=contextFor(entry,world),check=validateDraft(record.draft,entry);if(check.errors.length)throw Error(check.errors.join('\n'));
const client=new DeepSeekClient({budgetYuan:allocation.limitYuan,logFile:'logs/w1-yupo-depth-usage.jsonl'});client.spent=budget.spentYuan+Math.max(0,budget.reservedYuan??0);
const save=()=>write(`${budgetRoot}/budget.json`,{spentYuan:client.spent,reservedYuan:Math.max(0,client.reserved),limitYuan:client.budgetYuan});
try{const pending=client.generate(buildReviewRequest(entry,record.draft,context),`content-yupo-depth-${id}-manual-review`);pending.catch(()=>{});await save();const review=parseModelJSON(await pending);if(!Array.isArray(review.contradictions)||review.contradictions.some(r=>!['hard','soft','style'].includes(r.severity)||!['quote','field','reason'].every(k=>typeof r[k]==='string'&&r[k].trim())))throw Error('无效复审结果');record.review=review;record.errors=review.contradictions.filter(r=>r.severity==='hard');record.warnings=review.contradictions.filter(r=>r.severity!=='hard');record.status=record.errors.length?'manual':'passed';record.fingerprint=hashContent({entry,context,revision});await write(`${root}/${id}.json`,record);console.log(JSON.stringify({id,status:record.status,review}));}finally{await save();}
