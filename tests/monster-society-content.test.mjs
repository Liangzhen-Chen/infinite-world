// T157: 炭阶地宫与苔灯坞的正式内容。只按本批 ID 核对，不写死全世界人数或地点数。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {validateNpcDepth} from '../tools/npc-profile-validation.mjs';
import {validatePopulation} from '../tools/population-validation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {validateMonsterSocieties} from '../server-plugin/monster-society.mjs';
import {populationTemplate,populationBasis} from '../server-plugin/population.mjs';
import {buildBatch,ids,people,settlements,places,households} from '../world/design/monster-society-1.mjs';
import {FILES,withoutMonsterSociety} from '../tools/publish-monster-society.mjs';

const {TJ,TD,tj,td,P}=ids,batch=buildBatch(),formal=await loadWorld();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440;
const byId=(w,key,id)=>w[key].find(r=>r.id===id);

function fixture(world=formal){
 const engine=new WorldEngine(world);let document=engine.createCharacter(seed,{},'t157-content');
 document=applyPatches(document,planBossMigration(document,world.rules,world.bosses,world));
 Object.assign(document.state.player,{coins:1000,hp:500,maxHp:500});
 document.state.inventory.item_salt={quantity:20};document.state.inventory.item_oats={quantity:20};
 const run=async(doc,tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result};};
 return{world,engine,document,run};
}
// Put the player and every named body where their schedule places them at `minute`.
async function at(f,doc,location,minute){
 const d=structuredClone(doc);d.state.minute=minute;
 for(const n of f.world.npcs.filter(n=>n.society)){const slot=n.schedule.default.find(s=>s.start<=minute%DAY&&minute%DAY<s.end);Object.assign(d.state.npcs[n.id],{location:slot.location,activity:slot.activity});}
 const parent=f.world.locations.find(l=>l.id===location).parent;d.state.location=parent&&f.world.locations.some(l=>l.id===parent)?parent:location;
 if(d.state.location===location)return d;
 return(await f.run(d,'world_move',{destination:location},`go_${location}_${minute}`)).document;
}

test('正式目录已发布本批，且与设计骨架逐条一致；发布构建零错',()=>{
 for(const [,key]of FILES)for(const row of batch[key])assert.deepEqual(byId(formal,key,row.id),row,`${key}/${row.id}`);
 const release=validateWorld(formal,{stage:'release'});assert.deepEqual(release.errors,[]);
 assert.deepEqual(validateMonsterSocieties(formal),[]);
});

test('两处路线可达：炭阶距白石镇约四公里，苔灯坞距河湾约三公里，内部设施均可步行抵达',()=>{
 const engine=new WorldEngine(formal);
 for(const s of settlements){
  const route=engine.route(s.parent,s.id,'walk',600,'t157');
  const km=route.edges.reduce((n,id)=>n+formal.routes.find(r=>r.id===id).lengthKm,0);
  assert.ok(Math.abs(km-s.expectedKm)<0.6,`${s.id}: ${km}`);
  assert.ok(route.minutes>0);
  for(const p of places.filter(p=>p.settlement===s.id&&p.kind!=='seat'))assert.ok(engine.route(s.parent,p.id,'walk',600,'t157').minutes>0,p.id);
 }
});

test('每处12名具名成员：4名完整档承担首领、祭司或长老、生产负责人与持不同主张者，深度审计无缺口',()=>{
 const depth=validateNpcDepth(formal),mine=new Set(people.map(p=>p.id));
 assert.deepEqual(depth.issues.filter(i=>mine.has(i.id)),[]);
 for(const s of settlements){
  const named=people.filter(p=>p.settlement===s.id),full=named.filter(p=>p.tier==='full');
  assert.equal(named.length,12);assert.equal(full.length,4);
  assert.deepEqual(full.map(p=>p.role).sort(),(s.id===TJ?['窟主','炉祭','菌床管事','持不同主张者']:['坞主','长老','药圃管事','持不同主张者']).sort());
  for(const p of full){const n=byId(formal,'npcs',p.id);assert.equal(n.tier,'full');assert.equal(n.species,s.species);assert.equal(n.society,s.id);}
  for(const p of named.filter(p=>p.tier!=='full')){const r=byId(formal,'residents',p.id);assert.equal(r.tier,'roster');assert.equal(r.society,s.id);}
  const minors=named.filter(p=>p.age<18);assert.ok(minors.length>=1);
  for(const p of minors){const r=byId(formal,'residents',p.id);assert.equal(r.flags.minor,true);assert.equal(r.flags.romanceable,false);assert.doesNotMatch(JSON.stringify(r),/恋|情人|婚|亲吻|结缘/);}
  const boss=formal.bosses.find(b=>b.id===s.society.leader);assert.equal(byId(formal,'npcs',boss.actor).role,full.find(p=>['窟主','坞主'].includes(p.role)).role);
 }
});

test('户巢、住区与设施：每处2–3个住区、4–6项公共设施、至少两组内部立场，私宅住户与户籍一致',()=>{
 for(const s of settlements){
  const mine=places.filter(p=>p.settlement===s.id);
  const districts=mine.filter(p=>p.kind==='district'),facilities=mine.filter(p=>p.kind==='facility');
  assert.ok(districts.length>=2&&districts.length<=3);assert.ok(facilities.length>=4&&facilities.length<=6);
  for(const p of facilities)assert.equal(byId(formal,'locations',p.id).access.mode,'public');
  const seat=byId(formal,'locations',s.id).monsterSociety;assert.ok(seat.positions.length>=2);
  for(const pos of seat.positions)for(const id of pos.members)assert.equal([...formal.npcs,...formal.residents].find(n=>n.id===id)?.society,s.id);
  assert.ok(seat.motions.length>=2);
  for(const h of households.filter(h=>h.settlement===s.id)){
   const home=byId(formal,'locations',h.homeLocation);assert.equal(home.access.mode,'private');assert.deepEqual(home.access.residents,h.members);
   assert.ok(districts.some(d=>d.id===home.parent));
  }
 }
});

test('待生成人口与具名成员分开：登记12名，余数按种子配额生成，生成者不占具名编号',async()=>{
 assert.deepEqual(validatePopulation(formal),[]);
 for(const s of settlements){
  const profile=formal.settlementProfiles.find(p=>p.id===s.id);
  assert.equal(profile.registrationMode,'seeded-on-demand');assert.equal(profile.registeredPopulation,12);assert.equal(profile.residentIds.length,12);
  assert.equal(profile.registeredPopulation+profile.pendingPopulation,s.population);
  const template=populationTemplate(formal,s.id);assert.deepEqual(Object.keys(template.composition),[s.species]);
  assert.deepEqual(populationBasis(formal,s.id).pendingPopulation,profile.pendingPopulation);
  const f=fixture(),district=places.find(p=>p.settlement===s.id&&p.kind==='district').id;
  const d=await at(f,f.document,district,600);
  const record=d.state.population[s.id];assert.ok(record.districts[district].people>0);
  assert.equal(record.remaining.population,profile.pendingPopulation-record.districts[district].people);
  const created=Object.values(d.state.created).filter(e=>e.settlement===s.id);
  assert.equal(created.length,record.districts[district].people);
  for(const e of created){assert.match(e.id,/^npc_pop_/);assert.equal(e.species,s.species);assert.equal(e.culture,s.culture);assert.ok(!profile.residentIds.includes(e.id));}
  assert.ok(!created.some(e=>people.some(p=>p.name===e.name)),'生成者不重用具名成员姓名');
 }
});

test('白石镇近郊进入炭阶：黄昏后与换粮台的烟苔做有限库存交易，公共洞室可通行，私铺与议事窟要许可',async()=>{
 const f=fixture();let d=await at(f,f.document,tj.stair,18*60+30);
 assert.match(f.engine.scene(d),/烟苔/);
 const stock=d.state.npcs[P.yantai].inventory.item_dry_mushroom.quantity??d.state.npcs[P.yantai].inventory.item_dry_mushroom;
 const buy=await f.run(d,'world_trade',{seller:P.yantai,item:'item_dry_mushroom',quantity:2},'buy_mushroom');d=buy.document;
 assert.equal(d.state.inventory.item_dry_mushroom.quantity,2);assert.equal(d.state.npcs[P.yantai].inventory.item_dry_mushroom.quantity,stock-2);
 await assert.rejects(f.run(d,'world_trade',{seller:P.yantai,item:'item_dry_mushroom',quantity:stock},'too_many'),/库存|不足|没有/);
 for(const place of [tj.hearth,tj.fungus,tj.shaft,tj.forge,tj.yan])d=(await f.run(d,'world_move',{destination:place},`walk_${place}`)).document;
 assert.equal(d.state.location,tj.yan);
 await assert.rejects(f.run(d,'world_move',{destination:tj.home1},'home'),/许可/);
 await assert.rejects(f.run(d,'world_move',{destination:tj.council},'council'),/许可/);
 const sleeping=await at(f,f.document,tj.stair,10*60);
 await assert.rejects(f.run(sleeping,'world_trade',{seller:P.yantai,item:'item_dry_mushroom',quantity:1},'day_trade'),/不在场|不提供|清醒/);
});

test('河湾北林进入苔灯坞：天黑后与换盐石的青芷交易，共食庭可通行，家巢与长老树洞要许可',async()=>{
 const f=fixture();let d=await at(f,f.document,td.saltstone,19*60);
 const before=d.state.npcs[P.qingzhi].inventory.item_herb.quantity??d.state.npcs[P.qingzhi].inventory.item_herb;
 d=(await f.run(d,'world_trade',{seller:P.qingzhi,item:'item_herb',quantity:3},'buy_herb')).document;
 assert.equal(d.state.npcs[P.qingzhi].inventory.item_herb.quantity,before-3);
 for(const place of [td.commons,td.garden,td.ropes,td.lampground,td.tai])d=(await f.run(d,'world_move',{destination:place},`walk_${place}`)).document;
 await assert.rejects(f.run(d,'world_move',{destination:td.home1},'nest'),/许可/);
 await assert.rejects(f.run(d,'world_move',{destination:td.council},'council'),/许可/);
});

test('立约：两位首领在各自座处立通行约，覆盖辖区公共处而不含私宅与议事区',async()=>{
 for(const [seatPlace,lair,leader]of [[tj.hearth,'lair_ms_tanjie',P.yanzhen],[td.commons,'lair_ms_taideng',P.liheng]]){
  const f=fixture();const d=await at(f,f.document,seatPlace,20*60);
  const signed=await f.run(d,'world_lair',{operation:'negotiate',lair,pact:'nonaggression',term:'passage',days:10},`pass_${lair}`);
  assert.equal(signed.result.accepted,true,JSON.stringify(signed.result));const row=signed.document.state.records[signed.result.agreement];
  assert.equal(row.kind,'passage');assert.equal(row.leader,leader);
  for(const id of row.locations)assert.ok(!['private','council'].includes(byId(formal,'locations',id).access?.mode),id);
  assert.ok(!row.locations.includes(td.trapcache));
 }
});

test('潜入：仓窟与收夹洞登记为可潜入，成功后能读到线索，被发现会改变聚居地态度',async()=>{
 for(const [site,clue]of [[tj.store,'tj_store_drag'],[td.trapcache,'td_hurt_rope']]){
  const place=byId(formal,'locations',site);assert.ok(place.site.infiltration);assert.ok(!place.access);
  const f=fixture();let d=await at(f,f.document,site,10*60);
  d.state.player.attributes=Object.fromEntries(f.engine.rules.attributes.map(k=>[k,1000]));
  let out;for(const id of ['a','b','c','d']){out=await f.run(d,'world_field',{operation:'site_infiltrate'},`sneak_${site}_${id}`);if(out.result.covert)break;}
  assert.equal(out.result.covert,true);
  const read=await f.run(out.document,'world_field',{operation:'site_investigate',target:clue},'read');assert.equal(read.result.discovered,true);
 }
 const f=fixture();let d=await at(f,f.document,tj.store,2*60);d.state.player.attributes.敏捷=1;
 let out;for(const id of ['a','b','c','d']){out=await f.run(d,'world_field',{operation:'site_infiltrate'},`loud_${id}`);if(out.result.detected)break;}
 assert.equal(out.result.detected,true);assert.equal(out.result.watcher,P.yantai);
 assert.equal(out.document.state.records[`stance:${TJ}:player`].stance,'敌对');
});

test('内部立场可在议事处提出并由首领闭合',async()=>{
 const f=fixture();let d=await at(f,f.document,tj.hearth,30);
 const grant=await f.run(d,'world_promise',{operation:'grant_access',promisor:P.yanzhen,location:tj.council,content:'进议事窟旁听夜议',minutes:60},'grant');
 d=(await f.run(grant.document,'world_move',{destination:tj.council,authorization:grant.result.authorization},'enter_council')).document;
 d.state.minute=70;for(const id of [P.yanzhen,P.dingying,P.liya])Object.assign(d.state.npcs[id],{location:tj.council,activity:'议事窟夜议'});
 const gov=(args,id)=>f.run(d,'world_settlement',{settlement:TJ,...args},id);
 d=(await gov({operation:'governance_propose',issue:'grain_pact'},'propose')).document;
 const key=`society_motion:${TJ}:grain_pact`;
 d=(await gov({operation:'governance_opinion',proposal:key,speaker:P.dingying,opinion:'approve',content:'先立粮约'},'o1')).document;
 d=(await gov({operation:'governance_opinion',proposal:key,speaker:P.liya,opinion:'reject',content:'换得太贱'},'o2')).document;
 d=(await gov({operation:'governance_opinion',proposal:key,speaker:P.yanzhen,opinion:'approve',content:'照刻痕交付'},'o3')).document;
 d=(await gov({operation:'governance_close',proposal:key,authority:P.yanzhen},'close')).document;
 assert.equal(d.state.records[key].status,'通过');
});

test('world_upgrade：旧存档升级后加入两处居民与首领身体，原有变化保留',()=>{
 const old=withoutMonsterSociety(formal);assert.ok(!old.locations.some(l=>l.id===TJ));
 const engine=new WorldEngine(old);let doc=engine.createCharacter(seed,{},'t157-upgrade');
 const villager=Object.keys(doc.state.npcs)[0];doc.state.npcs[villager].coins=777;doc.state.player.coins=321;
 const upgrade=planWorldUpgrade(doc,old,formal,{worldHash:'t157',eventId:'t157-upgrade'});let next=applyPatches(doc,upgrade.patches);
 next=applyPatches(next,planBossMigration(next,formal.rules,formal.bosses,formal));
 assert.equal(next.state.npcs[villager].coins,777);assert.equal(next.state.player.coins,321);
 for(const p of people.filter(p=>p.tier==='full')){assert.ok(next.state.npcs[p.id],p.id);}
 assert.equal(next.state.npcs[P.yantai].inventory.item_dry_mushroom.quantity??next.state.npcs[P.yantai].inventory.item_dry_mushroom,20);
 assert.equal(next.state.npcs[P.yanzhen].boss,'boss_ms_tanjie');assert.equal(next.state.npcs[P.liheng].boss,'boss_ms_taideng');
 const again=planWorldUpgrade(next,formal,formal,{worldHash:'t157',eventId:'t157-upgrade-2'});assert.equal(applyPatches(next,again.patches).state.npcs[P.yantai].inventory.item_dry_mushroom.quantity??20,20);
});

test('发布入口只认已过L1/L2/L4的稿件，重发零写入',async()=>{
 const {readMonsterSocietyPublication}=await import('../tools/monster-society-content.mjs');
 const {publishMonsterSociety}=await import('../tools/publish-monster-society.mjs');
 const approved=await readMonsterSocietyPublication();assert.deepEqual(approved,batch);
 const again=await publishMonsterSociety();assert.deepEqual(again.changed,[]);assert.equal(again.validation.ok,true);
});

// T159：榆根里、裂炉营与四处聚居地组织的议题时钟。
import './monster-society-content-t159.mjs';
