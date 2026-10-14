import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {planBossMigration}from'../server-plugin/boss-migration.mjs';
import {deriveWorldEvents,worldEvents}from'../server-plugin/world-events.mjs';
import {recordSocietyActs,stanceOf,societyReceipts}from'../server-plugin/monster-society.mjs';
import {recordSpiritGrudges}from'../server-plugin/wildlife-society.mjs';
import {readBossCognition,recordBossEvents}from'../server-plugin/boss-cognition.mjs';

const baseline=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const person='npc_hw_linsui',market='site_we_market',bossId='boss_we_leader',seat='loc_we_seat';
const draft=document=>({document,patches:[],get(...k){return k.reduce((o,x)=>o?.[x],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}});

function fixture(){
 const world=structuredClone(baseline),npc=world.npcs.find(n=>n.id===person),boss=structuredClone(world.bosses.find(b=>b.intelligence>0));
 Object.assign(boss,{id:bossId,name:'测试事件首领',aliases:[],actor:person,lair:market,minions:[],cognition:{goal:'avoid_conflict',territory:[market]},negotiation:{stock:[{item:'item_ration',quantity:10}],accepts:['item_ration']},
  residence:{id:'lair_we_market',name:'测试事件驻地',location:market}});
 world.bosses.push(boss);
 Object.assign(npc,{species:boss.monster,society:seat,settlement:'loc_hw',location:market,coins:37,inventory:{item_ration:2}});
 const slots=[{start:0,end:1440,location:market,activity:'摊位接待',services:['trade']}];
 npc.schedule={default:slots,market:slots,rest:slots,restDays:[],seasonal:{}};
 world.locations.push({id:seat,name:'测试事件窟',aliases:[],parent:'loc_hw',scope:'loc_hw',coordinates:[0,0],terrain:'丘陵',monsterSociety:{leader:bossId,neighbors:{},stances:{player:'中立'},meetingPlace:market}});
 world.locations.push({id:market,name:'测试事件集',aliases:[],parent:seat,scope:'loc_hw',coordinates:[0,0],terrain:'平原',owner:person,access:{mode:'public'},
  site:{owner:person,manager:person,occupants:[person,bossId],entryMechanisms:[],mechanisms:[],clues:[],resources:[],truths:[]}});
 world.routes.push({id:'route_we_market',from:'loc_hw',to:market,lengthKm:0,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0});
 const spell={...world.spells[0],id:'spell_we_fire',name:'事件火束',skill:'skill_light',mp:1,duration:0,materials:[],effectSpec:{kind:'damage',power:3,damageType:'fire'}};
 world.spells.push(spell);
 const engine=new WorldEngine(world);let document=engine.createCharacter(seed,{},'world-events');
 Object.assign(document.state,{location:market,minute:600});
 Object.assign(document.state.player,{coins:1000,hp:100000,maxHp:100000,mp:100,maxMp:100});
 document.state.spells[spell.id]={learned:true};document.state.skills.skill_light={proficiency:300,daily:{},breakthroughs:[]};
 document.state.npcs[person].location=market;
 document=applyPatches(document,planBossMigration(document,world.rules,world.bosses,world));
 const run=async(doc,tool,args,eventId,options)=>{const out=await engine.reduce(doc,{tool,args,eventId},options);return{document:applyPatches(doc,out.patches),result:out.result};};
 return{world,engine,document,run,spell};
}
async function burn(f,doc,prefix,options){
 for(let i=0;i<20;i++){const out=await f.run(doc,'world_cast',{spell:f.spell.id,target:person},`${prefix}${i}`,options);if(out.result.success&&out.result.damage>0)return out;doc=out.document;}
 throw Error('夹具没有施法成功的种子');
}

test('每次结算生成规范化事件：法术伤人记为harm并进统一事件记录',async()=>{
 const f=fixture(),out=await burn(f,f.document,'fire');
 assert.equal(out.result.worldEventVersion,1);
 const row=worldEvents(out.document.state,e=>e.verb==='harm').at(-1);
 assert.deepEqual({verb:row.verb,actor:row.actor,target:row.target,harm:row.harm,location:row.location,minute:row.minute},
  {verb:'harm',actor:'player',target:person,harm:out.result.damage,location:market,minute:out.document.state.minute});
 assert.ok(row.tags.includes('magic')&&row.tags.includes('hostile'));assert.ok(Array.isArray(row.witnesses));
 const move=deriveWorldEvents(f.engine,f.document.state,f.document.state,{tool:'move',args:{},detail:{},eventId:'m'});
 assert.equal(move.length,1);assert.equal(move[0].verb,'move');
});

test('法术伤及聚居地成员与刀兵同样进入社会链路：立场、回执、关系与记忆',async()=>{
 const f=fixture();assert.notEqual(stanceOf(f.document.state,f.engine,seat,'player'),'敌对');
 const out=await burn(f,f.document,'fire'),state=out.document.state;
 assert.equal(stanceOf(state,f.engine,seat,'player'),'敌对');
 const receipt=societyReceipts(out.document,seat).find(r=>r.kind==='clash');assert.equal(receipt.target,person);
 assert.equal(state.records[`stance:${seat}:player`].reason,'以法术伤及成员');
 if(f.engine.byId.get(person).tier==='full'){
  const relation=state.npcs[person].relationships.player;assert.equal(relation.affection<=-3,true);assert.ok(relation.fear>=1);
  assert.ok(state.npcs[person].memoryStream.some(m=>m.kind==='conflict'&&m.content.includes('事件火束')));
 }
});

test('旧账重放不把旧施法补成社会伤害，也不写事件记录',async()=>{
 const f=fixture(),live=await burn(f,f.document,'fire');
 const eventId=Object.keys(live.document.state.records).find(k=>k.startsWith('world_event:')).slice('world_event:'.length);
 const old=await f.run(f.document,'world_cast',{spell:f.spell.id,target:person},eventId,{replay:true,result:{}});
 assert.equal(old.document.state.records[`world_event:${eventId}`],undefined);
 assert.equal(stanceOf(old.document.state,f.engine,seat,'player'),stanceOf(f.document.state,f.engine,seat,'player'));
});

test('被目击的偷窃与赠礼按动词订阅：聚居地立场下降或缓和，首领记住来者',()=>{
 const f=fixture(),d=draft(structuredClone(f.document)),start=stanceOf(d.document.state,f.engine,seat,'player');
 const base={actor:'player',target:person,location:market,minute:600,tags:[]};
 recordSocietyActs(d,f.engine,[{...base,id:'quiet',verb:'steal',witnesses:[]}]);
 assert.equal(stanceOf(d.document.state,f.engine,seat,'player'),start,'无人目击的偷窃不传到聚居地');
 recordSocietyActs(d,f.engine,[{...base,id:'seen',verb:'steal',witnesses:['npc_x']}]);
 const fallen=stanceOf(d.document.state,f.engine,seat,'player');assert.notEqual(fallen,start);
 assert.equal(societyReceipts(d.document,seat).find(r=>r.kind==='theft').target,person);
 recordSocietyActs(d,f.engine,[{...base,id:'gift1',verb:'gift',value:20}]);
 assert.equal(stanceOf(d.document.state,f.engine,seat,'player'),start,'赠礼缓和一步');
 recordSocietyActs(d,f.engine,[{...base,id:'seen2',verb:'steal',witnesses:['npc_x']},{...base,id:'gift2',verb:'gift',value:20}]);
 assert.equal(stanceOf(d.document.state,f.engine,seat,'player'),fallen,'十日内再送礼不能反复洗白');
 recordSocietyActs(d,f.engine,[{...base,id:'old',verb:'steal',witnesses:['npc_x'],legacy:true}]);
 assert.equal(societyReceipts(d.document,seat).filter(r=>r.kind==='theft').length,2,'旧账重放不新增偷窃反应');
});

test('偷窃在场智能首领的身体记为敌意交锋，赠礼记为来访',()=>{
 const f=fixture(),d=draft(structuredClone(f.document)),base={actor:'player',target:person,location:market,minute:600,tags:[]};
 recordBossEvents(d,f.engine,[{...base,id:'steal1',verb:'steal',witnesses:[]},{...base,id:'gift1',verb:'gift',value:5},{...base,id:'old',verb:'steal',witnesses:[],legacy:true}]);
 assert.deepEqual(readBossCognition(d.document.state.npcs[person]).encounters.map(e=>[e.event,e.kind,e.tactic]),[['steal1','clash','theft'],['gift1','approach',undefined]]);
});

test('法术伤及立意精怪同样留下寻仇记忆',()=>{
 const f=fixture(),doc=structuredClone(f.document),id='monster_we_spirit';
 doc.state.creatures={...doc.state.creatures,[id]:{}};Object.assign(doc.state.creatures[id],{location:market,hp:10,maxHp:10,status:'正常',mind:{awakened:{stage:'立意'}}});
 const d=draft(doc);
 recordSpiritGrudges(d,f.engine,[{id:'spell1',verb:'harm',actor:'player',target:id,harm:3,tags:['magic','hostile']},{id:'none',verb:'harm',actor:'player',target:id,harm:0,tags:['magic']}]);
 assert.deepEqual(d.document.state.creatures[id].mind.events.map(e=>[e.kind,e.event,e.damage]),[['寻仇','spell1',3]]);
});

// K5: witnessed weighty events become rumors carried by the existing routes.
import {npcRumors}from'../server-plugin/npc-rumors.mjs';
import {shareNpcMemory}from'../server-plugin/npc-cognition.mjs';
const witness='npc_hw_hezhou',third='npc_hw_ayan';
function rumorFixture(edit=()=>{}){
 const f=fixture();
 for(const id of [witness,third]){const n=f.world.npcs.find(x=>x.id===id),slots=[{start:0,end:1440,location:id===witness?market:'loc_hw',activity:'闲坐',services:[]}];n.schedule={default:slots,market:slots,rest:slots,restDays:[],seasonal:{}};n.personality.flaws=[];
  n.relationships=[...(n.relationships??[]).filter(r=>![witness,third].includes(r.with)),{with:id===witness?third:witness,type:'朋友',trust:30}];}
 edit(f.world);
 const engine=new WorldEngine(f.world),doc=structuredClone(f.document);
 for(const id of [witness,third])Object.assign(doc.state.npcs[id],{location:id===witness?market:'loc_hw',activity:'闲坐',memoryStream:[]});
 const run=async(d,tool,args,eventId,options)=>{const out=await engine.reduce(d,{tool,args,eventId},options);return{document:applyPatches(d,out.patches),result:out.result};};
 return{...f,engine,document:doc,run};
}
test('有目击的法术伤人自动成为可传播传闻：目击者可讲、玩家可听、转述走失真',async()=>{
 const f=rumorFixture(),out=await burn(f,f.document,'fire'),doc=out.document;
 const told=npcRumors(f.engine,witness,doc).find(r=>r.id.startsWith('rumor_event:'));
 assert.ok(told,'目击者持有事件传闻');assert.match(told.claim,/事件火束/);assert.equal(told.source,witness);
 const heard=await f.run(doc,'world_remember',{subject:'player',key:told.id,rumor:told.id,source:witness,content:told.claim},'hear');
 assert.equal(heard.result.rumor,told.id);assert.equal(heard.result.reliability,'未核实');
 const d=draft(structuredClone(doc));d.document.state.npcs[third].location=market;
 const memory=d.document.state.npcs[witness].memoryStream.find(m=>m.rumor===told.id);
 shareNpcMemory(d,f.engine,{from:witness,to:third,memoryId:memory.id,channel:'conversation',eventId:'tell'});
 const retold=npcRumors(f.engine,third,d.document).find(r=>r.id===told.id);
 assert.ok(retold,'转述后第三人也能讲');assert.notEqual(retold.claim,told.claim,'转述经过失真');assert.deepEqual(retold.transmissionChain.map(h=>[h.from,h.to]),[[witness,third]]);
});
test('负例：无人目击、私密或秘密记忆、未成年当事人都不成为传闻',async()=>{
 const alone=fixture(),quiet=await burn(alone,alone.document,'fire');
 assert.ok(Object.values(quiet.document.state.npcs).every(n=>!(n.memoryStream??[]).some(m=>m.eventRumor)),'无目击者');
 const minor=rumorFixture(w=>{const n=w.npcs.find(x=>x.id===person);n.flags={...n.flags,minor:true};}),young=await burn(minor,minor.document,'fire');
 assert.equal(npcRumors(minor.engine,witness,young.document).filter(r=>r.id.startsWith('rumor_event:')).length,0,'未成年当事人');
 const f=rumorFixture(),doc=(await burn(f,f.document,'fire')).document;
 const row=doc.state.npcs[witness].memoryStream.find(m=>m.eventRumor);
 for(const hide of [{private:true},{visibility:'private'},{visibility:'secret'}]){
  const copy=structuredClone(doc);Object.assign(copy.state.npcs[witness].memoryStream.find(m=>m.id===row.id),hide);
  assert.equal(npcRumors(f.engine,witness,copy).some(r=>r.id===row.rumor),false,JSON.stringify(hide));
 }
 const forged=structuredClone(doc);forged.state.npcs[witness].memoryStream.push({...row,id:'forged',rumor:'rumor_event:never'});
 assert.equal(npcRumors(f.engine,witness,forged).some(r=>r.id==='rumor_event:never'),false,'没有世界事件记录的不算');
});
