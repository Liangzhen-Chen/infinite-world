import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,digest}from'../server-plugin/storage.mjs';
import {standing,standingWords,adjustStanding,transmitStanding,collectivesOf,TRANSMISSION}from'../server-plugin/standing.mjs';
import {relationView}from'../server-plugin/npc-relations.mjs';
import {sceneStandings}from'../server-plugin/scene-card.mjs';
import {spendFactionAssets}from'../server-plugin/faction-clock.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world);
const fresh=()=>engine.createCharacter(seed,{},'standing');
const draft=document=>({document,get(...k){return k.reduce((o,x)=>o?.[x],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);}});
const seat=world.locations.find(l=>l.monsterSociety?.stances?.player==='戒备').id;
const harm=(target,id,extra={})=>({id,verb:'harm',actor:'player',target,harm:6,witnesses:[],tags:['combat','hostile'],minute:600,...extra});

test('W5：独立反向关系沿用已审理由与数值，立场及新旧组织公账都读取；原正文不变',async()=>{
 const raw=JSON.parse(await fs.readFile('world/lore/factions.json','utf8'));
 for(const [target,source,score]of [['faction_ms_lielu','faction_far_orcmoot',10],['faction_ms_yugen','faction_far_lignum',30],['faction_ms_taideng','faction_far_scentmoot',10]]){
  const authored=raw.find(f=>f.id===target),origin=raw.find(f=>f.id===source).relations.find(r=>r.faction===target);
  assert.deepEqual(world.factions.find(f=>f.id===target),authored);
  assert.deepEqual(world.rules.factionRelations[target],[{...origin,faction:source}]);assert.equal(origin.score,score);
  const d=draft(fresh());assert.equal(standing(engine,d.document.state,target,source),score);
  spendFactionAssets(d,engine,target,{coins:0},{sourceEvent:'w5-account'});
  const key=`faction-assets:${target}`,account=d.document.state.records[key];
  assert.equal(account.relations[source],score);assert.equal(account.coins,authored.resources.treasuryCopper);
  delete account.relations[source];assert.equal(standing(engine,d.document.state,target,source),score);
  spendFactionAssets(d,engine,target,{coins:0},{sourceEvent:'w5-old-account'});
  assert.equal(d.document.state.records[key].relations[source],score);
  d.document.state.records[key].relations[source]=-7;
  spendFactionAssets(d,engine,target,{coins:0},{sourceEvent:'w5-keep-change'});
  assert.equal(standing(engine,d.document.state,target,source),-7);assert.equal(d.document.state.records[key].relations[source],-7);
 }
 const tanjie=world.factions.find(f=>f.id==='faction_ms_tanjie');
 assert.deepEqual(tanjie,raw.find(f=>f.id===tanjie.id));assert.equal(world.rules.factionRelations[tanjie.id],undefined);
 assert.ok(!raw.filter(f=>f.id.startsWith('faction_far_')).some(f=>f.relations.some(r=>r.faction===tanjie.id)));
});

test('七份旧存储经同一入口读出 -100..100，存储结构不变',()=>{
 const doc=fresh(),s=doc.state;
 assert.equal(standing(engine,s,'npc_hw_linsui'),relationView(engine,s,'npc_hw_linsui','player').trust,'人物关系/旧信任');
 assert.equal(standing(engine,s,seat),-20,'聚居地戒备');
 s.records[`stance:${seat}:player`]={category:'settlement_stance',holder:seat,target:'player',stance:'敌对'};assert.equal(standing(engine,s,seat),-60);
 s.records[`reputation:${digest(['player','settlement','loc_hw']).slice(0,24)}`]={category:'reputation',subject:'player',scope:'settlement',target:'loc_hw',reputation:-4,fame:0,notoriety:2,deltas:[]};
 assert.equal(standing(engine,s,'loc_hw'),-20,'聚居口碑');
 assert.equal(standing(engine,s,'faction_reedpact','faction_bankorder'),32,'势力关系：登记初值');
 s.records['faction-assets:faction_reedpact']={category:'faction_assets',relations:{faction_bankorder:-5}};assert.equal(standing(engine,s,'faction_reedpact','faction_bankorder'),-5,'势力关系：运行账');
 s.creatures={...s.creatures,pet_a:{owner:'player',care:{loyalty:80,bond:40}},wild_a:{care:{loyalty:50,bond:40}},
  spirit_a:{mind:{awakened:{},events:[{kind:'寻仇',party:'player'},{kind:'寻仇',party:'player'}]}},spirit_b:{mind:{awakened:{}},companion:{with:'player'}}};
 assert.deepEqual(['pet_a','wild_a','spirit_a','spirit_b'].map(id=>standing(engine,s,id)),[60,40,-50,50],'宠物忠诚/亲近、精怪寻仇与结缘');
 s.creatures.boss_a={boss:'b',cognition:{format:1,encounters:[{event:'x',actor:'player',kind:'clash',tactic:'armed',minute:1,location:'loc_hw'}]}};
 assert.equal(standing(engine,s,'boss_a'),-60,'首领记得进攻');
 s.creatures.boss_a.negotiation={format:1,inventory:{},relation:{pact:'nonaggression',alliance:true,event:'y'},history:[{event:'y',minute:2,terms:{pact:'nonaggression',alliance:true,offer:[],request:[]},accepted:true,reason:'测试议定'}]};
 assert.equal(standing(engine,s,'boss_a'),60,'首领盟约');
 assert.deepEqual([-80,-40,-15,0,15,40,80].map(standingWords),['视你为仇','对你怀有敌意','对你戒备','对你平常','对你友善','颇信任你','视你为可托之人']);
});

test('统一写入：人物进关系账，集体进立场记录；同一来源不重复',()=>{
 const d=draft(fresh()),before=standing(engine,d.document.state,'npc_hw_ayan');
 adjustStanding(d,engine,'npc_hw_ayan','player',-7,{sourceEvent:'e1',reason:'测试'});
 adjustStanding(d,engine,'npc_hw_ayan','player',-7,{sourceEvent:'e1',reason:'测试'});
 assert.equal(standing(engine,d.document.state,'npc_hw_ayan'),before-7);
 assert.equal(d.document.state.npcs.npc_hw_ayan.relationships.player.evidenceKeys.length,1);
 adjustStanding(d,engine,'loc_hw','player',-5,{sourceEvent:'e1',reason:'测试',via:'settlement:loc_hw'});
 adjustStanding(d,engine,'loc_hw','player',-5,{sourceEvent:'e1',reason:'测试',via:'settlement:loc_hw'});
 assert.equal(standing(engine,d.document.state,'loc_hw'),-5);assert.equal(d.document.state.records['standing:loc_hw:player'].history.length,1);
});

test('伤害成员按比例传导到家户、聚居地、势力及其盟友；帮助反向；旧账不传导',()=>{
 const d=draft(fresh()),s0=d.document.state;
 const rows=collectivesOf(engine,s0,'npc_hw_linsui');
 assert.ok(rows.some(r=>r.holder==='npc_hw_ayan'&&r.ratio===TRANSMISSION.household));
 assert.ok(rows.some(r=>r.holder==='loc_hw'&&r.ratio===TRANSMISSION.settlement));
 const ayan=standing(engine,s0,'npc_hw_ayan');
 transmitStanding(d,engine,[harm('npc_hw_linsui','fight1')]);
 const s=d.document.state;
 assert.equal(standing(engine,s,'npc_hw_ayan'),ayan-8,'家户：-(10+6)×0.5');
 assert.equal(standing(engine,s,'loc_hw'),-5,'聚居地：-(16)×0.3 取整');
 transmitStanding(d,engine,[harm('npc_w5_reedpact_leader','fight2',{harm:30})]);
 assert.equal(standing(engine,d.document.state,'faction_reedpact'),-15,'势力：-30×0.5');
 assert.equal(standing(engine,d.document.state,'faction_bankorder'),-4,'盟友（关系≥30）：-30×0.125');
 assert.equal(standing(engine,d.document.state,'faction_mossstudy'),0,'关系不足盟友的不受牵连');
 transmitStanding(d,engine,[{id:'gift1',verb:'gift',actor:'player',target:'npc_w5_reedpact_leader',value:120,witnesses:[],tags:['gift'],minute:700}]);
 assert.equal(standing(engine,d.document.state,'faction_reedpact'),-7,'赠礼缓和：+15×0.5 取整');
 const frozen=structuredClone(d.document);
 transmitStanding(d,engine,[harm('npc_hw_linsui','old',{legacy:true}),{...harm('npc_hw_linsui','quiet'),verb:'steal',witnesses:[]}]);
 assert.deepEqual(d.document,frozen,'旧账与无人目击的偷窃不传导');
});

test('场景卡以世界内说法列出在场各方看法，不显示数字',()=>{
 const doc=fresh();doc.state.npcs.npc_hw_linsui.location=doc.state.location;
 doc.state.npcs.npc_hw_linsui.relationships={player:{trust:45,affection:0,respect:0,fear:0,romance:0,competition:0,favors:[],evidenceKeys:[]}};
 const views=sceneStandings(engine,doc.state,['npc_hw_linsui']);
 assert.deepEqual(views.find(v=>v.holder==='npc_hw_linsui'),{holder:'npc_hw_linsui',collective:false,words:'颇信任你'});
 const card=engine.scene(doc,'');const line=card.split('\n').find(l=>l.startsWith('【在场各方对你的看法】'));
 assert.match(line,/林穗颇信任你/);assert.doesNotMatch(line,/\d/);
});
