import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {baishiSkeleton,revision} from '../world/design/w1-baishi-skeleton.mjs';

export const root=path.resolve('world/drafts/w1/baishi-skeleton');
export const budgetRoot=path.resolve('world/drafts/w1');
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
async function write(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n');await fs.rename(temp,file);}
const merge=(old,rows)=>{const incoming=new Map(rows.map(r=>[r.id,r])),existing=new Set(old.map(r=>r.id));return[...old.map(r=>incoming.has(r.id)?structuredClone(incoming.get(r.id)):r),...structuredClone(rows.filter(r=>!existing.has(r.id)))];};

export function reviewContext(e,world){
 const b=baishiSkeleton(world);
 if(e.kind==='resident')return{household:b.households.find(h=>h.id===e.draft.householdId),cohabitants:[...b.residents,b.yan].filter(p=>e.draft.household.includes(p.id)).map(p=>({id:p.id,name:p.name,age:p.age})),kinship:b.profile.kinship.filter(k=>k.child===e.id||k.parent===e.id),limits:'名册不发放钱物、官职和服务。未成年只安排日常生活。'};
 // Freeze original contacts in prepare; publication must not become its own evidence.
 const y=world.npcs.find(p=>p.id==='npc_hw_yanzhe');
 return{town:world.locations.find(l=>l.id==='loc_bs'),shrine:world.locations.find(l=>l.id==='bld_bs_shrine'),yan:e.kind==='contact'?y:{id:y.id,name:y.name,age:y.age,occupation:y.occupation,notes:y.notes,coins:y.coins,inventory:y.inventory},calendar:world.rules.calendar,limits:'本卡作者创作新住户、街区、建筑和待协商问题。新短名册及建筑不产生现金、商品、工作站或官职。经济数字只引用既有严辙和小窑，不推断镇生产公库税章。职责登记不等于可执行任命。传闻是未传播种子，false与partial的claim允许不实，fact须正确；提议不算已发生事件。'};
}

export async function prepare(world){
 world??=await loadWorld();
 const originalFile=path.join(root,'original-contacts.json');
 const prior=await read(originalFile).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(prior)world=restoreContacts(world,prior);
 else await write(originalFile,{town:world.locations.find(l=>l.id==='loc_bs'),yan:world.npcs.find(p=>p.id==='npc_hw_yanzhe'),shrine:world.locations.find(l=>l.id==='bld_bs_shrine')});
 const bones=baishiSkeleton(world),schema=await read('schemas/world.schema.json'),ajv=new Ajv({strict:true,allowUnionTypes:true,allErrors:true});
 const validators=Object.fromEntries(['resident','household','settlementProfile','location','npc'].map(k=>[k,ajv.compile({$ref:`#/$defs/${k}`,$defs:schema.$defs})]));
 for(const [kind,rows] of [['resident',bones.residents],['household',bones.households],['settlementProfile',[bones.profile]],['location',bones.locations],['npc',[bones.yan]]])for(const row of rows)assert.ok(validators[kind](row),`${row.id}: ${JSON.stringify(validators[kind].errors)}`);
 const blocklist=await read('world/meta/blocklist.json'),blocked=[...blocklist.names,...blocklist.realPeople];
 for(const e of bones.entries){const text=JSON.stringify(e.draft);assert.ok(!text.includes('undefined'));if(e.kind!=='contact')assert.ok(!blocked.some(n=>text.includes(n)),`屏蔽名：${e.id}`);}
 validateSkeleton(bones);
 await write(path.join(root,'candidate.json'),{revision,formalWrite:false,...bones});
 return{world,bones};
}
function restoreContacts(world,original){return{...world,npcs:world.npcs.map(p=>p.id===original.yan.id?original.yan:p),locations:world.locations.map(p=>p.id===original.town.id?original.town:p.id===original.shrine.id?original.shrine:p)};}
export function validateSkeleton(b){
 assert.equal(b.residents.length,305);assert.equal(b.households.length,90);assert.equal(new Set(b.residents.map(p=>p.id)).size,305);assert.equal(new Set(b.residents.map(p=>p.name)).size,305);
 const people=new Map([...b.residents,b.yan].map(p=>[p.id,p])),ids=b.households.flatMap(h=>h.members);
 assert.equal(ids.length,306);assert.equal(new Set(ids).size,306);
 for(const h of b.households)for(const id of h.members){const p=people.get(id);assert.equal(p.householdId,h.id);assert.equal(p.home.location,h.homeLocation);assert.deepEqual(p.household,h.members.filter(x=>x!==id));}
 for(const k of b.profile.kinship)assert.ok(people.get(k.parent).age-people.get(k.child).age>=15,'亲子年龄');
 const p=b.profile;assert.equal(p.population,p.registeredPopulation+p.pendingPopulation);assert.equal(p.householdCount,p.registeredHouseholdCount+p.pendingHouseholdCount);
 assert.equal(Object.values(p.registeredAgeStructure).reduce((a,b)=>a+b,0),306);assert.equal(Object.values(p.pendingAgeStructure).reduce((a,b)=>a+b,0),694);
 assert.ok(b.promotionGroups.every(g=>g.ids.length===33));
 for(const x of b.residents){assert.equal(x.flags.minor,x.age<18);assert.equal(x.flags.romanceable,x.age>=18);assert.equal(x.traits.length,2);assert.ok(x.currentConcern&&x.visibleFeature);if(x.age<18)assert.ok(!/恋爱|调情|亲密|恋人/.test(JSON.stringify(x)));}
 return b;
}

export async function review({client,outputRoot=root,ledgerRoot=budgetRoot}={}){
 const {world,bones}=await prepare();
 client??=new DeepSeekClient({budgetYuan:20,logFile:path.join(outputRoot,'usage.jsonl')});
 const ledger=await read(path.join(ledgerRoot,'budget.json'));
 const allocation={cardId:'T90',waveLimitYuan:20,incrementLimitYuan:8,maxRequests:450,startingSpentYuan:ledger.spentYuan,startingReservedYuan:ledger.reservedYuan??0};
 return runContentPipeline({entries:bones.entries,root:outputRoot,budgetRoot:ledgerRoot,client,cardId:'T90',allocation,revision,concurrency:8,batchSize:40,reuseFrozenDrafts:true,reviewDraftFor:e=>e.draft,buildDraftRequest:()=>{throw Error('T90禁止模型起草');},contextFor:e=>reviewContext(e,world),validateDraft:(d,e)=>({errors:hashContent(d)===hashContent(e.draft)?[]:['固定作者稿不符'],warnings:[]}),buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.max_tokens=e.kind==='profile'?2400:700;r.messages[0].content+=' 新稿为本卡作者设计；不要将可相容的新建筑与居民误报为历史事实冲突。只核对明确矛盾和越权钱物、能力、官职。亲子关系按kinship核对，household只是同户索引，不等同血亲。';return r;}});
}

export async function approved(world,{sourceRoot=root}={}){
 world??=await loadWorld();
 const currentWorld=world;
 const original=await read(path.join(sourceRoot,'original-contacts.json'));world=restoreContacts(world,original);const b=baishiSkeleton(world);
 const rows=await readApprovedContent(sourceRoot,b.entries,{revision,contextFor:e=>reviewContext(e,world)});
 if(rows.length!==b.entries.length)throw Error('仍有未通过条目，完整骨架未发布');
 assert.deepEqual(rows,b.entries.map(e=>e.draft));validateSkeleton(b);
 const l4=await read(path.join(sourceRoot,'l4.json'));
 if(l4.randomTen.length!==10||new Set(l4.randomTen.map(r=>r.id)).size!==10||l4.randomTen.some(r=>!b.entries.some(e=>e.id===r.id)||r.scores.length!==6||r.scores.some(s=>s<3||s>5))||l4.randomTen.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次十抽六项评分未达标');
 return{world:currentWorld,b};
}
export function integrate(world,b){
 // K5: equipment is published by world/drafts/kg/apply.mjs, not by this skeleton; a re-integrated place keeps it.
 const keepFixtures=l=>{const fixtures=world.locations.find(x=>x.id===l.id)?.fixtures;return fixtures?{...l,fixtures:structuredClone(fixtures)}:l;};
 const currentYan=world.npcs.find(p=>p.id===b.yan.id),yan={...currentYan,settlement:b.yan.settlement,householdId:b.yan.householdId,household:b.yan.household,home:{...currentYan.home,location:b.yan.home.location}};
 const currentTown=world.locations.find(l=>l.id==='loc_bs'),town={...currentTown,scope:b.town.scope,description:b.town.description};
 const fullIds=new Set(world.npcs.map(p=>p.id));
 const next={...world,npcs:merge(world.npcs,[yan]),residents:merge(world.residents,b.residents).filter(p=>!fullIds.has(p.id)),households:merge(world.households,b.households),locations:merge(world.locations,[town,...b.locations.map(keepFixtures)]),routes:merge(world.routes,b.routes),settlementProfiles:merge(world.settlementProfiles,[b.profile])};
 for(const n of world.npcs)if(n.id!==b.yan.id)assert.deepEqual(next.npcs.find(p=>p.id===n.id),n,'旧人物锁定');
 assert.deepEqual(next.locations.find(l=>l.id==='bld_bs_shrine'),world.locations.find(l=>l.id==='bld_bs_shrine'));
 // K5: the town's kiln is equipment; its station derives from these fixtures.
 assert.deepEqual(next.locations.find(l=>l.id==='loc_bs').fixtures,world.locations.find(l=>l.id==='loc_bs').fixtures);
 return next;
}
export async function publish({contactRoutineOnly=false,facilitySourceOnly=null}={}){
 const {world,b}=await approved();
 if(contactRoutineOnly&&facilitySourceOnly)throw Error('定向恢复入口不能同时使用');
 // This targeted regeneration still verifies the original L1/L2/L4 approval.
 // New office services belong in the runtime view, not the frozen routine.
 let next=contactRoutineOnly?{...world,npcs:world.npcs.map(p=>p.id===b.yan.id?{...p,schedule:structuredClone(b.yan.schedule)}:p)}:integrate(world,b);
 if(facilitySourceOnly){
  const reviewed=b.locations.find(l=>l.id===facilitySourceOnly);if(!reviewed)throw Error('不在原已审批设施中');
  const source=await read('world/geo/locations.json');
  if(!source.some(l=>l.id===reviewed.id))throw Error('正式设施缺失');
  next={...world,locations:source.map(l=>l.id===reviewed.id?structuredClone(reviewed):l)};
 }
 const files={'people/baseline.json':next.npcs,'people/residents.json':next.residents,'people/households.json':next.households,'geo/locations.json':next.locations,'geo/routes.json':next.routes,'geo/settlements.json':next.settlementProfiles};
 const changed=[];for(const [file,value] of Object.entries(files)){if(contactRoutineOnly&&file!=='people/baseline.json'||facilitySourceOnly&&file!=='geo/locations.json')continue;const target=path.join('world',file);if(hashContent(await read(target))!==hashContent(value)){await write(target,value);changed.push(file);}}
 const ledger=await read(path.join(budgetRoot,'budget.json')),card=ledger.cards.T90;
 const result={changed,registered:306,seed:694,households:90,pendingHouseholds:210,reviewCalls:Object.values(ledger.requests).filter(r=>r.card==='T90'&&!['reserved','cancelled-unissued'].includes(r.status)).length,spentYuan:card.spentYuan,reservedYuan:card.reservedYuan};
 await write(path.join(root,'published.json'),result);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const command=process.argv[2]??'prepare';if(command==='prepare'){const {bones}=await prepare();console.log(JSON.stringify({entries:bones.entries.length,residents:bones.residents.length,households:bones.households.length}));}else if(command==='review'){const r=await review();console.log(JSON.stringify({total:r.summary.total,passed:r.summary.passed,manual:r.summary.manual,pending:r.summary.pending,budget:r.summary.budget.cards.T90}));}else if(command==='publish'){const at=process.argv.indexOf('--facility-source-only');if(at>=0&&(!process.argv[at+1]||process.argv[at+1].startsWith('--')))throw Error('需要原已审批设施ID');console.log(JSON.stringify(await publish({contactRoutineOnly:process.argv.includes('--contact-routine-only'),facilitySourceOnly:at<0?null:process.argv[at+1]})));}else throw Error('命令须为prepare/review/publish');}
