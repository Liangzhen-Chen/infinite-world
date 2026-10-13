import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {authorCraft,approved,integrate,reviewContext,root,responsibilities} from '../world/design/w1-baishi-craft-depth.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {validateNpcDepth,validateNpcProfiles} from '../tools/npc-profile-validation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {npcContext} from '../server-plugin/npc-memory.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {teachingDesign,contentAdditions} from '../world/design/w1-baishi-craft-teaching.mjs';
import {validateWorld} from '../tools/validate-world.mjs';

const world=await loadWorld(),bundle=authorCraft(world),ids=new Set(bundle.people.map(p=>p.id));
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const before={...world,npcs:world.npcs.filter(p=>!ids.has(p.id)),residents:[...world.residents,...bundle.sources]};

test('交易服务是现有操作，技能与未知教学服务仍须真实实体引用',()=>{
 assert.equal(validateWorld(world,{stage:'release'}).ok,true);
 const invalid=structuredClone(world),p=invalid.npcs.find(p=>ids.has(p.id));p.services.push('unknown_teaching');
 assert.ok(validateWorld(invalid).errors.some(e=>e.includes('unknown_teaching')));
 p.services.pop();p.skills.push('trade');assert.ok(validateWorld(invalid).errors.some(e=>e.includes('/skills')&&e.includes('pattern')));
});

test('按本批ID与聚落常住登记核对100/206及LOD0的250/500，访客与seed不充数',()=>{
 const residentsFor=id=>new Set(world.settlementProfiles.find(s=>s.id===id).residentIds);
 const town=residentsFor('loc_bs'),local=new Set(['loc_hw','loc_bs','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban'].flatMap(id=>[...residentsFor(id)]));
 for(const id of ids){assert.ok(town.has(id));assert.ok(world.npcs.some(n=>n.id===id&&n.tier==='full'));}
 const full=world.npcs.filter(n=>n.tier==='full'),roster=world.residents;
 assert.ok(full.filter(n=>town.has(n.id)).length>=100);assert.ok(roster.filter(n=>town.has(n.id)).length>=206);
 assert.ok(full.filter(n=>local.has(n.id)).length>=250);assert.ok(roster.filter(n=>local.has(n.id)).length>=500);
 assert.ok(![...local].some(id=>id.includes('seed')));
 for(const p of bundle.people){assert.ok(p.household.includes(p.relationships.at(-1).with));assert.equal(new Set(p.relationships.map(r=>r.with)).size,p.relationships.length);}
 const additions=contentAdditions(world);for(const p of additions.locations){assert.deepEqual(world.locations.find(l=>l.id===p.id),p);assert.ok(new WorldEngine(world).route('loc_bs',p.id,'walk',510,'craft-route').minutes>0);}
 assert.equal(world.locations.find(l=>l.id==='bld_bs_temple').name,'东街灯祠');
});

// All new route skills and certification records below come from public calls.
// Only the starting character's level, attributes and travel purse are fixtures.
async function schoolSession(t){
 const engine=new WorldEngine(world);let doc=engine.createCharacter(legacy,{},`t93-${t.route}`),serial=0;
 doc.state.minute=510;doc.state.location='loc_bs';doc.state.player.level=10;doc.state.player.coins=1000;
 for(const a of Object.keys(doc.state.player.attributes))doc.state.player.attributes[a]=18;
 const call=async(tool,args,successKey)=>{
  if(!successKey){const out=await engine.reduce(doc,{tool,args,eventId:`school-${++serial}`});doc=applyPatches(doc,out.patches);return out.result;}
  // Select a reproducible successful dice event, without overriding the dice or
  // injecting a learned skill. Failure accounting is tested separately below.
  for(let n=0;n<100;n++){const out=await engine.reduce(doc,{tool,args,eventId:`school-${++serial}`});if(out.result[successKey]){doc=applyPatches(doc,out.patches);return out.result;}}
  throw Error('未出现所需检定结果');
 };
 const morning=async()=>{let target=(Math.floor(doc.state.minute/1440)+1)*1440+510;while([10,20,30].includes(engine.calendar(target).day))target+=1440;await call('world_time',{minutes:target-doc.state.minute});};
 await call('world_move',{destination:t.location});
 return{engine,call,morning,get doc(){return doc;},set doc(value){doc=value;}};
}

test('四路线实际抵达、拜师、练习与认证；学费进导师账，书籍实际购买并可学',async()=>{
 for(const t of teachingDesign.filter(t=>['道','佛','法','武'].includes(t.route))){
  const s=await schoolSession(t);assert.equal(s.doc.state.npcs[t.id].location,t.location);
  const coins=s.doc.state.player.coins+s.doc.state.npcs[t.id].coins,feeBefore=s.doc.state.player.coins;
  await assert.rejects(s.call('world_profession',{profession:t.role,teacher:t.id}),/基础技能/);
  await s.call('world_learn',{entity:t.core,source:t.id,kind:'skill'},'success');
  assert.equal(s.doc.state.skills[t.core].source.id,t.id);assert.equal(s.doc.state.player.coins,feeBefore-12);
  while(s.doc.state.skills[t.core].proficiency<150){await s.call('world_practice',{skill:t.core,gain:100,target:'基础动作'});if(s.doc.state.skills[t.core].proficiency<150)await s.morning();}
  await s.morning();await s.call('world_profession',{profession:t.role,teacher:t.id,operation:'certify'},'certified');
  assert.equal(s.doc.state.professions.combat,t.role);assert.equal(s.doc.state.careers[t.role].certification.teacher,t.id);
  assert.equal(s.doc.state.player.coins+s.doc.state.npcs[t.id].coins,coins);
  await assert.rejects(s.call('world_profession',{profession:t.role,teacher:t.id}),/已经认证/);
  await s.morning();const stock=s.doc.state.npcs[t.id].inventory[t.book],book=await s.call('world_trade',{seller:t.id,item:t.book,quantity:1});
  assert.ok(book.cost>0);assert.equal(s.doc.state.npcs[t.id].inventory[t.book].quantity??s.doc.state.npcs[t.id].inventory[t.book],stock-1);assert.equal(s.doc.state.inventory[t.book].quantity,1);
  // Literacy also comes from lessons and practice at the same public school.
  await s.call('world_move',{destination:'bld_bs_school'});await s.morning();
  const teacher='npc_bs_077_2';await s.call('world_learn',{entity:'skill_literacy',source:teacher,kind:'skill'},'success');
  while(s.doc.state.skills.skill_literacy.proficiency<100){await s.call('world_practice',{skill:'skill_literacy',gain:100,target:'读初课页码'});if(s.doc.state.skills.skill_literacy.proficiency<100)await s.morning();}
  if(t.spell){await s.call('world_learn',{entity:t.spell,source:t.book,kind:'spell'},'success');assert.equal(s.doc.state.spells[t.spell].source.type,'book');}
  const check=await s.call('world_check',{attribute:world.skills.find(r=>r.id===t.core).attribute,skill:t.core,difficulty:10});assert.ok(check.modifier>=5);
  if(t.route==='法'){const mp=s.doc.state.player.mp;await s.call('world_cast',{spell:'spell_light',target:'item_staff'},'success');assert.equal(s.doc.state.player.mp,mp-1);assert.ok(Object.values(s.doc.state.effects).some(e=>e.kind==='light'));}
 }
});

test('师授失败照扣费和用时，贫穷、休息日与其他导师拒绝不写记录',async()=>{
 const t=teachingDesign[0],s=await schoolSession(t),saved=structuredClone(s.doc);let failure;
 for(let i=0;i<100;i++){const out=await s.engine.reduce(saved,{tool:'world_learn',args:{entity:t.core,source:t.id,kind:'skill'},eventId:`failed-${i}`});if(!out.result.success){failure=out;break;}}
 assert.ok(failure);const after=applyPatches(saved,failure.patches);assert.equal(after.state.player.coins,saved.state.player.coins-12);assert.equal(after.state.npcs[t.id].coins,saved.state.npcs[t.id].coins+12);assert.equal(after.state.minute,saved.state.minute+120);assert.equal(after.state.skills[t.core],undefined);
 s.doc.state.player.coins=11;const poor=structuredClone(s.doc);await assert.rejects(s.call('world_learn',{entity:t.core,source:t.id}),/教学费不足/);assert.deepEqual(s.doc,poor);
 s.doc.state.player.coins=100;await s.call('world_time',{minutes:9*1440+510-s.doc.state.minute});
 await assert.rejects(s.call('world_learn',{entity:t.core,source:t.id}),/在场|服务|作息/);
});

test('共享高阶术式同时检查认证和路线基础；旧法师学习、熟练度与退职保护保留',async()=>{
 for(const t of teachingDesign.filter(t=>['道','佛'].includes(t.route))){
  const s=await schoolSession(t);await assert.rejects(s.call('world_learn',{entity:'spell_mind_05',source:t.id}),/职业认证/);
  // Boundary fixtures isolate the high-stage gate; public beginner paths above
  // prove how the character obtains actual entry skills and certification.
  s.doc.state.professions.combat=t.role;s.doc.state.skills[t.core]={proficiency:299,daily:{},breakthroughs:[]};
  await assert.rejects(s.call('world_learn',{entity:'spell_mind_05',source:t.id}),/基础熟练度/);
  s.doc.state.skills[t.core].proficiency=300;await s.call('world_time',{until:{dayOffset:0,hour:13,minute:10}});
  await s.call('world_learn',{entity:'spell_mind_05',source:t.id},'success');assert.equal(s.doc.state.spells.spell_mind_05.source.id,t.id);
  s.doc.state.player.attributes.精神=10;s.doc.state.skills.skill_mind_05.proficiency=600;const check=await s.call('world_check',{attribute:'精神',skill:'skill_mind_05',difficulty:10});assert.equal(check.modifier,4);
  s.doc.state.professions.combat='';const capped=await s.call('world_check',{attribute:'精神',skill:'skill_mind_05',difficulty:10});assert.equal(capped.modifier,1);assert.equal(s.doc.state.skills.skill_mind_05.proficiency,600);
 }
 const mage=teachingDesign.find(t=>t.route==='法'),s=await schoolSession(mage);s.doc.state.professions.combat='profession_mage';
 await s.call('world_time',{until:{dayOffset:0,hour:13,minute:10}});await s.call('world_learn',{entity:'spell_mind_05',source:mage.id},'success');assert.ok(s.doc.state.spells.spell_mind_05);
});

test('本批33个ID正式提升且名册去重，炉巷与东学街原登记身份保持',async()=>{
 const approvedBundle=(await approved(world)).bundle;assert.deepEqual(approvedBundle.people,bundle.people);
 assert.equal(ids.size,33);assert.ok(bundle.sources.some(p=>p.home.location==='bld_bs_home_061'));
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
 const ledger=JSON.parse(await fs.readFile('world/drafts/w1/budget.json','utf8')),requests=Object.values(ledger.requests).filter(r=>r.card==='T93'&&!['reserved','cancelled-unissued'].includes(r.status));
 assert.ok(requests.length>=bundle.entries.length&&requests.length<=160);assert.ok(ledger.cards.T93.spentYuan<=7);assert.ok(ledger.cards.T93.reservedYuan<1e-10);assert.ok(requests.every(r=>r.status==='settled'));
 for(const entry of bundle.entries){
  const record=JSON.parse(await fs.readFile(`${root}/${entry.id}.json`,'utf8'));assert.equal(record.status,'passed');assert.equal(record.draftResponse,undefined);
  assert.equal(record.fingerprint,hashContent({entry,context:reviewContext(entry,bundle,world),revision:'t93-craft-1'}));
  assert.ok(record.responseEvidence.every(e=>e.phase==='review'));assert.ok(record.review.contradictions.every(r=>r.severity!=='hard'));
  const last=record.responseEvidence.at(-1),evidence=JSON.parse(await fs.readFile(`world/drafts/w1/${last.file}`,'utf8'));
  assert.equal(evidence.response.model.startsWith('deepseek'),true);assert.ok(evidence.usage.prompt_tokens>0);assert.equal(evidence.responseHash,last.responseHash);
  assert.deepEqual(JSON.parse(evidence.request.messages[1].content).draft,entry.draft);
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
 const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'t93-privacy');
 for(const event of bundle.events)for(const id of event.actors){
  const person=world.npcs.find(p=>p.id===id),context=npcContext(engine,doc,id,event.title),text=JSON.stringify(context);
  assert.ok(context.seeds.includes(person.memorySeeds[0].event));assert.deepEqual(context.unknown,person.knowledge.unknown);
  for(const otherId of event.actors.filter(x=>x!==id)){const other=world.npcs.find(p=>p.id===otherId);assert.ok(!text.includes(other.secrets[0].content));assert.ok(!context.known.includes(other.memorySeeds[1].event));}
  assert.deepEqual(person.secrets[0].knownBy,[id]);
 }
 const familyNotes=bundle.people.map(p=>p.relationships.at(-1).note.split('。').filter(Boolean).at(-1));assert.equal(new Set(familyNotes).size,ids.size);
});

test('玩家沿既有路线找到前厅居民，以真实私人库存成交并保持钱物守恒',async()=>{
 const engine=new WorldEngine(world),person=bundle.people[0],item=Object.keys(person.inventory)[0];let doc=engine.createCharacter(legacy,{},'t93-trade');
 doc.state.minute=510;doc.state.location='loc_bs';doc.state.player.coins=200;
 const run=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
 await run('world_move',{destination:person.workplace.location},'t93-walk');assert.equal(doc.state.npcs[person.id].location,person.workplace.location);
 const source=structuredClone(doc),money=doc.state.player.coins+doc.state.npcs[person.id].coins,stock=(doc.state.inventory[item]?.quantity??0)+doc.state.npcs[person.id].inventory[item];
 const bought=await run('world_trade',{seller:person.id,item,quantity:1},'t93-buy');assert.ok(bought.cost>0);
 assert.equal(doc.state.player.coins+doc.state.npcs[person.id].coins,money);assert.equal((doc.state.inventory[item]?.quantity??0)+(doc.state.npcs[person.id].inventory[item]??0),stock);
 assert.equal(doc.state.npcs[person.id].inventory[item]??0,0);assert.ok(doc.state.npcs[person.id].memoryStream.some(m=>m.sourceEvent==='t93-buy'));
 const replay=await engine.reduce(source,{tool:'world_trade',args:{seller:person.id,item,quantity:1},eventId:'t93-buy'});assert.deepEqual(applyPatches(source,replay.patches),doc);
 const prior=structuredClone(doc);await assert.rejects(run('world_trade',{seller:person.id,item,quantity:1},'t93-empty'),/库存不足/);assert.deepEqual(doc,prior);
 await assert.rejects(run('world_trade',{seller:person.id,service:'征税'},'t93-unsupported'),/未登记/);assert.deepEqual(doc,prior);
});

test('休息日没有库存接洽，未获许可的住宅入口保留原拒绝',async()=>{
 const engine=new WorldEngine(world),person=bundle.people[0],doc=engine.createCharacter(legacy,{},'t93-home');doc.state.minute=540;doc.state.location='loc_bs';
 const original=structuredClone(doc);await assert.rejects(engine.reduce(doc,{tool:'world_move',args:{destination:person.home.location},eventId:'t93-private-home'}),/成年住户/);assert.deepEqual(doc,original);
 doc.state.minute=9*1440+540;doc.state.location=person.home.location;doc.state.npcs[person.id].location=person.home.location;doc.state.npcs[person.id].activity='家务';
 await assert.rejects(engine.reduce(doc,{tool:'world_trade',args:{seller:person.id,item:Object.keys(person.inventory)[0],quantity:1},eventId:'t93-rest'}),/服务|时段|作息|休息/);
});

test('提升升级不覆盖旧档状态，重放不补充已用完的私人库存',()=>{
 const {world:next}=compatibleWorld(before,world);assert.ok([...ids].every(id=>!next.residents.some(p=>p.id===id)));
 const engine=new WorldEngine(before),doc=engine.createCharacter(legacy,{},'t93-upgrade'),oldId='npc_hw_yanzhe';
 Object.assign(doc.state.npcs[oldId],{coins:73,trust:27,affection:4,inventory:{item_wood:2},location:'loc_hw'});doc.state.npcs[oldId].memoryStream=[{id:'t93-keep',content:'已经发生的私人往来'}];
 const saved=structuredClone(doc.state.npcs[oldId]),update=planWorldUpgrade(doc,before,next,{worldHash:'t93-promoted',eventId:'t93-up'}),after=applyPatches(doc,update.patches);
 assert.deepEqual(after.state.npcs[oldId],saved);for(const person of bundle.people){assert.equal(after.state.npcs[person.id].coins,person.coins);assert.deepEqual(after.state.npcs[person.id].inventory,person.inventory);}
 const id=bundle.people[0].id;Object.assign(after.state.npcs[id],{coins:1,trust:19,inventory:{},memoryStream:[{id:'t93-after',content:'买卖后形成的记忆'}]});
 const replay=planWorldUpgrade(after,next,next,{worldHash:'t93-promoted',eventId:'t93-replay'});assert.deepEqual(applyPatches(after,replay.patches).state.npcs,after.state.npcs);
 assert.deepEqual(integrate(integrate(before,bundle),bundle),integrate(before,bundle));for(const person of before.npcs)assert.deepEqual(next.npcs.find(p=>p.id===person.id),person);
});

