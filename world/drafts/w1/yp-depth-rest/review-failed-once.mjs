import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadWorld} from '../../../../tools/load-world.mjs';
import {depthEntries,patchDraft,contextFor,validateDraft,validatePatchResults,buildReviewRequest} from '../../../../tools/npc-depth-content.mjs';
import {depthFoundation} from '../../../../tools/npc-depth.mjs';
import {hashContent,parseModelJSON} from '../../../../tools/content-pipeline.mjs';
import {openContentBudget} from '../../../../tools/content-budget.mjs';
import {DeepSeekClient} from '../../../../tools/deepseek-client.mjs';
const root=new URL('./',import.meta.url),read=async file=>JSON.parse(await fs.readFile(new URL(file,root),'utf8')),write=async(file,value)=>fs.writeFile(new URL(file,root),JSON.stringify(value,null,2)+'\n');
const revision='w1-yp-depth-rest-1',world=await loadWorld(),base=await read('base.json'),plan=await read('patch-plan.json');
const config=p=>({revision,patchRows:p.map(row=>({...row,before:base.find(n=>n.id===row.id)}))});
const beforeEntries=depthEntries(base,config(plan),world);
const fixes={
 npc_yp_tanghuan:{},
npc_yp_weichi:{
 'knowledge.known[1]':{fact:'卫冉是卫迟的女儿，与卫迟同住本户居处。',source:'npc_yp_weichi',reliability:'亲历'},
 'knowledge.known[2]':{fact:'卫迟在自家门槛内侧搓榆皮绳，午后把发脆旧股拿到亮处翻看。',source:'npc_yp_weichi',reliability:'亲历'},
 'knowledge.unknown[1]':'卫冉何时能到门边一起查看发脆的旧股',
 'relationships[0].note':'与女儿卫冉同户；卫迟曾把干湿两种绳股比给家人看，让家人上手摸清能受力和只能系轻物的区别。',
 'relationships[1].note':'与应珠同户；卫迟在门槛内侧搓绳，吃饭歇息都在屋里，旧绳和新绳分别收放，想请家人听清旧股的受力区别。',
 'relationships[2].note':'认识同村耿麓；卫迟自己搓绳、翻看旧股，耿麓做垫石帮工，两人的工事各自安排，若谈合作还要当面说明。',
 'opinions.neighbors[2].view':'认识同村耿麓；卫迟自己搓绳、翻看旧股，耿麓做垫石帮工，两人的工事各自安排，若谈合作还要当面说明。'
},
npc_yp_xicun:{
 'knowledge.known[1]':{fact:'席楚是席存的儿子，与席存同住本户居处。',source:'npc_yp_xicun',reliability:'亲历'},
 'knowledge.unknown[0]':'缪朴是否愿意帮自己核对公用簿上两个相近的名字',
 'relationships[0].note':'与儿子席楚同户；席存怕错还柴束，熟人的名字也要再读回核对，席楚在家认得母亲这股谨慎劲。',
 'relationships[1].note':'与父亲游麟同户；席存读名字时会再核对一次，游麟在家也认得她怕把东西错还的谨慎劲。'
},
npc_yp_kongfu:{
 'knowledge.known[1]':{fact:'孔衡是孔馥的儿子，与孔馥同住本户居处。',source:'npc_yp_kongfu',reliability:'亲历'},
 'knowledge.known[2]':{fact:'孔馥在自家院外清洗晒药布，曾当场承认转述的一句话没有亲眼见。',source:'npc_yp_kongfu',reliability:'亲历'},
 'knowledge.unknown[0]':'听过转述的邻人究竟是哪一句觉得不快',
 'knowledge.unknown[1]':'孔衡愿不愿帮自己核清一次转述的原话',
 'goals.mid[0].steps[0].content':'逐句说明自己实际听到哪部分，把没有亲眼见的部分说清',
 'relationships[0].note':'与儿子孔衡同户；孔馥平日在院外洗布，爱跟过路人搭话，如今想找听过自己转述的人说明哪些不是亲见。',
 'relationships[1].note':'认识同村俞澄；孔馥爱从洗布说到门口晒物，自己曾把听来的话说成亲见，今后与俞澄谈话时打算先分清来源。',
 'relationships[2].note':'认识同村裘砚；孔馥挂心转述后邻人不快，今后与裘砚谈话时打算先说明哪些只是听来。',
 'opinions.neighbors[1].view':'认识同村俞澄；孔馥爱从洗布说到门口晒物，自己曾把听来的话说成亲见，今后与俞澄谈话时打算先分清来源。',
 'opinions.neighbors[2].view':'认识同村裘砚；孔馥挂心转述后邻人不快，今后与裘砚谈话时打算先说明哪些只是听来。'
}
};
// Preserve the exact failed record, not a synthetic successful review.
const priors={},changes=[];for(const [id,values]of Object.entries(fixes)){const record=await read(id+'.json');assert.equal(record.status,'manual');assert.ok(record.errors.length);assert.ok(!record.contentRevisions?.length,'本脚本只允许第一次定点修正');priors[id]=record;const row=plan.find(r=>r.id===id);for(const [path,value]of Object.entries(values)){const p=row.patches.find(p=>p.path===path);assert.ok(p,'仅现有失败补丁叶子');assert.ok(record.errors.some(e=>e.field===path||e.field?.startsWith(path+'.')),'本次L2未命中 '+path);changes.push({id,path,before:p.value,after:value});p.value=value;}}
const entries=depthEntries(base,config(plan),world);validatePatchResults(entries,world);
for(const entry of entries)if(!fixes[entry.id]){const old=beforeEntries.find(e=>e.id===entry.id);assert.equal(hashContent(entry),hashContent(old));assert.equal(hashContent(contextFor(entry,world)),hashContent(contextFor(old,world)));}
const oldFoundation=await read('foundation.json'),newFoundation=depthFoundation(entries,world,revision),manifest=await read('manifest.json');
await write('content-revision-1-evidence.json',{revision,ids:Object.keys(fixes),changes,priorFailedRecords:priors,oldFoundationHash:hashContent(oldFoundation),newFoundationHash:hashContent(newFoundation),unaffectedCount:26,reason:'真实L2发现的姓名错误、关系和职业歧义及无来源前提；其他指控用实际原档核对。未重置attempts或改revision。',recordedAt:new Date().toISOString()});
await write('patch-plan.json',plan);await write('foundation.json',newFoundation);await write('candidate.json',entries.map(patchDraft));manifest.foundationHash=hashContent(newFoundation);await write('manifest.json',manifest);
const allocation=await read('allocation.json'),client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w1-yupo-depth-usage.jsonl'}),budget=await openContentBudget({file:'F:/dnd/world/drafts/m4-object/budget.json',client,cardId:'T06',allocation});
try{for(const id of Object.keys(fixes)){
 const entry=entries.find(e=>e.id===id),draft=patchDraft(entry),context=contextFor(entry,world),checked=validateDraft(draft,entry);assert.deepEqual(checked.errors,[]);
 const prior=priors[id],record={...prior,draft,review:null,status:'pending',errors:[],warnings:[],fingerprint:hashContent({entry,context,revision}),contentRevisions:[{iteration:1,prior:structuredClone(prior),changes:changes.filter(x=>x.id===id),startedAt:new Date().toISOString()}]};await write(id+'.json',record);
 const request=buildReviewRequest(entry,draft,context);
 request.max_tokens=1200;
 const payload=JSON.parse(request.messages[1].content);
 const relevant=['id','name','age','sex','tier','home','occupation','coins','inventory','wealth','notes','familyNotes','description','voice','knowledge','goals','relationships','memorySeeds','socialProfile','currentConcern','authoredFacts','secrets'];
 for(const field of ['before','facts'])payload.skeleton[field]=Object.fromEntries(relevant.filter(k=>Object.hasOwn(entry[field],k)).map(k=>[k,entry[field][k]]));
 request.messages[1].content=JSON.stringify(payload);
 const ids=new Set([id,...entry.before.relationships.map(r=>r.with),...draft.patches.filter(p=>p.path.startsWith('memorySeeds')).flatMap(p=>p.value.knownBy??[])]);
 const sourceRecords=[...world.npcs,...world.residents].filter(n=>ids.has(n.id)).map(n=>({id:n.id,name:n.name,age:n.age,sex:n.sex,occupation:n.occupation,home:n.home,relationships:n.relationships,description:n.description,socialProfile:n.socialProfile,memorySeeds:n.memorySeeds}));
 request.messages.push({role:'user',content:JSON.stringify({originalSourceRecords:sourceRecords,reviewBoundary:'核对实际事实。steps的status仍为pending，步骤是尚未执行的计划；愿不愿、何时等未知没有断言同意或行为已发生。请区分尚待确认的提议与已获授权或已发生的事实；不因此降低姓名、关系、归属、知情范围门槛。'})});
 await write(id+'-revision-1-request.json',request);
 try{const response=await budget.request(request,'content-yp-depth-rest-'+id+'-content-revision1-review'),review=parseModelJSON(response);assert.ok(Array.isArray(review.contradictions));for(const r of review.contradictions){assert.ok(['hard','soft','style'].includes(r.severity));assert.ok(['quote','field','reason'].every(k=>typeof r[k]==='string'&&r[k].trim()));}record.review=review;record.reviewResponse=response;record.errors=review.contradictions.filter(r=>r.severity==='hard');record.warnings=review.contradictions.filter(r=>r.severity!=='hard');record.status=record.errors.length?'manual':'passed';record.measurements??=[];record.measurements.push(response.measurement);record.contentRevisions[0].status=record.status;await write(id+'.json',record);console.log(JSON.stringify({id,status:record.status,errors:record.errors,warnings:record.warnings}));}
 catch(error){record.status='manual';record.errors=[error.message];record.contentRevisions[0].status='failed';await write(id+'.json',record);throw error;}
 }
}finally{await write('content-revision-1-budget.json',budget.ledger);await budget.close();}

