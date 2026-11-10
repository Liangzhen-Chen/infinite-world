import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {readS2Publication,mergeS2Publication,publishS2,withoutS2,files as publishedFiles} from '../tools/publish-w2-s2.mjs';
import {withoutS3} from '../tools/publish-w2-s3.mjs';
import {withoutS4} from '../tools/publish-w2-s4.mjs';
import {spells,books,items,recipes,placements,stations,mentors,routes,routeOf} from '../world/design/w2-s2.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {projectileAirPenalty} from '../server-plugin/magic-air.mjs';
// 跳日的夹具用skipTo同时把势力时钟移到下一边界（T159新增日钟）。
import {skipTo} from './fixtures/skip-clock.mjs';

// Later batches (T103 onward) are removed first so this batch is compared on its own edition.
const formal=withoutS3(withoutS4(await loadRuntimeWorld())),publication=await readS2Publication();
const ids={spells:new Set(spells.map(s=>s.id)),skills:new Set(spells.map(s=>s.skill)),items:new Set([...books,...items].map(i=>i.id)),recipes:new Set(recipes.map(r=>r.id))};
// The edition before this batch is rebuilt from the formal world, so the test
// works before and after publication and never pins catalogue totals.
const before=withoutS2(formal,{keepOwnGenerated:true}),world=mergeS2Publication(before,publication);
// 合入 F 后依据：家户每天吃饭、烧柴（F 的 npc-life）。炼丹导师家既没有别的口粮也没有柴：蜂蜜按类别成了口粮（每份饱腹 7），
// 几天的饭就把他那 3 份吃完、也按口粮自留；没有柴就只能烧他的艾绒引火包。学成后便买不到炼丹要的蜂蜜与引火包。
// 夹具（本测试的世界副本）给导师家备足面包作口粮、60 份木柴作家用燃料，让“蜂蜜与引火包是他可出让的余货”这一前提成立；断言不变。
// 面包数按 R1 重推（t-sat：面包单件饱腹 30→16，item-class.mjs satietyFactor，同样的饭要吃近两倍的面包）。探针 tools/probe-rules-a.mjs w2
// 复演丹路线至购买前（第 7 天）：st-5 导师 60 个面包吃到剩 18（吃掉 42，每天 6 个），现状 60 个吃光、再吃掉 2 份蜂蜜（蜂蜜留 1 且全部自留，可售 0，
// 买蜂蜜被拒）；现状每天吃约 12 个（84/7），120 个到购买前剩 36、蜂蜜 3 份全部可售。120 = 7 天 × 12 个 + 余量，之后一天的认证/补课也够。
const mentorHome=w=>{const n=w.npcs.find(x=>x.id==='npc_bs_078_1');n.inventory={...n.inventory,item_bread:120,item_wood:60};return w;};mentorHome(world);
const engine=new WorldEngine(world);
const published=formal.spells.some(s=>ids.spells.has(s.id));
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAO='npc_bs_077_1',WU='npc_bs_079_1',DAN='npc_bs_078_1';
const home={道:'bld_bs_reed_dao',武:'bld_bs_measured_hall',丹:'bld_bs_school'};
const rec=(doc,id)=>doc.state.records[`physical_feature:${id}`]?.state??world.locations.flatMap(l=>l.features??[]).find(f=>f.id===id).state;
const fid=k=>`feature_s2_${k}`;
let serial=0;
async function run(doc,tool,args){const out=await engine.reduce(doc,{tool,args,eventId:`s2-${++serial}`});return {doc:applyPatches(doc,out.patches),result:out.result};}
// Select a reproducible successful dice event without editing dice or state.
async function success(doc,tool,args,key='success'){for(let i=0;i<60;i++){const r=await run(doc,tool,args).catch(e=>{e.message+=` @${tool} ${JSON.stringify(args)} t=${doc.state.minute}`;throw e;});if(r.result.effectFailed)assert.fail(r.result.effectFailed);if(r.result[key])return r;}assert.fail(`未取得成功检定：${tool} ${JSON.stringify(args)}`);}
async function wait(doc,minutes){return (await run(doc,'world_time',{minutes,activity:'等待'})).doc;}
async function at(doc,minuteOfDay){let target=Math.floor(doc.state.minute/1440)*1440+minuteOfDay;if(target<=doc.state.minute)target+=1440;while([10,20,30].includes(engine.calendar(target).day))target+=1440;return wait(doc,target-doc.state.minute);}
// Residents can fall ill (NPC life simulation); lessons wait for a day the teacher is actually there.
async function attend(doc,teacher,place,minuteOfDay){for(let i=0;i<40;i++){doc=await at(doc,minuteOfDay);const n=doc.state.npcs[teacher];if(n.location===place&&!n.status)return doc;}assert.fail(`${teacher}长期不在${place}`);}
async function grant(doc,owner,...targets){const auth=[];for(const t of targets){const r=await run(doc,'world_promise',{operation:'grant_access',promisor:owner,location:t,minutes:600,content:'本人同意限定用途；到期或撤销即终止许可'});doc=r.doc;auth.push(r.result.authorization);}return{doc,authorization:auth[0],authorizations:auth.slice(1)};}

// Public route: arrive, initiate where the institution requires it, learn the
// core skill, practise, certify, then learn this batch from the same teacher.
const learnedByRoute={};
async function routeSession(route){
 const r=routes[route],teacher=r.teacher,place=home[route],role=world.professions.find(p=>p.id===r.profession);
 let doc=engine.createCharacter(seed,{},`s2-${route}`);doc.state.minute=510;doc.state.location='loc_bs';Object.assign(doc.state.player,{level:10,coins:5000});
 for(const a of Object.keys(doc.state.player.attributes))doc.state.player.attributes[a]=18;
 doc=(await run(doc,'world_move',{destination:place})).doc;
 const entry=world.rules.training.institutions.find(e=>e.teacher===teacher&&e.profession===role.id);
 if(entry)doc=(await run(doc,'world_profession',{operation:'initiate',profession:role.id,teacher,institution:place,rule:entry.rule})).doc;
 const core=role.entry.skill;doc=(await success(doc,'world_learn',{entity:core,source:teacher,kind:'skill'})).doc;
 // Acquisition and certification are exercised publicly. Prior accumulated
 // proficiency is a premise; one native session must really cross 150.
 const staged=applyIntentSetup(engine,doc,{abilities:{skills:{[core]:149}}});
 assert.deepEqual(staged.setupUnmet,[]);doc=staged.document;
 const practiceMinute=doc.state.minute,practiced=await run(doc,'world_practice',{skill:core});doc=practiced.doc;
 assert.ok(practiced.result.gain>0);assert.ok(doc.state.skills[core].proficiency>=150);
 assert.equal(doc.state.minute,practiceMinute+120);
 doc=await attend(doc,teacher,place,510);doc=(await success(doc,'world_profession',{profession:role.id,teacher,operation:'certify'},'certified')).doc;
 assert.ok([doc.state.professions.combat,...doc.state.professions.life].includes(role.id));
 for(const s of spells.filter(s=>routeOf[s.id]===route)){
  doc=await attend(doc,teacher,place,800);const coins=doc.state.player.coins,teacherCoins=doc.state.npcs[teacher].coins;
  const l=await success(doc,'world_learn',{kind:'spell',entity:s.id,source:teacher});doc=l.doc;
  assert.equal(doc.state.spells[s.id].source.id,teacher);assert.equal(doc.state.spells[s.id].source.type,'teacher');
  assert.equal(doc.state.player.coins,coins-s.learnFee);assert.equal(doc.state.npcs[teacher].coins,teacherCoins+s.learnFee);
 }
 const buy=async(item,quantity)=>{
  const t=await run(doc,'world_trade',{seller:teacher,item,quantity});
  // E6后导师私有火绒不算公开供给：S0、D1，稀缺因子1；先前真实采购使立场因子.99895。
  // 两份的零售额trunc(1×1×1×.99895×2)=1铜，其他采购仍须付款，材料消耗断言保持。
  if(item==='item_s2_tinder')assert.equal(t.result.cost,1,item);else assert.ok(t.result.cost>0,item);
  doc=t.doc;
 };
 if(route==='道'){
  doc=await attend(doc,teacher,place,800);
  for(const [item,q] of [['item_s2_yellow_paper',1],['item_s2_cinnabar',1],['item_ink_brush',1],['item_s2_talisman',4]])await buy(item,q);
  doc=(await success(doc,'world_learn',{kind:'recipe',entity:'recipe_s2_talisman',source:teacher})).doc;
  const c=await success(doc,'world_craft',{recipe:'recipe_s2_talisman'});doc=c.doc;
  assert.equal(doc.state.inventory.item_s2_talisman.quantity,8);assert.equal(doc.state.inventory.item_s2_yellow_paper?.quantity??0,0);
 }
 if(route==='武'){doc=await attend(doc,teacher,place,800);await buy('item_s2_talc',8);}
 if(route==='丹'){
  doc=await attend(doc,teacher,place,800);doc=(await success(doc,'world_learn',{kind:'spell',entity:'spell_s1_tinder',source:teacher})).doc;
  doc=await attend(doc,teacher,place,800);doc=(await success(doc,'world_learn',{kind:'recipe',entity:'recipe_s2_pill',source:teacher})).doc;
  for(const [item,q] of [['item_s2_huangjing',2],['item_s2_fuling',2],['item_s2_gancao',1],['item_honey',1],['item_s2_tinder',2],['item_charcoal',6]])await buy(item,q);
 }
 doc=await attend(doc,teacher,place,540);assert.equal(doc.state.npcs[teacher].location,place);
 // Casting branches below start rested with a deep mana pool; costs are still asserted.
 Object.assign(doc.state.player,{mp:500,maxMp:500});learnedByRoute[route]=doc;return doc;
}
async function cast(doc,args){const before=doc,r=await success(doc,'world_cast',args),s=world.spells.find(x=>x.id===args.spell);
 assert.equal(r.doc.state.player.mp,before.state.player.mp-s.mp);
 for(const m of s.materials)assert.equal(r.doc.state.inventory[m.item]?.quantity??0,(before.state.inventory[m.item]?.quantity??0)-m.amount);
 return r;}
async function litFurnace(doc){
 let g=await grant(doc,DAN,fid('pill_furnace'));doc=g.doc;const a={authorization:g.authorization};
 doc=(await run(doc,'world_environment',{operation:'load_fuel',target:fid('pill_furnace'),item:'item_s2_tinder',quantity:1,...a})).doc;
 doc=(await success(doc,'world_cast',{spell:'spell_s1_tinder',target:fid('pill_furnace'),...a})).doc;
 doc=(await run(doc,'world_environment',{operation:'load_fuel',target:fid('pill_furnace'),item:'item_charcoal',quantity:1,...a})).doc;
 assert.equal(rec(doc,fid('pill_furnace')).thermal.burning,true);return{doc,a};
}
const furnace=doc=>rec(doc,fid('pill_furnace')).thermal;

test('道、武、炼丹三路线实际拜师认证后向导师学会本批法术，并取得符、滑石粉与药材',async()=>{
 for(const route of ['道','武','丹'])await routeSession(route);
 assert.equal(Object.keys(learnedByRoute).length,3);
});

test('炼丹控火：点炉、催火、调匀温区后烘出蜜丸；不调匀则焦裂风险实际累计',async()=>{
 const base=learnedByRoute.丹;assert.ok(base,'需先完成路线学习');
 let {doc,a}=await litFurnace(structuredClone(base));
 const trace=await cast(doc,{spell:'spell_s2_wall_trace',target:fid('pill_furnace'),...a});assert.equal(trace.result.gradientC,10);assert.equal(trace.result.temperaturesC.length,2);doc=trace.doc;
 const heat=await cast(doc,{spell:'spell_s2_bellows_fire',target:fid('pill_furnace'),...a});doc=heat.doc;const input=furnace(doc).spellInputJ;
 doc=await wait(doc,10);assert.equal(furnace(doc).spellInputJ-input,30000);
 while(furnace(doc).energyJ<75000)doc=await wait(doc,2);
 const plain=structuredClone(doc);
 const even=await cast(doc,{spell:'spell_s2_even_fire',target:fid('pill_furnace'),...a});doc=await wait(even.doc,10);assert.deepEqual(furnace(doc).zoneOffsetsC,[0,0]);
 const pill=await success(doc,'world_craft',{recipe:'recipe_s2_pill'});
 assert.equal(pill.result.thermal.stress,0);assert.equal(pill.result.produced[0].amount,10);assert.equal(pill.doc.state.inventory.item_s2_pill.quantity,10);
 assert.equal(pill.doc.state.inventory.item_s2_huangjing?.quantity??0,0);assert.equal(pill.doc.state.npcs[DAN].coins,doc.state.npcs[DAN].coins+4);
 const uneven=await run(plain,'world_craft',{recipe:'recipe_s2_pill'});assert.ok(uneven.result.thermal.stress>0);assert.ok(uneven.result.thermal.riskPermille>0);
 // Fuel saving: same fire, one tenth less fuel burnt per minute.
 const saver=await cast(plain,{spell:'spell_s2_slow_fire',target:fid('pill_furnace'),...a}),calm=await wait(plain,1);
 const s10=await wait(saver.doc,10),p10=await wait(calm,10);
 assert.equal(furnace(s10).burnedFuelMg-furnace(saver.doc).burnedFuelMg,900);assert.equal(furnace(p10).burnedFuelMg-furnace(calm).burnedFuelMg,1000);
 // Smoke from the real fire is moved out along open exits.
 let smoky=await wait(plain,30);const g=await grant(smoky,DAN,fid('pill_room'));smoky=g.doc;const smoke0=rec(smoky,fid('pill_room')).air.smokeMg;assert.ok(smoke0>0);
 const vent=await cast(smoky,{spell:'spell_s2_smoke_vent',target:fid('pill_room'),path:[fid('pill_room'),fid('school_hall'),fid('school_yard')],authorization:g.authorization});
 const vented=await wait(vent.doc,5),still=await wait(smoky,6);
 assert.ok(rec(vented,fid('pill_room')).air.smokeMg<rec(still,fid('pill_room')).air.smokeMg);
});

test('道门符术：镇火、火线、静声、阻风、水帘、固堤、整坛、泥缝各自改变真实场景',async()=>{
 // A filtered regression still earns its own real route prerequisites.
 const base=learnedByRoute.道??await routeSession('道');assert.ok(base);
 // The existing ignition comparison also uses the alchemy route's learned
 // tinder spell; earn that prerequisite when selecting this case alone.
 if(!learnedByRoute.丹)await routeSession('丹');
 const fresh=()=>{const d=structuredClone(base);d.state.inventory.item_charcoal={quantity:3};d.state.spells.spell_s1_tinder=structuredClone(learnedByRoute.丹.state.spells.spell_s1_tinder);d.state.skills.skill_s1_tinder=structuredClone(learnedByRoute.丹.state.skills.skill_s1_tinder);return d;};
 // Seal first, then light the incense burner beside the old paper rack.
 const light=async doc=>{const g=await grant(doc,DAO,fid('incense_burner'));return (await success(g.doc,'world_cast',{spell:'spell_s1_tinder',target:fid('incense_burner'),authorization:g.authorization})).doc;};
 let g=await grant(fresh(),DAO,fid('talisman_room'));
 const sealed=await cast(g.doc,{spell:'spell_s2_fire_seal',target:fid('talisman_room'),authorization:g.authorization});
 let doc=await wait(await light(sealed.doc),5),open=await wait(await light(fresh()),5);
 assert.equal(rec(doc,fid('paper_rack')).thermal.burning,false);assert.equal(rec(open,fid('paper_rack')).thermal.burning,true);
 assert.ok(doc.state.player.mp<sealed.doc.state.player.mp-1);
 // Fire line blocks the local path across it until it burns out.
 // S4 starts an arrival at the gate-road zone itself. Walk south of the
 // strip before igniting it, so this negative control actually crosses fire.
 const south=await run(fresh(),'world_move',{destination:'zone_reed_court'});assert.equal(south.result.arrived,true);
 g=await grant(south.doc,DAO,fid('fire_strip'));const line=await cast(g.doc,{spell:'spell_s2_fire_line',target:fid('fire_strip'),authorization:g.authorization});assert.equal(line.result.blocksPath,true);
 await assert.rejects(engine.reduce(line.doc,{tool:'world_environment',args:{operation:'approach',target:fid('gate_road')},eventId:'cross-fire'}),/火线/);
 assert.equal(rec(await wait(line.doc,10),fid('fire_strip')).thermal.burning,false);
 // Quiet room: a call through it no longer reaches the speaker's own room.
 g=await grant(fresh(),DAO,fid('talisman_room'));const hush=await cast(g.doc,{spell:'spell_s2_hush',target:fid('talisman_room'),authorization:g.authorization});
 const say=async d=>{const p=await grant(d,DAO,fid('talisman_room'));return run(p.doc,'world_environment',{operation:'sound',target:fid('talisman_room'),destination:fid('dao_court'),text:'有人吗',authorization:p.authorization});};
 assert.deepEqual((await say(hush.doc)).result.heard,[]);assert.ok((await say(fresh())).result.heard.includes('player'));
 // Head wind on the gate road lengthens the actual trip.
 const windy=await cast(fresh(),{spell:'spell_s2_wind_block',target:fid('gate_road')});
 const calm=await wait(fresh(),1),slow=await run(windy.doc,'world_move',{destination:'loc_bs_dongxue'}),normal=await run(calm,'world_move',{destination:'loc_bs_dongxue'});
 assert.ok(slow.doc.state.minute-windy.doc.state.minute>normal.doc.state.minute-calm.state.minute);
 // Water curtain borrows real jar water and returns it.
 g=await grant(fresh(),DAO,fid('side_passage'),fid('water_jar'));const veil=await cast(g.doc,{spell:'spell_s2_water_veil',target:fid('side_passage'),source:fid('water_jar'),authorization:g.authorization,authorizations:g.authorizations});
 assert.equal(veil.result.reservedWaterMl,1000);assert.equal(rec(veil.doc,fid('water_jar')).waterMl,29000);assert.equal(rec(await wait(veil.doc,3),fid('water_jar')).waterMl,30000);
 // Bank erosion halves; altar ground is levelled; clay seals a crack.
 g=await grant(fresh(),DAO,fid('ditch_bank'),fid('bank_silt'));const bank=await cast(g.doc,{spell:'spell_s2_bank_hold',target:fid('ditch_bank'),authorization:g.authorization,authorizations:g.authorizations});
 const e0=rec(bank.doc,fid('ditch_bank')).erodedGrams,held=await wait(bank.doc,10),loose=await wait(fresh(),10);
 assert.equal(rec(held,fid('ditch_bank')).erodedGrams-e0,100);assert.ok(rec(loose,fid('ditch_bank')).erodedGrams>=200);
 g=await grant(fresh(),DAO,fid('altar_ground'));const level=await cast(g.doc,{spell:'spell_s2_altar_level',target:fid('altar_ground'),authorization:g.authorization});
 assert.equal(rec(level.doc,fid('altar_ground')).reliefCm,0);assert.deepEqual(rec(level.doc,fid('altar_ground')).roots,['老槐根须']);
 g=await grant(fresh(),DAO,fid('cracked_vat'),fid('vat_basin'),fid('clay_heap'));const seal=await cast(g.doc,{spell:'spell_s2_seam_seal',target:fid('cracked_vat'),source:fid('clay_heap'),authorization:g.authorization,authorizations:g.authorizations});
 assert.equal(rec(seal.doc,fid('clay_heap')).clayGrams,99800);const basin=rec(seal.doc,fid('vat_basin')).waterMl;assert.equal(rec(await wait(seal.doc,2),fid('vat_basin')).waterMl,basin);
 assert.ok(rec(await wait(fresh(),2),fid('vat_basin')).waterMl>0);
 // Private objects need the owner's permission; refusals keep money and materials.
 /* K6 依据（审查 C-b，所有者授权是后果）：他人之物无授权照样施放，命中擅用他人之物，罪名挂本次事件 */{const before=fresh(),out=await engine.reduce(before,{tool:'world_cast',args:{spell:'spell_s2_altar_level',target:fid('altar_ground')},eventId:'no-permit'}),after=applyPatches(before,out.patches);const o=out.result.offenses?.find(o=>o.offense==='unauthorized_use');assert.ok(o,JSON.stringify(out.result.offenses));assert.equal(after.state.records[o.record].sourceEvent,'no-permit');assert.ok(after.state.player.mp<before.state.player.mp,'施放确实发生');}
});

test('武者器用：拨矢、落叶身、闭息、听风、暖掌、开石、水索、陷足按真实条件生效',async()=>{
 const base=learnedByRoute.武;assert.ok(base);const fresh=()=>structuredClone(base);
 const turn=await cast(fresh(),{spell:'spell_s2_arrow_turn',target:'player'});
 const d={document:turn.doc,get:(...p)=>p.reduce((x,k)=>x?.[k],turn.doc)};assert.equal(projectileAirPenalty(d,'player',10000),-0.6);assert.ok(projectileAirPenalty(d,'player',200000)>-0.6);
 // Jump from the registered practice platform with and without the spell.
 const jump=async withSpell=>{let doc=(await run(fresh(),'world_environment',{operation:'approach',target:fid('jump_platform')})).doc;const g=await grant(doc,WU,fid('jump_platform'));doc=g.doc;
  if(withSpell)doc=(await cast(doc,{spell:'spell_s2_light_drop',target:'player'})).doc;return (await run(doc,'world_environment',{operation:'fall',target:fid('jump_platform'),authorization:g.authorization})).result.damage;};
 assert.equal(await jump(true),3);assert.equal(await jump(false),15);
 let g=await grant(fresh(),WU,fid('practice_corridor'));const bubble=await cast(g.doc,{spell:'spell_s2_held_breath',target:'player',source:fid('practice_corridor'),authorization:g.authorization});
 assert.equal(bubble.result.oxygenMg,600);assert.equal(rec(bubble.doc,fid('practice_corridor')).air.oxygenUsedMg>=600,true);
 const listen=await cast(fresh(),{spell:'spell_s2_wind_listen',target:fid('practice_corridor'),destination:fid('outer_court')});assert.deepEqual(listen.result.windVector,[1,0]);assert.equal(listen.result.echoDelayMs,60);
 const palm=await cast(fresh(),{spell:'spell_s2_warm_palm',target:'player'});assert.ok(palm.result.handTemperatureC<=38);assert.ok(palm.doc.state.effects[Object.keys(palm.doc.state.effects).find(k=>palm.doc.state.effects[k].operation==='warm')]);
 g=await grant(fresh(),WU,fid('trial_stone'));const stone=await cast(g.doc,{spell:'spell_s2_stone_wedge',target:fid('trial_stone'),authorization:g.authorization});assert.equal(rec(stone.doc,fid('trial_stone')).crackMm,7);assert.equal(rec(stone.doc,fid('trial_stone')).integrity,4995);
 g=await grant(fresh(),WU,fid('rope_post'),fid('wash_trough'));const rope=await cast(g.doc,{spell:'spell_s2_water_rope',target:fid('rope_post'),source:fid('wash_trough'),authorization:g.authorization,authorizations:g.authorizations});
 assert.equal(rope.result.reservedWaterMl,2000);assert.equal(rec(rope.doc,fid('wash_trough')).waterMl,18000);assert.equal(rec(await wait(rope.doc,2),fid('wash_trough')).waterMl,20000);
 g=await grant(fresh(),WU,fid('mud_pit'));const mud=await cast(g.doc,{spell:'spell_s2_mire_step',target:fid('mud_pit'),authorization:g.authorization});assert.ok(Object.values(mud.doc.state.effects).some(e=>e.operation==='mud_trap'&&e.target===fid('mud_pit')));
 /* K6 依据（审查 C-b，所有者授权是后果）：他人之物无授权照样施放，命中擅用他人之物，罪名挂本次事件 */{const before=fresh(),out=await engine.reduce(before,{tool:'world_cast',args:{spell:'spell_s2_stone_wedge',target:fid('trial_stone')},eventId:'no-permit-stone'}),after=applyPatches(before,out.patches);const o=out.result.offenses?.find(o=>o.offense==='unauthorized_use');assert.ok(o,JSON.stringify(out.result.offenses));assert.equal(after.state.records[o.record].sourceEvent,'no-permit-stone');assert.ok(after.state.player.mp<before.state.player.mp,'施放确实发生');}
});

test('书铺三册有限库存：购买、阅读学会法师与通用术式，并在学馆实地施放',async()=>{
 const base=()=>{const doc=engine.createCharacter(seed,{},'s2-books');doc.state.minute=540;doc.state.location='bld_hw_school';Object.assign(doc.state.player,{coins:10000,mp:10000,maxMp:10000});doc.state.player.attributes.智力=30;doc.state.player.attributes.精神=30;doc.state.professions.combat='profession_mage';doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};doc.state.inventory.item_charcoal={quantity:20,durability:100};return doc;};
 let doc=base();
 for(const b of books){const r=await run(doc,'world_trade',{seller:'npc_hw_luqing',item:b.id,quantity:1});assert.ok(r.result.cost>0);assert.equal(r.doc.state.npcs.npc_hw_luqing.inventory[b.id].quantity??r.doc.state.npcs.npc_hw_luqing.inventory[b.id],1);doc=r.doc;}
 for(const s of spells.filter(s=>['法','通'].includes(routeOf[s.id]))){const book=books.find(b=>b.book.teaches.includes(s.id)),r=await success(doc,'world_learn',{kind:'spell',entity:s.id,source:book.id});assert.equal(r.doc.state.spells[s.id].source.id,book.id);assert.equal(r.doc.state.minute,doc.state.minute+book.book.readingMinutes);doc=r.doc;}
 doc.state.location='bld_bs_school';skipTo(engine,doc,Math.ceil(doc.state.minute/1440)*1440+540);
 const lift=await cast(structuredClone(doc),{spell:'spell_s2_lift',target:fid('herb_tray')});assert.equal(lift.result.heightMeters,1);assert.deepEqual(lift.result.scattered,[fid('loose_tags')]);assert.equal(rec(await wait(lift.doc,2),fid('herb_tray')).heightMeters,0);
 const dust=await cast(structuredClone(doc),{spell:'spell_s2_dust_sweep',target:fid('dusty_curtain')});assert.equal(dust.result.removedDustMg,1000);assert.equal(rec(dust.doc,fid('dusty_curtain')).stainMg,300);
 const voice=await cast(structuredClone(doc),{spell:'spell_s2_voice_lane',target:fid('school_hall'),destination:fid('school_yard'),text:'丹房的炉要添炭了'});assert.deepEqual(voice.result.alongPath,[fid('school_hall'),fid('school_yard')]);
 const probe=await cast(structuredClone(doc),{spell:'spell_s2_echo_probe',target:fid('rock_ledge')});assert.equal(probe.result.observation.strata.length,2);assert.equal(probe.result.observation.errorMeters,.5);
 const ore=await cast(structuredClone(doc),{spell:'spell_s2_ore_band',target:fid('rock_ledge')});assert.equal(ore.result.observation.bands.length,1);assert.equal(ore.result.extracted,0);
 let grain=(await run(structuredClone(doc),'world_environment',{operation:'approach',target:fid('grain_sieve')})).doc;grain=(await run(grain,'world_environment',{operation:'turn_grain',target:fid('grain_sieve')})).doc;
 const dry=await cast(grain,{spell:'spell_s2_grain_dry',target:fid('grain_sieve')});assert.equal(rec(await wait(dry.doc,10),fid('grain_sieve')).moistureMg,40000);
 const soil=await cast(structuredClone(doc),{spell:'spell_s2_soil_read',target:fid('trial_plot')});assert.equal(soil.result.observation.texture,'loam');
 const till=await cast(structuredClone(doc),{spell:'spell_s2_loosen',target:fid('trial_plot')});assert.equal(rec(till.doc,fid('trial_plot')).compactionPercent,30);assert.equal(rec(till.doc,fid('trial_plot')).worked,true);
 const beam=await cast(structuredClone(doc),{spell:'spell_s2_wall_load',target:fid('school_beam')});assert.equal(beam.result.observation.overloadKg,0);assert.equal(beam.result.observation.loadKg,400);
 // Failure keeps the spent cost; missing material refuses before spending.
 const poor=structuredClone(doc);poor.state.inventory.item_charcoal.quantity=0;const saved=structuredClone(poor);await assert.rejects(engine.reduce(poor,{tool:'world_cast',args:{spell:'spell_s2_soil_read',target:fid('trial_plot')},eventId:'no-charcoal'}),/缺少材料/);assert.deepEqual(poor,saved);
 const weak=structuredClone(doc);weak.state.player.attributes.精神=1;let failed;for(let i=0;i<60&&!failed;i++){const r=await run(weak,'world_cast',{spell:'spell_s2_echo_probe',target:fid('rock_ledge')});if(!r.result.success)failed=r;}
 assert.ok(failed);assert.equal(failed.doc.state.player.mp,weak.state.player.mp-6);assert.equal(failed.doc.state.inventory.item_charcoal.quantity,weak.state.inventory.item_charcoal.quantity-1);
 const uncert=structuredClone(base());uncert.state.professions.combat=null;uncert.state.inventory[books[1].id]={quantity:1,durability:80};await assert.rejects(engine.reduce(uncert,{tool:'world_learn',args:{kind:'spell',entity:books[1].book.teaches[0],source:books[1].id},eventId:'uncert'}),/职业认证/);
});

test('旧战役升级逐键加入书、材料与导师课目，售空不回补，升级后可买可学',async()=>{
 const oldEngine=new WorldEngine(before),doc=oldEngine.createCharacter(seed,{},'s2-old');doc.state.minute=540;doc.state.location='bld_hw_school';doc.state.player.coins=10000;doc.state.player.attributes.智力=30;doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
 // An earlier copy of the same key (sold out or worn) must not be refilled.
 doc.state.npcs.npc_hw_luqing.inventory[books[0].id]=0;doc.state.npcs[DAO].inventory.item_s2_talisman={quantity:1,durability:20};doc.state.npcs[DAO].coins=7;
 const saved=structuredClone(doc),incoming=compatibleWorld(before,world).world,plan=planWorldUpgrade(doc,before,incoming,{worldHash:'s2-edition',eventId:'upgrade'}),after=applyPatches(doc,plan.patches);
 const added=plan.result.stockAdded.map(r=>`${r.npc}:${r.item}`);
 for(const b of books.slice(1))assert.ok(added.includes(`npc_hw_luqing:${b.id}`));assert.ok(!added.includes(`npc_hw_luqing:${books[0].id}`));assert.ok(!added.includes(`${DAO}:item_s2_talisman`));
 for(const [id,{inventory}] of Object.entries(mentors))for(const item of Object.keys(inventory))if(!(id===DAO&&item==='item_s2_talisman'))assert.ok(added.includes(`${id}:${item}`),`${id}:${item}`);
 assert.deepEqual(after.state.player,saved.state.player);assert.deepEqual(after.state.inventory,saved.state.inventory);assert.deepEqual(after.memories,saved.memories);
 assert.equal(after.state.npcs.npc_hw_luqing.inventory[books[0].id],0);assert.deepEqual(after.state.npcs[DAO].inventory.item_s2_talisman,{quantity:1,durability:20});assert.equal(after.state.npcs[DAO].coins,7);
 const upgraded=new WorldEngine(incoming),buy=await upgraded.reduce(after,{tool:'world_trade',args:{seller:'npc_hw_luqing',item:books[2].id,quantity:1},eventId:'buy-after'}),bought=applyPatches(after,buy.patches);assert.ok(buy.result.cost>0);
 let learned;for(let i=0;i<40&&!learned;i++){const r=await upgraded.reduce(bought,{tool:'world_learn',args:{kind:'spell',entity:books[2].book.teaches[0],source:books[2].id},eventId:`learn-after-${i}`});if(r.result.success)learned=applyPatches(bought,r.patches);}
 assert.equal(learned.state.spells[books[2].book.teaches[0]].source.id,books[2].id);
 const repeat=planWorldUpgrade(learned,incoming,incoming,{worldHash:'s2-edition',eventId:'repeat'});assert.deepEqual(repeat.result.stockAdded,[]);assert.deepEqual(applyPatches(learned,repeat.patches).state.npcs,learned.state.npcs);
 // Teaching now comes from the upgraded definitions without touching saved state.
 for(const [id,{teach}] of Object.entries(mentors))for(const what of teach)assert.ok(upgraded.byId.get(id).services.includes(what));
});

test('隔离发布只追加本批，保留其他条目，重复发布零写入，篡改或冲突拒绝且不回补库存',async t=>{
 assert.equal(world.spells.length,before.spells.length+spells.length);
 for(const k of ['spells','skills','items','recipes'])assert.deepEqual(world[k].filter(r=>!ids[k].has(r.id)),before[k].filter(r=>!ids[k].has(r.id)));
 // K5：工位由地点 fixtures 派生（引擎构造时就地物化）。对照项带同一导师家夹具，并经同一物化；草案手写的工位行按类别、热源要求、收费与主人核对其派生结果，不按旧 id。
 if(published){const expected=mentorHome(structuredClone(formal));new WorldEngine(expected);assert.deepEqual(world,expected);}
 for(const [place,rows] of Object.entries(stations))for(const row of rows){const got=world.locations.find(l=>l.id===place).workstations?.find(w=>w.kind===row.kind);assert.ok(got,`${place} 的 ${row.kind} 工位由 fixtures 派生`);assert.deepEqual({owner:got.owner,fee:got.fee,access:got.access,thermalRequirement:got.thermalRequirement},{owner:row.owner,fee:row.fee,access:row.access,thermalRequirement:row.thermalRequirement});}
 assert.deepEqual(mergeS2Publication(world,publication),world);
 const zero=structuredClone(world);zero.npcs.find(n=>n.id==='npc_hw_luqing').inventory[books[0].id]=0;zero.npcs.find(n=>n.id===DAN).inventory.item_charcoal=0;assert.deepEqual(mergeS2Publication(zero,publication).npcs,zero.npcs);
 const conflict=structuredClone(world);conflict.spells.find(s=>s.id===spells[0].id).name+='异文';assert.throws(()=>mergeS2Publication(conflict,publication),/冲突/);
 const root=await fs.mkdtemp(path.join(tmpRoot(),'dnd-s2-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 // 隔离世界保留地点依赖的四季采集密度规则及法域绑定，和S4发布夹具一致；不改发布内容或断言。
 for(const folder of ['meta','people','geo','lore','law','rules'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 await fs.mkdir(path.join(root,'drafts'));await fs.cp(path.resolve('world/drafts/w2-s2'),path.join(root,'drafts/w2-s2'),{recursive:true});
 const key={'meta/spells.json':'spells','meta/skills.json':'skills','meta/items.json':'items','meta/recipes.json':'recipes','people/baseline.json':'npcs','geo/locations.json':'locations'};
 for(const f of publishedFiles)await fs.writeFile(path.join(root,f),JSON.stringify(before[key[f]]));
 const original=await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),preview=await publishS2({root});
 assert.equal(preview.published,false);assert.equal(preview.formalSpellCount,before.spells.length+spells.length);assert.equal(preview.changed.length,publishedFiles.length);assert.equal(await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),original);
 const first=await publishS2({root,publish:true});assert.equal(first.changed.length,publishedFiles.length);
 const reloaded=mentorHome(await loadRuntimeWorld(root));new WorldEngine(reloaded);/* 对照项带同一导师家夹具并经同一引擎物化 */for(const k of Object.values(key))assert.deepEqual(reloaded[k],world[k]);
 const times=await Promise.all(first.changed.map(f=>fs.stat(path.join(root,f)).then(s=>s.mtimeMs)));assert.deepEqual((await publishS2({root,publish:true})).changed,[]);
 for(const [file,mutate,pattern] of [['candidate.json',r=>{r.spells[0].failure+='免费';},/候选/],[`${spells[0].id}.json`,r=>{r.draft.prose.theory+='另外';},/内容已改变|不符/],['batch-0.json',r=>{r.l4.approved=false;},/L4/],['batch-0.json',r=>{r.l4.wave[0].scores[0]=2;},/评分/]]){
  const f=path.join(root,'drafts/w2-s2',file),bytes=await fs.readFile(f,'utf8'),r=JSON.parse(bytes);mutate(r);await fs.writeFile(f,JSON.stringify(r));await assert.rejects(publishS2({root,publish:true}),pattern);await fs.writeFile(f,bytes);
 }
 assert.deepEqual(await Promise.all(first.changed.map(f=>fs.stat(path.join(root,f)).then(s=>s.mtimeMs))),times);
});
