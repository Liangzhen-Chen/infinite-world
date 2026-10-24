// Shared checks for the T105/T106 boss batches (w4-b2, w4-b3). Every check is
// keyed to the batch's own ids; catalog totals are never asserted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {bossBatch} from '../tools/w4-boss-content.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planRuleStateMigration} from '../server-plugin/rule-state-migration.mjs';
import {templateBossCounter,applyBossCounterAbility} from '../server-plugin/boss-abilities.mjs';
import {bossCounter,defeatBoss} from '../server-plugin/bosses.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {traitsOf,validateTraits} from '../server-plugin/traits.mjs';
import {validateBossMechanics} from '../server-plugin/boss-abilities.mjs';
import {standing,collectivesOf,HOSTILE} from '../server-plugin/standing.mjs';
import {COMBAT_TACTICS} from '../world/design/w4-boss-batch.mjs';

const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const byId=w=>({...w,bosses:w.bosses.toSorted((a,b)=>a.id.localeCompare(b.id))});
const draft=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc),set(p,v){let o=doc;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=v;}});

export async function defineBatchTests(batch,{balanceFile,tiers}){
 const world=await loadWorld(),B=await bossBatch(batch),{bosses,design}=B,ids=new Set(bosses.map(b=>b.id));
 const target=b=>b.actor??b.id,body=(doc,b)=>b.actor?doc.state.npcs[b.actor]:doc.state.creatures[b.id];
 const before={...structuredClone(world),bosses:world.bosses.filter(b=>!ids.has(b.id))};
 function setup(b,w=world){
  const engine=new WorldEngine(w),fresh=engine.createCharacter(legacy,{},b.id),doc=applyPatches(fresh,planRuleStateMigration(fresh,w.rules));
  // Resident bosses keep their schedules; 21:40 is inside every resident's lair hours.
  doc.state.minute=1300;doc.state.location=b.lair;doc.state.player.hp=10000;doc.state.player.maxHp=10000;
  for(const id of [...new Set([...(b.negotiation?.accepts??[]),'item_ration'])])doc.state.inventory[id]={quantity:100,quality:'木',durability:100,weight:.2};
  let n=0;const run=async(d,tool,args,id=`${batch}-${++n}`)=>{const out=await engine.reduce(d,{tool,args,eventId:id});return {doc:applyPatches(d,out.patches),result:out.result};};
  const enter=d=>run(d,'world_field',{operation:'lair_approach',lair:b.residence.id});
  return {engine,doc,run,enter};
 }

 test(`${batch} 本批十首领正式发布：中西各半、三名智能存在，阶位覆盖`,async()=>{
  const publication=await B.readPublication();
  assert.equal(bosses.length,10);assert.equal(validateWorld(world).ok,true);
  for(const e of B.entries){assert.deepEqual(B.validateDraft(B.reviewDraftFor(e),e).errors,[]);assert.deepEqual(world.bosses.find(b=>b.id===e.id),publication.bosses.find(b=>b.id===e.id));}
  const lineage=Object.values(design.lineage);assert.equal(lineage.filter(x=>x==='中式').length,5);assert.equal(lineage.filter(x=>x==='西式').length,5);
  const smart=bosses.filter(b=>b.intelligence>0&&b.cognition&&b.negotiation);assert.equal(smart.length,3);
  for(const b of publication.bosses){assert.ok(b.residence&&b.territory&&b.tactics.length&&b.weakness&&b.taming&&b.origin&&b.lairDescription&&b.behavior&&b.tags.length,b.id);if(!b.actor)assert.ok(b.drops.length&&b.residence.replacementSpecies.length,b.id);}
  const present=new Set(world.bosses.map(b=>b.tier));for(const t of tiers)assert.ok(present.has(t),`缺${t}阶首领`);
  for(const b of bosses)assert.ok(b.tier>=1&&b.tier<=9);
  const badTags=structuredClone(world);badTags.bosses.find(b=>ids.has(b.id)).tags=['gold'];assert.match(validateTraits(badTags).join(';'),/首领体表与材质标签/);
  const longGlare=structuredClone(bosses[0]);Object.assign(longGlare.mechanics.abilities[0],{effectSpec:{kind:'status',status:'dazzle',power:1},duration:2});assert.ok(validateBossMechanics(longGlare).length>0);
  assert.deepEqual(B.merge(world,publication),world);
  assert.deepEqual(byId(B.merge(before,publication)),byId(world));
  const bad=structuredClone(world);bad.bosses.find(b=>ids.has(b.id)).origin+='异文';assert.throws(()=>B.merge(bad,publication),/冲突/);
 });

 test(`${batch} 智能首领沿用聚居地居民完整档；野生首领有真实巢穴、部下与当地迁入者`,async t=>{
  for(const b of bosses)await t.test(b.id,async()=>{
   if(b.actor){
    const npc=world.npcs.find(n=>n.id===b.actor);assert.equal(npc.tier,'full');assert.equal(npc.species,b.monster);assert.ok(npc.society);
    assert.equal(world.npcs.filter(n=>n.id===b.actor).length,1);assert.equal(world.bosses.filter(x=>x.actor===b.actor).length,1);
    assert.ok(!world.locations.some(l=>l.monsterSociety?.leader===b.id),'非首领居民不登记为聚居地首领');
    return;
   }
   const s=world.monsters.find(m=>m.id===b.monster),h=world.rules.wildlife.habitats.find(h=>h.id===b.residence.habitat);
   assert.equal(s.wildlife.habitat,h.id);assert.equal(h.location,b.lair);
   for(const id of b.residence.replacementSpecies)assert.equal(world.monsters.find(m=>m.id===id).wildlife.habitat,h.id);
   if(/独|独居|独栖|独行/.test(s.grouping))assert.equal(b.residence.minionCount,0);
   const {doc,enter}=setup(b),pop=d=>d.state.records[`ecology:${h.id}`].populations[b.monster];
   const first=await enter(doc),second=await enter(first.doc),available=Math.min(b.residence.minionCount,pop(doc).count);
   assert.equal(first.result.contact.id,b.id);assert.equal(first.result.minions.length,available);
   assert.equal(pop(first.doc).count,pop(doc).count-available);assert.deepEqual(pop(second.doc),pop(first.doc));
  });
 });

 test(`${batch} 首领体表与材质标签经K1派生，元素弱点与抗性经K2交互表在真实交锋结算中生效`,async t=>{
  for(const b of bosses)await t.test(b.id,async()=>{
   const {engine,doc,enter}=setup(b),d=(await enter(doc)).doc,traits=traitsOf(engine,d,target(b));
   for(const tag of b.tags)assert.ok(traits.tags.includes(tag),`${b.id}缺${tag}`);
   assert.ok(Object.keys(design.elements[b.id]).length>0);
   for(const tactic of COMBAT_TACTICS)assert.equal(bossCounter(draft(d),engine,target(b),tactic).damageMultiplier,design.elements[b.id][tactic]??1,`${b.id}:${tactic}`);
  });
 });

 test(`${batch} 反击、同类适应与弱点使用现有真实消费者`,async t=>{
  for(const b of bosses)await t.test(b.id,async()=>{
   const {engine,doc,enter,run}=setup(b);let d=(await enter(doc)).doc;
   Object.assign(body(d,b),{hp:10000,maxHp:10000});
   for(let i=0;i<2;i++)d=(await run(d,'world_combat',{target:target(b)})).doc;
   const actor=body(d,b);assert.equal(actor.battleMemory.tactics.unarmed,2);
   const w=b.mechanics.weaknesses[0],open=w.requiresStatus==='dazzle'?{eyesClosed:false}:{};
   assert.equal(templateBossCounter(draft(d),b,actor,'unarmed',open).damageMultiplier,.9);
   actor.battleMemory.tactics[w.tactic]=4;
   d.state.effects.weakness={kind:'status',status:w.requiresStatus,target:b.id,power:1,remainingUses:1,expires:d.state.minute+1};
   assert.equal(templateBossCounter(draft(d),b,actor,w.tactic,open).damageMultiplier,1);
   if(w.requiresStatus==='dazzle')assert.ok(templateBossCounter(draft(d),b,actor,w.tactic,{eyesClosed:true}).damageMultiplier<1);
   d.state.effects.weakness.expires=d.state.minute;assert.ok(templateBossCounter(draft(d),b,actor,w.tactic,open).damageMultiplier<1);
   const a=b.mechanics.abilities[0];d.state.effects={};actor.abilityCounters=0;actor.hp=actor.maxHp*a.belowHpPercent/100;
   assert.equal(applyBossCounterAbility(draft(d),engine,target(b),{eventId:'miss',attackIndex:0,hit:false,remainingHp:actor.hp}),null);
   for(let i=1;i<a.every;i++)assert.equal(applyBossCounterAbility(draft(d),engine,target(b),{eventId:`count-${i}`,attackIndex:0,hit:true,remainingHp:actor.hp}),null);
   const out=applyBossCounterAbility(draft(d),engine,target(b),{eventId:'trigger',attackIndex:0,hit:true,remainingHp:actor.hp});assert.equal(out.ability,a.id);
   const effect=d.state.effects['boss_ability:trigger:0'];assert.equal(effect.status,a.effectSpec.status);assert.equal(effect.power,a.effectSpec.power);assert.equal(effect.expires,d.state.minute+a.duration);
  });
 });

 test(`${batch} 被击败后巢穴空出：野生巢穴由当地别种迁入，居民首领不补刷`,async t=>{
  for(const b of bosses)await t.test(b.id,async()=>{
   const {engine,doc,enter,run}=setup(b);let d=(await enter(doc)).doc;
   Object.assign(body(d,b),{hp:0,status:'死亡'});
   const result=defeatBoss(draft(d),engine,target(b),'slain');assert.equal(result.vacant,true);
   const lair=()=>d.state.records[`lair:${b.residence.id}`];assert.equal(lair().status,'空置');assert.equal(lair().occupant,null);
   if(b.actor){assert.equal(lair().reoccupyAfter,null);for(let i=0;i<2;i++)d=(await run(d,'world_time',{minutes:20*1440})).doc;assert.notEqual(lair().occupant?.kind,'monster');return;}
   const species=b.residence.replacementSpecies[0],h=b.residence.habitat,pop=()=>d.state.records[`ecology:${h}`].populations[species],withdrawn=pop().withdrawn;
   for(let left=b.residence.vacancyDays+2;left>0;left-=30)d=(await run(d,'world_time',{minutes:Math.min(30,left)*1440})).doc;
   assert.equal(lair().occupant.kind,'monster');assert.equal(lair().occupant.definition,species);assert.ok(pop().withdrawn>withdrawn);
   assert.equal(d.state.creatures[lair().occupant.actor].species,species);assert.equal(body(d,b).status,'死亡');
  });
 });

 test(`${batch} 智能首领交涉与立场走统一入口：议和成为世界事件并读入立场，进攻破约，非首领居民不能代聚居地立约`,async t=>{
  for(const b of bosses.filter(b=>b.cognition))await t.test(b.id,async()=>{
   const {engine,doc,enter,run}=setup(b),id=target(b),first=await enter(doc);
   const lair=(extra,eventId)=>run(first.doc,'world_field',{operation:'lair_negotiate',lair:b.residence.id,pact:'respect_territory',...extra},eventId);
   if(b.cognition.goal==='defend_territory'){const denied=await lair({pact:'nonaggression'},'deny');assert.equal(denied.result.accepted,false);assert.match(denied.result.reason,/领地边界/);}
   const give=b.negotiation.accepts[0],take=b.negotiation.stock[0];
   const deal=await lair({offer:[{item:give,quantity:10}],request:take?[{item:take.item,quantity:1}]:[]},'deal');
   assert.equal(deal.result.accepted,true);assert.equal(deal.result.socialEvent.verb,'pact');
   const e=deal.doc.state.records['world_event:deal'];assert.equal(e.verb,'pact');assert.equal(e.target,id);
   assert.equal(standing(engine,deal.doc.state,id),30);
   for(const c of collectivesOf(engine,deal.doc.state,id))assert.ok(standing(engine,deal.doc.state,c.holder)>standing(engine,first.doc.state,c.holder),c.holder);
   if(take)assert.equal(deal.doc.state.inventory[take.item].quantity,(first.doc.state.inventory[take.item]?.quantity??0)+1);
   if(b.actor)await assert.rejects(lair({term:'passage',days:10},'term'),/只有聚居地首领/);
   Object.assign(body(deal.doc,b),{hp:10000,maxHp:10000});
   const fought=await run(deal.doc,'world_combat',{target:id},'attack');
   assert.equal(standing(engine,fought.doc.state,id),-60);
   if(b.actor)assert.ok(standing(engine,fought.doc.state,world.npcs.find(n=>n.id===b.actor).society)<=HOSTILE);
   const refused=await run(fought.doc,'world_field',{operation:'lair_negotiate',lair:b.residence.id,pact:'respect_territory',alliance:true},'again');
   assert.equal(refused.result.accepted,false);
  });
 });

 test(`${batch} world_upgrade：旧战役升级后加入本批巢穴与居民首领身体，原有钱物与已有变化保留`,()=>{
  const engine=new WorldEngine(before),doc=engine.createCharacter(legacy,{},`${batch}-upgrade`);
  doc.state.player.coins=321;const someone=Object.keys(doc.state.npcs)[0];doc.state.npcs[someone].coins=777;
  const plan=planWorldUpgrade(doc,before,world,{worldHash:batch,eventId:`${batch}-upgrade`});let next=applyPatches(doc,plan.patches);
  next=applyPatches(next,planBossMigration(next,world.rules,world.bosses,world));
  assert.equal(next.state.player.coins,321);assert.equal(next.state.npcs[someone].coins,777);assert.deepEqual(next.state.inventory,doc.state.inventory);
  for(const b of bosses){assert.equal(next.state.records[`lair:${b.residence.id}`]?.boss,b.id);if(b.actor)assert.equal(next.state.npcs[b.actor].boss,b.id);}
  assert.deepEqual(planBossMigration(next,world.rules,world.bosses,world),[]);
 });

 test(`${batch} 隔离发布重发零写；候选与L4篡改在写入前拒绝`,async t=>{
  const root=await fs.mkdtemp(path.join(tmpRoot(),`dnd-${batch}-publish-`));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  // A3 loadWorld includes action definitions and ontology assets; copy the complete edition before checking exact publication equality.
  for(const folder of ['meta','people','geo','lore','law','rules','templates','actions','ontology'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
  await fs.mkdir(path.join(root,'drafts'));await fs.cp(path.resolve(`world/drafts/${batch}`),path.join(root,`drafts/${batch}`),{recursive:true});
  const file=path.join(root,'meta/bosses.json');await fs.writeFile(file,JSON.stringify(before.bosses)+'\n');
  const preview=await B.publish({root});assert.equal(preview.published,false);assert.deepEqual(preview.changed,['meta/bosses.json']);
  const first=await B.publish({root,publish:true});assert.deepEqual(first.batchBossIds,bosses.map(b=>b.id));assert.deepEqual(byId(await loadWorld(root)),byId(world));
  assert.deepEqual((await B.publish({root,publish:true})).changed,[]);
  for(const [name,mutate,pattern]of [['candidate.json',r=>r.bosses[0].origin+='异文',/候选/],['batch-0.json',r=>r.l4.approved=false,/L4/],['batch-0.json',r=>r.l4.wave[0].scores[0]=2,/评分/]]){
   const p=path.join(root,`drafts/${batch}`,name),original=await fs.readFile(p,'utf8'),r=JSON.parse(original);mutate(r);await fs.writeFile(p,JSON.stringify(r));await assert.rejects(B.publish({root,publish:true}),pattern);await fs.writeFile(p,original);
  }
 });

 test(`${batch} 目录三种子平衡覆盖本批：单人≤15%，标准五人55%–65%`,async()=>{
  const report=JSON.parse(await fs.readFile(balanceFile,'utf8'));assert.equal(report.pass,true);
  for(const b of bosses)for(const seed of [20261010,20330615,409033])for(const mode of ['reference_solo','reference_team']){
   const r=report.results.find(r=>r.boss===b.id&&r.seed===seed&&r.mode===mode);assert.ok(r,`${b.id}:${seed}:${mode}`);assert.equal(r.trials,10000);assert.equal(r.pass,true);
   assert.ok(mode==='reference_solo'?r.winRate<=.15:r.winRate>=.55&&r.winRate<=.65);
  }
 });
}
