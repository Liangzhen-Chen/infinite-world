import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {hashContent,readApprovedContent,defaultReviewRequest} from '../tools/content-pipeline.mjs';
import {entries as auditedEntries,contextFor as spellContext,revision as spellRevision} from '../tools/w2-reuse-content.mjs';
import {validateDraft as validateBookDraft} from '../tools/m4-books-content.mjs';
import {reuseSpellCandidates,reuseLearningReferences} from '../world/design/w2-reuse-candidates.mjs';
import {sources,entries,contextFor,reviewDraftFor,revision,withReuseLearningCandidates} from '../world/design/w2-reuse-learning.mjs';

const source=await loadWorld(),world=withReuseLearningCandidates(source),spells=reuseSpellCandidates();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const quantity=value=>typeof value==='number'?value:value?.quantity??0;
function setup() {
 const engine=new WorldEngine(world),document=engine.createCharacter(seed,{},'w2-reuse-learning');
 document.state.minute=540;
 document.state.location='loc_hw_dock';
 Object.assign(document.state.player,{coins:10000,level:60,hp:500,maxHp:500,mp:1000,maxMp:1000});
 document.state.player.attributes.精神=30;
 document.state.player.attributes.智力=10;
 document.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
 document.state.skills.skill_light={proficiency:100,daily:{},breakthroughs:[]};
 const run=async(d,tool,args,eventId)=>{
  const output=await engine.reduce(d,{tool,args,eventId});
  return {document:applyPatches(d,output.patches),result:output.result,eventId};
 };
 return {engine,document,run};
}
async function outcome(run,document,tool,args,success,prefix) {
 // Observe real deterministic dice; every selected action is applied to its
 // returned document. Looking for a seed does not stub the learning consumer.
 for(let index=0;index<100;index++) {
  const out=await run(document,tool,args,`${prefix}_${index}`);
  if(out.result.success===success||success&&out.result.certified) return out;
 }
 throw Error(`没有找到所需骰点：${prefix}`);
}
async function buy(run,document,entry,prefix) {
 const arrived=await run(document,'world_move',{destination:entry.origin},`${prefix}_arrive`);
 assert.equal(arrived.document.state.location,entry.origin);
 assert.equal(arrived.document.state.npcs[entry.stock.owner].location,entry.origin);
 const acquired=await run(arrived.document,'world_trade',{
  seller:entry.stock.owner,item:entry.id,quantity:1,
 },`${prefix}_buy`);
 assert.ok(acquired.result.cost>0);
 assert.equal(acquired.document.state.minute,arrived.document.state.minute+5);
 assert.equal(acquired.document.state.player.coins,arrived.document.state.player.coins-acquired.result.cost);
 assert.equal(acquired.document.state.npcs[entry.stock.owner].coins,
  arrived.document.state.npcs[entry.stock.owner].coins+acquired.result.cost);
 assert.equal(quantity(acquired.document.state.inventory[entry.id]),1);
 assert.equal(quantity(acquired.document.state.npcs[entry.stock.owner].inventory[entry.id]),entry.stock.quantity-1);
 return acquired;
}

test('14来源引用闭合，原14法术正文审核指纹复用，新来源仍待L2/L4',async()=>{
 const approved=await readApprovedContent('world/drafts/w2-reuse',auditedEntries,{
  contextFor:spellContext,revision:spellRevision,
 });
 assert.equal(approved.length,14);
 assert.equal(source.spells.length,17);
 assert.equal(world.spells.length,31);
 assert.equal(new Set(world.spells.map(row=>row.id)).size,31);
 assert.equal(sources.mappings.length,14);
 assert.deepEqual(sources.mappings.map(({spell,book})=>({spell,book})),reuseLearningReferences);
 const saved=JSON.parse(await fs.readFile('world/drafts/w2-reuse/learning-sources.json','utf8'));
 assert.deepEqual(saved,sources);
 for(const mapping of sources.mappings) {
  const spell=spells.find(row=>row.id===mapping.spell),book=entries.find(row=>row.id===mapping.book);
  assert.ok(book.book.teaches.includes(spell.id));
  assert.deepEqual(world.spells.find(row=>row.id===spell.id),spell);
  assert.equal(mapping.skill.id,spell.skill);
  assert.equal(mapping.skill.stage,spell.stage);
  assert.equal(mapping.readingMinutes,world.rules.books.readingMinutes[spell.stage]);
  assert.equal(mapping.requiresCertification,spell.stage?'profession_mage':null);
  assert.deepEqual(mapping.teachers,[]);
 }
 for(const entry of entries) {
  const record=JSON.parse(await fs.readFile(`world/drafts/w2-reuse/learning/${entry.id}.json`,'utf8'));
  const context=contextFor(entry,source);
  assert.equal(record.status,'pending');
  assert.equal(record.attempts,0);
  assert.equal(record.review,null);
  assert.equal(record.fingerprint,hashContent({entry,context,revision}));
  assert.deepEqual(record.draft,reviewDraftFor(entry));
  assert.deepEqual(validateBookDraft(record.draft,entry).errors,[]);
  const request=defaultReviewRequest(entry,record.draft,context);
  assert.ok(request.messages.some(row=>row.content.includes(entry.stock.owner)));
  assert.ok(context.seller.serviceCatalog.some(row=>row.kind==='trade'&&row.price.mode==='engineQuote'));
  assert.ok(context.seller.schedule.default.some(slot=>slot.location===entry.origin&&slot.services.includes('trade')));
 }
 assert.deepEqual(withReuseLearningCandidates(world),world);
 for(const npc of source.npcs) {
  const next=world.npcs.find(row=>row.id===npc.id),inventory={...next.inventory};
  for(const entry of entries)if(entry.stock.owner===npc.id)delete inventory[entry.id];
  assert.deepEqual({...next,inventory},npc);
 }
});

test('真实行走到教师付费认证后可到学堂买一阶书并研读',async()=>{
 const {document,run}=setup();
 const arrived=await run(document,'world_move',{destination:'bld_hw_riverhome'},'certify_arrive');
 assert.equal(arrived.document.state.npcs.npc_hw_xuling.location,'bld_hw_riverhome');
 const certified=await outcome(run,arrived.document,'world_profession',{
  profession:'profession_mage',teacher:'npc_hw_xuling',
 },true,'certify');
 assert.equal(certified.document.state.professions.combat,'profession_mage');
 assert.equal(certified.document.state.player.coins,arrived.document.state.player.coins-30);
 const entry=entries.find(row=>row.book.grade==='中级');
 const acquired=await buy(run,certified.document,entry,'certified');
 const learned=await outcome(run,acquired.document,'world_learn',{
  entity:'spell_fire_08',kind:'spell',source:entry.id,
 },true,'certified_read');
 assert.equal(learned.document.state.spells.spell_fire_08.source.id,entry.id);
});

for(const spell of spells) test(`${spell.name}：购买、失败成本、重试学会与零熟练施法`,async()=>{
 const {document,run}=setup();
 // A previously certified character; certification acquisition is exercised
 // above. No spell or spell skill is injected into this document.
 document.state.professions.combat='profession_mage';
 const entry=entries.find(row=>row.id===sources.mappings.find(row=>row.spell===spell.id).book);
 const acquired=await buy(run,document,entry,spell.id);
 assert.equal(acquired.document.state.spells[spell.id],undefined);
 assert.equal(acquired.document.state.skills[spell.skill],undefined);
 const args={entity:spell.id,kind:'spell',source:entry.id};
 const failed=await outcome(run,acquired.document,'world_learn',args,false,`${spell.id}_fail`);
 assert.equal(failed.document.state.minute,acquired.document.state.minute+entry.book.readingMinutes);
 assert.equal(failed.document.state.player.coins,acquired.document.state.player.coins);
 assert.equal(failed.document.state.npcs[entry.stock.owner].coins,acquired.document.state.npcs[entry.stock.owner].coins);
 assert.equal(failed.document.state.spells[spell.id],undefined);
 assert.equal(failed.document.state.skills[spell.skill],undefined);
 assert.equal(quantity(failed.document.state.inventory[entry.id]),1);
 assert.equal(failed.document.state.learning[failed.eventId].success,false);
 assert.equal(failed.document.state.learning[failed.eventId].cost,0);
 assert.equal(failed.document.state.player.coins,document.state.player.coins-acquired.result.cost);
 const learned=await outcome(run,failed.document,'world_learn',args,true,`${spell.id}_learn`);
 assert.equal(learned.document.state.minute,failed.document.state.minute+entry.book.readingMinutes);
 assert.deepEqual(learned.document.state.spells[spell.id].source,{
  type:'book',id:entry.id,author:entry.book.author,edition:entry.book.edition,
 });
 assert.equal(learned.document.state.skills[spell.skill].proficiency,0);
 assert.equal(quantity(learned.document.state.inventory[entry.id]),1);
 await assert.rejects(run(learned.document,'world_learn',args,`${spell.id}_repeat`),/已经学会/);
 const casting=(await run(learned.document,'world_move',{destination:'loc_hw_dock'},`${spell.id}_dock`)).document;
 casting.state.weather.loc_hw_dock={humidityPercent:70};
 for(const material of spell.materials)casting.state.inventory[material.item]={quantity:material.amount};
 let target='player';
 if(spell.mechanism==='dry') {casting.state.inventory.item_clothes.moisture=70;target='item_clothes';}
 if(spell.mechanism==='repair_metal') {
  const metal=world.items.find(row=>row.tags?.includes('metal')&&row.durability>20);
  target=metal.id;casting.state.inventory[target]={quantity:1,durability:10,maxDurability:metal.durability};
  casting.state.inventory.item_iron={quantity:1};casting.state.inventory.item_resin={quantity:1};
 }
 const targets={condense:'feature_hw_cup',clean_water:'feature_hw_pool',sense_water:'feature_hw_pool',
  irrigate:'feature_hw_channel',clear_silt:'feature_hw_channel',soil_water:'feature_hw_plot'};
 target=targets[spell.mechanism]??target;
 if(spell.school==='精神') casting.state.records.permit={category:'authorization',action:'mental_magic',
  subject:'player',grantor:'npc_hw_gucen',location:casting.state.location,expires:casting.state.minute+100};
 const cast=await outcome(run,casting,'world_cast',{spell:spell.id,target,
  ...(spell.school==='精神'?{permit:'permit'}:{}),
 },true,`${spell.id}_cast`);
 assert.equal(cast.document.state.minute,casting.state.minute+spell.minutes);
 assert.equal(cast.document.state.player.mp,casting.state.player.mp-spell.mp);
 switch(spell.mechanism) {
  case 'dry':assert.equal(cast.document.state.inventory[target].moisture,0);break;
  case 'repair_metal':assert.equal(cast.document.state.inventory[target].durability,30);
   assert.equal(quantity(cast.document.state.inventory.item_iron),0);
   assert.equal(quantity(cast.document.state.inventory.item_resin),0);break;
  case 'damage_fire':assert.ok(cast.result.damage>0);break;
  case 'condense':assert.equal(cast.result.condensedMl,35);break;
  case 'clean_water':{
   const pool=world.locations.flatMap(row=>row.features??[]).find(row=>row.id==='feature_hw_pool').state;
   const cleaned=cast.document.state.records['physical_feature:feature_hw_pool'].state;
   assert.equal(cleaned.turbidity,Math.max(0,pool.turbidity-40));
   assert.equal(cleaned.toxinUg,pool.toxinUg);break;
  }
  case 'sense_water':assert.equal(cast.result.observation.salinityPpt,.2);break;
  case 'clear_silt':assert.equal(cast.document.state.records['physical_feature:feature_hw_channel'].state.loosenedSiltGrams,2000);break;
  case 'irrigate':case 'soil_water':assert.ok(cast.document.state.records['physical_feature:feature_hw_plot'].state.waterMl>0);break;
  case 'servant':assert.ok(Object.values(cast.document.state.effects).some(row=>row.summonType==='water_cup'));break;
  default:assert.ok(Object.values(cast.document.state.effects).some(row=>row.status===spell.effectSpec.status));
 }
});

test('书籍取得和学习拒绝保持账本；售罄和损坏库存不补货',async()=>{
 const {document,run}=setup(),entry=entries[0];
 const arrived=(await run(document,'world_move',{destination:entry.origin},'bounds_arrive')).document;
 const noMoney=structuredClone(arrived);noMoney.state.player.coins=0;
 const saved=structuredClone(noMoney);
 await assert.rejects(run(noMoney,'world_trade',{seller:entry.stock.owner,item:entry.id,quantity:1},'no_money'),/不足/);
 assert.deepEqual(noMoney,saved);
 const absent=structuredClone(arrived);absent.state.location='loc_hw_dock';
 await assert.rejects(run(absent,'world_trade',{seller:entry.stock.owner,item:entry.id,quantity:1},'absent'),/不在场/);
 const night=(await run(arrived,'world_time',{until:{dayOffset:0,hour:22},activity:'休息'},'night')).document;
 night.state.location=entry.origin;
 await assert.rejects(run(night,'world_trade',{seller:entry.stock.owner,item:entry.id,quantity:1},'closed'),/不提供|不在场/);
 const purchased=await run(arrived,'world_trade',{seller:entry.stock.owner,item:entry.id,quantity:2},'all_stock');
 assert.equal(quantity(purchased.document.state.npcs[entry.stock.owner].inventory[entry.id]),0);
 await assert.rejects(run(purchased.document,'world_trade',{seller:entry.stock.owner,item:entry.id,quantity:1},'sold_out'),/库存不足/);
 const args={entity:'spell_water_01',kind:'spell',source:entry.id};
 const low=structuredClone(purchased.document);low.state.skills.skill_literacy.proficiency=99;
 await assert.rejects(run(low,'world_learn',args,'illiterate'),/识字/);
 const damaged=structuredClone(purchased.document);damaged.state.inventory[entry.id].durability=0;
 await assert.rejects(run(damaged,'world_learn',args,'damaged'),/损坏/);
 await assert.rejects(run(arrived,'world_learn',args,'not_owned'),/没有这本书/);
 const wrong={...args,entity:'spell_fire_08'};
 const certified=structuredClone(purchased.document);certified.state.professions.combat='profession_mage';
 await assert.rejects(run(certified,'world_learn',wrong,'wrong_book'),/没有所需学习内容/);
 const middle=await buy(run,document,entries[1],'uncertified');
 await assert.rejects(run(middle.document,'world_learn',{...wrong,source:entries[1].id},'no_certification'),/认证/);
 const stockWorld=structuredClone(world),seller=stockWorld.npcs.find(row=>row.id===entry.stock.owner);
 seller.inventory[entry.id]=0;seller.inventory[entries[1].id]={quantity:1,durability:0};
 const repeated=withReuseLearningCandidates(stockWorld).npcs.find(row=>row.id===seller.id);
 assert.deepEqual(repeated.inventory,seller.inventory);
});
