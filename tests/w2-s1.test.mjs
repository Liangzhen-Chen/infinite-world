import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {readS1Publication,mergeS1Publication,publishS1} from '../tools/publish-w2-s1.mjs';
import {spells,books,placements,channelFacts} from '../world/design/w2-s1.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {initialThermalState} from '../server-plugin/magic-object.mjs';
import {consumeMagicProtection} from '../server-plugin/magic-primitives.mjs';
const formal=await loadWorld(),publication=await readS1Publication();
const before=structuredClone(formal);
for(const category of ['spells','skills','items'])before[category]=before[category].filter(r=>!r.id.includes('_s1_'));
for(const book of books)delete before.npcs.find(n=>n.id==='npc_hw_luqing').inventory[book.id];
for(const [id,rows]of Object.entries(placements)){const place=before.locations.find(l=>l.id===id);place.features=(place.features??[]).filter(f=>!rows.some(r=>r.id===f.id));if(!place.features.length)delete place.features;}
const channel=before.locations.flatMap(l=>l.features??[]).find(f=>f.id==='feature_hw_channel');for(const k of Object.keys(channelFacts))delete channel.state[k];
const world=mergeS1Publication(before,publication),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
let serial=0;
async function run(doc,tool,args,eventId=`s1-action-${++serial}`){const out=await engine.reduce(doc,{tool,args,eventId});return {doc:applyPatches(doc,out.patches),result:out.result,id:eventId};}
function base(){const doc=engine.createCharacter(seed,{},'s1-publication');doc.state.minute=540;doc.state.location='bld_hw_school';Object.assign(doc.state.player,{coins:10000,mp:10000,maxMp:10000,hp:10000,maxHp:10000,level:60,companions:[]});doc.state.player.attributes.智力=30;doc.state.player.attributes.精神=30;doc.state.professions.combat='profession_mage';doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};doc.state.inventory.item_charcoal={quantity:20,durability:100};return doc;}
async function success(doc,tool,args){for(let i=0;i<40;i++){const r=await run(doc,tool,args);if(r.result.checkSuccess&&r.result.effectFailed)assert.fail(r.result.effectFailed);if(r.result.success)return r;}assert.fail(`未取得成功检定：${JSON.stringify(args)}`);}
async function grant(doc,target,{owner='npc_hw_luqing',minutes=10080,guests=[]}={}){return run(doc,'world_promise',{operation:'grant_access',promisor:owner,location:target,minutes,guests,content:'本人同意限定用途；到期或撤销即终止许可'});}
function draft(doc){return {document:structuredClone(doc),get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(p,v){this.document=applyPatches(this.document,[{op:'set',path:p,value:v}]);},remove(p){this.document=applyPatches(this.document,[{op:'delete',path:p}]);}};}
const state=(doc,id)=>doc.state.records[`physical_feature:${id}`]?.state??world.locations.flatMap(l=>l.features??[]).find(f=>f.id===id).state;
async function contact(doc,id){Object.assign(doc.state.npcs[id],{location:doc.state.location,hp:10000,maxHp:10000,status:'正常',activity:'交谈'});for(let i=0;i<20;i++){const r=await run(doc,'world_combat',{target:id,intent:'defend'});if(r.doc.state.records[`local_actor_position:${id}`])return r.doc;}assert.fail('正常交锋未生成实际接触');}
const learned=new Map(),purchased=new Map();

test('六本有限书籍付费购买，30条逐项阅读取得真实来源、再施法产生可验证效果',async t=>{
 for(const b of books){const doc=base(),r=await run(doc,'world_trade',{seller:'npc_hw_luqing',item:b.id,quantity:1});assert.ok(r.result.cost>0);assert.equal(r.doc.state.player.coins,doc.state.player.coins-r.result.cost);assert.equal(r.doc.state.npcs.npc_hw_luqing.inventory[b.id].quantity,1);purchased.set(b.id,r.doc);}
 for(const s of spells){const book=books.find(b=>b.book.teaches.includes(s.id)),doc=purchased.get(book.id),r=await success(doc,'world_learn',{kind:'spell',entity:s.id,source:book.id});assert.equal(r.doc.state.spells[s.id].source.id,book.id);assert.equal(r.doc.state.skills[s.skill].proficiency,0);assert.equal(r.doc.state.minute,doc.state.minute+book.book.readingMinutes);assert.equal(r.doc.state.player.coins,doc.state.player.coins);assert.equal(r.doc.state.inventory.item_charcoal.quantity,doc.state.inventory.item_charcoal.quantity);learned.set(s.id,r.doc);}
 for(const s of spells)await t.test(`${s.id} ${s.name}`,async()=>{
  let doc=structuredClone(learned.get(s.id));doc.state.minute=540;doc.state.location='bld_hw_school';doc.state.player.companions=[];
  // Fixture resets only conditions for this individual branch; learned source
  // and purchase ledger above remain the real consumer outputs.
  for(const id of ['npc_hw_luqing','npc_hw_xuling'])Object.assign(doc.state.npcs[id],{location:doc.state.location,status:'正常',activity:'交谈',hp:10000,maxHp:10000});
  const args={spell:s.id,target:'player'},kind=s.effectSpec.kind,op=s.effectSpec.operation;
  if(kind==='anchor_sense')args.target='feature_s1_anchor_school';
  if(kind==='blink'){
   args.target='feature_s1_landing';
   if(s.effectSpec.maxCompanions){doc.state.player.companions=['npc_hw_luqing'];doc=await contact(doc,'npc_hw_luqing');}
   const g=await grant(doc,args.target,{guests:doc.state.player.companions});doc=g.doc;args.authorization=g.result.authorization;
  }
  if(kind==='teleport'){
   // Both known anchors originate in actual casts, not supplied coordinates.
   const read=world.spells.find(s=>s.id==='spell_s1_anchor_read');doc.state.spells[read.id]=structuredClone(learned.get(read.id).state.spells[read.id]);doc.state.skills[read.skill]=structuredClone(learned.get(read.id).state.skills[read.skill]);
   doc=(await success(doc,'world_cast',{spell:read.id,target:'feature_s1_anchor_school'})).doc;
   const a=await grant(doc,'feature_s1_anchor_school',{minutes:1440});doc=a.doc;doc.state.player.companions=['npc_hw_luqing'];
   doc=(await run(doc,'world_move',{destination:'loc_hw_dock'})).doc;doc.state.player.companions=[];
   doc=(await success(doc,'world_cast',{spell:read.id,target:'feature_s1_anchor_dock'})).doc;
   Object.assign(doc.state.npcs.npc_hw_luqing,{location:'loc_hw_dock',activity:'交谈'});delete doc.state.npcs.npc_hw_luqing.scheduleTravel;delete doc.state.npcs.npc_hw_luqing.cognitionTravel;
   const b=await grant(doc,'feature_s1_anchor_dock',{minutes:1440});doc=b.doc;doc.state.player.companions=['npc_hw_luqing'];
   doc=(await run(doc,'world_move',{destination:'bld_hw_school'})).doc;doc.state.player.companions=[];
   args.target='feature_s1_anchor_dock';args.authorizations=[a.result.authorization,b.result.authorization];
  }
  if(['message','mind_message','consent_link','team_link'].includes(kind)){
   const target='npc_hw_luqing',third='npc_hw_xuling';doc.state.player.companions=kind==='team_link'?[target,third]:[target];doc=await contact(doc,target);if(kind==='team_link')doc=await contact(doc,third);
   const purpose=['message','mind_message'].includes(kind)?'mental_message':kind;
   const a=await grant(doc,purpose,{owner:target,minutes:60,guests:kind==='team_link'?[third]:[]});doc=a.doc;args.target=target;args.authorization=a.result.authorization;
   if(kind==='team_link'){const b=await grant(doc,purpose,{owner:third,minutes:60,guests:[target]});doc=b.doc;args.authorizations=[b.result.authorization];}
   args.text=kind==='consent_link'?'平静':kind==='team_link'?'防守':'我在学塾等候。';
   if(kind==='mind_message'){
    doc.state.spells.spell_fire_07={source:{type:'fixture',id:'older-approved-spell'}};doc.state.skills.skill_fire_07={proficiency:200,daily:{},breakthroughs:[]};doc.state.inventory.item_whittling_knife={quantity:1,durability:100};
    const mark=await success(doc,'world_cast',{spell:'spell_fire_07',target:'item_whittling_knife',text:'远笺'});doc=mark.doc;args.permit=mark.result.mark;
   }
   // Refresh contact after mark/consent preparation if needed.
   doc=await contact(doc,target);if(kind==='team_link')doc=await contact(doc,third);
  }
  if(kind==='object'){
   args.target='feature_s1_hearth';const g=await grant(doc,args.target);doc=g.doc;args.authorization=g.result.authorization;
   if(op==='extinguish'){const f=world.locations.flatMap(l=>l.features??[]).find(f=>f.id===args.target),thermal=initialThermalState(f.thermalInitial,f.thermalModel,doc.state.minute);thermal.burning=true;doc.state.records[`physical_feature:${f.id}`]={category:'physical_feature',id:f.id,location:doc.state.location,state:{thermal}};}
  }
  if(kind==='water_earth'){
   if(op==='seal'){args.target='feature_s1_leak_bucket';const g=await grant(doc,args.target);doc=g.doc;args.authorization=g.result.authorization;const h=await grant(doc,'feature_s1_drain');doc=h.doc;args.authorizations=[h.result.authorization];}
   else{doc.state.location='loc_hw_dock';args.target='feature_hw_channel';}
  }
  if(kind==='care'){
   const targets={herb_sense:'herb',seedling:'seedling',roots:'seedling',graft:'stock',preserve_food:'fruit'};args.target=`feature_s1_${targets[op]}`;
   const g=await grant(doc,args.target);doc=g.doc;args.authorization=g.result.authorization;
   if(['roots','graft'].includes(op)){args.source=op==='roots'?'feature_s1_root_water':'feature_s1_scion';const h=await grant(doc,args.source);doc=h.doc;args.authorizations=[h.result.authorization];}
   if(op==='graft'){const gardening=world.skills.find(r=>r.id==='skill_gardening'||r.name.includes('园艺'));doc.state.skills[gardening.id]={proficiency:100,daily:{},breakthroughs:[]};}
  }
  if(kind==='growth'){
   doc.state.location='loc_hw_fields';const p=world.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw');
   // Advance the existing agricultural ledger through its first actual sowing.
   for(let day=0;day<26&&!doc.state.records['agriculture:loc_hw'].field.cohorts.length;day++)doc=(await run(doc,'world_time',{minutes:1440,activity:'等待'})).doc;
   assert.ok(doc.state.records['agriculture:loc_hw'].field.cohorts.length,'正式农事来源须实际播种');
   doc.state.player.companions=[p.manager];Object.assign(doc.state.npcs[p.manager],{location:doc.state.location,activity:'交谈',status:'正常'});
   const g=await grant(doc,p.fieldId,{owner:p.manager});doc=g.doc;args.target=p.fieldId;args.authorization=g.result.authorization;
  }
  const input=structuredClone(doc),r=await success(doc,'world_cast',args);
  assert.equal(r.doc.state.player.mp,input.state.player.mp-s.mp);assert.equal(r.doc.state.inventory.item_charcoal.quantity,input.state.inventory.item_charcoal.quantity-1);assert.equal(r.doc.state.minute,input.state.minute+s.minutes);
  assert.equal(r.doc.state.spells[s.id].source.id,learned.get(s.id).state.spells[s.id].source.id);
  if(kind==='area'){
   if(s.effectSpec.trigger==='pulse'){assert.ok(r.doc.state.player.hp<input.state.player.hp);const later=await run(r.doc,'world_time',{minutes:2,activity:'等待'});assert.ok(later.doc.state.player.hp<r.doc.state.player.hp);}
   else{const shield=Object.values(r.doc.state.effects).find(e=>e.areaSource===r.id&&e.target==='player');assert.equal(shield.remaining,12);const d=draft(r.doc);const hit=consumeMagicProtection(d,'player',15,s.effectSpec.effect.damageTypes[0]);assert.equal(hit.absorbed,12);assert.equal(hit.damage,3);}
   const end=await run(r.doc,'world_time',{minutes:s.duration,activity:'等待'});assert.equal(end.doc.state.effects[r.id],undefined);
  }
  if(kind==='anchor_sense')assert.equal(r.doc.state.records[r.result.anchor].subject,args.target);
  if(kind==='blink'){assert.deepEqual(r.doc.state.records.local_player_position.point,[4,0]);assert.equal(r.result.companions.length,s.effectSpec.maxCompanions);}
  if(kind==='teleport'){assert.equal(r.doc.state.location,'loc_hw_dock');assert.ok(r.result.metres>0);}
  if(['message','mind_message','consent_link','team_link'].includes(kind)){
   assert.equal(r.doc.state.npcCognition.messages[r.result.messageId].status,'在途');const delivered=await run(r.doc,'world_time',{minutes:s.effectSpec.delayMinutes,activity:'等待'});assert.equal(delivered.doc.state.npcCognition.messages[r.result.messageId].status,'已交付');
   if(['consent_link','team_link'].includes(kind)){const later=await run(r.doc,'world_time',{minutes:s.effectSpec.upkeepMinutes,activity:'等待'});assert.equal(later.doc.state.player.mp,r.doc.state.player.mp-s.effectSpec.upkeepMp*(kind==='team_link'?2:1));const revoke=await run(later.doc,'world_promise',{operation:'revoke_access',promisor:args.target,authorization:args.authorization});assert.equal(revoke.doc.state.effects[r.id],undefined);}
  }
  if(op==='ignite')assert.equal(r.result.ignited,true);
  if(op==='extinguish'){assert.equal(r.result.extinguished,true);assert.equal(r.result.stillHot,true);}
  if(op==='heat')assert.equal(r.result.heatInputJ,5000);
  if(op==='sense_heat')assert.equal(r.result.temperatureC,20);
  if(op==='seal'){const q=await run(r.doc,'world_time',{minutes:2,activity:'等待'});assert.equal(state(q.doc,args.target).waterMl,state(r.doc,args.target).waterMl);}
  if(op==='survey_water'){assert.equal(r.result.observation.lengthMeters,3);assert.equal(r.result.observation.velocityMetersPerSecond,.2);}
  if(op==='slow_flow')assert.equal(r.doc.state.effects[r.id].power,50);
  if(op==='herb_sense'){assert.equal(r.result.observation.unknown,false);assert.ok(r.result.observation.commonProperties.length);}
  if(['seedling','roots','graft','preserve_food'].includes(op)){
   if(op==='seedling'){const initial=structuredClone(state(r.doc,args.target));initial.temperatureC=-2;r.doc.state.records[`physical_feature:${args.target}`]={category:'physical_feature',id:args.target,location:r.doc.state.location,state:initial};}
   const q=await run(r.doc,'world_time',{minutes:2,activity:'等待'}),old=state(r.doc,args.target),now=state(q.doc,args.target);
   if(op==='seedling')assert.equal(now.plant.health,old.plant.health);
   if(op==='roots'){assert.ok(now.plant.rootLengthMeters>old.plant.rootLengthMeters);assert.ok(now.waterMl<old.waterMl);assert.ok(now.nutrientMg<old.nutrientMg);}
   if(op==='graft'){assert.ok(now.plant.graft.union>old.plant.graft.union);assert.ok(now.plant.graft.rejection<old.plant.graft.rejection);}
   if(op==='preserve_food')assert.ok(Math.abs((now.foodLots[0].spoiledGrams-old.foodLots[0].spoiledGrams)-.01)<1e-7);
  }
  if(kind==='growth'){
   const key='agriculture:loc_hw',old=r.doc.state.records[key].field.growthLeases[0],q=await run(r.doc,'world_time',{minutes:1440,activity:'等待'}),lease=q.doc.state.records[key].field.growthLeases[0];assert.equal(old.usedTicks,0);assert.ok(lease.usedTicks>0);assert.ok(lease.waterMl>0);assert.ok(lease.nutrientMg>0);const water=state(q.doc,'feature_s1_field');assert.equal(water.waterMl+water.growthConsumedWaterMl,500000);assert.equal(water.nutrientMg+water.growthConsumedNutrientMg,100000);assert.equal(q.doc.state.records[key].ledger.harvested,r.doc.state.records[key].ledger.harvested);
  }
 });
});

test('未知法术、未持书/识字不足/认证不足、施法材料不足与失败成本保留',async()=>{
 const s=spells[0],book=books.find(b=>b.book.teaches.includes(s.id));let doc=base();
 await assert.rejects(engine.reduce(doc,{tool:'world_cast',args:{spell:s.id,target:'player'},eventId:'unknown'}),/尚未学会/);
 await assert.rejects(engine.reduce(doc,{tool:'world_learn',args:{kind:'spell',entity:s.id,source:book.id},eventId:'no-book'}),/没有这本书/);
 doc=structuredClone(purchased.get(book.id));doc.state.skills.skill_literacy.proficiency=99;await assert.rejects(engine.reduce(doc,{tool:'world_learn',args:{kind:'spell',entity:s.id,source:book.id},eventId:'illiterate'}),/识字/);
 doc.state.skills.skill_literacy.proficiency=100;doc.state.professions.combat=null;await assert.rejects(engine.reduce(doc,{tool:'world_learn',args:{kind:'spell',entity:s.id,source:book.id},eventId:'uncertified'}),/职业认证/);
 doc=structuredClone(learned.get(s.id));doc.state.inventory.item_charcoal.quantity=0;const saved=structuredClone(doc);await assert.rejects(engine.reduce(doc,{tool:'world_cast',args:{spell:s.id,target:'player'},eventId:'no-material'}),/缺少材料/);assert.deepEqual(doc,saved);
 doc=structuredClone(learned.get(s.id));doc.state.player.attributes.精神=1;let failed;for(let i=0;i<40;i++){const r=await run(doc,'world_cast',{spell:s.id,target:'player'});if(!r.result.success){failed=r;break;}}assert.ok(failed);assert.equal(failed.doc.state.player.mp,doc.state.player.mp-s.mp);assert.equal(failed.doc.state.inventory.item_charcoal.quantity,doc.state.inventory.item_charcoal.quantity-1);assert.equal(failed.doc.state.minute,doc.state.minute+s.minutes);assert.equal(failed.doc.state.effects[failed.id],undefined);
});

test('正常环境许可只由实际所有者签发，撤销/到期/超距保留原钱物，公共访问不授权生长',async()=>{
 const s=spells.find(s=>s.id==='spell_s1_warm_vessel');let doc=structuredClone(learned.get(s.id));doc.state.minute=540;doc.state.location='bld_hw_school';
 const args={spell:s.id,target:'feature_s1_hearth'};
 await assert.rejects(engine.reduce(doc,{tool:'world_cast',args,eventId:'private'}),/授权/);
 await assert.rejects(grant(doc,args.target,{owner:'npc_hw_xuling'}),/所有者/);
 const g=await grant(doc,args.target);const revoked=await run(g.doc,'world_promise',{operation:'revoke_access',promisor:'npc_hw_luqing',authorization:g.result.authorization});await assert.rejects(engine.reduce(revoked.doc,{tool:'world_cast',args:{...args,authorization:g.result.authorization},eventId:'revoked'}),/授权/);
 const expired=structuredClone(g.doc);expired.state.records[g.result.authorization].expires=expired.state.minute;await assert.rejects(engine.reduce(expired,{tool:'world_cast',args:{...args,authorization:g.result.authorization},eventId:'expired'}),/授权/);
 const far=structuredClone(g.doc);far.state.records.local_player_position={location:far.state.location,point:[4,0]};await assert.rejects(engine.reduce(far,{tool:'world_cast',args:{...args,authorization:g.result.authorization},eventId:'far'}),/距离/);
 const grow=structuredClone(learned.get('spell_s1_field_growth'));grow.state.location='loc_hw_fields';await assert.rejects(engine.reduce(grow,{tool:'world_cast',args:{spell:'spell_s1_field_growth',target:'farm_hw_oats'},eventId:'public-field'}),/田主.*同意/);
});

test('旧战役逐键升级六本书，零库存/残本/钱物/记忆保留，升级后可购买学习',async()=>{
 const oldEngine=new WorldEngine(before),doc=oldEngine.createCharacter(seed,{},'s1-old');doc.state.minute=540;doc.state.location='bld_hw_school';doc.state.player.coins=10000;doc.state.player.attributes.智力=30;doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
 const seller=doc.state.npcs.npc_hw_luqing;seller.coins=19;seller.inventory[books[0].id]=0;seller.inventory[books[1].id]={quantity:1,durability:17};const saved=structuredClone(doc),incoming=compatibleWorld(before,world).world,plan=planWorldUpgrade(doc,before,incoming,{worldHash:'s1-edition',eventId:'upgrade'}),after=applyPatches(doc,plan.patches);
 assert.equal(plan.result.stockAdded.length,4);assert.deepEqual(after.state.player,saved.state.player);assert.deepEqual(after.state.inventory,saved.state.inventory);assert.deepEqual(after.memories,saved.memories);assert.equal(after.state.npcs.npc_hw_luqing.coins,19);assert.equal(after.state.npcs.npc_hw_luqing.inventory[books[0].id],0);assert.deepEqual(after.state.npcs.npc_hw_luqing.inventory[books[1].id],{quantity:1,durability:17});
 const purchase=await run(after,'world_trade',{seller:'npc_hw_luqing',item:books[4].id,quantity:1});assert.ok(purchase.result.cost>0);const learn=await success(purchase.doc,'world_learn',{kind:'spell',entity:books[4].book.teaches[0],source:books[4].id});assert.equal(learn.doc.state.spells[books[4].book.teaches[0]].source.id,books[4].id);
 const repeat=planWorldUpgrade(learn.doc,incoming,incoming,{worldHash:'s1-edition',eventId:'repeat'});assert.deepEqual(repeat.result.stockAdded,[]);assert.deepEqual(applyPatches(learn.doc,repeat.patches).state.npcs,learn.doc.state.npcs);
});

test('隔离发布31→61与重复零写，正文/来源/L4/评分篡改拒绝，正式冲突拒绝且不补库存',async t=>{
 assert.equal(before.spells.length,31);assert.equal(world.spells.length,61);assert.deepEqual(formal,world);assert.deepEqual(mergeS1Publication(world,publication),world);
 const zero=structuredClone(world);zero.npcs.find(n=>n.id==='npc_hw_luqing').inventory[books[0].id]=0;assert.deepEqual(mergeS1Publication(zero,publication).npcs,zero.npcs);
 const conflict=structuredClone(world);conflict.spells.find(s=>s.id===spells[0].id).name+='异文';assert.throws(()=>mergeS1Publication(conflict,publication),/冲突/);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-s1-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));for(const folder of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});await fs.mkdir(path.join(root,'drafts'));await fs.cp(path.resolve('world/drafts/w2-s1'),path.join(root,'drafts/w2-s1'),{recursive:true});
 for(const [f,v]of Object.entries({'meta/spells.json':before.spells,'meta/skills.json':before.skills,'meta/items.json':before.items,'people/baseline.json':before.npcs,'geo/locations.json':before.locations}))await fs.writeFile(path.join(root,f),JSON.stringify(v));
 const original=await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),preview=await publishS1({root});assert.equal(preview.published,false);assert.equal(preview.formalSpellCount,61);assert.equal(preview.changed.length,5);assert.equal(await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),original);
 const first=await publishS1({root,publish:true});assert.equal(first.changed.length,5);assert.deepEqual(await loadWorld(root),world);const times=await Promise.all(first.changed.map(f=>fs.stat(path.join(root,f)).then(s=>s.mtimeMs)));assert.deepEqual((await publishS1({root,publish:true})).changed,[]);
 for(const [file,mutate,pattern]of [['candidate.json',r=>{r.spells[0].failure+='免费';},/候选/],['spell_s1_ember_circle.json',r=>{r.draft.source.readingMinutes=1;},/内容已改变/],['batch-0.json',r=>{r.l4.approved=false;},/L4/],['batch-0.json',r=>{r.l4.wave[0].scores[0]=2;},/评分/]]){const f=path.join(root,'drafts/w2-s1',file),bytes=await fs.readFile(f,'utf8'),r=JSON.parse(bytes);mutate(r);await fs.writeFile(f,JSON.stringify(r));await assert.rejects(publishS1({root,publish:true}),pattern);await fs.writeFile(f,bytes);}
 assert.deepEqual(await Promise.all(first.changed.map(f=>fs.stat(path.join(root,f)).then(s=>s.mtimeMs))),times);
});
