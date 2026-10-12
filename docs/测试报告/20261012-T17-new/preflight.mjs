import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {loadWorld} from '../../../tools/load-world.mjs';
import {loadPromptBundle} from '../../../tools/build-card.mjs';
import {loadHostPromptProcessor} from '../../../tools/host-prompt.mjs';
import {assembleMessages,staticMessages,isOutOfCharacter} from '../../../extension/prompt.mjs';
import {digest,atomicJSON} from '../../../server-plugin/storage.mjs';
import {hashContent} from '../../../tools/content-pipeline.mjs';
import {WorldEngine} from '../../../server-plugin/engine.mjs';
import {npcPlanningContext} from '../../../server-plugin/npc-autonomy.mjs';
import {npcPlanningRequest} from '../../../tools/npc-autonomy-planner.mjs';
import {createPlaytestServer,runPlaytest} from '../../../tools/playtest-runner.mjs';
import {reviewPlaytest} from '../../../tools/playtest-review.mjs';
import {reviewNpcRequirements} from '../../../tools/npc-acceptance.mjs';
import {publicSettlementEntries} from '../../../server-plugin/settlement-profile.mjs';
import {prepareNpcDepthBatch} from '../../../tools/publish-npc-depth.mjs';
const out=import.meta.dirname,root=path.resolve(out,'../../..');
const oldDir='F:/dnd-wt/T17/docs/测试报告/20261012-T17';
const read=async file=>JSON.parse(await fs.readFile(path.resolve(root,file),'utf8'));
const world=await loadWorld(),bundle=await loadPromptBundle({world});
const hostInstallation=process.env.T17_HOST_INSTALLATION??'F:/dnd/SillyTavern';
const host=await loadHostPromptProcessor(hostInstallation),prior=await read('world/drafts/w1/t11b-publication/evidence.json');
const approvedIds=prior.selectedQuality.map(n=>n.id),approved=new Set(approvedIds);
assert.equal(approved.size,32);assert.equal(prior.m2.originalIds.length,18);
assert.ok(prior.m2.originalIds.every(id=>approved.has(id)));
const profiles=prior.selectedQuality.map(row=>{const npc=world.npcs.find(n=>n.id===row.id);assert.equal(hashContent(npc),row.hash,row.id);assert.deepEqual(row.issues,[]);return {...row,original18:prior.m2.originalIds.includes(row.id)};});
const events=prior.sharedEvents.map(row=>{const npc=world.npcs.find(n=>n.id===row.id),event=npc.memorySeeds.find(e=>e.id===row.eventId);assert.equal(hashContent(event),row.eventHash,row.eventId);assert.ok(row.participants.every(id=>approved.has(id)));return {...row,verifiedCurrent:true};});
const yupoManifest='world/drafts/w1/yp-depth-rest/reopen/publication-batch.json';
const yupo=await prepareNpcDepthBatch({batchManifest:path.join(root,yupoManifest)});assert.deepEqual(yupo.preview.changed,[]);assert.equal(yupo.preview.amendedNpcIds.length,30);
const yupoPublished={manifest:yupoManifest,manifestHash:digest(await read(yupoManifest)),changed:[],profiles:yupo.preview.amendedNpcIds.map(id=>({id,hash:hashContent(world.npcs.find(n=>n.id===id))})),scope:'原publisher逐项L1/L2/L4/事件闭包预演为零差异；不自动扩大本轮32人动态守卫'};
const ids=['npc_social','npc_private','npc_shove','guide','npc_delivery','npc_quest_social','npc_home_visit','npc_offscreen','npc_voices','npc_courier'];
const files=(await fs.readdir(path.join(root,'tests/playtests'))).filter(f=>f.endsWith('.json')).sort();
const scenarios=(await Promise.all(files.map(f=>read('tests/playtests/'+f)))).filter(s=>ids.includes(s.id));assert.equal(scenarios.length,10);
const dependencies=prior.m2.scenarios.map(row=>{const s=scenarios.find(s=>row.file===`tests/playtests/${s.id}.json`);assert.equal(hashContent(s),row.hash,s.id);assert.deepEqual(row.unapproved,[]);return {...row,verifiedCurrent:true};});
const rows=world.locations.filter(row=>row.id!=='loc_hw'&&row.scope!=='loc_hw').map(({id,name})=>({id,name}));
const text=`其他已登记地点：${rows.map(row=>row.name).join('、')}。详细地理通过目录与检索查阅。`;
const raw=staticMessages(bundle),converted=host.process(assembleMessages(bundle,[], '【时间】预检\n【在场】预检'),bundle);
const renderings=[raw,converted].flatMap(messages=>messages.flatMap((m,i)=>{const start=m.content?.indexOf(text)??-1;if(start<0)return [];assert.equal(m.role,'system');assert.equal(m.content.indexOf(text,start+1),-1);return [{path:`request.messages[${i}].content`,span:[start,start+text.length],contentHash:digest(m.content)}];}));
assert.equal(renderings.length,2);
const oldPre=JSON.parse(await fs.readFile(path.join(oldDir,'preflight.json'),'utf8')),oldBudget=JSON.parse(await fs.readFile(path.join(oldDir,'resume-persistent-budget.json'),'utf8'));
assert.equal(oldBudget.runId,oldPre.runId);assert.equal(oldBudget.spentYuan,.28484248);assert.equal(oldBudget.reservedYuan,6.372890000000001);
const sourcePaths=[...prior.sources.map(s=>'world/'+s.file),'world/drafts/w1/t11b-publication/evidence.json','tools/load-world.mjs','tools/build-card.mjs','tools/host-prompt.mjs','tools/npc-autonomy-planner.mjs',...dependencies.map(s=>s.file),...(await fs.readdir(path.join(root,'prompt'))).map(f=>'prompt/'+f)];
sourcePaths.push(yupoManifest,'docs/测试报告/20261012-T17-new/runtime-guard.mjs');
const sources=await Promise.all(sourcePaths.map(async file=>({file,sha256:digest(await fs.readFile(path.join(root,file),'utf8'))})));
const hostSources=await Promise.all(['src/prompt-converters.js','src/util.js','config.yaml'].map(async file=>({file,sha256:digest(await fs.readFile(path.join(hostInstallation,file),'utf8'))})));
const pre={card:'T17-A',capturedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),diff:execFileSync('git',['diff','--stat'],{cwd:root,encoding:'utf8'}).trim(),modelCalls:0,spentYuan:0,reservedYuan:0,worldHash:digest(world),promptHash:digest(bundle),scenariosHash:digest(scenarios),hostInstallation,providerProcessing:host.identity,approvedIds,profiles,events,originalIds:prior.m2.originalIds,dependencies,sources,locationProjection:{source:'tools/build-card.mjs:reference / world/geo/locations.json',rows,text,textHash:digest(text),renderings},oldRun:{runId:oldPre.runId,budgetFile:path.join(oldDir,'resume-persistent-budget.json'),budgetHash:digest(oldBudget),spentYuan:oldBudget.spentYuan,unknownReservedYuan:oldBudget.reservedYuan,newRunId:'t17-m2-20261012-02',newIncrementCeilingYuan:8,combinedUpperCeilingYuan:14.65773248,historyDeduplication:'not-verified',paymentReady:false},scope:'完整正式world/bundle/host转换输入；不新开预算、不恢复旧run；本地响应只核查请求出处，不计M2真实验收'};
await atomicJSON(path.join(out,'preflight.json'),pre);
await atomicJSON(path.join(out,'frozen-inputs.json'),{world,bundle,scenarios,providerProcessing:host.identity,convertedStaticMessages:converted});
const {analyzeRequest,closure}=await import('./runtime-guard.mjs');
pre.profileClosures=profiles.map(n=>({id:n.id,closure:closure([n.id])}));assert.ok(pre.profileClosures.every(row=>row.closure.every(id=>approved.has(id))));
const oldReport=JSON.parse(await fs.readFile('F:/dnd-wt/T17/docs/测试报告/最新/真实试玩.json','utf8'));
pre.replaySource={file:'F:/dnd-wt/T17/docs/测试报告/最新/真实试玩.json',hash:digest(oldReport)};
const requests=[],blockers=[],results=[];let serial=0;
function capture(body,label,role){const analysis=analyzeRequest(body);requests.push({label,role,requestHash:digest(body),request:body,...analysis});if(analysis.unapproved.length){blockers.push({label,role,unapproved:analysis.unapproved,references:analysis.references.filter(r=>analysis.unapproved.includes(r.id))});throw Error('未批准实际依赖：'+analysis.unapproved.join(','));}}
const response=(content,tool_calls)=>({choices:[{finish_reason:tool_calls?'tool_calls':'stop',message:{role:'assistant',content,...(tool_calls?{tool_calls}:{})}}]});
const call=(name,args)=>({id:`zero-${serial++}`,type:'function',function:{name,arguments:JSON.stringify(args)}});
const consistencyClient={async generate(body,label){capture(body,label,'consistency');return response(null,[call('report_consistency_issues',{issues:[]})]);}};
// The supported server creates isolated campaigns and performs every HTTP write.
// Local clients cannot contact a provider. Old recorded calls only drive matching inputs.
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'t17-new-preflight-'));
const server=await createPlaytestServer({world,seed:'T17-A-zero',directory,consistencyClient});
try{for(const scenario of scenarios){
 const old=oldReport.results.find(r=>r.id===scenario.id),played=new Set();
 const client={async generate(body,label){capture(body,label,'host');const match=new RegExp(`^${scenario.id}-1-(\\d+)-`).exec(label),i=Number(match[1]),step=scenario.turns[i];
  if(!played.has(i)){played.add(i);const recorded=old?.turns.find(t=>t.input===step.input);let calls=recorded?.calls??[];
   if(scenario.id==='npc_home_visit'&&i===5)calls=[{tool:'world_time',args:{minutes:60,activity:'等待'}}];
   if(scenario.id==='npc_quest_social'&&i===4)calls=[{tool:'world_move',args:{destination:'bld_hw_council'}},{tool:'world_time',args:{until:{hour:12,minute:0,dayOffset:0},activity:'等待'}}];
   if(scenario.id==='npc_quest_social'&&i===5)calls=[{tool:'world_trade',args:{seller:'npc_hw_chenbai',item:'带壳燕麦',quantity:10,unitPrice:3,payment:'cash'}}];
   // Replay targets are checked as real tool objects, never name metadata.
   if(calls.length){const proposed=calls.map(c=>call(c.tool,c.args));capture({calls:proposed},label+':targets','tool');return response(null,proposed);}}
  const scene=await server.api('scene',{campaignId:campaignByScenario.get(scenario.id),query:step.input});const view=await server.api('read',{campaignId:campaignByScenario.get(scenario.id)});
  const state=view.document.state,present=Object.entries(state.npcs).filter(([,n])=>n.location===state.location).map(([id])=>id).join(',');
  return response(isOutOfCharacter(step.input)?'零模型预检记录。':`零模型预检记录。<回合 额外="0分" 地点="${state.location}" 在场="${present}"/>`);
 }};
 const campaignByScenario=new Map();
 const api=async(endpoint,body)=>{const value=await server.api(endpoint,body);if(endpoint==='create')campaignByScenario.set(scenario.id,value.reference.campaignId);if(endpoint==='execute'&&body.tool!=='world_turn')capture({tool:body.tool,args:body.args},`${scenario.id}:HTTP:${body.tool}`,'tool');return value;};
 const result=await runPlaytest({scenario,api,client,bundle,processMessages:host.process,countTokens:async t=>Buffer.byteLength(t),stopOnFailure:true});
 const context=npcPlanningContext(new WorldEngine(world),result.finalDocument);capture(npcPlanningRequest(context,3000),`${scenario.id}:planning`,'planning');
 const scoring={async generate(body,label){capture(body,label,'review');if(label.includes('npc-acceptance')){const id=label.split('-').at(-1);return response(JSON.stringify({requirements:[{id,pass:false,reason:'零模型预检不计真实证据',evidence:[{turn:0,quote:'零模型预检记录。'}]}]}));}if(label.endsWith('voice-blind'))throw Error('零模型预检不做真实盲辨');return response(JSON.stringify({scores:{truth:0,agency:0,language:0,continuity:0},findings:[]}));}};
 await reviewPlaytest(scoring,result,scenario.rubric,{world});await reviewNpcRequirements(scoring,result,scenario);
 results.push({id:scenario.id,expectedTurns:scenario.turns.length,completedTurns:result.turns.length,executionErrors:result.turns.flatMap(t=>t.errors),minute:result.finalDocument.state.minute,location:result.finalDocument.state.location,ledgerPass:result.ledgerPass,failedAssertions:result.turns.flatMap(t=>t.assertions.filter(a=>!a.pass).map(a=>({turn:t.index,...a}))),planningIds:context.people.map(n=>n.id),planningHash:digest(context)});
}}
finally{await server.close();assert.ok(directory.startsWith(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true});}
pre.runtime=results;pre.blockers=blockers;pre.yupoPublished=yupoPublished;pre.hostSources=hostSources;pre.requestsByRole=Object.fromEntries(['host','consistency','review','planning','tool'].map(role=>[role,requests.filter(r=>r.role===role).length]));pre.preflightReady=!blockers.length&&results.length===10&&results.every(r=>r.completedTurns===r.expectedTurns&&!r.executionErrors.length);pre.paymentReady=false;
const publicRows=publicSettlementEntries(world),gaps=[];
for(const request of requests.filter(r=>r.unapproved.length)){
 const refs=request.references.filter(r=>r.classification==='depthDependency'&&request.unapproved.includes(r.id));
 for(const ref of refs){const npc=world.npcs.find(n=>n.id===ref.id),matches=[];
  function collect(value){if(typeof value==='string'){let parsed;try{parsed=JSON.parse(value);}catch{}if(parsed&&typeof parsed==='object')collect(parsed);else for(const line of value.split('\n'))if(line.includes(ref.token))for(const row of publicRows)if(line.endsWith(row.text.slice(0,260)))matches.push({rowId:row.id,rowHash:digest(row),text:line,source:`world/geo/settlements.json#${row.id}`,status:'正式publicSettlementEntries；旧guard仅登记榆坡problem_yp_1，其余行投影尚未绑定'});}else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}
  collect(request.request);
  gaps.push({label:request.label,role:request.role,id:ref.id,token:ref.token,path:ref.path,span:ref.span,npcHash:hashContent(npc),publishedYupo:yupoPublished.profiles.some(p=>p.id===ref.id),publicRows:[...new Map(matches.map(row=>[row.rowId,row])).values()],cause:ref.path.includes('assertions')?'实际断言携带人物ID，按原guard展开人物/事件闭包':matches.length?'正式公开行进入host转换后的user场景；仅旧严格scene模式及已冻结公开行有投影授权':'实际工具/事实正文依赖，须逐出处审核；不按同名地名豁免'});
 }
}
await atomicJSON(path.join(out,'dependency-gaps.json'),{capturedAt:new Date().toISOString(),preflightReady:false,fullWorldRetained:true,yupoPublished,affected:results.filter(r=>r.executionErrors.length).map(r=>({id:r.id,completedTurns:r.completedTurns,expectedTurns:r.expectedTurns})),actualPublicRows:[...new Map(gaps.flatMap(g=>g.publicRows).map(row=>[row.rowId,row])).values()],gaps,next:'只补这些实际行的源证明与host场景渲染绑定，或逐人接入已发布榆坡30人证明；不要求其余村整批人物闭合。完整重冻并十场通过后才能T17-B；历史费用去重另核。'});
await fs.writeFile(path.join(out,'zero-model-requests.jsonl'),requests.map(r=>JSON.stringify(r)).join('\n')+'\n');await atomicJSON(path.join(out,'preflight.json'),pre);
console.log(JSON.stringify({preflightReady:pre.preflightReady,paymentReady:false,modelCalls:0,runtime:results.map(({id,completedTurns,expectedTurns,executionErrors,minute})=>({id,completedTurns,expectedTurns,executionErrors,minute})),blockedLabels:[...new Set(blockers.map(b=>b.label))],actualPublicRows:[...new Set(gaps.flatMap(g=>g.publicRows.map(r=>r.rowId)))],requestsByRole:pre.requestsByRole}));
if(!pre.preflightReady)process.exitCode=1;
