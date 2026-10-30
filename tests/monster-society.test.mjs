import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {planWorldUpgrade}from'../server-plugin/world-upgrade.mjs';
import {planBossMigration}from'../server-plugin/boss-migration.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {readBossCognition}from'../server-plugin/boss-cognition.mjs';
import {validateSites}from'../server-plugin/sites.mjs';

const baseline=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const person='npc_hw_linsui',market='site_ms_market',council='site_ms_council',home='bld_hw_qingdeng',bossId='boss_ms_leader',lairKey='lair:lair_ms_market';
function fixture(){
 const world=structuredClone(baseline),npc=world.npcs.find(n=>n.id===person),boss=structuredClone(world.bosses.find(b=>b.intelligence>0));
 Object.assign(boss,{id:bossId,name:'测试非人首领',aliases:[],actor:person,lair:market,minions:[],cognition:{goal:'avoid_conflict',territory:[market]},negotiation:{stock:[{item:'item_ration',quantity:100}],accepts:['item_ration']},
  residence:{id:'lair_ms_market',name:'测试社会首领驻地',location:market}});
 world.bosses.push(boss);
 // S5-02: household120 satiety retains four existing stew portions, leaving both examined rations for trade.
 Object.assign(npc,{species:boss.monster,society:'loc_hw',settlement:'loc_hw',location:market,coins:37,inventory:{item_ration:2,item_mutton_turnip_stew:4}});
 const slots=[{start:0,end:720,location:market,activity:'摊位接待',services:['trade']},{start:720,end:1440,location:home,activity:'睡眠',services:[]}];
 npc.schedule={default:slots,market:slots,rest:slots,restDays:[],seasonal:{}};
 for(const [id,access]of [[market,{mode:'public'}],[council,{mode:'council',requiresConsent:true,authority:person}]]){
  world.locations.push({id,name:id===market?'测试共市':'测试议事室',aliases:[],parent:'loc_hw',scope:'loc_hw',coordinates:[0,0],terrain:'平原',owner:person,
   access,site:{owner:person,manager:person,occupants:id===market?[person,bossId]:[],entryMechanisms:[],mechanisms:[],clues:[],resources:[],truths:[]}});
  world.routes.push({id:`route_ms_${id}`,from:'loc_hw',to:id,lengthKm:0,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0});
 }
 world.locations.find(l=>l.id===home).access={mode:'private',requiresConsent:true,residents:[person]};
 const rumor={id:'rumor_ms_test',claim:'测试共市准备修缮雨棚。',source:person,carriers:[person],witnesses:[person]};
 world.rumors=[...world.rumors??[],rumor];
 const engine=new WorldEngine(world);let document=engine.createCharacter(seed,{},'monster-society');
 document.state.location='loc_hw';document.state.minute=600;
 document.state.player.coins=1000;
 document.state.player.hp=document.state.player.maxHp=100000;
 document.state.npcs[person].location=market;
 document=applyPatches(document,planBossMigration(document,world.rules,world.bosses,world));
 const run=async(doc,tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result};};
 return{world,npc,boss,engine,document,run,rumor};
}
const move=(f,d,destination,args={})=>f.run(d,'world_move',{destination,...args},`move_${destination}`);
const enter=(f,d,args={})=>f.run(d,'world_site',{operation:'enter',...args},'site_enter');
const negotiate=(f,d,args={},id='agreement')=>f.run(d,'world_lair',{operation:'negotiate',lair:'lair_ms_market',pact:'nonaggression',...args},id);

test('物种、社会归属和身体引用通过实际世界校验，坏引用和野怪补刷被拒绝',()=>{
 const f=fixture(),valid=validateWorld(f.world);assert.equal(valid.ok,true,valid.errors.join('\n'));
 f.boss.name=f.npc.name;
 assert.equal(validateWorld(f.world).ok,true);
 const shared=new WorldEngine(f.world);assert.equal(shared.resolve(f.npc.name),person);assert.equal(shared.resolve(bossId,'npc'),person);
 for(const mutate of [w=>w.npcs.find(n=>n.id===person).species='monster_missing',w=>w.npcs.find(n=>n.id===person).society='loc_missing',
  w=>w.bosses.at(-1).actor=w.residents[0].id,w=>w.bosses.at(-1).residence.replacementSpecies=[w.monsters[0].id],
  w=>w.locations.find(l=>l.id===council).access.authority=w.residents[0].id]){
  const bad=structuredClone(f.world);mutate(bad);assert.equal(validateWorld(bad).ok,false);
 }
});

test('进入公共住区后看到按作息接待的成员，同一库存用于交易与议和',async()=>{
 const f=fixture();let d=(await move(f,f.document,market)).document;
 const inside=await enter(f,d);d=inside.document;assert.equal(inside.result.entered,true);assert.ok(inside.result.occupants.includes(person));
 assert.match(f.engine.scene(d),/摊位接待/);
 assert.equal(d.state.creatures?.[bossId],undefined);assert.equal(f.engine.resolve(bossId),person);
 const talk=await f.run(d,'world_remember',{subject:'player',source:person,key:f.rumor.id,rumor:f.rumor.id,content:f.rumor.claim},'talk');d=talk.document;
 assert.equal(talk.result.source,person);
 const coins=d.state.npcs[person].coins,playerCoins=d.state.player.coins;
 const trade=await f.run(d,'world_trade',{seller:bossId,item:'item_ration',quantity:1},'buy');d=trade.document;
 // E6排除私人行囊后公开S2、货架需求D14；clamp(14/2)=3，基准3×3×首笔其他因子1=9铜。
 assert.equal(trade.result.cost,9);
 assert.equal(d.state.npcs[person].inventory.item_ration.quantity,1);assert.ok(d.state.npcs[person].coins>coins);assert.ok(d.state.player.coins<playerCoins);
 const agreement=await negotiate(f,d,{offer:[{item:'item_ration',quantity:1}]});d=agreement.document;
 assert.equal(agreement.result.accepted,true);assert.equal(f.engine.quantity({get:(...p)=>p.reduce((v,k)=>v?.[k],d)},person,'item_ration'),2);
 assert.deepEqual(d.state.npcs[person].negotiation.inventory,{});assert.equal(readBossCognition(d.state.npcs[person]).encounters.length,0);
 const tooMuch=await negotiate(f,d,{request:[{item:'item_ration',quantity:3}]},'stock-short');assert.equal(tooMuch.result.accepted,false);
 assert.match(tooMuch.result.reason,/库存不足/);
 const late=(await f.run(d,'world_time',{minutes:130},'close')).document;
 assert.equal(late.state.npcs[person].location,home);
 await assert.rejects(f.run(late,'world_trade',{seller:person,item:'item_ration',quantity:1},'closed'),/不在场/);
 assert.equal(late.state.records[lairKey].reoccupyAfter,null);
});

test('议事区与私巢分别签发许可，公共通行和议和均不授权私巢，过期撤销及同行边界保持',async()=>{
 const f=fixture();let d=(await move(f,f.document,market)).document;d=(await enter(f,d)).document;
 d=(await negotiate(f,d)).document;
 const before=structuredClone(d);
 await assert.rejects(move(f,d,council),/许可/);await assert.rejects(move(f,d,home),/许可/);assert.deepEqual(d,before);
 const grant=await f.run(d,'world_promise',{operation:'grant_access',promisor:person,location:council,content:'进入议事室商谈',minutes:60},'council_grant');
 const authorized=(await move(f,grant.document,council,{authorization:grant.result.authorization})).document;
 assert.equal((await enter(f,authorized,{authorization:grant.result.authorization})).result.entered,true);
 await assert.rejects(move(f,grant.document,home,{authorization:grant.result.authorization}),/许可/);
 const homeGrant=await f.run(grant.document,'world_promise',{operation:'grant_access',promisor:person,location:home,content:'拜访住处',minutes:60},'home_grant');
 assert.equal((await move(f,homeGrant.document,home,{authorization:homeGrant.result.authorization})).document.state.location,home);
 const expired=structuredClone(homeGrant.document);expired.state.minute+=60;
 await assert.rejects(move(f,expired,home,{authorization:homeGrant.result.authorization}),/许可/);
 const revoke=await f.run(homeGrant.document,'world_promise',{operation:'revoke_access',promisor:person,authorization:homeGrant.result.authorization},'revoke');
 await assert.rejects(move(f,revoke.document,home,{authorization:homeGrant.result.authorization}),/许可/);
 const guests=structuredClone(homeGrant.document);guests.state.player.companions=['npc_hw_zhouyan'];
 await assert.rejects(move(f,guests,home,{authorization:homeGrant.result.authorization}),/同行者/);
});

test('首领受伤和死亡同时影响接触、交谈、交易和巢穴，离开回来不补刷居民',async()=>{
 const f=fixture();let d=(await move(f,f.document,market)).document;
 const originalPopulation=structuredClone(d.state.records['ecology:habitat_hw_wood']);
 d.state.npcs[person].hp=d.state.npcs[person].maxHp*.1;
 const observed=await f.run(d,'world_lair',{lair:'lair_ms_market',operation:'observe'},'hurt');assert.equal(observed.result.occupant.cognition.attitude,'退守');
 const hp=d.state.npcs[person].hp;
 d.state.player.attributes=Object.fromEntries(f.engine.rules.attributes.map(k=>[k,10000]));d.state.player.level=200;
 for(let i=0;i<20&&d.state.npcs[person].status!=='死亡';i++)d=(await f.run(d,'world_combat',{target:bossId},`combat_${i}`)).document;
 assert.ok(d.state.npcs[person].hp<hp);assert.equal(d.state.npcs[person].status,'死亡');assert.equal(d.state.npcs[person].hp,0);
 assert.equal(d.state.creatures?.[bossId],undefined);assert.equal(d.state.records[lairKey].occupant,null);
 assert.ok(readBossCognition(d.state.npcs[person]).encounters.some(e=>e.kind==='clash'));
 await assert.rejects(negotiate(f,d),/清醒/);await assert.rejects(f.run(d,'world_trade',{seller:person,item:'item_ration',quantity:1},'dead_trade'),/清醒/);
 await assert.rejects(f.run(d,'world_remember',{subject:'player',source:person,key:f.rumor.id,rumor:f.rumor.id,content:f.rumor.claim},'dead_talk'),/清醒/);
 const next=(await f.run(d,'world_time',{minutes:20*1440},'dead_wait')).document;
 assert.equal(next.state.npcs[person].status,'死亡');assert.equal(next.state.records[lairKey].reoccupyAfter,null);
 assert.equal(Object.values(next.state.creatures??{}).some(a=>a.lair==='lair_ms_market'),false);
 const withdrawn=row=>Object.fromEntries(Object.entries(row.populations).map(([id,p])=>[id,p.withdrawn]));
 assert.deepEqual(withdrawn(originalPopulation),withdrawn(next.state.records['ecology:habitat_hw_wood']));
 const living=fixture();let away=(await move(living,living.document,market)).document;
 away.state.npcs[person].location=home;
 for(const variant of ['default','market','rest'])living.npc.schedule[variant]=[{start:0,end:1440,location:home,activity:'休息',services:[]}];
 const noContact=await living.run(away,'world_lair',{operation:'approach',lair:'lair_ms_market'},'away');assert.equal(noContact.result.contact,null);
 noContact.document.state.npcs[person].location=market;
 for(const variant of ['default','market','rest'])living.npc.schedule[variant]=[{start:0,end:1440,location:market,activity:'接待',services:['trade']}];
 const back=await living.run(noContact.document,'world_lair',{operation:'approach',lair:'lair_ms_market'},'back');assert.equal(back.result.contact.id,person);
 assert.equal(back.document.state.creatures?.[bossId],undefined);
});

test('显式升级和重启保留同一身体、售空库存及认知，不重复给钱物',async()=>{
 const f=fixture(),old=new WorldEngine(baseline).createCharacter(seed,{},'upgrade');
 old.state.npcs[person].coins=9;old.state.npcs[person].inventory={item_ration:0};old.state.npcs[person].location=market;
 const upgrade=planWorldUpgrade(old,baseline,f.world,{worldHash:'society',eventId:'one'});let d=applyPatches(old,upgrade.patches);
 assert.equal(d.state.npcs[person].coins,9);assert.equal(d.state.npcs[person].inventory.item_ration,0);
 d.state.npcs[person].hp=7;d.state.npcs[person].cognition={blurred:{},reflections:[]};
 const next=applyPatches(d,planWorldUpgrade(d,f.world,f.world,{worldHash:'society',eventId:'two'}).patches);
 assert.equal(next.state.npcs[person].hp,7);assert.equal(next.state.npcs[person].inventory.item_ration,0);assert.deepEqual(next.state.npcs[person].cognition,d.state.npcs[person].cognition);
 const root=await fs.mkdtemp(path.join(tmpRoot(),'monster-society-'));
 try{
  const storage=new CampaignStorage(root);await storage.create({id:'society',worldVersion:next.worldVersion,document:next});const restored=(await new CampaignStorage(root).load('society')).document;
  assert.equal(restored.state.npcs[person].hp,7);assert.equal(restored.state.creatures?.[bossId],undefined);
  assert.deepEqual(planBossMigration(restored,f.world.rules,f.world.bosses,f.world),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('旧野生首领转居民时移动已有身体和库存，死亡与旧历史保留，冲突拒绝覆盖',()=>{
 const f=fixture(),old=structuredClone(f.document);
 old.state.creatures??={};old.state.creatures[bossId]={name:'旧首领',hp:0,maxHp:900,status:'死亡',location:market,owner:null,
  cognition:{format:1,encounters:[]},negotiation:{format:1,inventory:{item_ration:{quantity:1}},relation:null,history:[]},battleMemory:{tactics:{unarmed:2},lastEvent:'old'}};
 delete old.state.npcs[person].hp;delete old.state.npcs[person].maxHp;
 const before=structuredClone(old),next=applyPatches(old,planBossMigration(old,f.world.rules,f.world.bosses,f.world));assert.deepEqual(old,before);
 assert.equal(next.state.creatures[bossId],undefined);assert.equal(next.state.npcs[person].hp,0);assert.equal(next.state.npcs[person].status,'死亡');
 assert.equal(next.state.npcs[person].inventory.item_ration.quantity,1);assert.deepEqual(next.state.npcs[person].negotiation.inventory,{});
 assert.equal(next.state.records[lairKey].reoccupyAfter,null);assert.deepEqual(next.memories,old.memories);
 assert.deepEqual(planBossMigration(next,f.world.rules,f.world.bosses,f.world),[]);
 const conflict=structuredClone(before);conflict.state.npcs[person].hp=1;
 assert.throws(()=>planBossMigration(conflict,f.world.rules,f.world.bosses,f.world),/冲突的身体/);
});

// T158: per-target stance, separate agreements, infiltration and message travel.
const seatId='loc_ms_test',store='site_ms_store',guardId='npc_hw_baihui',elderId='npc_hw_fanrong',villager='npc_hw_shijin',DAY=1440;
function society({clocks}={}){
 const world=structuredClone(baseline),boss=structuredClone(world.bosses.find(b=>b.intelligence>0));
 Object.assign(boss,{id:bossId,name:'测试窟主',aliases:[],actor:person,lair:market,minions:[],cognition:{goal:'avoid_conflict',territory:[market,store]},
  negotiation:{stock:[{item:'item_ration',quantity:100}],accepts:['item_ration']},residence:{id:'lair_ms_market',name:'测试社会首领驻地',location:market}});
 world.bosses.push(boss);
 world.locations.push({id:seatId,name:'测试地宫',aliases:[],parent:'loc_hw',scope:'loc_hw',coordinates:[3,0],terrain:'丘陵',
  monsterSociety:{leader:bossId,neighbors:{loc_hw:'中立'},meetingPlace:market,motions:[{id:'raid',name:'是否出窟抢粮'}]}});
 world.routes.push({id:'route_ms_seat',from:'loc_hw',to:seatId,lengthKm:3,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0});
 const site=(id,name,extra)=>({id,name,aliases:[],parent:seatId,scope:'loc_hw',coordinates:[3,0],terrain:'丘陵',owner:person,...extra});
 world.locations.push(site(market,'测试共市',{access:{mode:'public'},site:{owner:person,manager:person,occupants:[person,bossId],entryMechanisms:[],mechanisms:[],clues:[],resources:[],truths:[]}}),
  site(store,'测试仓窟',{site:{owner:person,manager:person,occupants:[guardId],entryMechanisms:[],mechanisms:[],resources:[{id:'grain',name:'窟粮',item:'item_ration',quantity:5,minutes:5}],
   clues:[{id:'ledger',name:'刻痕账',text:'仓窟刻痕记着三袋粮来自河湾。',minutes:10}],truths:[],infiltration:{minutes:30,check:{attribute:'敏捷',difficulty:15},damage:5}}}),
  site(council,'测试议事室',{access:{mode:'council',requiresConsent:true,authority:person},site:{owner:person,manager:person,occupants:[],entryMechanisms:[],mechanisms:[],clues:[],resources:[],truths:[]}}));
 for(const id of [market,store,council])world.routes.push({id:`route_ms_${id}`,from:seatId,to:id,lengthKm:0,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0});
 const member=(id,location,activity,services=[])=>{const npc=world.npcs.find(n=>n.id===id),slots=[{start:0,end:1440,location,activity,services}];
  Object.assign(npc,{species:boss.monster,society:seatId,settlement:seatId,location,schedule:{default:slots,market:slots,rest:slots,restDays:[],seasonal:{}}});return npc;};
 Object.assign(member(person,market,'摊位接待',['trade']),{coins:37,inventory:{item_ration:20}});
 member(guardId,store,'看守仓窟');member(elderId,market,'晒菌');
 if(clocks)world.rules.factionClock={version:1,clocks};
 for(const id of ['faction_saltboat','faction_riverhomes'])Object.assign(world.factions.find(f=>f.id===id).resources,{treasuryCopper:100,items:{}});
 const engine=new WorldEngine(world);let document=engine.createCharacter(seed,{},'monster-society-t158');
 Object.assign(document.state,{location:seatId,minute:600});Object.assign(document.state.player,{coins:1000,hp:100,maxHp:100});
 document.state.inventory.item_ration={quantity:20};
 for(const [id,loc]of [[person,market],[guardId,store],[elderId,market]])document.state.npcs[id].location=loc;
 document=applyPatches(document,planBossMigration(document,world.rules,world.bosses,world));
 const run=async(doc,tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result};};
 return{world,engine,document,run};
}
const stance=(f,doc,holder,target='player')=>doc.state.records[`stance:${holder}:${target}`]?.stance;
const receipts=(doc,kind)=>Object.values(doc.state.records).filter(r=>r.category==='society_receipt'&&r.kind===kind);
const at=async(f,doc,place)=>(await f.run(doc,'world_move',{destination:place},`go_${place}_${doc.state.minute}`)).document;
const pact=(f,doc,args,id)=>f.run(doc,'world_field',{operation:'lair_negotiate',lair:'lair_ms_market',pact:'nonaggression',...args},id);
const sneak=(f,doc,id)=>f.run(doc,'world_field',{operation:'site_infiltrate'},id);
const waitFor=async(f,doc,minutes,id)=>(await f.run(doc,'world_time',{minutes},id)).document;

test('通行朝贡只覆盖首领辖区与库存，按期交付守约改善态度并经消息传到邻村',async()=>{
 const f=society();assert.deepEqual(validateSites(f.world),[]);
 let d=await at(f,f.document,market);
 await assert.rejects(pact(f,d,{term:'passage',days:5,location:council},'own_council'),/私宅与议事区|辖区/);
 await assert.rejects(pact(f,d,{term:'passage',days:5,location:'loc_hw'},'other_land'),/只能承诺其辖区/);
 await assert.rejects(pact(f,d,{term:'tribute',days:5,offer:[{item:'item_ration',quantity:1}],request:[{item:'item_ration',quantity:1}]},'tribute_back'),/朝贡/);
 const short=await pact(f,d,{term:'trade',days:20,offer:[{item:'item_ration',quantity:1}],request:[{item:'item_oats',quantity:500}]},'no_stock');
 assert.equal(short.result.accepted,false);assert.equal(short.result.agreement,null);assert.match(short.result.reason,/库存不足/);
 const signed=await pact(f,d,{term:'tribute',days:15,offer:[{item:'item_ration',quantity:2}]},'tribute');d=signed.document;
 const key=signed.result.agreement,row=d.state.records[key];
 assert.equal(row.kind,'tribute');assert.deepEqual(row.locations,[market,store]);assert.equal(row.nextDue,row.signedAt+10*DAY);
 assert.equal(stance(f,d,seatId),undefined,'立约不覆盖态度枚举');
 assert.equal(d.state.npcs[person].inventory.item_ration.quantity,22);
 const view=await f.run(d,'world_field',{operation:'lair_observe',lair:'lair_ms_market'},'look');
 assert.equal(view.result.occupant.cognition.society.stance,'戒备');assert.equal(view.result.occupant.cognition.society.agreements[0].id,key);
 const inStore=await f.run(await at(f,d,store),'world_field',{operation:'site_enter'},'enter_store');
 assert.equal(inStore.result.entered,true,'朝贡通行覆盖首领辖区的仓窟');
 await assert.rejects(f.run(inStore.document,'world_field',{operation:'site_gather',target:'grain'},'take'),/许可|物权|发现/);
 d=await at(f,inStore.document,market);
 const kept=await pact(f,d,{contract:key},'pay_1');d=kept.document;
 assert.equal(kept.result.kept,true);assert.equal(stance(f,d,seatId),'中立');assert.equal(d.state.records[key].nextDue,null);
 assert.equal(receipts(d,'agreement_kept').length,1);assert.equal(receipts(d,'agreement_kept')[0].agreement,key);
 const news=d.state.records['society_news:pay_1:loc_hw'];assert.equal(news.act,'aid');assert.ok(news.arrivesAt>d.state.minute);
 d=await waitFor(f,d,16*DAY,'term_end');
 assert.equal(d.state.records[key].status,'到期');assert.equal(d.state.records['society_news:pay_1:loc_hw'].status,'已送达');
 assert.equal(stance(f,d,'loc_hw'),undefined,'中立村收到守约消息仍为中立');
});

test('背约：逾期未交朝贡记为玩家背约，态度转敌对，成员拒绝交易与立约，回执可供除妖委托使用',async()=>{
 const f=society();let d=await at(f,f.document,market);
 const signed=await pact(f,d,{term:'tribute',days:30,offer:[{item:'item_ration',quantity:1}]},'tribute');d=signed.document;const key=signed.result.agreement;
 d=await waitFor(f,d,10*DAY+5,'skip');
 const row=d.state.records[key];assert.equal(row.status,'背约');assert.equal(row.breachedBy,'player');
 assert.equal(stance(f,d,seatId),'敌对');assert.equal(d.state.npcs[person].negotiation?.relation??null,null);
 const breached=receipts(d,'agreement_breached');assert.equal(breached.length,1);assert.equal(breached[0].society,seatId);assert.equal(breached[0].stance.after,'敌对');
 assert.equal(d.state.records[`society_news:${key}:due:${row.signedAt+10*DAY}:loc_hw`].act,'harm');
 await assert.rejects(f.run(d,'world_trade',{seller:person,item:'item_ration',quantity:1},'buy'),/敌对/);
 await assert.rejects(pact(f,d,{term:'passage',days:3},'again'),/敌对/);
 await assert.rejects(f.run(d,'world_field',{operation:'site_enter'},'enter'),/敌对/);
});

test('未被发现的潜入耗时并实际检定，只开放调查；未登记据点与私宅不能潜入',async()=>{
 const f=society();let d=await at(f,f.document,store);
 await assert.rejects(f.run(d,'world_field',{operation:'site_enter'},'plain'),/占据者|许可/);
 d.state.player.attributes=Object.fromEntries(f.engine.rules.attributes.map(k=>[k,1000]));
 let out;for(const id of ['quiet_a','quiet_b','quiet_c','quiet_d']){out=await sneak(f,d,id);if(out.result.covert)break;}
 assert.equal(out.result.covert,true);assert.equal(out.result.detected,false);assert.equal(out.result.check.opponent.npc,guardId);
 assert.equal(out.document.state.minute,d.state.minute+30);assert.equal(stance(f,out.document,seatId),undefined);
 assert.equal(receipts(out.document,'infiltration')[0].detected,false);
 const clue=await f.run(out.document,'world_field',{operation:'site_investigate',target:'ledger'},'read_ledger');assert.equal(clue.result.discovered,true);
 await assert.rejects(f.run(clue.document,'world_field',{operation:'site_gather',target:'grain'},'steal'),/许可|物权/);
 const home=await at(f,f.document,market);await assert.rejects(sneak(f,home,'not_registered'),/登记可潜入/);
 const bad=structuredClone(f.world);Object.assign(bad.locations.find(l=>l.id===council).site,{infiltration:{minutes:10,check:{attribute:'敏捷',difficulty:15}}});
 assert.match(validateSites(bad).join(),/私宅与议事区不能登记为可潜入/);
 const loose=structuredClone(f.world);loose.locations.find(l=>l.id===seatId).monsterSociety.neighbors.loc_hw='友好';assert.match(validateSites(loose).join(),/初始态度无效/);
});

test('被发现：戒备时驱逐并转敌对，敌对时交锋受伤；交锋成员与消息传播令邻村转敌对后拒绝交易',async()=>{
 const f=society();let d=await at(f,f.document,store);
 d.state.player.attributes.敏捷=1;
 let out;for(const id of ['loud_a','loud_b','loud_c','loud_d']){out=await sneak(f,d,id);if(out.result.detected)break;}
 assert.equal(out.result.detected,true);assert.equal(out.result.response,'驱逐');assert.equal(out.result.expelled,seatId);
 d=out.document;assert.equal(d.state.location,seatId);assert.equal(stance(f,d,seatId),'敌对');
 assert.equal(d.state.records.site_presence,undefined);
 const news=Object.values(d.state.records).find(r=>r.category==='society_news'&&r.to==='loc_hw');
 assert.equal(news.status,'在途');assert.equal(stance(f,d,'loc_hw'),undefined,'消息未到前邻村不知情');
 d=await at(f,d,store);
 for(const id of ['again_a','again_b','again_c','again_d']){out=await sneak(f,d,id);if(out.result.detected)break;}
 assert.equal(out.result.response,'交锋');assert.equal(out.result.damage,5);assert.equal(out.document.state.player.hp,d.state.player.hp-5);
 d=await at(f,out.document,store);d.state.player.attributes=Object.fromEntries(f.engine.rules.attributes.map(k=>[k,30]));
 d=(await f.run(d,'world_combat',{target:guardId},'hit_guard')).document;
 assert.equal(receipts(d,'clash')[0].target,guardId);
 d=await waitFor(f,d,DAY,'news_travel');
 assert.equal(stance(f,d,'loc_hw'),'敌对','伤害本村友邻的消息逐条传到后转敌对');
 Object.assign(d.state,{location:'loc_hw'});Object.assign(d.state.npcs[villager],{location:'loc_hw',inventory:{item_ration:3},status:'正常',activity:'闲坐'});
 await assert.rejects(f.run(d,'world_trade',{seller:villager,item:'item_ration',quantity:1},'village_buy'),/本村已对你敌对/);
});

test('内部议事沿用提议与意见动作，闭合记录推动势力时钟；第三方村镇行为经消息传到后改变关系',async()=>{
 const motion=`society_motion:${seatId}:raid`;
 const clocks=[{id:'ms_raid',faction:'faction_saltboat',settlement:seatId,source:'test',intervalDays:1,probability:1,
   stages:[{id:'raid',name:'出窟抢粮',condition:{kind:'record',id:motion,field:'status',equals:'通过'},effect:{kind:'society_news',target:'loc_hw',act:'harm'}}]},
  {id:'hw_dam',faction:'faction_riverhomes',settlement:'loc_hw',source:'test',intervalDays:1,probability:1,
   stages:[{id:'dam',name:'封堵风井',condition:{kind:'always'},effect:{kind:'society_news',target:seatId,act:'harm'}}]}];
 const f=society({clocks});let d=await at(f,f.document,market);
 const gov=(args,id)=>f.run(d,'world_settlement',{settlement:seatId,...args},id);
 await assert.rejects(gov({operation:'governance_propose',issue:'unknown'},'bad'),/议题/);
 d=(await gov({operation:'governance_propose',issue:'raid'},'propose')).document;
 await assert.rejects(gov({operation:'governance_opinion',proposal:motion,speaker:guardId,opinion:'approve',content:'去'},'absent'),/在场/);
 d=(await gov({operation:'governance_opinion',proposal:motion,speaker:elderId,opinion:'approve',content:'粮不够过冬'},'elder')).document;
 await assert.rejects(gov({operation:'governance_close',proposal:motion,authority:elderId},'not_leader'),/首领/);
 d=(await gov({operation:'governance_close',proposal:motion,authority:person},'close')).document;
 assert.equal(d.state.records[motion].status,'通过');
 d=await waitFor(f,d,2*DAY,'clock_days');
 const event=Object.values(d.state.records).find(r=>r.category==='faction_event'&&r.stage==='raid');assert.ok(event);
 assert.equal(d.state.records[`society_news:${event.sourceEvent}:loc_hw`].status,'已送达');
 assert.equal(stance(f,d,'loc_hw',seatId),'戒备','邻村得知抢粮后对聚居地转戒备');
 const dam=Object.values(d.state.records).find(r=>r.category==='faction_event'&&r.stage==='dam');
 const heard=d.state.records[`society_news:${dam.sourceEvent}:${seatId}`];assert.ok(heard.arrivesAt>dam.minute);assert.equal(heard.status,'已送达');
 assert.equal(stance(f,d,seatId,'loc_hw'),'戒备','第三方村镇行为经消息到达后改变聚居地对它的态度');
 assert.equal(stance(f,d,seatId),undefined,'玩家未参与时聚居地对玩家态度不变');
});
