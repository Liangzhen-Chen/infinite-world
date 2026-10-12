import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {init} from '../server-plugin/index.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,digest} from '../server-plugin/storage.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const actors=['npc_hw_linsui','npc_hw_hezhou'];
const damage={kind:'damage',power:4,damageType:'fire',armorFactor:0};
const area=effect=>({kind:'area',power:effect.power,radiusMeters:2,intervalMinutes:2,trigger:effect.kind==='protection'?'presence':'pulse',effect});
async function fixture(t,{effect=damage,bossArea=false,blocked=false}={}){
 const world=await loadWorld(),spell={...world.spells[0],id:'spell_area_actions_fixture',name:'动作区域夹具',skill:'skill_area_actions_fixture',effectSpec:area(effect),mp:2,minutes:1,duration:8,rangeMeters:5,targeting:{lineOfSight:true},materials:[]};
 world.spells.push(spell);world.skills.push({id:spell.skill,name:'动作区域夹具',attribute:'精神',profession:null});
 const place=world.locations.find(l=>l.id==='bld_hw_qingdeng'),feature=(id,point,state={})=>({id,name:id,kind:'silt_heap',owner:place.id,access:'public',position:point,state});
 place.features.push(feature('feature_area_origin',[0,0]),feature('feature_area_exit',[3,0]));
 world.locations.find(l=>l.id==='loc_hw_northwood').features??=[];
 world.locations.find(l=>l.id==='loc_hw_northwood').features.push(feature('feature_area_wood_origin',[0,0]),feature('feature_area_wood_exit',[3,0]));
 // Durable numerical fixtures keep real spawned animals alive across entry/exit.
 world.rules.combat.monster.beast.hpBase=100;world.rules.combat.monster.standard.hpBase=100;
 if(blocked)place.features.push(feature('feature_area_obstruction',[0,0],{blocksSight:true,sightRadiusMeters:.2}));
 if(bossArea){const boss=world.bosses.find(b=>b.id==='boss_mud_tusk');boss.mechanics={adaptation:{tactics:['unarmed'],threshold:2,perStep:.1,maximum:.3},weaknesses:[],abilities:[{id:'ability_area_fixture',every:1,belowHpPercent:100,effectSpec:area(damage),duration:8}]};}
 const engine=new WorldEngine(world),c=engine.initialFromLegacy(seed,'area-actions');
 Object.assign(c.state.player,{hp:100000,maxHp:100000,mp:10000,maxMp:10000});
 c.state.spells[spell.id]={source:{type:'fixture'}};c.state.skills[spell.skill]={proficiency:200,breakthroughs:[],daily:{}};
 for(const id of actors)Object.assign(c.state.npcs[id],{hp:10000,maxHp:10000});
 c.state.player.companions=[actors[0]];
 assert.equal(Object.keys(c.state.records).some(k=>k.startsWith('local_actor_position:')),false);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-area-actions-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 c.worldHash=digest(world);
 const initial=new CampaignStorage(path.join(root,'seed'),{reducer:engine.reduce.bind(engine)});await initial.create({id:'seed',worldVersion:world.version,document:c});
 const bundle={...await initial.export('seed'),worlds:{[c.worldHash]:world}};
 const app=express();app.use(express.json({limit:'500mb'}));const router=express.Router();
 await init(router,{baseRoot:root,world,npcPlanningEnabled:false,consistencyEnabled:false});app.use(router);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const request=async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
 const imported=await request('/import',{bundle});assert.equal(imported.status,200,JSON.stringify(imported.body));
 const campaignId=imported.body.reference.campaignId,read=async()=>{const out=await request('/read',{campaignId});assert.equal(out.status,200);return out.body.document;};
 const execute=async(tool,args,eventId,anchor=eventId)=>{const out=await request('/execute',{campaignId,tool,args,eventId,anchor});assert.equal(out.status,200,JSON.stringify(out.body));return out.body;};
 const approach=target=>execute('world_environment',{operation:'approach',target},`approach-${target}-${serial++}`);
 let serial=0;
 const contact=async target=>{for(let i=0;i<20;i++){const out=await execute('world_combat',{target,intent:'defend'},`contact-${target}-${serial++}`),doc=await read();if(doc.state.records[`local_actor_position:${target}`])return{out,doc};}throw Error('正常近身交锋未形成接触');};
 const cast=async()=>{for(let i=0;i<100;i++){const id=`cast-${serial++}`,out=await execute('world_cast',{spell:spell.id,target:'player'},id);if(out.result.success)return{id,out,doc:await read()};}throw Error('未取得成功施法');};
 return{world,engine,c,spell,request,campaignId,read,execute,approach,contact,cast};
}
test('真实HTTP普通动作生成双NPC位置，多目标与友军受伤，离界和重入沿同一消费者',async t=>{
 const s=await fixture(t);await s.approach('feature_area_origin');for(const id of actors)await s.contact(id);
 const before=await s.read(),cast=await s.cast();
 for(const id of actors){const row=cast.doc.state.records[`local_actor_position:${id}`],proof=cast.doc.state.records[row.source];assert.equal(proof.category,'physical_contact');assert.equal(proof.subject,id);assert.equal(proof.location,cast.doc.state.location);assert.ok(proof.event.startsWith('contact-'));assert.deepEqual(row.point,[0,0]);assert.equal(cast.doc.state.npcs[id].hp,before.state.npcs[id].hp-4);}
 assert.equal(cast.doc.state.player.hp,before.state.player.hp-4);assert.equal(cast.out.result.outcomes.length,3);
 await s.approach('feature_area_exit');await s.contact(actors[0]);let doc=await s.read();assert.deepEqual(doc.state.records[`local_actor_position:${actors[0]}`].point,[3,0]);assert.equal(doc.state.effects[cast.id].members[actors[0]].inside,false);
 await s.approach('feature_area_origin');await s.contact(actors[0]);doc=await s.read();assert.deepEqual(doc.state.records[`local_actor_position:${actors[0]}`].point,[0,0]);assert.equal(doc.state.effects[cast.id].members[actors[0]].inside,true);
});
test('同场未知和无同意友军不纳入，真实遮挡拒绝施法且零写',async t=>{
 const s=await fixture(t,{effect:{kind:'protection',power:12,damageTypes:['fire'],stacking:'strongest'}});
 await s.contact(actors[0]);const cast=await s.cast();assert.ok(cast.doc.state.effects[`${cast.id}:member:player`]);for(const id of actors)assert.equal(cast.doc.state.effects[`${cast.id}:member:${id}`],undefined);
 assert.ok(cast.out.result.outcomes.some(r=>r.target===actors[0]&&r.skipped.includes('同意')));assert.equal(cast.doc.state.records[`local_actor_position:${actors[1]}`],undefined);
 const blocked=await fixture(t,{blocked:true});await blocked.approach('feature_area_origin');const before=await blocked.read();
 const out=await blocked.request('/execute',{campaignId:blocked.campaignId,tool:'world_cast',args:{spell:blocked.spell.id,target:'player'},eventId:'blocked'});assert.equal(out.status,400);assert.match(out.body.error,/视线/);assert.deepEqual(await blocked.read(),before);
});
test('接触坐标到期、实际同行离场清除，未知视线不能凭半径推断',async t=>{
 const s=await fixture(t);await s.contact(actors[0]);let doc=await s.read();const row=doc.state.records[`local_actor_position:${actors[0]}`];
 const d={get:(...p)=>p.reduce((v,k)=>v?.[k],doc)};assert.equal(s.engine.magicAreaTargetFacts(d,actors[0],doc.state.location,[1,0]).lineOfSight,false);
 await s.execute('world_time',{minutes:row.expires-doc.state.minute},'expire');doc=await s.read();assert.equal(doc.state.records[`local_actor_position:${actors[0]}`],undefined);
 await s.approach('feature_area_exit');await s.contact(actors[0]);await s.execute('world_move',{destination:'loc_hw'},'leave');doc=await s.read();assert.equal(doc.state.records.local_player_position,undefined);assert.equal(doc.state.records[`local_actor_position:${actors[0]}`],undefined);
});
test('巢穴实际个体经交锋取得坐标，首领区域能力走正式链，部下仍须逐个接触',async t=>{
 const s=await fixture(t,{bossArea:true});await s.execute('world_move',{destination:'loc_hw_northwood'},'wood');
 const entered=await s.execute('world_lair',{operation:'approach',lair:'lair_mud_tusk'},'lair');assert.ok(entered.result.minions.length);
 let doc=await s.read();assert.equal(doc.state.records['local_actor_position:boss_mud_tusk'],undefined);
 const minion=entered.result.minions[0].id;await s.contact(minion);const before=await s.read(),fight=await s.contact('boss_mud_tusk');doc=fight.doc;
 const abilities=fight.out.result.abilities??[],ability=abilities.find(a=>a.effect);assert.ok(ability,'真实反击应产生区域');assert.equal(doc.state.effects[ability.effect].owner,'boss_mud_tusk');
 assert.ok(ability.outcomes.some(r=>r.target===minion&&r.damage===4));assert.ok(ability.outcomes.some(r=>r.target==='player'&&r.damage===4));assert.equal(doc.state.records[`local_actor_position:${entered.result.minions[1].id}`],undefined);assert.equal(doc.state.player.xp,before.state.player.xp);
 const hp=doc.state.creatures[minion].hp;assert.ok(hp>0);await s.execute('world_time',{minutes:2},'boss-pulse');doc=await s.read();assert.equal(doc.state.creatures[minion].hp,Math.max(0,hp-4));
});
test('正常巢穴生成的两个怪物逐个接触后参与玩家区域，怪物出界和重入更新成员',async t=>{
 const s=await fixture(t);await s.execute('world_move',{destination:'loc_hw_northwood'},'wood');
 const entered=await s.execute('world_lair',{operation:'approach',lair:'lair_mud_tusk'},'lair'),targets=entered.result.minions.map(m=>m.id);assert.equal(targets.length,2);
 await s.approach('feature_area_wood_origin');for(const id of targets)await s.contact(id);
 const before=await s.read(),cast=await s.cast();for(const id of targets)assert.equal(cast.doc.state.creatures[id].hp,before.state.creatures[id].hp-4);
 assert.equal(cast.doc.state.effects[cast.id].members.boss_mud_tusk,undefined);
 await s.approach('feature_area_wood_exit');await s.contact(targets[0]);let doc=await s.read();assert.deepEqual(doc.state.records[`local_actor_position:${targets[0]}`].point,[3,0]);assert.equal(doc.state.effects[cast.id].members[targets[0]].inside,false);
 await s.approach('feature_area_wood_origin');await s.contact(targets[0]);doc=await s.read();assert.equal(doc.state.effects[cast.id].members[targets[0]].inside,true);
});
test('HTTP重复、导出导入、撤回和重新执行仅结算一次，失败动作不留坐标',async t=>{
 const s=await fixture(t);const before=await s.read();const failed=await s.request('/execute',{campaignId:s.campaignId,tool:'world_combat',args:{target:actors[0],intent:'invented'},eventId:'bad'});assert.equal(failed.status,400);assert.deepEqual(await s.read(),before);
 await s.contact(actors[0]);const cast=await s.cast(),first=await s.execute('world_time',{minutes:2},'pulse','pulse-anchor'),doc=await s.read();
 const duplicate=await s.execute('world_time',{minutes:2},'pulse','pulse-anchor');assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.result,first.result);assert.deepEqual(await s.read(),doc);
 const exported=await s.request('/export',{campaignId:s.campaignId}),imported=await s.request('/import',{bundle:exported.body});assert.equal(imported.status,200);const restored=await s.request('/read',{campaignId:imported.body.reference.campaignId});assert.deepEqual(restored.body.document,doc);
 const reconciled=await s.request('/reconcile',{campaignId:s.campaignId,validAnchors:exported.body.events.map(e=>e.anchor).filter(a=>a&&a!=='pulse-anchor')});assert.equal(reconciled.status,200);
 assert.equal((await s.read()).state.npcs[actors[0]].hp,cast.doc.state.npcs[actors[0]].hp);
 await s.execute('world_time',{minutes:2},'pulse-retry','pulse-retry');assert.equal((await s.read()).state.npcs[actors[0]].hp,doc.state.npcs[actors[0]].hp);
});
