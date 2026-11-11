import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {hashContent,parseModelJSON,defaultReviewRequest,rowFingerprintShape} from './content-pipeline.mjs';
import {validateDraft,contextFor,revision} from './w1-hewan-content.mjs';
const root='world/drafts/w1/hewan',read=async p=>JSON.parse(await fs.readFile(p,'utf8')),write=(p,x)=>fs.writeFile(p,JSON.stringify(x,null,2)+'\n');
const world=await loadWorld(),bones=await read(`${root}/foundation.json`),budgetPath='world/drafts/w1/budget.json',budget=await read(budgetPath),client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w1-usage.jsonl'});client.spent=budget.spentYuan+(budget.reservedYuan??0);
const patches=[
 {kind:'npcs',id:'npc_hw_miaozhen',reason:'公开人物描写不能直接揭示仅本人知晓的秘密；记忆不能保证骨架未给出的种粒保存结果。',changes:[['description','近来辨小字吃力，宁愿请人读给自己听，却不愿把这事说破。','她筛粒时把膝上布摊得平平整整，拿起一粒就停下来细看。'],['memoryNarratives.0','，没让那批种粒沤坏。','。'],['voiceSamples.2','榆儿，你念慢些，这记号我得对着袋子再听一遍。','这筛下的瘪粒另放，别和要留种的混了。']]},
 {kind:'npcs',id:'npc_hw_xiejin',reason:'删除天未亮就起床做饭的叙述，保持既定08:00起家务的作息事实。',changes:[['description','天没大亮她就起来做饭、理家务，随后','她先在家做饭、理家务，随后']]},
 {kind:'locations',id:'bld_hw_home_16',reason:'本户为邢芦的农户，未设渔具修补技艺或服务，删除新增渔具修补行为。',changes:[['description','择菜或修补渔具','择菜或整理衣袖']]},
];
const selectedId=process.argv.includes('--id')?process.argv[process.argv.indexOf('--id')+1]:null;const selected=selectedId?patches.filter(p=>p.id===selectedId):patches;if(!selected.length)throw new Error('没有匹配的定点修正');
for(const p of selected){const file=`${root}/${p.kind}/${p.id}.json`,r=await read(file),entry=bones[p.kind].find(e=>e.id===p.id),context=contextFor(entry,bones,world);
 for(const [field,from,to]of p.changes){const keys=field.split('.'),owner=keys.length===2?r.draft[keys[0]]:r.draft,key=keys.at(-1);if(owner[key].includes(from))owner[key]=owner[key].replace(from,to);else if(!owner[key].includes(to))throw new Error(`修正原句不符 ${p.id}/${field}`);}
 r.status='pending';r.manualCorrection={reason:p.reason};r.review=null;await write(file,r);
 const request=defaultReviewRequest(entry,r.draft,context);request.messages[0].content+=' 完整档的description和台词是公开可见内容，若直接泄漏仅本人知晓的secrets则属于硬边界错误。记忆种子可补兼容的感官细节，不能增加已成功或已获利等未给出的结果。';
 const response=client.generate(request,`w1-l4-${p.id}`);response.catch(()=>{});await write(budgetPath,{spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20});
 try{r.review=parseModelJSON(await response);if(!Array.isArray(r.review.contradictions))throw new Error('审查格式无效');r.errors=[...validateDraft(r.draft,entry).errors,...r.review.contradictions.filter(x=>x.severity==='hard')];r.warnings=r.review.contradictions.filter(x=>x.severity!=='hard');r.status=r.errors.length?'manual':'passed';r.feedback=r.errors.length?r.errors:null;r.fingerprint=hashContent({entry,context,revision});await write(file,r);console.log(JSON.stringify({id:p.id,status:r.status,errors:r.errors}));}finally{await write(budgetPath,{spentYuan:client.spent,reservedYuan:Math.max(0,client.reserved),limitYuan:20});}
}
for(const kind of new Set(selected.map(p=>p.kind))){const directory=`${root}/${kind}`,summary=await read(`${directory}/summary.json`);for(const batch of summary.batches){const rows=await Promise.all(batch.ids.map(id=>read(`${directory}/${id}.json`)));batch.fingerprint=hashContent(rows.map(rowFingerprintShape));batch.passed=rows.filter(r=>r.status==='passed').length;batch.manual=rows.filter(r=>r.status==='manual').map(r=>r.id);batch.pending=rows.filter(r=>r.status==='pending').map(r=>r.id);batch.flagged=[...new Set([...batch.flagged,...selected.filter(p=>p.kind===kind).map(p=>p.id)])];batch.manualRatio=batch.manual.length/batch.count;batch.needsSystemicRepair=batch.manualRatio>.1;batch.l4={approved:false,notes:[]};await write(`${directory}/batch-${batch.index}.json`,batch);}summary.passed=summary.batches.reduce((n,b)=>n+b.passed,0);summary.manual=summary.batches.reduce((n,b)=>n+b.manual.length,0);summary.pending=summary.batches.reduce((n,b)=>n+b.pending.length,0);summary.costUpperYuan=client.spent;await write(`${directory}/summary.json`,summary);}
