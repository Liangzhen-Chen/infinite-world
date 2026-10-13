import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {planWorldUpgrade}from'../server-plugin/world-upgrade.mjs';
import {planBossMigration}from'../server-plugin/boss-migration.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {readBossCognition}from'../server-plugin/boss-cognition.mjs';

const baseline=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const person='npc_hw_linsui',market='site_ms_market',council='site_ms_council',home='bld_hw_qingdeng',bossId='boss_ms_leader',lairKey='lair:lair_ms_market';
function fixture(){
 const world=structuredClone(baseline),npc=world.npcs.find(n=>n.id===person),boss=structuredClone(world.bosses.find(b=>b.intelligence>0));
 Object.assign(boss,{id:bossId,name:'测试非人首领',aliases:[],actor:person,lair:market,minions:[],cognition:{goal:'avoid_conflict',territory:[market]},negotiation:{stock:[{item:'item_ration',quantity:100}],accepts:['item_ration']},
  residence:{id:'lair_ms_market',name:'测试社会首领驻地',location:market}});
 world.bosses.push(boss);
 Object.assign(npc,{species:boss.monster,society:'loc_hw',settlement:'loc_hw',location:market,coins:37,inventory:{item_ration:2}});
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
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'monster-society-'));
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
