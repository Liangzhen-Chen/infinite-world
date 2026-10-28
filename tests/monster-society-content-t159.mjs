// T159: 榆根里与裂炉营的正式内容（由 monster-society-content.test.mjs 载入运行），以及四处聚居地组织的议题时钟。只按本批 ID 核对，
// 不写死全世界人数、地点数或势力数。
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
import {populationTemplate} from '../server-plugin/population.mjs';
import {publicLore} from '../server-plugin/lore.mjs';
import {buildBatch,ids,people,settlements,places,organizations} from '../world/design/monster-society-2.mjs';
import {ids as t157ids,buildBatch as buildT157} from '../world/design/monster-society-1.mjs';
import {FILES,withoutMonsterSociety2} from '../tools/publish-monster-society-2.mjs';

const {YG,LL,yg,ll,P}=ids,batch=buildBatch(),DAY=1440;
const formal=await loadWorld();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const byId=(w,key,id)=>w[key].find(r=>r.id===id);

function fixture(world=formal,randomSeed='t159-content'){
 const engine=new WorldEngine(world);let document=engine.createCharacter(seed,{},randomSeed);
 document=applyPatches(document,planBossMigration(document,world.rules,world.bosses,world));
 Object.assign(document.state.player,{coins:1000,hp:500,maxHp:500});
 // W8C 负重：四样各 40 份共 40.8 公斤，已超出安全负重 40 公斤；燕麦（0.5 公斤/份）减为 20 份，合计 30.8 公斤，仍远多于各用例换出的数量。
 for(const item of ['item_salt','item_oats','item_ration','item_fish'])document.state.inventory[item]={quantity:item==='item_oats'?20:40};
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
// Let real time pass to the next given minute of day, then walk there.
async function goTo(f,d,location,minuteOfDay,id){
 const wait=((minuteOfDay-d.state.minute%DAY)+DAY)%DAY||DAY;
 d=(await f.run(d,'world_time',{minutes:wait},`wait_${id}`)).document;
 return d.state.location===location?d:(await f.run(d,'world_move',{destination:location},`go_${id}`)).document;
}
const qty=(d,id,item)=>{const v=id==='player'?d.state.inventory[item]:d.state.npcs[id].inventory[item];return typeof v==='number'?v:v?.quantity??0;};
// Enter a settlement's meeting place with the authority's grant and seat the scheduled members.
async function council(f,{grantAt,authority,meeting,minute,present,settlement}){
 let d=await at(f,f.document,grantAt,minute-15);
 const grant=await f.run(d,'world_promise',{operation:'grant_access',promisor:authority,location:meeting,content:'进议事处旁听议事',minutes:120},`grant_${meeting}`);
 d=(await f.run(grant.document,'world_move',{destination:meeting,authorization:grant.result.authorization},`enter_${meeting}`)).document;
 d.state.minute=minute;for(const id of present)Object.assign(d.state.npcs[id],{location:meeting,activity:'议事'});
 const gov=async(doc,args,id)=>(await f.run(doc,'world_settlement',{settlement,...args},id));
 return{d,gov};
}
// A member speaks against its position only when the player's persuasion succeeds.
async function persuade(gov,d,proposal,speaker,opinion,content){
 for(const k of ['a','b','c','d','e','f','g','h']){const out=await gov(d,{operation:'governance_opinion',proposal,speaker,opinion,content},`persuade_${speaker}_${k}`);
  if(out.result.opinion.opinion===opinion)return out;}
 throw Error('说服未成功');
}

test('正式目录已发布本批与四处组织，T157聚居地只追加立场结构；发布构建零错',()=>{
 for(const [,key]of FILES)for(const row of batch[key])assert.deepEqual(byId(formal,key,row.id),row,`${key}/${row.id}`);
 for(const row of buildT157().locations.filter(l=>l.monsterSociety))assert.deepEqual(byId(formal,'locations',row.id),row);
 assert.deepEqual(validateWorld(formal,{stage:'release'}).errors,[]);
 assert.deepEqual(validateMonsterSocieties(formal),[]);
});

test('两处路线可达：榆根里距榆坡约五公里，裂炉营距砾泉约六公里，内部设施均可步行抵达',()=>{
 const engine=new WorldEngine(formal);
 for(const s of settlements){
  const route=engine.route(s.parent,s.id,'walk',600,'t159');
  const km=route.edges.reduce((n,id)=>n+formal.routes.find(r=>r.id===id).lengthKm,0);
  assert.ok(Math.abs(km-s.expectedKm)<0.6,`${s.id}: ${km}`);
  for(const p of places.filter(p=>p.settlement===s.id&&p.kind!=='seat'))assert.ok(engine.route(s.parent,p.id,'walk',600,'t159').minutes>0,p.id);
 }
});

test('每处12名具名成员：4名完整档承担首领、长老、生产负责人与持不同主张者；幼体不服劳役',()=>{
 const depth=validateNpcDepth(formal),mine=new Set(people.map(p=>p.id));
 assert.deepEqual(depth.issues.filter(i=>mine.has(i.id)),[]);
 const roles={[YG]:['林主','长老','排水头','持不同主张者'],[LL]:['营头','炉老','工匠头','持不同主张者']};
 for(const s of settlements){
  const named=people.filter(p=>p.settlement===s.id),full=named.filter(p=>p.tier==='full');
  assert.equal(named.length,12);assert.equal(full.length,4);assert.deepEqual(full.map(p=>p.role).sort(),[...roles[s.id]].sort());
  for(const p of full){const n=byId(formal,'npcs',p.id);assert.equal(n.tier,'full');assert.equal(n.species,p.species);assert.equal(n.society,s.id);}
  for(const p of named.filter(p=>p.tier!=='full')){const r=byId(formal,'residents',p.id);assert.equal(r.tier,'roster');assert.equal(r.society,s.id);}
  assert.deepEqual(new Set(named.map(p=>p.species)),new Set(Object.keys(s.pendingSpeciesStructure)));
  const minors=named.filter(p=>p.age<18);assert.ok(minors.length>=2);
  for(const p of minors){const r=byId(formal,'residents',p.id);assert.equal(r.flags.minor,true);assert.equal(r.flags.romanceable,false);
   assert.doesNotMatch(r.occupation,/挖|搬|下矿|劳役|守/);assert.doesNotMatch(JSON.stringify(r),/恋|情人|婚|亲吻/);}
  const boss=formal.bosses.find(b=>b.id===s.society.leader);assert.equal(byId(formal,'npcs',boss.actor).role,roles[s.id][0]);
 }
});

test('混居物种配额与资源来源：按物种生成到各自住区，族号字随物种；成员库存与组织公账都有登记来源',async()=>{
 assert.deepEqual(validatePopulation(formal),[]);
 for(const s of settlements){
  const profile=formal.settlementProfiles.find(p=>p.id===s.id);
  assert.equal(profile.registeredPopulation+profile.pendingPopulation,s.population);assert.equal(profile.registeredPopulation,12);
  const template=populationTemplate(formal,s.id);assert.deepEqual(Object.keys(template.composition).sort(),Object.keys(s.pendingSpeciesStructure).sort());
  const f=fixture();let d=f.document;
  for(const [species,g]of Object.entries(s.pendingSpeciesStructure))d=await at(f,d,g.districts[0],600);
  const created=Object.values(d.state.created).filter(e=>e.settlement===s.id);
  assert.equal(created.length,profile.pendingPopulation);assert.equal(d.state.population[s.id].remaining.population,0);
  for(const [species,g]of Object.entries(s.pendingSpeciesStructure)){
   const mine=created.filter(e=>e.species===species),named=people.filter(p=>p.settlement===s.id&&p.species===species);
   assert.equal(mine.length,g.population,species);
   assert.equal(new Set(mine.map(e=>e.householdId)).size,g.households,species);
   assert.ok(mine.every(e=>g.districts.includes(e.home.district)),species);
   const clan=new Set(named.map(p=>[...p.name][0]));assert.ok(mine.every(e=>clan.has([...e.name][0])),`${species}族号字`);
   const ages=mine.reduce((a,e)=>{a[e.age<18?'children':e.age<35?'youngAdults':e.age<60?'adults':'elders']++;return a;},{children:0,youngAdults:0,adults:0,elders:0});
   assert.deepEqual(ages,g.ageStructure,species);
  }
  const supplies=byId(formal,'locations',s.id).monsterSociety.supplies,org=organizations.find(o=>o.settlement===s.id);
  for(const p of people.filter(p=>p.settlement===s.id&&p.tier==='full'))for(const item of Object.keys(p.inventory))assert.ok(supplies.some(r=>r.item===item),`${p.id}/${item}`);
  for(const item of Object.keys(org.items))assert.ok(supplies.some(r=>r.item===item),`公账${item}`);
  for(const r of supplies)assert.ok(r.species?Object.hasOwn(s.pendingSpeciesStructure,r.species):Object.hasOwn(s.society.neighbors,r.from),r.item);
 }
});

test('榆坡附近进入榆根里：白天与节苍换林产，夜里与须晓换铲柄；通行约覆盖公共处，私宅与议根洞要许可',async()=>{
 const f=fixture();let d=await at(f,f.document,yg.gate,600);
 assert.match(f.engine.scene(d),/节苍/);
 const before=qty(d,P.jiecang,'item_hazelnut');
 d=(await f.run(d,'world_trade',{seller:P.jiecang,item:'item_hazelnut',quantity:2},'buy_nut')).document;
 assert.equal(qty(d,'player','item_hazelnut'),2);assert.equal(qty(d,P.jiecang,'item_hazelnut'),before-2);
 const signed=await f.run(d,'world_lair',{operation:'negotiate',lair:'lair_ms_yugen',pact:'nonaggression',term:'passage',days:10},'yg_pass');
 assert.equal(signed.result.accepted,true,JSON.stringify(signed.result));
 for(const id of signed.document.state.records[signed.result.agreement].locations)assert.ok(!['private','council'].includes(byId(formal,'locations',id).access?.mode),id);
 for(const place of [yg.nursery,yg.shed,yg.ditch,yg.crown])d=(await f.run(d,'world_move',{destination:place},`walk_${place}`)).document;
 await assert.rejects(f.run(d,'world_move',{destination:yg.home1},'home'),/许可/);
 await assert.rejects(f.run(d,'world_move',{destination:yg.council},'council'),/许可/);
 let n=await at(f,f.document,yg.shed,22*60);
 n=(await f.run(n,'world_trade',{seller:P.xuxiao,item:'item_tool_handle',quantity:1},'buy_handle')).document;
 assert.equal(qty(n,'player','item_tool_handle'),1);
 const asleep=await at(f,f.document,yg.gate,22*60);
 await assert.rejects(f.run(asleep,'world_trade',{seller:P.jiecang,item:'item_hazelnut',quantity:1},'night_nut'),/不在场|不提供|清醒/);
});

test('砾泉矿道支路进入裂炉营：夜里与锉针换铁钉，白天可与营头立通行约，矿口卸石场可通行',async()=>{
 const f=fixture();let d=await at(f,f.document,ll.shop,22*60);
 const nails=qty(d,P.cuozhen,'item_iron_nail');
 d=(await f.run(d,'world_trade',{seller:P.cuozhen,item:'item_iron_nail',quantity:5},'buy_nail')).document;
 assert.equal(qty(d,P.cuozhen,'item_iron_nail'),nails-5);
 let day=await at(f,f.document,ll.forge,13*60);
 const pass=await f.run(day,'world_lair',{operation:'negotiate',lair:'lair_ms_lielu',pact:'nonaggression',term:'passage',days:10},'ll_pass');
 assert.equal(pass.result.accepted,true,JSON.stringify(pass.result));day=pass.document;
 for(const place of [ll.adit,ll.yard,ll.tents,ll.huts])day=(await f.run(day,'world_move',{destination:place},`walk_${place}`)).document;
 await assert.rejects(f.run(day,'world_move',{destination:ll.council},'council'),/许可/);
});

test('立约读取内部立场：守贡派营头不立贸易约；朝贡约记下工匠派反对；议事通过改贡后贸易可立、朝贡不再立',async()=>{
 const f=fixture();let d=await at(f,f.document,ll.forge,13*60);
 const trade={operation:'negotiate',lair:'lair_ms_lielu',pact:'nonaggression',term:'trade',days:20,offer:[{item:'item_ration',quantity:4}],request:[{item:'item_stone',quantity:2}]};
 await assert.rejects(f.run(d,'world_lair',trade,'trade_refused'),/守贡派.*纳贡改为按件贸易/);
 const tribute=await f.run(d,'world_lair',{operation:'negotiate',lair:'lair_ms_lielu',pact:'nonaggression',term:'tribute',days:20,offer:[{item:'item_ration',quantity:2}]},'tribute');
 assert.equal(tribute.result.accepted,true);assert.deepEqual(tribute.result.opposedBy,['工匠派']);
 assert.deepEqual(tribute.document.state.records[tribute.result.agreement].positions,{support:['keep_tribute'],oppose:['craft_trade']});
 // 榆根里：林主所属护林派赞成伐界，贸易可立，共议派的反对被记下。
 const y=await at(f,f.document,yg.gate,600);
 const yt=await f.run(y,'world_lair',{operation:'negotiate',lair:'lair_ms_yugen',pact:'nonaggression',term:'trade',days:20,offer:[{item:'item_fish',quantity:4}],request:[{item:'item_walnut',quantity:1}]},'yg_trade');
 assert.equal(yt.result.accepted,true,JSON.stringify(yt.result));assert.deepEqual(yt.result.opposedBy,['共议派']);
 // 通过改贡以后
 const c=await council(f,{grantAt:ll.forge,authority:P.yayue,meeting:ll.council,minute:1210,present:[P.yayue,P.yajin,P.cuozhen],settlement:LL});
 let m=c.d;m.state.player.attributes.魅力=1000;
 const key=`society_motion:${LL}:tribute_to_trade`;
 m=(await c.gov(m,{operation:'governance_propose',issue:'tribute_to_trade'},'propose')).document;
 m=(await persuade(c.gov,m,key,P.yajin,'approve','首火的事另说，粮按件换也行')).document;
 m=(await c.gov(m,{operation:'governance_close',proposal:key,authority:P.yayue},'close')).document;
 assert.equal(m.state.records[key].status,'通过');
 const back=await at(f,m,ll.forge,DAY+13*60);
 const ok=await f.run(back,'world_lair',trade,'trade_after');assert.equal(ok.result.accepted,true,JSON.stringify(ok.result));
 await assert.rejects(f.run(back,'world_lair',{operation:'negotiate',lair:'lair_ms_lielu',pact:'nonaggression',term:'tribute',days:20,offer:[{item:'item_ration',quantity:2}]},'tribute_after'),/议事已通过/);
});

test('议事读取内部立场：未发言的在场成员按所属立场计票，违背立场须说服，失败时仍按原立场表态',async()=>{
 const f=fixture();
 const c=await council(f,{grantAt:yg.nursery,authority:P.jieyin,meeting:yg.council,minute:1090,present:[P.jiecang,P.jieyin],settlement:YG});
 let d=c.d;const key=`society_motion:${YG}:shared_allocation`;
 const inspect=(await c.gov(d,{operation:'governance_inspect'},'inspect')).result;
 assert.deepEqual(inspect.positions.map(p=>[p.id,p.stances.shared_allocation]),[['keep_grove','reject'],['shared_council','approve']]);
 assert.equal(inspect.organization.privateGoal,organizations.find(o=>o.id==='faction_ms_yugen')&&formal.factions.find(x=>x.id==='faction_ms_yugen').privateGoal);
 d=(await c.gov(d,{operation:'governance_propose',issue:'shared_allocation'},'propose')).document;
 d.state.player.attributes.魅力=1;
 const failed=await c.gov(d,{operation:'governance_opinion',proposal:key,speaker:P.jieyin,opinion:'approve',content:'让他们进来'},'weak');
 assert.equal(failed.result.opinion.opinion,'reject');assert.equal(failed.result.opinion.heldPosition.asked,'approve');
 const closed=await c.gov(failed.document,{operation:'governance_close',proposal:key,authority:P.jiecang},'close');
 const row=closed.document.state.records[key];
 assert.equal(row.status,'否决');assert.ok(row.opinions.some(o=>o.speaker===P.jiecang&&o.implicit&&o.opinion==='reject'));
});

test('议题经势力时钟推进：裂炉营通过改贡则粮按工落到工匠头、砾泉转缓；否决则粮归营头；每段都扣组织公账',async()=>{
 const outcome=async(passed)=>{
  const f=fixture();const c=await council(f,{grantAt:ll.forge,authority:P.yayue,meeting:ll.council,minute:1210,present:[P.yayue,P.yajin,P.cuozhen],settlement:LL});
  let d=c.d;d.state.player.attributes.魅力=1000;const key=`society_motion:${LL}:tribute_to_trade`;
  d=(await c.gov(d,{operation:'governance_propose',issue:'tribute_to_trade'},'propose')).document;
  if(passed)d=(await persuade(c.gov,d,key,P.yajin,'approve','按件换也行')).document;
  d=(await c.gov(d,{operation:'governance_close',proposal:key,authority:P.yayue},'close')).document;
  assert.equal(d.state.records[key].status,passed?'通过':'否决');
  const before={cuozhen:qty(d,P.cuozhen,'item_ration'),yayue:qty(d,P.yayue,'item_ration')};
  d=(await f.run(d,'world_time',{minutes:4*DAY},'wait')).document;
  const clock=d.state.records['faction-clock:clock_ms_lielu'],assets=d.state.records['faction-assets:faction_ms_lielu'],issue=d.state.records[`society_issue:${LL}:tribute`];
  assert.equal(clock.phase,3);assert.equal(issue.status,'照议定落实一期');assert.equal(issue.decidedBy,key);
  return{d,before,assets,issue};
 };
 const yes=await outcome(true),no=await outcome(false);
 assert.equal(yes.issue.outcome,'改贡为按件贸易');assert.equal(no.issue.outcome,'照旧纳贡换通行');
 assert.equal(qty(yes.d,P.cuozhen,'item_ration'),yes.before.cuozhen+6);assert.equal(qty(no.d,P.yayue,'item_ration'),no.before.yayue+6);
 assert.equal(yes.assets.items.item_iron,6);assert.equal(no.assets.items.item_iron,10);
 assert.equal(yes.assets.items.item_ration,24-2-6);assert.equal(yes.assets.items.item_stone,40-4-6);
 assert.equal(yes.d.state.records[`stance:loc_bs_liquan:${LL}`]?.stance,'中立');assert.equal(no.d.state.records[`stance:loc_bs_liquan:${LL}`],undefined);
 assert.ok(yes.assets.ledger.some(e=>e.kind==='issue_outcome'&&e.outcome==='改贡为按件贸易'));
});

test('两地方案后果不同：榆根里同议则林产分给排水头与修具者，否决则留林主且泡坏一份；公账不足时玩家供资才推进，调停可暂缓',async()=>{
 const run=async(passed,tweak)=>{
  const f=fixture();const c=await council(f,{grantAt:yg.nursery,authority:P.jieyin,meeting:yg.council,minute:1090,present:[P.jiecang,P.jieyin],settlement:YG});
  let d=c.d;d.state.player.attributes.魅力=1000;const key=`society_motion:${YG}:shared_allocation`;
  d=(await c.gov(d,{operation:'governance_propose',issue:'shared_allocation'},'propose')).document;
  if(passed){d=(await persuade(c.gov,d,key,P.jieyin,'approve','沟是他们挖的')).document;d=(await persuade(c.gov,d,key,P.jiecang,'approve','刻上同议')).document;}
  d=(await c.gov(d,{operation:'governance_close',proposal:key,authority:P.jiecang},'close')).document;
  if(tweak)d=await tweak(f,d);
  const before={gonghou:qty(d,P.gonghou,'item_hazelnut'),xuxiao:qty(d,P.xuxiao,'item_walnut'),jiecang:qty(d,P.jiecang,'item_hazelnut')};
  d=(await f.run(d,'world_time',{minutes:4*DAY},'wait')).document;
  return{f,d,before,issue:d.state.records[`society_issue:${YG}:forest_share`],assets:d.state.records['faction-assets:faction_ms_yugen'],clock:d.state.records['faction-clock:clock_ms_yugen']};
 };
 const yes=await run(true),no=await run(false);
 assert.equal(yes.issue.outcome,'树穴地窟同议分份');assert.equal(no.issue.outcome,'仍由木精按树分份');
 assert.equal(qty(yes.d,P.gonghou,'item_hazelnut'),yes.before.gonghou+6);assert.equal(qty(yes.d,P.xuxiao,'item_walnut'),yes.before.xuxiao+4);
 assert.equal(qty(no.d,P.jiecang,'item_hazelnut'),no.before.jiecang+6);
 assert.equal(yes.assets.items.item_hazelnut,30-4-6);assert.equal(no.assets.items.item_hazelnut,30-4-6-6);
 assert.equal(yes.assets.items.item_wood,12-4-2);assert.equal(no.assets.items.item_wood,12-2);
 // 公账榛仁不足：决议阶段卡住，玩家在根门向林主供资后次日推进。
 const short=await run(true,async(f,d)=>{d=(await f.run(d,'world_time',{minutes:DAY+60},'open')).document;
  const a=d.state.records['faction-assets:faction_ms_yugen'];d.state.records['faction-assets:faction_ms_yugen']={...a,items:{...a.items,item_hazelnut:3}};return d;});
 assert.equal(short.clock.phase,1);assert.match(short.clock.blocked??'',/不足/);
 let g=await goTo(short.f,short.d,yg.gate,600,'give');g.state.inventory.item_hazelnut={quantity:20};
 g=(await short.f.run(g,'world_settlement',{operation:'faction_contribute',clock:'clock_ms_yugen',item:'item_hazelnut',quantity:12},'give')).document;
 g=(await short.f.run(g,'world_time',{minutes:2*DAY},'after_give')).document;
 assert.equal(g.state.records['faction-clock:clock_ms_yugen'].phase,3);
 // 调停：决议阶段在根门请林主暂缓，时钟停住。
 const paused=await run(true,async(f,d)=>{
  let p=await goTo(f,d,yg.gate,600,'pause');assert.equal(p.state.records['faction-clock:clock_ms_yugen'].phase,1);p.state.player.attributes.魅力=1000;
  for(const k of ['a','b','c','d']){const out=await f.run(p,'world_settlement',{operation:'faction_intervene',clock:'clock_ms_yugen',choice:'yg_mediate_pause'},`pause_${k}`);if(out.result.success)return out.document;}
  throw Error('调停未成功');});
 assert.equal(paused.clock.paused,true);assert.equal(paused.clock.phase,1);assert.equal(paused.issue.outcome,null);
});

test('T157两处补上组织时钟：炭阶通过粮约则烟苔领铁钉、白石镇转缓；苔灯坞否决追偿则以干果结缘',async()=>{
 const {TJ,TD,tj,td,P:T}=t157ids;
 let f=fixture();let c=await council(f,{grantAt:tj.hearth,authority:T.yanzhen,meeting:tj.council,minute:70,present:[T.yanzhen,T.dingying,T.liya],settlement:TJ});
 let d=c.d;const key=`society_motion:${TJ}:grain_pact`,nails=qty(d,T.yantai,'item_iron_nail');
 d=(await c.gov(d,{operation:'governance_propose',issue:'grain_pact'},'propose')).document;
 d=(await c.gov(d,{operation:'governance_close',proposal:key,authority:T.yanzhen},'close')).document;
 assert.equal(d.state.records[key].status,'通过');
 d=(await f.run(d,'world_time',{minutes:4*DAY},'wait')).document;
 assert.equal(d.state.records[`society_issue:${TJ}:winter_grain`].outcome,'与白石镇谈按旬粮约');
 assert.equal(qty(d,T.yantai,'item_iron_nail'),nails+10);assert.equal(d.state.records[`stance:loc_bs:${TJ}`]?.stance,'中立');
 f=fixture();c=await council(f,{grantAt:td.ropes,authority:T.taimian,meeting:td.council,minute:70,present:[T.taimian,T.liheng,T.lizhen],settlement:TD});
 d=c.d;const tk=`society_motion:${TD}:trap_redress`,herb=qty(d,T.qingzhi,'item_herb');
 d=(await c.gov(d,{operation:'governance_propose',issue:'trap_redress'},'propose')).document;
 d=(await c.gov(d,{operation:'governance_opinion',proposal:tk,speaker:T.liheng,opinion:'reject',content:'先弄清边界石'},'o1')).document;
 d=(await c.gov(d,{operation:'governance_close',proposal:tk,authority:T.liheng},'close')).document;
 assert.equal(d.state.records[tk].status,'否决');
 d=(await f.run(d,'world_time',{minutes:4*DAY},'wait')).document;
 const issue=d.state.records[`society_issue:${TD}:trap_wounds`];assert.equal(issue.outcome,'先结缘再议边界');
 assert.equal(qty(d,T.qingzhi,'item_herb'),herb+4);assert.equal(d.state.records['faction-assets:faction_ms_taideng'].items.item_dried_fruit,20-2-4);
});

test('公开风俗与派系私下目标分开检索：公开设定只给公开目标，私下目标只在议事处可见',async()=>{
 for(const o of organizations){
  const row=byId(formal,'factions',o.id),pub=publicLore(row);
  assert.ok(pub.description.includes(row.publicGoal));assert.ok(!JSON.stringify(pub).includes(row.privateGoal),o.id);
  assert.ok(row.description.includes('私下'));assert.equal(row.descriptionVisibility,'gm_private');
 }
 for(const id of ['culture_ms_yugen','culture_ms_lielu']){const c=publicLore(byId(formal,'cultures',id));assert.match(c.description,/忌/);}
 const f=fixture(),outside=await at(f,f.document,ll.forge,13*60);
 const view=(await f.run(outside,'world_settlement',{settlement:LL,operation:'governance_inspect'},'outside')).result;
 assert.equal(view.organization.publicGoal,byId(formal,'factions','faction_ms_lielu').publicGoal);assert.equal(view.organization.privateGoal,undefined);
 assert.ok(view.positions.every(p=>p.claim&&p.stances));
});

test('world_upgrade：旧存档升级后加入两处居民与首领身体，T157聚居地读到新立场，原有变化保留',()=>{
 const old=withoutMonsterSociety2(formal);assert.ok(!old.locations.some(l=>l.id===YG));
 const engine=new WorldEngine(old);let doc=engine.createCharacter(seed,{},'t159-upgrade');
 const villager=Object.keys(doc.state.npcs)[0];doc.state.npcs[villager].coins=777;doc.state.player.coins=321;
 const upgrade=planWorldUpgrade(doc,old,formal,{worldHash:'t159',eventId:'t159-upgrade'});let next=applyPatches(doc,upgrade.patches);
 next=applyPatches(next,planBossMigration(next,formal.rules,formal.bosses,formal));
 assert.equal(next.state.npcs[villager].coins,777);assert.equal(next.state.player.coins,321);
 for(const p of people.filter(p=>p.tier==='full'))assert.ok(next.state.npcs[p.id],p.id);
 assert.equal(qty(next,P.cuozhen,'item_iron_nail'),30);
 assert.equal(next.state.npcs[P.jiecang].boss,'boss_ms_yugen');assert.equal(next.state.npcs[P.yayue].boss,'boss_ms_lielu');
 const again=planWorldUpgrade(next,formal,formal,{worldHash:'t159',eventId:'t159-upgrade-2'});assert.equal(qty(applyPatches(next,again.patches),P.cuozhen,'item_iron_nail'),30);
});

test('T159发布入口只认已过L1/L2/L4的稿件，重发零写入',async()=>{
 const {readMonsterSociety2Publication}=await import('../tools/monster-society-2-content.mjs');
 const {publishMonsterSociety2}=await import('../tools/publish-monster-society-2.mjs');
 assert.deepEqual(await readMonsterSociety2Publication(),batch);
 const again=await publishMonsterSociety2();assert.deepEqual(again.changed,[]);assert.equal(again.validation.ok,true);
});
