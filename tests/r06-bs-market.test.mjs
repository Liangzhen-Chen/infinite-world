import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {authorMarket,approved,integrate,reviewContext,root,responsibilities} from '../world/design/w1-baishi-market-depth.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {validateNpcDepth,validateNpcProfiles} from '../tools/npc-profile-validation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {npcContext} from '../server-plugin/npc-memory.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {baishiSkeleton} from '../world/design/w1-baishi-skeleton.mjs';
import * as G from '../world/design/a3-world-governance.mjs';
import {readFiles,contentEntries,previewWorld,contextFor,draftFor} from '../world/design/a3-world-approval.mjs';
import {readApprovedContent} from '../tools/content-pipeline.mjs';

const world=await loadWorld(),bundle=authorMarket(world),ids=new Set(bundle.people.map(p=>p.id));
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const before={...world,npcs:world.npcs.filter(p=>!ids.has(p.id)),residents:[...world.residents,...bundle.sources]};

test('本批33个ID正式提升且名册去重，官前与南市原登记身份保持',async()=>{
 const approvedBundle=(await approved(world)).bundle;assert.deepEqual(approvedBundle.people,bundle.people);
 assert.equal(ids.size,33);assert.ok(bundle.sources.some(p=>p.home.location==='bld_bs_home_046'));
 for(const source of bundle.sources){
  const rows=world.npcs.filter(p=>p.id===source.id);assert.equal(rows.length,1);assert.equal(rows[0].tier,'full');
  assert.equal(world.residents.some(p=>p.id===source.id),false);
  // A3 separately approved the faction field of this existing T92 person.
  // Keep the entire prior profile exact; incremental receipts are checked below.
  const expected=structuredClone(bundle.people.find(p=>p.id===source.id));
  for(const patch of G.personFields.filter(p=>p.subject===source.id))expected[patch.field]=patch.value;
  assert.deepEqual(rows[0],expected);
  for(const key of Object.keys(source))if(!['tier','home'].includes(key))assert.deepEqual(rows[0][key],source[key],`${source.id}.${key}`);
  assert.equal(rows[0].home.location,source.home.location);assert.equal(rows[0].home.access,source.home.access);
  const home=world.locations.find(l=>l.id===source.home.location),house=world.households.find(h=>h.id===source.householdId);
  assert.ok(home.access.residents.includes(source.id));assert.ok(house.members.includes(source.id));
 }
 const registered=[...world.npcs,...world.residents].filter(p=>p.settlement==='loc_bs').map(p=>p.id);
 assert.equal(new Set(registered).size,registered.length);assert.deepEqual(new Set(registered),new Set(world.settlementProfiles.find(p=>p.id==='loc_bs').residentIds));
});

test('逐人真实L2证据、串行共享账和L4阅读与最终作者稿相符',async()=>{
 const ledger=JSON.parse(await fs.readFile('world/drafts/w1/budget.json','utf8')),requests=Object.values(ledger.requests).filter(r=>r.card==='T92'&&!['reserved','cancelled-unissued'].includes(r.status));
 assert.ok(requests.length>=ids.size&&requests.length<=120);assert.ok(ledger.cards.T92.spentYuan<=7);assert.ok(ledger.cards.T92.reservedYuan<1e-10);assert.ok(requests.every(r=>r.status==='settled'));
 for(const entry of bundle.entries){
  const record=JSON.parse(await fs.readFile(`${root}/${entry.id}.json`,'utf8'));assert.equal(record.status,'passed');assert.equal(record.draftResponse,undefined);
  assert.equal(record.fingerprint,hashContent({entry:{...entry,draft:record.draft},context:reviewContext({...entry,draft:record.draft},bundle,world),revision:'t92-market-1'}));
  assert.ok(record.responseEvidence.every(e=>e.phase==='review'));assert.ok(record.review.contradictions.every(r=>r.severity!=='hard'));
  const last=record.responseEvidence.at(-1),evidence=JSON.parse(await fs.readFile(`world/drafts/w1/${last.file}`,'utf8'));
  assert.equal(evidence.response.model.startsWith('deepseek'),true);assert.ok(evidence.usage.prompt_tokens>0);assert.equal(evidence.responseHash,last.responseHash);
  assert.deepEqual(JSON.parse(evidence.request.messages[1].content).draft,record.draft);
  assert.deepEqual({...record.draft,services:[]},entry.draft,'引用修正不改变已审核的人物事实');
 }
 const batch=JSON.parse(await fs.readFile(`${root}/batch-0.json`,'utf8'));assert.equal(batch.l4.approved,true);
 for(const id of new Set([...batch.sample,...batch.flagged]))assert.ok(batch.l4.notes.some(r=>r.id===id&&r.note));
});

test('11件往事在实际参与者双方闭合，其他人物没有旁听或替人批准工日或税务',()=>{
 for(const event of bundle.events){
  assert.equal(event.actors.length,3);const memories=event.actors.map(id=>world.npcs.find(p=>p.id===id).memorySeeds.find(m=>m.id===event.id));
  assert.ok(memories.every(Boolean));for(const memory of memories){assert.deepEqual(memory.knownBy,event.actors);assert.equal(memory.location,event.location);assert.equal(memory.event,memories[0].event);}
  assert.deepEqual(world.npcs.filter(p=>p.memorySeeds?.some(m=>m.id===event.id)).map(p=>p.id).sort(),[...event.actors].sort());
  const positions=event.actors.map(id=>world.npcs.find(p=>p.id===id).hooks[1]);assert.equal(new Set(positions).size,event.actors.length);
 }
 assert.deepEqual(validateNpcDepth(world).issues,[]);assert.deepEqual(validateNpcProfiles(world),[]);
 const broken=structuredClone(world),event=bundle.events[0];broken.npcs.find(p=>p.id===event.actors[1]).memorySeeds=broken.npcs.find(p=>p.id===event.actors[1]).memorySeeds.filter(m=>m.id!==event.id);
 assert.ok(validateNpcDepth(broken).issues.some(i=>i.code==='memory-shared'&&event.actors.includes(i.id)));
});

test('提示认知包含本人的共同往事和具体未知，不含同伴的私下想法',()=>{
 const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'t92-privacy');
 for(const event of bundle.events)for(const id of event.actors){
  const person=world.npcs.find(p=>p.id===id),context=npcContext(engine,doc,id,event.title),text=JSON.stringify(context);
  assert.ok(context.seeds.includes(person.memorySeeds[0].event));assert.deepEqual(context.unknown,person.knowledge.unknown);
  for(const otherId of event.actors.filter(x=>x!==id)){const other=world.npcs.find(p=>p.id===otherId);assert.ok(!text.includes(other.secrets[0].content));assert.ok(!context.known.includes(other.memorySeeds[1].event));}
  assert.deepEqual(person.secrets[0].knownBy,[id]);
 }
 const familyNotes=bundle.people.map(p=>p.relationships.at(-1).note.split('。').filter(Boolean).at(-1));assert.equal(new Set(familyNotes).size,ids.size);
});

test('玩家沿既有路线找到前厅居民，以真实私人库存成交并保持钱物守恒',async()=>{
 const engine=new WorldEngine(world),person=bundle.people[0],item=Object.keys(person.inventory)[0];let doc=engine.createCharacter(legacy,{},'t92-trade');
 doc.state.minute=510;doc.state.location='loc_bs';doc.state.player.coins=200;
 const run=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
 await run('world_move',{destination:person.workplace.location},'t92-walk');assert.equal(doc.state.npcs[person.id].location,person.workplace.location);
 const source=structuredClone(doc),money=doc.state.player.coins+doc.state.npcs[person.id].coins,stock=(doc.state.inventory[item]?.quantity??0)+doc.state.npcs[person.id].inventory[item];
 const bought=await run('world_trade',{seller:person.id,item,quantity:1},'t92-buy');assert.ok(bought.cost>0);
 assert.equal(doc.state.player.coins+doc.state.npcs[person.id].coins,money);assert.equal((doc.state.inventory[item]?.quantity??0)+(doc.state.npcs[person.id].inventory[item]??0),stock);
 assert.equal(doc.state.npcs[person.id].inventory[item]??0,0);assert.ok(doc.state.npcs[person.id].memoryStream.some(m=>m.sourceEvent==='t92-buy'));
 const replay=await engine.reduce(source,{tool:'world_trade',args:{seller:person.id,item,quantity:1},eventId:'t92-buy'});assert.deepEqual(applyPatches(source,replay.patches),doc);
 const prior=structuredClone(doc);await assert.rejects(run('world_trade',{seller:person.id,item,quantity:1},'t92-empty'),/库存不足/);assert.deepEqual(doc,prior);
 await assert.rejects(run('world_trade',{seller:person.id,service:'征税'},'t92-unsupported'),/未登记/);assert.deepEqual(doc,prior);
});

test('休息日没有库存接洽，未获许可的住宅入口保留原拒绝',async()=>{
 const engine=new WorldEngine(world),person=bundle.people[0],doc=engine.createCharacter(legacy,{},'t92-home');doc.state.minute=540;doc.state.location='loc_bs';
 const original=structuredClone(doc);await assert.rejects(engine.reduce(doc,{tool:'world_move',args:{destination:person.home.location},eventId:'t92-private-home'}),/成年住户/);assert.deepEqual(doc,original);
 doc.state.minute=9*1440+540;doc.state.location=person.home.location;doc.state.npcs[person.id].location=person.home.location;doc.state.npcs[person.id].activity='家务';
 await assert.rejects(engine.reduce(doc,{tool:'world_trade',args:{seller:person.id,item:Object.keys(person.inventory)[0],quantity:1},eventId:'t92-rest'}),/服务|时段|作息|休息/);
});

test('提升升级不覆盖旧档状态，重放不补充已用完的私人库存',()=>{
 const {world:next}=compatibleWorld(before,world);assert.ok([...ids].every(id=>!next.residents.some(p=>p.id===id)));
 const engine=new WorldEngine(before),doc=engine.createCharacter(legacy,{},'t92-upgrade'),oldId='npc_hw_yanzhe';
 Object.assign(doc.state.npcs[oldId],{coins:73,trust:27,affection:4,inventory:{item_wood:2},location:'loc_hw'});doc.state.npcs[oldId].memoryStream=[{id:'t92-keep',content:'已经发生的私人往来'}];
 const saved=structuredClone(doc.state.npcs[oldId]),update=planWorldUpgrade(doc,before,next,{worldHash:'t92-promoted',eventId:'t92-up'}),after=applyPatches(doc,update.patches);
 assert.deepEqual(after.state.npcs[oldId],saved);for(const person of bundle.people){assert.equal(after.state.npcs[person.id].coins,person.coins);assert.deepEqual(after.state.npcs[person.id].inventory,person.inventory);}
 const id=bundle.people[0].id;Object.assign(after.state.npcs[id],{coins:1,trust:19,inventory:{},memoryStream:[{id:'t92-after',content:'买卖后形成的记忆'}]});
 const replay=planWorldUpgrade(after,next,next,{worldHash:'t92-promoted',eventId:'t92-replay'});assert.deepEqual(applyPatches(after,replay.patches).state.npcs,after.state.npcs);
 assert.deepEqual(integrate(integrate(before,bundle),bundle),integrate(before,bundle));for(const person of before.npcs)assert.deepEqual(next.npcs.find(p=>p.id===person.id),person);
});

test('既有协调人升档，官署分工可查且与户籍、治安和公库规则相符',()=>{
 const governance=world.settlementProfiles.find(p=>p.id==='loc_bs').details.governance;
 assert.ok(governance.coordinators.every(id=>ids.has(id)));
 // T92 coordinators remain non-executive; A3 head/enforcer rights have separate receipts.
 const frozenGovernance=baishiSkeleton(world).profile.details.governance;
 assert.equal(frozenGovernance.head,null);assert.deepEqual(frozenGovernance.enforcers,[]);
 assert.deepEqual(governance,{...frozenGovernance,head:G.settlementHead.head,enforcers:G.settlementHead.enforcers,authority:G.settlementHead.authority});
 const dutyIds=new Set(responsibilities.map(r=>r[0]));assert.equal(dutyIds.size,17);
 for(const [id,role,location,duty] of responsibilities){
  const person=world.npcs.find(p=>p.id===id);
  assert.ok(ids.has(id));assert.equal(person.workplace.location,location);
  assert.ok(person.notes.includes(duty));assert.ok(person.description.includes(duty));
  const context=reviewContext(bundle.entries.find(e=>e.id===id),bundle,world);
  assert.equal(context.authoredResponsibility.role,role);
  assert.equal(context.authoredResponsibility.duty,duty);
  assert.deepEqual(context.governance,frozenGovernance);
  assert.deepEqual(person.services,[]);
  assert.ok(person.serviceCatalog.every(s=>s.kind==='trade'));
  assert.deepEqual(person.wealth.debts,[]);assert.deepEqual(person.wealth.property,[]);
  const place=world.locations.find(l=>l.id===location);
  for(const day of ['default','market'])for(const slot of person.schedule[day].filter(s=>s.location===location)){
   assert.ok(slot.start>=place.openHours[0]&&slot.end<=place.openHours[1]);
  }
 }
 const text=responsibilities.map(r=>r[1]+r[3]).join('');
 for(const phrase of ['任职','税务','户籍','工程','摊位','照护','既有司法流程'])assert.ok(text.includes(phrase),phrase);
 assert.ok(responsibilities.find(r=>r[1]==='税务咨询递件')[3].includes('不收税'));
 assert.ok(responsibilities.find(r=>r[1]==='工程申请递件')[3].includes('不批准施工'));
 for(const event of bundle.events){
  const participantNames=event.actors.map(id=>world.npcs.find(p=>p.id===id).name);
  for(const person of bundle.people)if(event.event.includes(person.name))assert.ok(participantNames.includes(person.name),event.title+':'+person.name);
 }
 const ends=bundle.people.map(p=>p.relationships[0].note.split('。').at(-2));
 assert.equal(new Set(ends).size,ids.size,'关系备注各自记录不同立场');
});

test('正式世界发布校验没有涉及本批人物ID的错误',()=>{
 const result=validateWorld(world,{stage:'release'});
 assert.deepEqual(result.errors.filter(error=>[...ids].some(id=>error.includes(id))),[]);
});

// 13ac0697: verify the incremental approval in addition to the unchanged T92 gate.
test('A3 head, incumbents and authority retain independent L1/L2/L4 receipts',async()=>{
 const files=await readFiles(),candidate=previewWorld(world);
 const entries=contentEntries(files).filter(e=>['person','person-field','faction','office','head-patch','room-patch'].includes(e.kind));
 const rows=await readApprovedContent(G.draftRoot,entries,{revision:G.revision,contextFor:e=>contextFor(candidate,e)});
 assert.deepEqual(rows,entries.map(draftFor));
 for(const e of entries){
  const current=e.kind==='person'?files.baseline.find(p=>p.id===e.id):
   e.kind==='person-field'?{[e.field]:files.baseline.find(p=>p.id===e.subject)[e.field]}:
   e.kind==='faction'?(({offices,...row})=>row)(files.factions.find(f=>f.id===e.id)):
   e.kind==='office'?files.factions.find(f=>f.id===e.faction).offices.find(o=>o.id===e.id):
   e.kind==='room-patch'?{rooms:files.locations.find(l=>l.id===e.subject).rooms}:
   (({head,enforcers,authority})=>({head,enforcers,authority}))(world.settlementProfiles.find(p=>p.id===e.subject).details.governance);
  assert.deepEqual(current,e.row,e.id);
 }
 assert.deepEqual(world.npcs.filter(p=>p.id==='npc_bs_townhead').map(p=>p.id),['npc_bs_townhead']);
});
