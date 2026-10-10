import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DeepSeekClient} from './deepseek-client.mjs';
import {loadWorld} from './load-world.mjs';
import {npcM2Foundation,npcAgeCorrections} from '../world/design/npc-m2.mjs';
import {validateFoundation,validateDraft,contextFor,revision} from './m2-people-content.mjs';
import {defaultReviewRequest,parseModelJSON,hashContent} from './content-pipeline.mjs';
const root='world/drafts/m2-people',read=async name=>JSON.parse(await fs.readFile(`${root}/${name}.json`,'utf8')),write=(name,x)=>fs.writeFile(`${root}/${name}.json`,JSON.stringify(x,null,2)+'\n');
const ids=['npc_hw_duanyan','npc_hw_zhengshuisheng','npc_hw_gucen'];
const source=await fs.readFile('tools/bootstrap-world.mjs','utf8');
assert.ok(source.includes("age: name === '段禾' ? 16 : name === '林穗' ? 34 : 30"),'原生成器默认年龄证据发生变化，停止');
const world=await loadWorld();world.npcs=await read('baseline');
const bones=await read('foundation'),fresh=npcM2Foundation(world),batch=await read('batch-0');
const unaffectedBefore=Object.fromEntries(await Promise.all(batch.ids.filter(id=>!ids.includes(id)).map(async id=>[id,hashContent(await read(id))])));
for(const id of ids){
 const target=bones.npcs.find(n=>n.id===id),updated=fresh.npcs.find(n=>n.id===id);
 for(const k of ['coins','inventory','skills','services','schedule'])assert.deepEqual(target[k],updated[k],`不得改变${id}.${k}`);
 target.age=updated.age;target.birth.year=updated.birth.year;target.portraitPrompt=updated.portraitPrompt;target.authoredBasis.ageCorrection=updated.authoredBasis.ageCorrection;
}
bones.corrections=structuredClone(npcAgeCorrections);validateFoundation(bones,world);await write('foundation',bones);
const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/m2-people-usage.jsonl'}),budget=await read('budget');client.spent=budget.spentYuan+(budget.reservedYuan??0);
try{
 for(const id of ids){
  const row=await read(id),entry=bones.npcs.find(n=>n.id===id),fingerprint=hashContent({entry,context:contextFor(entry),revision});
  if(row.fingerprint===fingerprint&&row.status==='passed'&&row.ageReview)continue;
  const before=hashContent(row.draft);
  if(id==='npc_hw_duanyan')row.draft.description=row.draft.description.replace('段岩三十岁','段岩四十二岁');
  const check=validateDraft(row.draft,entry),request=defaultReviewRequest(entry,row.draft,contextFor(entry));
  request.messages[0].content+=' 骨架authoredBasis.ageCorrection提供原代码通用年龄占位证据和本次设计修正。采用修正后age与birth，检查亲子年龄及十九年前参军经历；不要求正文复述数字年龄，不补造婚育或从军情节。';
  row.review=parseModelJSON(await client.generate(request,`m2-age-repair-${id}`));
  row.errors=[...check.errors,...row.review.contradictions.filter(x=>x.severity==='hard')];row.warnings=[...check.warnings,...row.review.contradictions.filter(x=>x.severity!=='hard')];row.status=row.errors.length?'manual':'passed';row.fingerprint=fingerprint;
  row.ageReview={correction:entry.authoredBasis.ageCorrection,priorDraftHash:before,proseChanged:before!==hashContent(row.draft),reviewed:true};
  await write(id,row);await write('budget',{spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20});
 }
 for(const [id,hash] of Object.entries(unaffectedBefore))assert.equal(hashContent(await read(id)),hash,`不得重写无关人物${id}`);
 const rows=await Promise.all(batch.ids.map(read));
 Object.assign(batch,{fingerprint:hashContent(rows.map(row=>({id:row.id,draft:row.draft,review:row.review,status:row.status}))),passed:rows.filter(x=>x.status==='passed').length,manual:rows.filter(x=>x.status==='manual').map(x=>x.id),flagged:rows.filter(x=>x.warnings.length).map(x=>x.id),costUpperYuan:client.spent,l4:{approved:false,notes:[]}});
 batch.manualRatio=batch.manual.length/batch.count;batch.needsSystemicRepair=batch.manualRatio>0.1;await write('batch-0',batch);
 const summary=await read('summary');Object.assign(summary,{passed:batch.passed,manual:batch.manual.length,costUpperYuan:client.spent,batches:[batch]});await write('summary',summary);await write('terminal',{state:'finished',...summary});
 await write('age-review',{ids,source:'tools/bootstrap-world.mjs:18',code:"age: name === '段禾' ? 16 : name === '林穗' ? 34 : 30",corrections:npcAgeCorrections.slice(1),unaffectedRecordHashes:unaffectedBefore,unchangedFields:['coins','inventory','skills','services','schedule'],costUpperYuan:client.spent});
 console.log(JSON.stringify({passed:batch.passed,manual:batch.manual,flagged:batch.flagged,costUpperYuan:client.spent,fingerprint:batch.fingerprint}));
}catch(error){await write('budget',{spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20});await write('terminal',{state:'error',error:String(error.message)});throw error;}
