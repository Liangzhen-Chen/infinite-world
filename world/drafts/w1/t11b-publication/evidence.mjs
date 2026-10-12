import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadWorld} from '../../../../tools/load-world.mjs';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
import {publishNpcDepth} from '../../../../tools/publish-npc-depth.mjs';
import {auditNpcDepth} from '../../../../tools/audit-npc-depth.mjs';
import {WorldEngine} from '../../../../server-plugin/engine.mjs';
import {npcPlanningContext} from '../../../../server-plugin/npc-autonomy.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../..'),repo=path.dirname(root);
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const manifest=path.join(root,'drafts/w1/depth-publication.json'),world=await loadWorld(root),repeat=await publishNpcDepth({batchManifest:manifest});
assert.deepEqual(repeat.changed,[]);assert.deepEqual(repeat.selectedQuality.issues,[]);
const selected=new Set(repeat.amendedNpcIds),report=auditNpcDepth(world),m2=await read(path.join(root,'drafts/m2-people/baseline.json'));
const reviewDiff=execFileSync('git',['diff','--name-only','3fcdc1a','--','world/drafts/w1/existing-depth','world/design/w1-existing-depth.mjs','world/design/w1-existing-depth-first-review.mjs'],{cwd:repo,encoding:'utf8'}).trim();assert.equal(reviewDiff,'','原审核来源与批准提交不同');
assert.equal(selected.size,32);assert.equal(world.npcs.length,152);assert.equal(world.residents.length,294);
assert.ok(m2.every(n=>selected.has(n.id)));assert.equal(m2.length,18);assert.equal(report.legacyTraits.ok,true);
const selectedPeople=world.npcs.filter(n=>selected.has(n.id)),sharedEvents=[];
for(const person of selectedPeople)for(const [index,memory]of person.memorySeeds.entries())if(memory.knownBy.length>1){
 assert.ok(memory.id&&memory.knownBy.includes(person.id));
 for(const id of memory.knownBy){
  assert.ok(selected.has(id),`未批准参与者 ${memory.id}/${id}`);
  const counterpart=world.npcs.find(n=>n.id===id).memorySeeds.find(m=>m.id===memory.id);assert.ok(counterpart);
  assert.equal(counterpart.location,memory.location);assert.equal(counterpart.minute,memory.minute);
  assert.deepEqual([...counterpart.knownBy].sort(),[...memory.knownBy].sort());
 }
 assert.ok(!report.issues.some(i=>i.id===person.id&&i.field===`memorySeeds[${index}]`&&i.code==='memory-shared'));
 sharedEvents.push({id:person.id,eventId:memory.id,eventHash:hashContent(memory),participants:memory.knownBy,closed:true});
}
const scenarios=[];
for(const name of ['npc_social','npc_private','npc_shove','guide','npc_delivery','npc_quest_social','npc_home_visit','npc_offscreen','npc_voices','npc_courier']){
 const file=`tests/playtests/${name}.json`,scenario=await read(path.join(repo,file)),text=JSON.stringify(scenario);
 const explicit=[...new Set(text.match(/npc_(?:hw|yp|wt|lq|sb)_[a-z0-9_]+/g)??[])].filter(id=>world.npcs.some(n=>n.id===id));
 const named=world.npcs.flatMap(n=>[n.name,...n.aliases??[]].filter(token=>token&&text.includes(token)).map(token=>({id:n.id,token})));
 const ids=[...new Set([...explicit,...named.map(n=>n.id)])].sort();
 const dependencies=new Set(ids);
 for(const id of dependencies){const person=world.npcs.find(n=>n.id===id);for(const ref of JSON.stringify(person).match(/npc_(?:hw|yp|wt|lq|sb)_[a-z0-9_]+/g)??[])if(world.npcs.some(n=>n.id===ref))dependencies.add(ref);}
 const dependencyIds=[...dependencies].sort(),eventDependencies=sharedEvents.filter(e=>dependencies.has(e.id)),eventParticipants=[...new Set(eventDependencies.flatMap(e=>e.participants))].sort();
 const unapproved=[...new Set([...dependencyIds,...eventParticipants])].filter(id=>!selected.has(id));assert.deepEqual(unapproved,[]);
 scenarios.push({file,hash:hashContent(scenario),explicitIds:explicit,namedReferences:named,npcIds:ids,profileReferenceClosure:dependencyIds,eventIds:[...new Set(eventDependencies.map(e=>e.eventId))],eventParticipants,unapproved});
}
const engine=new WorldEngine(world),seed=await read(path.join(repo,'tests/fixtures/legacy/seed.json')),document=engine.createCharacter(seed,{},'t11b-dependency-snapshot');
const ruleRecipes=world.recipes.filter(r=>r.minutes<=30),ruleTeachers=[...new Set(ruleRecipes.flatMap(r=>r.teachers??[]))].filter(id=>world.npcs.some(n=>n.id===id)).sort();
const auditInventory=world.npcs.filter(n=>Object.values(n.goals??{}).flat().some(g=>/核清现有(?:铁料|线料)/.test(g.content)&&g.progress<100)).map(n=>n.id).sort();
const eligible=[...new Set([...ruleTeachers,...auditInventory])].sort(),planning=npcPlanningContext(engine,document).people.map(n=>n.id);
assert.ok([...eligible,...planning].every(id=>selected.has(id)));
const sourceFiles=['meta/rules.json','people/baseline.json','geo/locations.json','geo/routes.json',...['items','professions','skills','spells','recipes','monsters','bosses'].map(n=>`meta/${n}.json`),...['cultures','deities','factions','history','factionPeople','eras'].map(n=>`lore/${n}.json`),'people/residents.json','people/households.json','geo/settlements.json'];
const sources=await Promise.all(sourceFiles.map(async file=>{const raw=await fs.readFile(path.join(root,file));return {file,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),contentHash:hashContent(JSON.parse(raw))};}));
const evidence={card:'T11-B',capturedAt:new Date().toISOString(),sourceParent:'3865d66',approvedT10Commit:'3fcdc1a',modelCalls:0,originalReviewFilesUnchanged:true,worldHash:hashContent(world),baselineHash:hashContent(world.npcs),manifests:repeat.manifests,sources,counts:{full:152,roster:294},selectedQuality:selectedPeople.map(n=>({id:n.id,hash:hashContent(n),issues:report.issues.filter(i=>i.id===n.id)})),globalQuality:{checked:report.checked,issues:report.issues},legacyTraits:report.legacyTraits,sharedEvents,m2:{originalIds:m2.map(n=>n.id),originalIdsIncluded:true,scenarios,autonomy:{consideredIds:world.npcs.filter(n=>n.tier==='full').map(n=>n.id),eligibleRuleActors:eligible,inventoryGoalActors:auditInventory,recipeTeacherActors:ruleTeachers,recipeIds:ruleRecipes.filter(r=>r.teachers?.some(id=>ruleTeachers.includes(id))).map(r=>r.id),initialPlanningIds:planning,unapprovedEligible:[],scope:'Static source dependency check and isolated initial planning context. Actual model/tool playtests were not run; T17 must recheck runtime actors.'}},repeat:{changed:repeat.changed,sourceHash:repeat.sourceHash,resultHash:repeat.resultHash}};
await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({selected:32,selectedIssues:0,globalIssues:report.issues.length,sharedMemories:sharedEvents.length,distinctEvents:new Set(sharedEvents.map(e=>e.eventId)).size,m2:18,scenarios:scenarios.length,autonomyEligible:eligible,planning,changed:repeat.changed,worldHash:evidence.worldHash}));
