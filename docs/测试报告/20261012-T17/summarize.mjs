import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {loadWorld} from '../../../tools/load-world.mjs';
import {digest,atomicJSON} from '../../../server-plugin/storage.mjs';
const out=import.meta.dirname,root=path.resolve(out,'../../..'),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const report=await read(path.join(out,'真实试玩.json')),preflight=await read(path.join(out,'preflight.json')),world=await loadWorld();
assert.equal(digest(world),preflight.worldHash);assert.equal(report.promptHash,preflight.promptHash);assert.equal(report.scenariosHash,preflight.scenariosHash);
const approved=new Set(preflight.approvedIds),known=new Set(world.npcs.map(n=>n.id));
const refs=text=>[...new Set(text.match(/npc_(?:hw|yp|wt|lq|sb)_[a-z0-9_]+/g)??[])].filter(id=>known.has(id));
const contexts=(await fs.readFile(path.join(out,'runtime-contexts.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
const observed=report.results.map(result=>{
 const scenes=result.turns.map(turn=>({index:turn.index,ids:refs(JSON.stringify([turn.sceneBefore,turn.sceneBeforeReply,turn.calls,turn.turnResult]))}));
 const daily=result.turns.flatMap(turn=>turn.assertions.filter(a=>a.kind==='newRecordsDuringTurn'&&a.path==='state.npcAutonomy.actions').flatMap(a=>a.actual?.records??[]));
 const actors=[...new Set(daily.map(n=>n.npc))];
 return {id:result.id,actualTurns:result.turns.length,sceneDependencies:scenes,offscreenActors:actors,offscreenRecords:daily,unapproved:[...new Set([...scenes.flatMap(s=>s.ids),...actors])].filter(id=>!approved.has(id))};
});
const sourceFiles=[...preflight.sources.map(s=>'world/'+s.file),'prompt/constitution.md','prompt/world-primer.md','prompt/style.md','prompt/examples.md','prompt/first-message.md','prompt/cliches.json','tools/playtests.mjs','tools/playtest-runner.mjs','tools/playtest-budget.mjs','tools/host-prompt.mjs','tools/build-card.mjs','tools/load-world.mjs','tools/npc-autonomy-planner.mjs','tools/npc-acceptance.mjs','tools/playtest-review.mjs','server-plugin/index.mjs','server-plugin/npc-autonomy.mjs','server-plugin/engine.mjs','server-plugin/storage.mjs','server-plugin/retrieval.mjs',...preflight.dependencies.map(s=>s.file)];
const sources=await Promise.all(sourceFiles.map(async file=>{const raw=await fs.readFile(path.join(root,file));return{file,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};}));
const common=execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim(),registry=path.join(path.resolve(root,common),'playtest-runs',report.runId);
for(const name of ['budget.json','usage.jsonl'])await fs.copyFile(path.join(registry,name),path.join(out,'persistent-'+name));
const tasks=await fs.readdir(path.join(registry,'tasks'));const taskEvidence=[];
for(const name of tasks){const file=path.join(registry,'tasks',name),raw=await fs.readFile(file);taskEvidence.push({file:name,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')});}
const summary={card:'T17',runId:report.runId,capturedAt:new Date().toISOString(),finished:report.complete,acceptancePass:report.acceptancePass,ledger:{passed:report.passed,assertions:report.assertions,ratio:report.ledgerRatio},m2:report.m2,toolSelection:report.toolSelection,requests:report.requests,modelRoles:report.modelRoles,spentYuan:report.spentYuan,reservedYuan:report.reservedYuan,costUpperYuan:report.costUpperYuan,limitYuan:30,paidReassessmentYuan:0,sourceHash:preflight.worldHash,promptHash:report.promptHash,scenariosHash:report.scenariosHash,sources,contextRequests:contexts.filter(c=>c.request).length,planningRequests:contexts.filter(c=>c.request&&c.role==='planning').map(c=>({label:c.label,requestHash:c.requestHash,ids:c.referencedIds,closure:c.profileAndEventClosure,unapproved:c.unapproved})),unapprovedContexts:contexts.filter(c=>c.unapproved?.length).map(({request,...c})=>c),observed,taskEvidence,registry,sessionFailures:report.results.map(r=>({id:r.id,error:r.error,ledger:r.ledgerPass,consistency:r.consistencyPass,reviewComplete:r.review?.complete,npcComplete:r.npcAcceptance?.complete,reviewError:r.review?.error,npcError:r.npcAcceptance?.error,failedAssertions:r.turns.flatMap(t=>t.assertions.filter(a=>!a.pass).map(a=>({turn:t.index,...a}))),turnErrors:r.turns.filter(t=>t.errors.length).map(t=>({turn:t.index,errors:t.errors}))})),scope:'真实M2专项证据。未全量测试/构建/部署；全体full仍1517缺口，完整M2与发布门槛不关闭。没有人工状态续场、没有自动整批重跑、旧费用不并入此波次。'};
await atomicJSON(path.join(out,'acceptance-evidence.json'),summary);
console.log(JSON.stringify({finished:summary.finished,pass:summary.acceptancePass,ledger:summary.ledger,m2:{measured:report.m2.measured,passed:report.m2.passed,declared:report.m2.declared,privacy:report.m2.privacyPass,offscreen:report.m2.offscreenPass},cost:summary.costUpperYuan,contexts:summary.contextRequests,unapproved:summary.unapprovedContexts.length,failures:summary.sessionFailures.map(f=>({id:f.id,error:f.error,assertions:f.failedAssertions.length,turnErrors:f.turnErrors}))}));
