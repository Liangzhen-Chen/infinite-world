import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {readS4Publication,mergeS4Publication,publishS4,withoutS4,designPublication,files as publishedFiles} from '../tools/publish-w2-s4.mjs';
import {spells,books,items,placements,mentors,routes,routeOf,ritualScopes,TABLET} from '../world/design/w2-s4.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {consumeMagicProtection} from '../server-plugin/magic-primitives.mjs';
import {wildlifeEncounterAt} from '../server-plugin/wildlife.mjs';
import {questGenerators} from '../server-plugin/quest-sources.mjs';
// 跳日的夹具用skipTo同时把势力时钟移到下一边界（T159新增日钟）。
import {skipTo} from './fixtures/skip-clock.mjs';

const formal=await loadWorld(),publication=process.env.W2S4_DESIGN?designPublication():await readS4Publication();
const ids={spells:new Set(spells.map(s=>s.id)),skills:new Set(spells.map(s=>s.skill)),items:new Set([...books,...items].map(i=>i.id))};
// The edition before this batch is rebuilt from the formal world, so the test
// works before and after publication and never pins catalogue totals.
const before=withoutS4(formal),world=mergeS4Publication(before,publication),engine=new WorldEngine(world);
const published=formal.spells.some(s=>ids.spells.has(s.id));
// Reconstruct the edition in its formal catalogue order, including later items.
if(published){const order=new Map(formal.items.map((r,i)=>[r.id,i]));world.items.sort((a,b)=>order.get(a.id)-order.get(b.id));}
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAO='npc_bs_077_1',JI='npc_bs_076_3',SHU='npc_bs_078_2',MIAO='npc_bs_080_3',MAGE='npc_bs_077_2',LU='npc_hw_luqing';
const MIST='loc_wild_wt_mist',KILN='loc_wild_bs_kiln',SOUL='monster_mist_flat_soul',WISP='monster_marsh_wisp',LAMP='monster_tile_lamp_wraith';
const home={道:'bld_bs_reed_dao',佛:'bld_bs_still_temple',祭:'bld_bs_temple',巫:'bld_bs_temple'};
const rec=(doc,id)=>doc.state.records[`physical_feature:${id}`]?.state??world.locations.flatMap(l=>l.features??[]).find(f=>f.id===id).state;
const fid=k=>`feature_s4_${k}`,id=k=>`spell_s4_${k}`;
const reader=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const writer=doc=>({...reader(doc),set:(p,value)=>{let n=doc;for(const k of p.slice(0,-1))n=n[k]??={};n[p.at(-1)]=structuredClone(value);},remove:p=>{let n=doc;for(const k of p.slice(0,-1))n=n[k];delete n[p.at(-1)];}});
let serial=0;
async function run(doc,tool,args){const out=await engine.reduce(doc,{tool,args,eventId:`s4-${++serial}`});return {doc:applyPatches(doc,out.patches),result:out.result};}
// Select a reproducible successful dice event without editing dice or state.
async function success(doc,tool,args,key='success'){for(let i=0;i<60;i++){const r=await run(doc,tool,args).catch(e=>{e.message+=` @${tool} ${JSON.stringify(args)} t=${doc.state.minute}`;throw e;});if(r.result.effectFailed)assert.fail(r.result.effectFailed);if(r.result[key])return r;}assert.fail(`未取得成功检定：${tool} ${JSON.stringify(args)}`);}
async function wait(doc,minutes){return (await run(doc,'world_time',{minutes,activity:'等待'})).doc;}
async function clock(doc,minuteOfDay){let target=Math.floor(doc.state.minute/1440)*1440+minuteOfDay;if(target<=doc.state.minute)target+=1440;return wait(doc,target-doc.state.minute);}
async function at(doc,minuteOfDay){let target=Math.floor(doc.state.minute/1440)*1440+minuteOfDay;if(target<=doc.state.minute)target+=1440;while([10,20,30].includes(engine.calendar(target).day))target+=1440;return wait(doc,target-doc.state.minute);}
// Residents can fall ill (NPC life simulation); lessons wait for a day the teacher is actually there.
async function attend(doc,teacher,place,minuteOfDay){for(let i=0;i<40;i++){doc=await at(doc,minuteOfDay);const n=doc.state.npcs[teacher];if(n.location===place&&!n.status?.match?.(/患病|昏迷/)&&n.status!=='患病')return doc;}assert.fail(`${teacher}长期不在${place}`);}
async function grant(doc,owner,...targets){const auth=[];for(const t of targets){const r=await run(doc,'world_promise',{operation:'grant_access',promisor:owner,location:t,minutes:600,content:'本人同意限定用途；到期或撤销即终止许可'});doc=r.doc;auth.push(r.result.authorization);}return{doc,authorization:auth[0],authorizations:auth.slice(1)};}
// K6 (acf503a8, legality is a consequence): casting on someone's object without their grant is physically
// the same cast; it takes effect and the missing licence is committed as unauthorized use against the
// object's owner under the cast's own event.
async function unlicensedCast(doc,args){
 const r=await cast(doc,args),owner=world.locations.flatMap(l=>l.features??[]).find(f=>f.id===args.target)?.owner;
 const rows=Object.values(r.doc.state.records).filter(x=>x.category==='offense'&&!doc.state.records[x.id]);
 assert.ok(typeof owner==='string'&&owner!=='player',args.target);
 assert.equal(rows.length,1,JSON.stringify(rows));assert.equal(rows[0].offense,'unauthorized_use');assert.equal(rows[0].victim,owner);
 assert.equal(rows[0].offender,'player');assert.equal(rows[0].subject.id,args.target);assert.equal(rows[0].sourceEvent,`s4-${serial}`);
 return r;
}
async function cast(doc,args){const prior=doc,r=await success(doc,'world_cast',args),s=world.spells.find(x=>x.id===args.spell);
 assert.ok(r.doc.state.player.mp<=prior.state.player.mp-s.mp);
 for(const m of s.materials)assert.equal(r.doc.state.inventory[m.item]?.quantity??0,(prior.state.inventory[m.item]?.quantity??0)-m.amount);
 return r;}
async function track(doc,species){const r=await success(doc,'world_wildlife',{operation:'track',species});assert.equal(r.result.found.species,world.monsters.find(m=>m.id===species).name);return{doc:r.doc,target:r.result.found.id};}
async function approachContact(doc,target){
 await import('../server-plugin/primitives-runtime.mjs');
 const close=await run(doc,'world_move',{destination:target});assert.equal(close.result.arrived,true);
 const position=close.doc.state.records[`local_actor_position:${target}`];
 assert.equal(position.minute,close.doc.state.minute);assert.equal(position.expires,position.minute+10);
 return close.doc;
}
async function takeT155(doc,cause,target){
 // Public templates run through their registered U17 generator after tracking.
 const q=world.rules.questSources.wildlife.find(r=>r.id===cause),saved=world.rules.questSources.wildlife;
 world.rules.questSources.wildlife=[q];
 try{questGenerators().find(g=>g.id==='village_wildlife').scan(writer(doc),engine,doc.state.minute);}finally{world.rules.questSources.wildlife=saved;}
 const row=Object.values(doc.state.quests).find(q=>q.source?.cause===cause&&q.objective.target===target);assert.ok(row,`告示必须指向实际个体 ${target}`);
 doc=(await run(doc,'world_quest',{operation:'accept',quest:row.id})).doc;
 await assert.rejects(run(doc,'world_quest',{operation:'complete',quest:row.id}),/证据/);
 return {doc,quest:row.id};
}
async function settleT155(doc,quest){
 const coins=doc.state.player.coins,r=await run(doc,'world_quest',{operation:'complete',quest});
 assert.equal(r.result.reward,60);assert.equal(r.doc.state.player.coins,coins+60);
 await assert.rejects(run(r.doc,'world_quest',{operation:'complete',quest}),/可结算/);return r.doc;
}
const eco=(doc,habitat)=>doc.state.records[`ecology:${habitat}`].populations;
const present=(doc,species,location)=>Object.values(doc.state.creatures??{}).filter(a=>a.species===species&&a.location===location&&a.status!=='死亡'&&a.hp>0).length;

// Public route: arrive, initiate, learn the core skill, practise, certify, learn
// this batch, keep the precepts for a day and pay for the institution's real
// ritual qualification, then buy the route's material.
const learnedByRoute={},permits={};
async function routeSession(route){
 const r=routes[route],teacher=r.teacher,place=home[route],role=world.professions.find(p=>p.id===r.profession);
 let doc=engine.createCharacter(seed,{},`s4-${route}`);doc.state.minute=510;doc.state.location='loc_bs';Object.assign(doc.state.player,{level:10,coins:5000});
 for(const a of Object.keys(doc.state.player.attributes))doc.state.player.attributes[a]=18;
 doc=(await run(doc,'world_move',{destination:place})).doc;
 const entry=world.rules.training.institutions.find(e=>e.teacher===teacher&&e.profession===role.id);
 doc=(await run(doc,'world_profession',{operation:'initiate',profession:role.id,teacher,institution:place,rule:entry.rule})).doc;
 const core=role.entry.skill;doc=(await success(doc,'world_learn',{entity:core,source:teacher,kind:'skill'})).doc;
 // Acquisition and certification are exercised publicly. Prior accumulated
 // proficiency is a premise; one native session must really cross 150.
 const staged=applyIntentSetup(engine,doc,{abilities:{skills:{[core]:149}}});
 assert.deepEqual(staged.setupUnmet,[]);doc=staged.document;
 const practiceMinute=doc.state.minute,practiced=await run(doc,'world_practice',{skill:core});doc=practiced.doc;
 assert.ok(practiced.result.gain>0);assert.ok(doc.state.skills[core].proficiency>=150);
 assert.equal(doc.state.minute,practiceMinute+120);
 doc=await attend(doc,teacher,place,510);doc=(await success(doc,'world_profession',{profession:role.id,teacher,operation:'certify'},'certified')).doc;
 assert.equal(doc.state.professions.combat,role.id);
 for(const s of spells.filter(s=>routeOf[s.id]===route)){
  doc=await attend(doc,teacher,place,800);const coins=doc.state.player.coins,teacherCoins=doc.state.npcs[teacher].coins;
  const l=await success(doc,'world_learn',{kind:'spell',entity:s.id,source:teacher});doc=l.doc;
  assert.equal(doc.state.spells[s.id].source.id,teacher);assert.equal(doc.state.spells[s.id].source.type,'teacher');
  assert.equal(doc.state.player.coins,coins-s.learnFee);assert.equal(doc.state.npcs[teacher].coins,teacherCoins+s.learnFee);
 }
 // The ritual scope added for this batch is the institution's registered one.
 for(const s of spells.filter(s=>routeOf[s.id]===route&&s.effectSpec.kind==='ritual'))assert.ok(entry.ritualOperations.includes(s.effectSpec.operation),s.id);
 doc=await attend(doc,teacher,place,540);
 const o=await run(doc,'world_profession',{operation:'ritual_officiate',profession:role.id,teacher,institution:place,...(entry.deity?{deity:entry.deity}:{}),minutes:10080});
 assert.ok(o.result.permit.startsWith('ritual_permission:'));assert.equal(o.result.cost,entry.ritualFee);doc=o.doc;permits[route]=o.result.permit;
 doc=await attend(doc,teacher,place,700);
 const t=await run(doc,'world_trade',{seller:teacher,item:r.material,quantity:4});assert.ok(t.result.cost>0);doc=t.doc;assert.equal(doc.state.inventory[r.material].quantity,4);
 // Casting branches below start rested with a deep mana pool; costs are still asserted.
 Object.assign(doc.state.player,{mp:500,maxMp:500});learnedByRoute[route]=doc;return doc;
}
// Field rites happen where the real spirits are: walk out and wait for their hours.
async function field(doc,location,minuteOfDay){doc=(await run(doc,'world_move',{destination:location})).doc;assert.equal(doc.state.location,location);return clock(doc,minuteOfDay);}

test('道、佛、祭、巫四条路线实际入门、认证、学会本批法术并取得含本批仪式范围的主持资格',async()=>{
 for(const route of ['道','佛','祭','巫'])await routeSession(route);
 assert.equal(Object.keys(learnedByRoute).length,4);
 // Without the institution's qualification no rite starts and nothing is spent.
 const plain=structuredClone(learnedByRoute.佛),saved=structuredClone(plain);
 await assert.rejects(engine.reduce(plain,{tool:'world_cast',args:{spell:id('vow_guard'),target:'player'},eventId:'no-permit'}),/资格/);assert.deepEqual(plain,saved);
});

test('度亡：止波寺资格对雾滩低阶游魂施放，游魂进入已超度终态、记入牌位，种群扣减且不能用于复活',async()=>{
 // Standalone regression selection still learns and certifies this real route.
 const base=learnedByRoute.佛??await routeSession('佛');assert.ok(base,'需先完成路线学习');
 let doc=await field(structuredClone(base),MIST,1290);const p=permits.佛,pop0=eco(doc,'habitat_wt_mist_flat')[SOUL];
 const total0=pop0.count+present(doc,SOUL,MIST);
 // Non-souls, living people and the player are refused before any cost.
 const wisp=await track(doc,WISP);let saved=structuredClone(wisp.doc);
 await assert.rejects(engine.reduce(wisp.doc,{tool:'world_cast',args:{spell:id('ferry'),target:wisp.target,permit:p},eventId:'ferry-wisp'}),/游魂/);assert.deepEqual(wisp.doc,saved);
 await assert.rejects(engine.reduce(wisp.doc,{tool:'world_cast',args:{spell:id('ferry'),target:'player',permit:p},eventId:'ferry-self'}),/游魂|复活/);
 await assert.rejects(engine.reduce(wisp.doc,{tool:'world_cast',args:{spell:id('ferry'),target:JI,permit:p},eventId:'ferry-npc'}),/游魂|复活|在场/);
 const found=await track(doc,SOUL);doc=found.doc;
 assert.equal(eco(doc,'habitat_wt_mist_flat')[SOUL].count+present(doc,SOUL,MIST),total0);
 const job=await takeT155(doc,'t155_wt_soul',found.target);
 // 06 §6.7/§6.5: the seven-minute acceptance plus this five-minute rite
 // exceeds the original contact proof; approach the still visible soul first.
 doc=await approachContact(job.doc,found.target);
 const f=await cast(doc,{spell:id('ferry'),target:found.target,permit:p});doc=f.doc;
 doc=await settleT155(doc,job.quest);
 assert.equal(f.result.ferried,true);assert.equal(f.result.revived,false);assert.equal(f.result.destination,TABLET);
 const soul=doc.state.creatures[found.target];assert.equal(soul.status,'已超度');assert.equal(soul.location,null);assert.equal(soul.hp,0);assert.equal(soul.spirit.realm,'beyond');
 const ledger=doc.state.records[f.result.record];assert.equal(ledger.category,'spirit_ferry');assert.equal(ledger.revivable,false);assert.equal(ledger.destination,TABLET);
 assert.deepEqual(rec(doc,TABLET).names.map(n=>n.subject),[found.target]);
 const pop=eco(doc,'habitat_wt_mist_flat')[SOUL];assert.equal(pop.ferried,1);assert.equal(pop.count+present(doc,SOUL,MIST),total0-1);
 // A ferried soul has left the scene: it cannot be ferried again, exorcised or drawn back.
 saved=structuredClone(doc);await assert.rejects(engine.reduce(doc,{tool:'world_cast',args:{spell:id('ferry'),target:found.target,permit:p},eventId:'ferry-again'}),/游魂|实际|需要/);assert.deepEqual(doc,saved);
 assert.equal(Object.values((await run(doc,'world_wildlife',{operation:'observe'})).result.animals).some(a=>a.id===found.target),false);
 // Long native study can fill the habitat. Reuse the real ferry's vacancy,
 // rather than expecting a full fresh baseline to manifest beyond capacity.
 const flat=structuredClone(doc),rite=await cast(flat,{spell:id('calm_flat'),permit:p});
 assert.deepEqual(rite.result.species.sort(),[SOUL,WISP].sort());assert.equal(rite.result.expires,rite.doc.state.minute+10080);
 await assert.rejects(engine.reduce(rite.doc,{tool:'world_cast',args:{spell:id('calm_flat'),permit:p},eventId:'calm-twice'}),/叠加/);
 const week=d=>{const day=Math.floor(d.state.minute/1440);let next=day;while(next%7!==6)next++;return (next+1)*1440+60-d.state.minute;};
 const plainDoc=structuredClone(rite.doc);for(const [k,e] of Object.entries(plainDoc.state.effects))if(e.kind==='ritual'&&e.operation==='consecrate')delete plainDoc.state.effects[k];
 const w=week(rite.doc),held=await wait(rite.doc,w),open=await wait(plainDoc,w);
 const sum=(d,k)=>[SOUL,WISP].reduce((n,s)=>n+(eco(d,'habitat_wt_mist_flat')[s][k]??0),0);
 assert.ok(sum(open,'arisen')>sum(plainDoc,'arisen'),`未作法时本季应有新聚成 ${JSON.stringify({minute:plainDoc.state.minute,season:engine.calendar(plainDoc.state.minute).season,populations:[SOUL,WISP].map(id=>({id,count:eco(plainDoc,'habitat_wt_mist_flat')[id].count,present:present(plainDoc,id,MIST),manifest:world.monsters.find(m=>m.id===id).wildlife.manifest}))})}`);assert.equal(sum(held,'arisen'),sum(rite.doc,'arisen'));assert.ok(sum(held,'suppressed')>0);
});

test('佛门守戒与立愿：持戒护身吸收刀棍与暗影伤害，立愿生成止波师承誓约，契纹自查读出原签条款',async()=>{
 const base=learnedByRoute.佛;assert.ok(base);const fresh=()=>structuredClone(base),p=permits.佛;
 const guard=await cast(fresh(),{spell:id('vow_guard'),target:'player',permit:p}),g=writer(guard.doc);
 assert.equal(consumeMagicProtection(g,'player',6,'physical').absorbed,6);assert.equal(consumeMagicProtection(g,'player',6,'shadow').absorbed,4);assert.equal(consumeMagicProtection(g,'player',6,'fire').absorbed,0);
 // Breaking a precept ends the shield at the next clock settlement.
 const broken=structuredClone(guard.doc);broken.state.careers.profession_monk.initiation.lastBreach=broken.state.minute;broken.state.player.faith.lastBreach=broken.state.minute;
 assert.equal(Object.values((await wait(broken,1)).state.effects).some(e=>e.spell===id('vow_guard')),false);
 const vow=await cast(fresh(),{spell:id('still_vow'),target:'player',text:'每日清扫静息廊，不再迟到',permit:p});
 const contract=vow.doc.state.records[vow.result.contract];assert.equal(contract.kind,'oath');assert.equal(contract.church,'止波师承');assert.deepEqual(contract.parties,['player']);
 // The general primer is bought and read at the Hewan bookshop like any other volume.
 let doc=vow.doc;doc.state.location='bld_hw_school';skipTo(engine,doc,Math.ceil(doc.state.minute/1440)*1440+540);doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};doc.state.player.coins+=200;doc.state.inventory.item_charcoal={quantity:3,durability:100};
 // 01 §1.6 / 15: accounts are authoritative. Synchronize this test-only
 // resource fixture before the real trade; keep A3's reconciliation intact.
 resyncBooks(engine,doc);
 const primer=books.find(b=>b.book.teaches.includes(id('contract_read')));doc=(await run(doc,'world_trade',{seller:LU,item:primer.id,quantity:1})).doc;
 doc=(await success(doc,'world_learn',{kind:'spell',entity:id('contract_read'),source:primer.id})).doc;
 const read=await cast(doc,{spell:id('contract_read'),target:vow.result.contract});assert.deepEqual(read.result.changes,[]);assert.equal(read.result.legalJudgement,false);
});

test('道门符阵：驱邪、护界、镇宅在雾滩真实生效；锁隙、门警、封界、补隙、校锚、扫尘符役在芦衡观按许可生效',async()=>{
 const base=learnedByRoute.道;assert.ok(base);const fresh=()=>structuredClone(base),p=permits.道;
 let night=await field(fresh(),MIST,1290);
 let t=await track(night,WISP);const expel=await cast(t.doc,{spell:id('expel'),target:t.target,permit:p});
 assert.deepEqual(expel.result.expelled,[t.target]);assert.equal(expel.doc.state.creatures[t.target].location,null);
 t=await track(night,SOUL);const job=await takeT155(t.doc,'t155_wt_soul',t.target);const purge=await cast(job.doc,{spell:id('home_purify'),permit:p});assert.deepEqual(purge.result.expelled,[t.target]);await settleT155(purge.doc,job.quest);
 await assert.rejects(engine.reduce(night,{tool:'world_cast',args:{spell:id('home_purify'),permit:p},eventId:'purify-empty'}),/邪秽/);
 // Ward: new spirit encounters are withheld while it lasts; other wildlife still comes.
 const ward=await cast(night,{spell:id('ward_seal'),target:'player',permit:p}),e=Object.values(ward.doc.state.effects).find(x=>x.spell===id('ward_seal'));
 assert.equal(e.expires,e.started+60);assert.equal(e.location,MIST);
 let spiritSeen=0,others=0;const spirit=s=>Boolean(world.monsters.find(m=>m.id===s)?.nature?.spirit);
 for(let i=0;i<400;i++){
  const minute=e.started+i*360,shifted=structuredClone(ward.doc),own=Object.values(shifted.state.effects).find(x=>x.spell===id('ward_seal'));Object.assign(own,{started:minute,expires:minute+60});
  const warded=wildlifeEncounterAt(reader(shifted),engine,MIST,minute),open=wildlifeEncounterAt(reader(night),engine,MIST,minute);
  if(warded?.species)assert.equal(spirit(warded.species.id),false,'护界期间不应有新灵体近身');
  if(warded?.species)others++;if(open?.species&&spirit(open.species.id))spiritSeen++;
 }
 assert.ok(spiritSeen>0&&others>0);
 // Reed hall objects need the owner's grant.
 let doc=await attend(fresh(),DAO,home.道,600);
 let g=await grant(doc,DAO,fid('scripture_door'));const lock=await cast(g.doc,{spell:id('door_lock'),target:fid('scripture_door'),authorization:g.authorization});
 await assert.rejects(engine.reduce(lock.doc,{tool:'world_environment',args:{operation:'approach',target:fid('scripture_shelf')},eventId:'locked-door'}),/封界或机械锁/);
 {const locked=await unlicensedCast(doc,{spell:id('door_lock'),target:fid('scripture_door')});await assert.rejects(engine.reduce(locked.doc,{tool:'world_environment',args:{operation:'approach',target:fid('scripture_shelf')},eventId:'locked-door-unlicensed'}),/封界或机械锁/);}
 g=await grant(doc,DAO,fid('gate'));const alarm=await cast(g.doc,{spell:id('door_alarm'),target:fid('gate'),authorization:g.authorization});
 const out=await run(alarm.doc,'world_move',{destination:'loc_bs_dongxue'});assert.ok(Object.values(out.doc.state.records).some(r=>r.category==='door_alarm'&&r.target===fid('gate')));
 g=await grant(doc,DAO,fid('gate'));const seal=await cast(g.doc,{spell:id('seal_way'),target:fid('gate'),authorization:g.authorization});assert.equal(seal.result.publicSign,'空间封界：此通道暂时封闭');
 await assert.rejects(engine.reduce(seal.doc,{tool:'world_move',args:{destination:'loc_bs_dongxue'},eventId:'sealed-gate'}),/封界/);
 assert.equal((await run(await wait(seal.doc,30),'world_move',{destination:'loc_bs_dongxue'})).doc.state.location,'loc_bs_dongxue');
 g=await grant(doc,DAO,fid('old_rift'));const mend=await cast(g.doc,{spell:id('mend_rift'),target:fid('old_rift'),authorization:g.authorization});
 assert.equal(mend.result.intensity,0);assert.equal(rec(mend.doc,fid('old_rift')).blocksSpace,false);
 g=await grant(doc,DAO,fid('anchor_stone'));assert.equal(g.doc.state.records[g.authorization].action,'teleport_anchor');
 const anchor=await cast(g.doc,{spell:id('true_anchor'),target:fid('anchor_stone'),authorization:g.authorization});assert.deepEqual(rec(anchor.doc,fid('anchor_stone')).anchorOffsetMeters,[0,0]);
 g=await grant(doc,DAO,fid('scripture_shelf'));const dust=await cast(g.doc,{spell:id('dust_talisman'),target:fid('scripture_shelf'),authorization:g.authorization});
 assert.equal(dust.result.cleanedGrams,100);assert.equal(rec(dust.doc,fid('scripture_shelf')).dustGrams,300);assert.equal(rec(dust.doc,fid('scripture_shelf')).collectedDustGrams,100);
 const mp=dust.doc.state.player.mp;assert.ok((await wait(dust.doc,10)).state.player.mp<mp,'尘役按时扣维持魔力');
});

test('灯祠祭礼：净场与镇窑灯礼作用于废窑瓦灯魅，净坛、灯前立誓与门印守戒按教派资格生效',async()=>{
 const base=learnedByRoute.祭??await routeSession('祭');assert.ok(base);const fresh=()=>structuredClone(base),p=permits.祭;
 const night=await field(fresh(),KILN,1200);const t=await track(night,LAMP);
 const job=await takeT155(t.doc,'t155_bs_lamp',t.target);
 // 06 §6.7 and §6.5: accepting a quest spends its registered time; local
 // contact must still be valid when the rite completes. Seven minutes of
 // acceptance plus three of casting reaches the original evidence's expiry.
 const saved=structuredClone(job.doc);
 // Search independent real dice events as elsewhere in this file: a failed
 // check never reaches completion validation and cannot prove stale contact.
 await assert.rejects(success(job.doc,'world_cast',{spell:id('purify'),permit:p}),/邪秽/);
 assert.deepEqual(job.doc,saved);
 // Reconfirm by actually approaching the still visible body, without extending
 // the old proof or granting coordinates to an unobserved creature.
 const close=await approachContact(job.doc,t.target);
 const purify=await cast(close,{spell:id('purify'),permit:p});assert.deepEqual(purify.result.expelled,[t.target]);await settleT155(purify.doc,job.quest);
 const settle=await cast(night,{spell:id('kiln_settle'),permit:p});assert.deepEqual(settle.result.species,[LAMP]);
 await assert.rejects(engine.reduce(await field(fresh(),MIST,1290),{tool:'world_cast',args:{spell:id('kiln_settle'),permit:p},eventId:'kiln-mist'}),/这类/);
 let doc=await attend(fresh(),MIAO,home.祭,600);
 const g=await grant(doc,MIAO,fid('lintel_altar'));const clean=await cast(g.doc,{spell:id('altar_clean'),target:fid('lintel_altar'),authorization:g.authorization,permit:p});
 assert.equal(clean.result.removed,40);assert.equal(rec(clean.doc,fid('lintel_altar')).contamination,20);
 const oath=await cast(fresh(),{spell:id('lamp_oath'),target:'player',text:'借来的灯油三日内还清',permit:p});assert.equal(oath.doc.state.records[oath.result.contract].church,'门印证契堂');
 const vow=await cast(fresh(),{spell:id('lintel_vow'),target:'player',permit:p});assert.equal(consumeMagicProtection(writer(vow.doc),'player',9,'physical').absorbed,6);
});

test('巫祝观灵与问灵：雾滩上看出在场灵体性质，问出未现身种群与度亡数目',async()=>{
 const base=learnedByRoute.巫;assert.ok(base);const p=permits.巫;
 const night=await field(structuredClone(base),MIST,1290),t=await track(night,SOUL);
 const look=await cast(t.doc,{spell:id('spirit_look'),target:'player',permit:p});assert.deepEqual(look.result.spirits.map(s=>[s.id,s.lowRank,s.nature]),[[t.target,true,'malevolent']]);
 const ask=await cast(t.doc,{spell:id('spirit_ask'),permit:p}),soul=ask.result.spirits.find(s=>s.species===SOUL);
 assert.equal(soul.present,1);assert.equal(soul.unseen,eco(t.doc,'habitat_wt_mist_flat')[SOUL].count);assert.deepEqual(soul.seasons,[0,2,3]);assert.ok(ask.result.spirits.some(s=>s.species===WISP));
 await assert.rejects(engine.reduce(structuredClone(base),{tool:'world_cast',args:{spell:id('spirit_ask'),permit:p},eventId:'ask-town'}),/栖地/);
});

test('书铺两册有限库存：购买、阅读学会空间与役灵、量距与契纹，并实地施放',async()=>{
 const start=()=>{const doc=engine.createCharacter(seed,{},'s4-books');doc.state.minute=540;doc.state.location='bld_hw_school';Object.assign(doc.state.player,{coins:10000,mp:10000,maxMp:10000});doc.state.player.attributes.智力=30;doc.state.player.attributes.精神=30;doc.state.professions.combat='profession_mage';doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};doc.state.inventory.item_charcoal={quantity:20,durability:100};return doc;};
 let doc=start();
 for(const b of books){const r=await run(doc,'world_trade',{seller:LU,item:b.id,quantity:1});assert.ok(r.result.cost>0);const left=r.doc.state.npcs[LU].inventory[b.id];assert.equal(left.quantity??left,1);doc=r.doc;}
 for(const s of spells.filter(s=>['法','通'].includes(routeOf[s.id]))){const book=books.find(b=>b.book.teaches.includes(s.id)),r=await success(doc,'world_learn',{kind:'spell',entity:s.id,source:book.id});assert.equal(r.doc.state.spells[s.id].source.id,book.id);assert.equal(r.doc.state.minute,doc.state.minute+book.book.readingMinutes);doc=r.doc;}
 const uncert=start();uncert.state.professions.combat=null;uncert.state.inventory[books[0].id]={quantity:1,durability:80};await assert.rejects(engine.reduce(uncert,{tool:'world_learn',args:{kind:'spell',entity:id('rust_bite'),source:books[0].id},eventId:'uncert'}),/职业认证/);
 // Anchor freight between the two Hewan anchors, both identified and granted by their owner.
 const s1=(await run(doc,'world_trade',{seller:LU,item:'item_book_s1_movement',quantity:1})).doc;let cargo=(await success(s1,'world_learn',{kind:'spell',entity:'spell_s1_anchor_read',source:'item_book_s1_movement'})).doc;
 cargo=await clock(cargo,600);Object.assign(cargo.state.npcs[LU],{location:'bld_hw_school',status:'正常',activity:'交谈'});delete cargo.state.npcs[LU].scheduleTravel;delete cargo.state.npcs[LU].cognitionTravel;
 cargo=(await success(cargo,'world_cast',{spell:'spell_s1_anchor_read',target:'feature_s1_anchor_school'})).doc;
 const a=await run(cargo,'world_promise',{operation:'grant_access',promisor:LU,location:'feature_s1_anchor_school',minutes:1440,content:'同意本人锚送轻物'});cargo=a.doc;cargo.state.player.companions=[LU];
 cargo=(await run(cargo,'world_move',{destination:'loc_hw_dock'})).doc;cargo.state.player.companions=[];
 cargo=(await success(cargo,'world_cast',{spell:'spell_s1_anchor_read',target:'feature_s1_anchor_dock'})).doc;
 Object.assign(cargo.state.npcs[LU],{location:'loc_hw_dock',activity:'交谈'});delete cargo.state.npcs[LU].scheduleTravel;delete cargo.state.npcs[LU].cognitionTravel;
 const b=await run(cargo,'world_promise',{operation:'grant_access',promisor:LU,location:'feature_s1_anchor_dock',minutes:1440,content:'同意本人锚送轻物'});cargo=b.doc;cargo.state.player.companions=[LU];
 cargo=(await run(cargo,'world_move',{destination:'bld_hw_school'})).doc;cargo.state.player.companions=[];
 const sent=await cast(cargo,{spell:id('anchor_cargo'),target:books[1].id,source:'feature_s1_anchor_school',destination:'feature_s1_anchor_dock',permit:a.result.authorization,authorizations:[b.result.authorization]});
 assert.equal(sent.result.location,'loc_hw_dock');assert.equal(sent.doc.state.itemInstances[sent.result.instance].status,'落地');assert.equal(sent.doc.state.inventory[books[1].id]?.quantity??0,0);
 // Sleeve store drops the book where it was sealed; far take brings it back.
 const stored=await cast(structuredClone(doc),{spell:id('sleeve_store'),target:books[1].id});assert.equal(stored.doc.state.inventory[books[1].id]?.quantity??0,0);
 const dropped=await wait(stored.doc,30);assert.equal(dropped.state.itemInstances[stored.result.instance].status,'落地');
 const back=await cast(dropped,{spell:id('far_take'),target:stored.result.instance});assert.equal(back.doc.state.inventory[books[1].id].quantity,1);
 // The East Street school yard: measure, corrode the rusted latch, two rubble servants.
 doc.state.location='bld_bs_school';doc=await attend(doc,MAGE,'bld_bs_school',600);
 const span=await cast(structuredClone(doc),{spell:id('measure'),target:'feature_s2_school_hall',destination:'feature_s2_school_yard'});assert.equal(span.result.metres,1);
 let g=await grant(doc,MAGE,fid('iron_latch'));const rust=await cast(g.doc,{spell:id('rust_bite'),target:fid('iron_latch'),authorization:g.authorization});
 assert.ok(Math.abs(rec(await wait(rust.doc,10),fid('iron_latch')).integrity-92)<1e-9);
 {const bitten=await unlicensedCast(doc,{spell:id('rust_bite'),target:fid('iron_latch')});assert.ok(Math.abs(rec(await wait(bitten.doc,10),fid('iron_latch')).integrity-92)<1e-9);}
 g=await grant(doc,MAGE,fid('brick_pile'),fid('tile_pile'),fid('rubble_cart'));const auth={authorization:g.authorization,authorizations:g.authorizations};
 const one=await cast(g.doc,{spell:id('rubble_servant'),target:fid('brick_pile'),destination:fid('rubble_cart'),...auth});assert.equal(one.result.carriedGrams,2000);
 const two=await cast(one.doc,{spell:id('rubble_servant'),target:fid('tile_pile'),destination:fid('rubble_cart'),...auth});assert.equal(rec(two.doc,fid('rubble_cart')).rubbleGrams,4000);
 const swap=await cast(two.doc,{spell:id('reassign'),target:one.result.summon,source:two.result.summon,...auth});
 assert.equal(swap.doc.state.effects[one.result.summon].assignment.target,fid('tile_pile'));assert.equal(swap.doc.state.effects[two.result.summon].assignment.target,fid('brick_pile'));
 const both=await cast(swap.doc,{spell:id('coordinate'),target:one.result.summon,source:two.result.summon,...auth});assert.equal(both.result.work.length,2);
 assert.equal(rec(both.doc,fid('rubble_cart')).rubbleGrams,8000);assert.equal(rec(both.doc,fid('brick_pile')).rubbleGrams,2000);assert.equal(rec(both.doc,fid('tile_pile')).rubbleGrams,1000);
});

test('旧战役升级逐键加入两册书与导师课目，售空不回补，升级后可买可学',async()=>{
 const oldEngine=new WorldEngine(before),doc=oldEngine.createCharacter(seed,{},'s4-old');doc.state.minute=540;doc.state.location='bld_hw_school';doc.state.player.coins=10000;doc.state.player.attributes.智力=30;doc.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
 // An earlier copy of the same key (sold out) must not be refilled.
 doc.state.npcs[LU].inventory[books[0].id]=0;
 const saved=structuredClone(doc),incoming=compatibleWorld(before,world).world,plan=planWorldUpgrade(doc,before,incoming,{worldHash:'s4-edition',eventId:'upgrade'}),after=applyPatches(doc,plan.patches);
 const added=plan.result.stockAdded.map(r=>`${r.npc}:${r.item}`);
 for(const b of books.slice(1))assert.ok(added.includes(`${LU}:${b.id}`));assert.ok(!added.includes(`${LU}:${books[0].id}`));
 assert.deepEqual(after.state.player,saved.state.player);assert.deepEqual(after.state.inventory,saved.state.inventory);assert.deepEqual(after.memories,saved.memories);
 assert.equal(after.state.npcs[LU].inventory[books[0].id],0);
 const upgraded=new WorldEngine(incoming),buy=await upgraded.reduce(after,{tool:'world_trade',args:{seller:LU,item:books[1].id,quantity:1},eventId:'buy-after'}),bought=applyPatches(after,buy.patches);assert.ok(buy.result.cost>0);
 let learned;for(let i=0;i<40&&!learned;i++){const r=await upgraded.reduce(bought,{tool:'world_learn',args:{kind:'spell',entity:books[1].book.teaches[0],source:books[1].id},eventId:`learn-after-${i}`});if(r.result.success)learned=applyPatches(bought,r.patches);}
 assert.equal(learned.state.spells[books[1].book.teaches[0]].source.id,books[1].id);
 const repeat=planWorldUpgrade(learned,incoming,incoming,{worldHash:'s4-edition',eventId:'repeat'});assert.deepEqual(repeat.result.stockAdded,[]);assert.deepEqual(applyPatches(learned,repeat.patches).state.npcs,learned.state.npcs);
 // Teaching and ritual scopes come from the upgraded definitions without touching saved state.
 for(const [who,{teach}] of Object.entries(mentors))for(const what of teach)assert.ok(upgraded.byId.get(who).services.includes(what));
 for(const [institution,v] of Object.entries(ritualScopes))for(const [profession,ops] of Object.entries(v))assert.ok(ops.every(op=>incoming.rules.training.institutions.find(e=>e.institution===institution&&e.profession===profession).ritualOperations.includes(op)));
});

test('隔离发布只追加本批，保留其他条目，重复发布零写入，篡改或冲突拒绝且不回补库存',async t=>{
 assert.equal(world.spells.length,before.spells.length+spells.length);
 for(const k of ['spells','skills','items'])assert.deepEqual(world[k].filter(r=>!ids[k].has(r.id)),before[k].filter(r=>!ids[k].has(r.id)));
 if(published)assert.deepEqual(world,formal);
 assert.deepEqual(mergeS4Publication(world,publication),world);
 const zero=structuredClone(world);zero.npcs.find(n=>n.id===LU).inventory[books[0].id]=0;assert.deepEqual(mergeS4Publication(zero,publication).npcs,zero.npcs);
 const conflict=structuredClone(world);conflict.spells.find(s=>s.id===spells[0].id).name+='异文';assert.throws(()=>mergeS4Publication(conflict,publication),/冲突/);
 if(process.env.W2S4_DESIGN)return;
 const root=await fs.mkdtemp(path.join(tmpRoot(),'dnd-s4-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 // Publication must retain the current edition's S4 norm bindings.
 for(const folder of ['meta','people','geo','lore','law','rules'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 await fs.mkdir(path.join(root,'drafts'));await fs.cp(path.resolve('world/drafts/w2-s4'),path.join(root,'drafts/w2-s4'),{recursive:true});
 const key={'meta/spells.json':'spells','meta/skills.json':'skills','meta/items.json':'items','meta/recipes.json':'recipes','people/baseline.json':'npcs','geo/locations.json':'locations','meta/rules.json':'rules'};
 for(const f of publishedFiles)await fs.writeFile(path.join(root,f),JSON.stringify(before[key[f]]));
 const original=await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),preview=await publishS4({root});
 const changedFiles=publishedFiles.filter(f=>f!=='meta/recipes.json');
 assert.equal(preview.published,false);assert.equal(preview.formalSpellCount,before.spells.length+spells.length);assert.deepEqual(preview.changed,changedFiles);assert.equal(await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),original);
 const first=await publishS4({root,publish:true});assert.deepEqual(first.changed,changedFiles);
 const reloaded=await loadWorld(root);for(const k of Object.values(key))assert.deepEqual(reloaded[k],world[k]);
 const times=await Promise.all(publishedFiles.map(f=>fs.stat(path.join(root,f)).then(s=>s.mtimeMs)));assert.deepEqual((await publishS4({root,publish:true})).changed,[]);
 for(const [file,mutate,pattern] of [['candidate.json',r=>{r.spells[0].failure+='免费';},/候选/],[`${spells[0].id}.json`,r=>{r.draft.prose.theory+='另外';},/内容已改变|不符/],['batch-0.json',r=>{r.l4.approved=false;},/L4/],['batch-0.json',r=>{r.l4.wave[0].scores[0]=2;},/评分/]]){
  const f=path.join(root,'drafts/w2-s4',file),bytes=await fs.readFile(f,'utf8'),r=JSON.parse(bytes);mutate(r);await fs.writeFile(f,JSON.stringify(r));await assert.rejects(publishS4({root,publish:true}),pattern);await fs.writeFile(f,bytes);
 }
 assert.deepEqual(await Promise.all(publishedFiles.map(f=>fs.stat(path.join(root,f)).then(s=>s.mtimeMs))),times);
});
