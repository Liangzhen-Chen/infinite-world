import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {authorDock,approved,integrate,reviewContext,root} from '../world/design/w1-baishi-dock-depth.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {validateNpcDepth,validateNpcProfiles} from '../tools/npc-profile-validation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {npcContext} from '../server-plugin/npc-memory.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

const world=await loadWorld(),bundle=authorDock(world),ids=new Set(bundle.people.map(p=>p.id));
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const before={...world,npcs:world.npcs.filter(p=>!ids.has(p.id)),residents:[...world.residents,...bundle.sources]};

test('本批33个ID正式提升且名册去重，河埠与栈西原登记身份保持',async()=>{
 const approvedBundle=(await approved(world)).bundle;assert.deepEqual(approvedBundle.people,bundle.people);
 assert.equal(ids.size,33);assert.ok(bundle.sources.some(p=>p.home.location==='bld_bs_home_016'));
 for(const source of bundle.sources){
  const rows=world.npcs.filter(p=>p.id===source.id);assert.equal(rows.length,1);assert.equal(rows[0].tier,'full');
  assert.equal(world.residents.some(p=>p.id===source.id),false);assert.deepEqual(rows[0],bundle.people.find(p=>p.id===source.id));
  for(const key of Object.keys(source))if(!['tier','home'].includes(key))assert.deepEqual(rows[0][key],source[key],`${source.id}.${key}`);
  assert.equal(rows[0].home.location,source.home.location);assert.equal(rows[0].home.access,source.home.access);
  const home=world.locations.find(l=>l.id===source.home.location),house=world.households.find(h=>h.id===source.householdId);
  assert.ok(home.access.residents.includes(source.id));assert.ok(house.members.includes(source.id));
 }
 const registered=[...world.npcs,...world.residents].filter(p=>p.settlement==='loc_bs').map(p=>p.id);
 assert.equal(new Set(registered).size,registered.length);assert.deepEqual(new Set(registered),new Set(world.settlementProfiles.find(p=>p.id==='loc_bs').residentIds));
});

test('逐人真实L2证据、串行共享账和L4阅读与最终作者稿相符',async()=>{
 const ledger=JSON.parse(await fs.readFile('world/drafts/w1/budget.json','utf8')),requests=Object.values(ledger.requests).filter(r=>r.card==='T91'&&!['reserved','cancelled-unissued'].includes(r.status));
 assert.ok(requests.length>=ids.size&&requests.length<=120);assert.ok(ledger.cards.T91.spentYuan<=7);assert.ok(ledger.cards.T91.reservedYuan<1e-10);assert.ok(requests.every(r=>r.status==='settled'));
 for(const entry of bundle.entries){
  const record=JSON.parse(await fs.readFile(`${root}/${entry.id}.json`,'utf8'));assert.equal(record.status,'passed');assert.equal(record.draftResponse,undefined);
  assert.equal(record.fingerprint,hashContent({entry,context:reviewContext(entry,bundle,world),revision:'t91-dock-1'}));
  assert.ok(record.responseEvidence.every(e=>e.phase==='review'));assert.ok(record.review.contradictions.every(r=>r.severity!=='hard'));
  const last=record.responseEvidence.at(-1),evidence=JSON.parse(await fs.readFile(`world/drafts/w1/${last.file}`,'utf8'));
  assert.equal(evidence.response.model.startsWith('deepseek'),true);assert.ok(evidence.usage.prompt_tokens>0);assert.equal(evidence.responseHash,last.responseHash);
  assert.deepEqual(JSON.parse(evidence.request.messages[1].content).draft,entry.draft);
 }
 const batch=JSON.parse(await fs.readFile(`${root}/batch-0.json`,'utf8'));assert.equal(batch.l4.approved,true);
 for(const id of new Set([...batch.sample,...batch.flagged]))assert.ok(batch.l4.notes.some(r=>r.id===id&&r.note));
});

test('11件往事在实际参与者双方闭合，其他人物没有旁听或替人答应船期',()=>{
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
 const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'t91-privacy');
 for(const event of bundle.events)for(const id of event.actors){
  const person=world.npcs.find(p=>p.id===id),context=npcContext(engine,doc,id,event.title),text=JSON.stringify(context);
  assert.ok(context.seeds.includes(person.memorySeeds[0].event));assert.deepEqual(context.unknown,person.knowledge.unknown);
  for(const otherId of event.actors.filter(x=>x!==id)){const other=world.npcs.find(p=>p.id===otherId);assert.ok(!text.includes(other.secrets[0].content));assert.ok(!context.known.includes(other.memorySeeds[1].event));}
  assert.deepEqual(person.secrets[0].knownBy,[id]);
 }
 const familyNotes=bundle.people.map(p=>p.relationships.at(-1).note.split('。').filter(Boolean).at(-1));assert.equal(new Set(familyNotes).size,ids.size);
});

test('玩家沿既有路线找到前厅居民，以真实私人库存成交并保持钱物守恒',async()=>{
 const engine=new WorldEngine(world),person=bundle.people[0],item=Object.keys(person.inventory)[0];let doc=engine.createCharacter(legacy,{},'t91-trade');
 doc.state.minute=510;doc.state.location='loc_bs';doc.state.player.coins=200;
 const run=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
 await run('world_move',{destination:person.workplace.location},'t91-walk');assert.equal(doc.state.npcs[person.id].location,person.workplace.location);
 const source=structuredClone(doc),money=doc.state.player.coins+doc.state.npcs[person.id].coins,stock=(doc.state.inventory[item]?.quantity??0)+doc.state.npcs[person.id].inventory[item];
 const bought=await run('world_trade',{seller:person.id,item,quantity:1},'t91-buy');assert.ok(bought.cost>0);
 assert.equal(doc.state.player.coins+doc.state.npcs[person.id].coins,money);assert.equal((doc.state.inventory[item]?.quantity??0)+(doc.state.npcs[person.id].inventory[item]??0),stock);
 assert.equal(doc.state.npcs[person.id].inventory[item]??0,0);assert.ok(doc.state.npcs[person.id].memoryStream.some(m=>m.sourceEvent==='t91-buy'));
 const replay=await engine.reduce(source,{tool:'world_trade',args:{seller:person.id,item,quantity:1},eventId:'t91-buy'});assert.deepEqual(applyPatches(source,replay.patches),doc);
 const prior=structuredClone(doc);await assert.rejects(run('world_trade',{seller:person.id,item,quantity:1},'t91-empty'),/库存不足/);assert.deepEqual(doc,prior);
 await assert.rejects(run('world_trade',{seller:person.id,service:'雇船'},'t91-unsupported'),/未登记/);assert.deepEqual(doc,prior);
});

test('休息日没有库存接洽，未获许可的住宅入口保留原拒绝',async()=>{
 const engine=new WorldEngine(world),person=bundle.people[0],doc=engine.createCharacter(legacy,{},'t91-home');doc.state.minute=540;doc.state.location='loc_bs';
 const original=structuredClone(doc);await assert.rejects(engine.reduce(doc,{tool:'world_move',args:{destination:person.home.location},eventId:'t91-private-home'}),/成年住户/);assert.deepEqual(doc,original);
 doc.state.minute=9*1440+540;doc.state.location=person.home.location;doc.state.npcs[person.id].location=person.home.location;doc.state.npcs[person.id].activity='家务';
 await assert.rejects(engine.reduce(doc,{tool:'world_trade',args:{seller:person.id,item:Object.keys(person.inventory)[0],quantity:1},eventId:'t91-rest'}),/服务|时段|作息|休息/);
});

test('提升升级不覆盖旧档状态，重放不补充已用完的私人库存',()=>{
 const {world:next}=compatibleWorld(before,world);assert.ok([...ids].every(id=>!next.residents.some(p=>p.id===id)));
 const engine=new WorldEngine(before),doc=engine.createCharacter(legacy,{},'t91-upgrade'),oldId='npc_hw_yanzhe';
 Object.assign(doc.state.npcs[oldId],{coins:73,trust:27,affection:4,inventory:{item_wood:2},location:'loc_hw'});doc.state.npcs[oldId].memoryStream=[{id:'t91-keep',content:'已经发生的私人往来'}];
 const saved=structuredClone(doc.state.npcs[oldId]),update=planWorldUpgrade(doc,before,next,{worldHash:'t91-promoted',eventId:'t91-up'}),after=applyPatches(doc,update.patches);
 assert.deepEqual(after.state.npcs[oldId],saved);for(const person of bundle.people){assert.equal(after.state.npcs[person.id].coins,person.coins);assert.deepEqual(after.state.npcs[person.id].inventory,person.inventory);}
 const id=bundle.people[0].id;Object.assign(after.state.npcs[id],{coins:1,trust:19,inventory:{},memoryStream:[{id:'t91-after',content:'买卖后形成的记忆'}]});
 const replay=planWorldUpgrade(after,next,next,{worldHash:'t91-promoted',eventId:'t91-replay'});assert.deepEqual(applyPatches(after,replay.patches).state.npcs,after.state.npcs);
 assert.deepEqual(integrate(integrate(before,bundle),bundle),integrate(before,bundle));for(const person of before.npcs)assert.deepEqual(next.npcs.find(p=>p.id===person.id),person);
});
