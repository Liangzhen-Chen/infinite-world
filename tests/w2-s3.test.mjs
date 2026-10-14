import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {readS3Publication,mergeS3Publication,publishS3,withoutS3,files as publishedFiles} from '../tools/publish-w2-s3.mjs';
import {withoutS4} from '../tools/publish-w2-s4.mjs';
import {spells,books,items,placements,mentors,routes,routeOf} from '../world/design/w2-s3.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {lightAt,opticalSightClear} from '../server-plugin/magic-light.mjs';
import {magicStatusStats} from '../server-plugin/magic-status.mjs';
import {consumeMagicProtection} from '../server-plugin/magic-primitives.mjs';
import {recordLocalContact} from '../server-plugin/environment.mjs';

// Later batches (T104 onward) are removed first so this batch is compared on its own edition.
const formal=withoutS4(await loadWorld()),publication=await readS3Publication();
const ids={spells:new Set(spells.map(s=>s.id)),skills:new Set(spells.map(s=>s.skill)),items:new Set([...books,...items].map(i=>i.id))};
// The edition before this batch is rebuilt from the formal world, so the test
// works before and after publication and never pins catalogue totals.
const before=withoutS3(formal),world=mergeS3Publication(before,publication),engine=new WorldEngine(world);
const published=formal.spells.some(s=>ids.spells.has(s.id));
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const JI='npc_bs_076_3',SHU='npc_bs_078_2',MIAO='npc_bs_080_3';
const home={佛:'bld_bs_still_temple',巫:'bld_bs_temple',祭:'bld_bs_temple'};
const rec=(doc,id)=>doc.state.records[`physical_feature:${id}`]?.state??world.locations.flatMap(l=>l.features??[]).find(f=>f.id===id).state;
const fid=k=>`feature_s3_${k}`;
const reader=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const writer=doc=>({...reader(doc),set:(p,value)=>{let n=doc;for(const k of p.slice(0,-1))n=n[k]??={};n[p.at(-1)]=structuredClone(value);},remove:p=>{let n=doc;for(const k of p.slice(0,-1))n=n[k];delete n[p.at(-1)];}});
const lux=(doc,point)=>lightAt(reader(doc),engine,doc.state.location,point).lux;
let serial=0;
async function run(doc,tool,args){const out=await engine.reduce(doc,{tool,args,eventId:`s3-${++serial}`});return {doc:applyPatches(doc,out.patches),result:out.result};}
// Select a reproducible successful dice event without editing dice or state.
async function success(doc,tool,args,key='success'){for(let i=0;i<60;i++){const r=await run(doc,tool,args).catch(e=>{e.message+=` @${tool} ${JSON.stringify(args)} t=${doc.state.minute}`;throw e;});if(r.result.effectFailed)assert.fail(r.result.effectFailed);if(r.result[key])return r;}assert.fail(`未取得成功检定：${tool} ${JSON.stringify(args)}`);}
async function wait(doc,minutes){return (await run(doc,'world_time',{minutes,activity:'等待'})).doc;}
async function at(doc,minuteOfDay){let target=Math.floor(doc.state.minute/1440)*1440+minuteOfDay;if(target<=doc.state.minute)target+=1440;while([10,20,30].includes(engine.calendar(target).day))target+=1440;return wait(doc,target-doc.state.minute);}
// Residents can fall ill (NPC life simulation); lessons wait for a day the teacher is actually there.
async function attend(doc,teacher,place,minuteOfDay){for(let i=0;i<40;i++){doc=await at(doc,minuteOfDay);const n=doc.state.npcs[teacher];if(n.location===place&&!n.status)return doc;}assert.fail(`${teacher}长期不在${place}`);}
async function grant(doc,owner,...targets){const auth=[];for(const t of targets){const r=await run(doc,'world_promise',{operation:'grant_access',promisor:owner,location:t,minutes:600,content:'本人同意限定用途；到期或撤销即终止许可'});doc=r.doc;auth.push(r.result.authorization);}return{doc,authorization:auth[0],authorizations:auth.slice(1)};}
async function permit(doc,authority,location){const r=await run(doc,'world_law',{operation:'grant_magic_permit',authority,location,subject:'player',action:'mental_magic',minutes:120});assert.ok(r.result.permit);return{doc:r.doc,permit:r.result.permit};}

// Public route: arrive, initiate where the institution requires it, learn the
// core skill, practise, certify, then learn this batch from the same teacher.
const learnedByRoute={};
async function routeSession(route){
 const r=routes[route],teacher=r.teacher,place=home[route],role=world.professions.find(p=>p.id===r.profession);
 let doc=engine.createCharacter(seed,{},`s3-${route}`);doc.state.minute=510;doc.state.location='loc_bs';Object.assign(doc.state.player,{level:10,coins:5000});
 for(const a of Object.keys(doc.state.player.attributes))doc.state.player.attributes[a]=18;
 doc=(await run(doc,'world_move',{destination:place})).doc;
 const entry=world.rules.training.institutions.find(e=>e.teacher===teacher&&e.profession===role.id);
 if(entry)doc=(await run(doc,'world_profession',{operation:'initiate',profession:role.id,teacher,institution:place,rule:entry.rule})).doc;
 const core=role.entry.skill;doc=(await success(doc,'world_learn',{entity:core,source:teacher,kind:'skill'})).doc;
 while(doc.state.skills[core].proficiency<150){doc=(await run(doc,'world_practice',{skill:core,gain:100,target:'基础动作'})).doc;if(doc.state.skills[core].proficiency<150)doc=await attend(doc,teacher,place,510);}
 doc=await attend(doc,teacher,place,510);doc=(await success(doc,'world_profession',{profession:role.id,teacher,operation:'certify'},'certified')).doc;
 assert.equal(doc.state.professions.combat,role.id);
 for(const s of spells.filter(s=>routeOf[s.id]===route)){
  doc=await attend(doc,teacher,place,800);const coins=doc.state.player.coins,teacherCoins=doc.state.npcs[teacher].coins;
  const l=await success(doc,'world_learn',{kind:'spell',entity:s.id,source:teacher});doc=l.doc;
  assert.equal(doc.state.spells[s.id].source.id,teacher);assert.equal(doc.state.spells[s.id].source.type,'teacher');
  assert.equal(doc.state.player.coins,coins-s.learnFee);assert.equal(doc.state.npcs[teacher].coins,teacherCoins+s.learnFee);
 }
 doc=await attend(doc,teacher,place,540);
 const t=await run(doc,'world_trade',{seller:teacher,item:r.material,quantity:6});assert.ok(t.result.cost>0);doc=t.doc;assert.equal(doc.state.inventory[r.material].quantity,6);
 assert.equal(doc.state.npcs[teacher].location,place);
 // Casting branches below start rested with a deep mana pool; costs are still asserted.
 Object.assign(doc.state.player,{mp:500,maxMp:500});learnedByRoute[route]=doc;return doc;
}
async function cast(doc,args){const before=doc,r=await success(doc,'world_cast',args),s=world.spells.find(x=>x.id===args.spell);
 assert.ok(r.doc.state.player.mp<=before.state.player.mp-s.mp);
 for(const m of s.materials)assert.equal(r.doc.state.inventory[m.item]?.quantity??0,(before.state.inventory[m.item]?.quantity??0)-m.amount);
 return r;}
const id=k=>`spell_s3_${k}`;

test('佛、巫、祭三路线实际入门认证后向导师学会本批法术，并买到线香、祝米与灯油',async()=>{
 for(const route of ['佛','巫','祭'])await routeSession(route);
 assert.equal(Object.keys(learnedByRoute).length,3);
});

test('止波寺禅定与医护：观心、护念、寄念、护身、抚伤、养息、凉藏、低灯、闭隙、凉帕各自真实生效',async()=>{
 const base=learnedByRoute.佛;assert.ok(base,'需先完成路线学习');const fresh=()=>structuredClone(base);
 // Mental spells need the institution's real permit; consent of others stays required.
 let {doc,permit:p}=await permit(fresh(),JI,'bld_bs_still_temple');
 await assert.rejects(engine.reduce(fresh(),{tool:'world_cast',args:{spell:id('still_mind'),target:'player'},eventId:'no-permit'}),/许可/);
 let seen=await cast(doc,{spell:id('still_mind'),target:'player',permit:p});assert.equal(seen.result.interference,false);
 const troubled=structuredClone(doc);troubled.state.effects.fixture_illusion={kind:'status',target:'player',status:'illusion',power:2,expires:troubled.state.minute+10,remainingUses:1,source:'fixture_illusion'};
 seen=await cast(troubled,{spell:id('still_mind'),target:'player',permit:p});assert.equal(seen.result.interferenceCount,1);
 doc.state.npcs[JI].location=doc.state.location;recordLocalContact(writer(doc),engine,JI,'s3-contact');
 await assert.rejects(engine.reduce(doc,{tool:'world_cast',args:{spell:id('still_mind'),target:JI,permit:p},eventId:'no-consent'}),/同意/);
 // A real remembered event is kept from fading for thirty days.
 doc=(await run(doc,'world_remember',{subject:'player',key:'s3-vow',content:'在止波寺答应季笙每日扫廊'})).doc;
 const guarded=await cast(doc,{spell:id('bead_guard'),target:'player',source:'player::s3-vow',permit:p});assert.equal(guarded.result.truthVerified,false);assert.equal(guarded.doc.memories['player::s3-vow'].guardUntil,guarded.doc.state.minute+43200);
 await assert.rejects(engine.reduce(doc,{tool:'world_cast',args:{spell:id('bead_guard'),target:'player',source:'player::none',permit:p},eventId:'no-memory'}),/记忆/);
 // Feeling: bought single primer carries the caster's own sentence.
 let bead=(await run(fresh(),'world_trade',{seller:JI,item:'item_bs_monk_primer',quantity:1})).doc;
 const felt=await cast(bead,{spell:id('feeling_bead'),target:'item_bs_monk_primer',text:'愿你一路平安'});assert.equal(felt.result.feeling,'愿你一路平安');assert.equal(felt.doc.state.records[felt.result.carrier].expires,felt.doc.state.minute+1440);
 // Physical guard absorbs eight points in total.
 const guard=await cast(fresh(),{spell:id('post_guard'),target:'player'});const g=writer(guard.doc);
 assert.equal(consumeMagicProtection(g,'player',5,'physical').absorbed,5);assert.equal(consumeMagicProtection(g,'player',5,'physical').absorbed,3);assert.equal(consumeMagicProtection(g,'player',5,'fire').absorbed,0);
 // Healing: own touch, then a two-metre rest circle pulsing every ten minutes.
 const hurt=fresh();Object.assign(hurt.state.player,{hp:20,maxHp:60});
 const palm=await cast(hurt,{spell:id('mend_palm'),target:'player'});assert.equal(palm.doc.state.player.hp,hurt.state.player.hp+4);
 const field=await cast(hurt,{spell:id('rest_field'),target:'player'});const hp0=field.doc.state.player.hp;assert.equal(hp0,hurt.state.player.hp+2);
 assert.equal((await wait(field.doc,10)).state.player.hp,hp0+2);
 await assert.rejects(engine.reduce(hurt,{tool:'world_cast',args:{spell:id('mend_palm'),target:JI},eventId:'heal-no-consent'}),/同意|在场|事实/);
 // Herb cabinet: upkeep per minute, cooler cabinet, half the spoilage.
 let c=await grant(fresh(),JI,fid('herb_cabinet'));const cool=await cast(c.doc,{spell:id('herb_cool'),target:fid('herb_cabinet'),authorization:c.authorization});
 const mp0=cool.doc.state.player.mp,cold=await wait(cool.doc,10),warm=await wait(c.doc,10);
 assert.equal(rec(cold,fid('herb_cabinet')).temperatureC,13);assert.equal(cold.state.player.mp,mp0-10);
 const spoiled=d=>rec(d,fid('herb_cabinet')).foodLots[0].spoiledGrams;assert.ok(Math.abs(spoiled(cold)-spoiled(cool.doc)-.1)<1e-9);assert.ok(Math.abs(spoiled(warm)-spoiled(c.doc)-.2)<1e-9);
 assert.equal(rec(await wait(cold,60),fid('herb_cabinet')).temperatureC,18);
 // Lamp dimmed to four tenths; closed door slit hides the room.
 c=await grant(fresh(),JI,fid('hall_lamp'));const bright=lux(c.doc,[0,0]),dim=await cast(c.doc,{spell:id('lamp_dim'),target:fid('hall_lamp'),authorization:c.authorization});
 assert.ok(Math.abs(lux(dim.doc,[0,0])-bright*.4)<1e-9);
 c=await grant(fresh(),JI,fid('chan_door'));assert.equal(opticalSightClear(reader(c.doc),engine,'bld_bs_still_temple',[0,0],[2,0]),true);
 const shade=await cast(c.doc,{spell:id('door_shade'),target:fid('chan_door'),authorization:c.authorization});assert.equal(opticalSightClear(reader(shade.doc),engine,'bld_bs_still_temple',[0,0],[2,0]),false);
 assert.equal(opticalSightClear(reader(await wait(shade.doc,30)),engine,'bld_bs_still_temple',[0,0],[2,0]),true);
 // Compress cloth gives up 2000 J and stops at 15 C.
 c=await grant(fresh(),JI,fid('compress_cloth'));const chill=await cast(c.doc,{spell:id('cool_cloth'),target:fid('compress_cloth'),authorization:c.authorization});
 assert.equal(chill.result.heatRemovedJ,2000);assert.equal(chill.result.temperatureC,15);
 await assert.rejects(engine.reduce(fresh(),{tool:'world_cast',args:{spell:id('herb_cool'),target:fid('herb_cabinet')},eventId:'no-owner'}),/授权/);
});

test('灯祠巫祝安抚：收惊、安神、避阴、雾灯、归路灯标、避风寒按真实条件生效',async()=>{
 const base=learnedByRoute.巫;assert.ok(base);const fresh=()=>structuredClone(base);
 let {doc,permit:p}=await permit(fresh(),SHU,'bld_bs_temple');
 doc.state.effects.fixture_fear={kind:'status',target:'player',status:'fear',power:2,expires:doc.state.minute+30,source:'fixture_fear'};
 doc.state.effects.fixture_push={kind:'status',target:'player',status:'compulsion',power:2,expires:doc.state.minute+30,source:'fixture_push'};
 const eased=await cast(doc,{spell:id('startle_ease'),target:'player',permit:p});assert.equal(eased.result.relieved,3);
 assert.equal(eased.doc.state.effects.fixture_fear,undefined);assert.equal(eased.doc.state.effects.fixture_push.power,1);
 await assert.rejects(engine.reduce(doc,{tool:'world_cast',args:{spell:id('startle_ease'),target:'player'},eventId:'ease-no-permit'}),/许可/);
 const scared=structuredClone(doc);delete scared.state.effects.fixture_push;const plain=magicStatusStats(reader(scared),'player').hit;
 const calm=await cast(scared,{spell:id('calm_guard'),target:'player'});assert.equal(plain,-.04);assert.equal(magicStatusStats(reader(calm.doc),'player').hit,0);assert.ok(calm.doc.state.effects.fixture_fear);
 const ward=await cast(fresh(),{spell:id('shade_ward'),target:'player'});assert.equal(magicStatusStats(reader(ward.doc),'player').shadowResistance,.3);
 let g=await grant(fresh(),SHU,fid('fog_stand'));const lamp0=lux(g.doc,[1,-1]),fog=await cast(g.doc,{spell:id('fog_lamp'),target:fid('fog_stand'),authorization:g.authorization});
 assert.ok(Math.abs(lux(fog.doc,[1,-1])-lamp0-20)<1e-9);assert.ok(Math.abs(lux(await wait(fog.doc,30),[1,-1])-lamp0)<1e-9);
 // Both ends must have been visited in person: walk out to the street and back.
 let walked=(await run(fresh(),'world_move',{destination:'loc_bs_dongxue'})).doc;walked=(await run(walked,'world_move',{destination:'bld_bs_temple'})).doc;
 const route='route_t90_bld_bs_temple_loc_bs_dongxue',mark=await cast(walked,{spell:id('way_lamp'),target:route});assert.equal(mark.result.route.id,route);
 const seen=await run(mark.doc,'world_environment',{operation:'inspect',target:route});assert.equal(seen.result.markers.length,1);
 const guard=await cast(fresh(),{spell:id('wind_cold_guard'),target:'player'}),w=writer(guard.doc);
 assert.equal(consumeMagicProtection(w,'player',4,'cold').absorbed,4);assert.equal(consumeMagicProtection(w,'player',4,'wind').absorbed,2);assert.equal(consumeMagicProtection(w,'player',4,'physical').absorbed,0);
 await assert.rejects(engine.reduce(fresh(),{tool:'world_cast',args:{spell:id('fog_lamp'),target:fid('fog_stand')},eventId:'fog-no-owner'}),/授权/);
});

test('灯祠祭礼光事：聚灯、铜镜回光、帷暗、灯前帘只改光路不添亮',async()=>{
 const base=learnedByRoute.祭;assert.ok(base);const fresh=()=>structuredClone(base);
 let g=await grant(fresh(),MIAO,fid('offering_table'),fid('altar_lamp'));const table=lux(g.doc,[1,0]),side=lux(g.doc,[-1,0]);
 const focus=await cast(g.doc,{spell:id('lamp_focus'),target:fid('offering_table'),source:fid('altar_lamp'),authorization:g.authorization,authorizations:g.authorizations});
 assert.ok(lux(focus.doc,[1,0])>table);assert.ok(lux(focus.doc,[-1,0])<side);
 g=await grant(fresh(),MIAO,fid('bronze_mirror'),fid('altar_lamp'));const seat=lux(g.doc,[2,1]);
 const mirror=await cast(g.doc,{spell:id('mirror_turn'),target:fid('bronze_mirror'),source:fid('altar_lamp'),destination:fid('side_seat'),authorization:g.authorization,authorizations:g.authorizations});
 assert.ok(lux(mirror.doc,[2,1])>seat-1e-9&&mirror.result.effect);
 g=await grant(fresh(),MIAO,fid('rest_couch'));const couch=lux(g.doc,[-1,0]),dark=await cast(g.doc,{spell:id('veil_dark'),target:fid('rest_couch'),authorization:g.authorization});
 assert.ok(Math.abs(lux(dark.doc,[-1,0])-couch*.3)<1e-9);assert.equal(lux(dark.doc,[2,1]),lux(g.doc,[2,1]));
 g=await grant(fresh(),MIAO,fid('side_passage'));const screen=await cast(g.doc,{spell:id('lamp_screen'),target:fid('side_passage'),authorization:g.authorization});
 assert.equal(opticalSightClear(reader(screen.doc),engine,'bld_bs_temple',[0,0],[0,-2]),false);assert.equal(opticalSightClear(reader(screen.doc),engine,'bld_bs_temple',[0,-2],[0,0]),true);
 await assert.rejects(engine.reduce(fresh(),{tool:'world_cast',args:{spell:id('veil_dark'),target:fid('rest_couch')},eventId:'dark-no-owner'}),/授权/);
});

test('书铺两册有限库存：购买、阅读学会法师与看护术式，并在灯祠实地施放',async()=>{
 const base=()=>{const doc=engine.createCharacter(seed,{},'s3-books');doc.state.minute=540;doc.state.location='bld_hw_school';Object.assign(doc.state.player,{coins:10000,mp:10000,maxMp:10000});doc.state.player.attributes.智力=30;doc.state.player.attributes.精神=30;doc.state.professions.combat='profession_mage';doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};doc.state.inventory.item_charcoal={quantity:20,durability:100};return doc;};
 let doc=base();
 for(const b of books){const r=await run(doc,'world_trade',{seller:'npc_hw_luqing',item:b.id,quantity:1});assert.ok(r.result.cost>0);const left=r.doc.state.npcs.npc_hw_luqing.inventory[b.id];assert.equal(left.quantity??left,1);doc=r.doc;}
 for(const s of spells.filter(s=>['法','通'].includes(routeOf[s.id]))){const book=books.find(b=>b.book.teaches.includes(s.id)),r=await success(doc,'world_learn',{kind:'spell',entity:s.id,source:book.id});assert.equal(r.doc.state.spells[s.id].source.id,book.id);assert.equal(r.doc.state.minute,doc.state.minute+book.book.readingMinutes);doc=r.doc;}
 doc.state.location='bld_bs_temple';doc.state.minute=Math.ceil(doc.state.minute/1440)*1440+540;
 const color=await cast(structuredClone(doc),{spell:id('color_read'),target:fid('ore_tray')});assert.equal(color.result.observation.spectrum.length,3);
 const shadow=await cast(structuredClone(doc),{spell:id('shadow_rule'),target:fid('screen_wall'),source:fid('porch_lamp'),destination:fid('incense_post')});assert.equal(shadow.result.observation.heightMeters,1);assert.ok(shadow.result.observation.shadowLengthMeters>0);
 const hidden=structuredClone(doc);hidden.state.effects.fixture_camouflage={kind:'status',target:'player',status:'camouflage',power:5,expires:hidden.state.minute+30,source:'fixture_camouflage'};
 const found=await cast(hidden,{spell:id('reveal'),target:'player'});assert.deepEqual(found.result.revealed,['fixture_camouflage']);
 // In the unlit back corner the caster's own shadow holds the feet for two minutes.
 let corner=(await run(structuredClone(doc),'world_environment',{operation:'approach',target:fid('dark_corner')})).doc;assert.equal(lightAt(reader(corner),engine,'bld_bs_temple',[5,-5]).illumination,'dim');
 const bound=await cast(corner,{spell:id('shadow_bind'),target:'player'});await assert.rejects(engine.reduce(bound.doc,{tool:'world_environment',args:{operation:'approach',target:fid('ore_tray')},eventId:'bound-step'}),/阴影/);
 await assert.rejects(engine.reduce(structuredClone(doc),{tool:'world_cast',args:{spell:id('shadow_bind'),target:'player'},eventId:'lit-bind'}),/微光/);
 const watcher=structuredClone(doc);watcher.state.npcs[MIAO].location='bld_bs_temple';recordLocalContact(writer(watcher),engine,MIAO,'s3-watch');
 const split=await cast(watcher,{spell:id('split_shadow'),target:'player',destination:MIAO});assert.equal(split.result.observer,MIAO);assert.equal(split.result.physical,false);
 const hurt=structuredClone(doc);Object.assign(hurt.state.player,{hp:20,maxHp:60});const healed=await cast(hurt,{spell:id('revive_breath'),target:'player'});assert.equal(healed.doc.state.player.hp,hurt.state.player.hp+10);
 const wear=await cast(structuredClone(doc),{spell:id('wear_read'),target:fid('old_mortar')});assert.equal(wear.result.observation.wear.length,2);
 const lamp=await cast(structuredClone(doc),{spell:id('night_lamp'),target:books[1].id});assert.equal(lamp.result.illuminated,true);assert.equal(lamp.result.expires,doc.state.minute+1+240);
 const guard=await cast(structuredClone(doc),{spell:id('heat_guard'),target:'player'});assert.equal(consumeMagicProtection(writer(guard.doc),'player',9,'fire').absorbed,6);
 const dry=await cast(structuredClone(doc),{spell:id('cloth_dry'),target:fid('drying_cloth')});assert.equal(dry.result.evaporatedMg,1000);assert.equal(rec(dry.doc,fid('drying_cloth')).thermal.moistureMg,4000);
 // Failure keeps the spent cost; missing material refuses before spending.
 const poor=structuredClone(doc);poor.state.inventory.item_charcoal.quantity=0;const saved=structuredClone(poor);await assert.rejects(engine.reduce(poor,{tool:'world_cast',args:{spell:id('wear_read'),target:fid('old_mortar')},eventId:'no-charcoal'}),/缺少材料/);assert.deepEqual(poor,saved);
 const uncert=structuredClone(base());uncert.state.professions.combat=null;uncert.state.inventory[books[0].id]={quantity:1,durability:80};await assert.rejects(engine.reduce(uncert,{tool:'world_learn',args:{kind:'spell',entity:id('reveal'),source:books[0].id},eventId:'uncert'}),/职业认证/);
});

test('旧战役升级逐键加入书、材料与导师课目，售空不回补，升级后可买可学',async()=>{
 const oldEngine=new WorldEngine(before),doc=oldEngine.createCharacter(seed,{},'s3-old');doc.state.minute=540;doc.state.location='bld_hw_school';doc.state.player.coins=10000;doc.state.player.attributes.智力=30;doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
 // An earlier copy of the same key (sold out or worn) must not be refilled.
 doc.state.npcs.npc_hw_luqing.inventory[books[0].id]=0;doc.state.npcs[JI].inventory.item_s3_incense={quantity:1,durability:20};doc.state.npcs[JI].coins=7;
 const saved=structuredClone(doc),incoming=compatibleWorld(before,world).world,plan=planWorldUpgrade(doc,before,incoming,{worldHash:'s3-edition',eventId:'upgrade'}),after=applyPatches(doc,plan.patches);
 const added=plan.result.stockAdded.map(r=>`${r.npc}:${r.item}`);
 for(const b of books.slice(1))assert.ok(added.includes(`npc_hw_luqing:${b.id}`));assert.ok(!added.includes(`npc_hw_luqing:${books[0].id}`));assert.ok(!added.includes(`${JI}:item_s3_incense`));
 for(const [who,{inventory}] of Object.entries(mentors))for(const item of Object.keys(inventory))if(!(who===JI&&item==='item_s3_incense'))assert.ok(added.includes(`${who}:${item}`),`${who}:${item}`);
 assert.deepEqual(after.state.player,saved.state.player);assert.deepEqual(after.state.inventory,saved.state.inventory);assert.deepEqual(after.memories,saved.memories);
 assert.equal(after.state.npcs.npc_hw_luqing.inventory[books[0].id],0);assert.deepEqual(after.state.npcs[JI].inventory.item_s3_incense,{quantity:1,durability:20});assert.equal(after.state.npcs[JI].coins,7);
 const upgraded=new WorldEngine(incoming),buy=await upgraded.reduce(after,{tool:'world_trade',args:{seller:'npc_hw_luqing',item:books[1].id,quantity:1},eventId:'buy-after'}),bought=applyPatches(after,buy.patches);assert.ok(buy.result.cost>0);
 let learned;for(let i=0;i<40&&!learned;i++){const r=await upgraded.reduce(bought,{tool:'world_learn',args:{kind:'spell',entity:books[1].book.teaches[0],source:books[1].id},eventId:`learn-after-${i}`});if(r.result.success)learned=applyPatches(bought,r.patches);}
 assert.equal(learned.state.spells[books[1].book.teaches[0]].source.id,books[1].id);
 const repeat=planWorldUpgrade(learned,incoming,incoming,{worldHash:'s3-edition',eventId:'repeat'});assert.deepEqual(repeat.result.stockAdded,[]);assert.deepEqual(applyPatches(learned,repeat.patches).state.npcs,learned.state.npcs);
 // Teaching now comes from the upgraded definitions without touching saved state.
 for(const [who,{teach}] of Object.entries(mentors))for(const what of teach)assert.ok(upgraded.byId.get(who).services.includes(what));
});

test('隔离发布只追加本批，保留其他条目，重复发布零写入，篡改或冲突拒绝且不回补库存',async t=>{
 assert.equal(world.spells.length,before.spells.length+spells.length);
 for(const k of ['spells','skills','items'])assert.deepEqual(world[k].filter(r=>!ids[k].has(r.id)),before[k].filter(r=>!ids[k].has(r.id)));
 if(published)assert.deepEqual(world,formal);
 assert.deepEqual(mergeS3Publication(world,publication),world);
 const zero=structuredClone(world);zero.npcs.find(n=>n.id==='npc_hw_luqing').inventory[books[0].id]=0;zero.npcs.find(n=>n.id===SHU).inventory.item_s3_rice=0;assert.deepEqual(mergeS3Publication(zero,publication).npcs,zero.npcs);
 const conflict=structuredClone(world);conflict.spells.find(s=>s.id===spells[0].id).name+='异文';assert.throws(()=>mergeS3Publication(conflict,publication),/冲突/);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-s3-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const folder of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 await fs.mkdir(path.join(root,'drafts'));await fs.cp(path.resolve('world/drafts/w2-s3'),path.join(root,'drafts/w2-s3'),{recursive:true});
 const key={'meta/spells.json':'spells','meta/skills.json':'skills','meta/items.json':'items','meta/recipes.json':'recipes','people/baseline.json':'npcs','geo/locations.json':'locations'};
 for(const f of publishedFiles)await fs.writeFile(path.join(root,f),JSON.stringify(before[key[f]]));
 const original=await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),preview=await publishS3({root});
 const changedFiles=publishedFiles.filter(f=>f!=='meta/recipes.json');
 assert.equal(preview.published,false);assert.equal(preview.formalSpellCount,before.spells.length+spells.length);assert.deepEqual(preview.changed,changedFiles);assert.equal(await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),original);
 const first=await publishS3({root,publish:true});assert.deepEqual(first.changed,changedFiles);
 const reloaded=await loadWorld(root);for(const k of Object.values(key))assert.deepEqual(reloaded[k],world[k]);
 const times=await Promise.all(publishedFiles.map(f=>fs.stat(path.join(root,f)).then(s=>s.mtimeMs)));assert.deepEqual((await publishS3({root,publish:true})).changed,[]);
 for(const [file,mutate,pattern] of [['candidate.json',r=>{r.spells[0].failure+='免费';},/候选/],[`${spells[0].id}.json`,r=>{r.draft.prose.theory+='另外';},/内容已改变|不符/],['batch-0.json',r=>{r.l4.approved=false;},/L4/],['batch-0.json',r=>{r.l4.wave[0].scores[0]=2;},/评分/]]){
  const f=path.join(root,'drafts/w2-s3',file),bytes=await fs.readFile(f,'utf8'),r=JSON.parse(bytes);mutate(r);await fs.writeFile(f,JSON.stringify(r));await assert.rejects(publishS3({root,publish:true}),pattern);await fs.writeFile(f,bytes);
 }
 assert.deepEqual(await Promise.all(publishedFiles.map(f=>fs.stat(path.join(root,f)).then(s=>s.mtimeMs))),times);
});
