import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {entries,reviewDraftFor,validateDraft} from '../tools/w4-b1-content.mjs';
import {bosses} from '../world/design/w4-b1.mjs';
import {readB1Publication,mergeB1Publication,publishB1} from '../tools/publish-w4-b1.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {planRuleStateMigration} from '../server-plugin/rule-state-migration.mjs';
import {templateBossCounter,applyBossCounterAbility} from '../server-plugin/boss-abilities.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
const world=await loadWorld(),publication=await readB1Publication(),ids=new Set(bosses.map(b=>b.id));
const before={...structuredClone(world),bosses:world.bosses.filter(b=>!ids.has(b.id))};
// T157等后续批次的首领排在本批之后；从现目录剔除本批再合并时本批追加到末尾，故按编号排序后比较内容。
const byId=w=>({...w,bosses:w.bosses.toSorted((a,b)=>a.id.localeCompare(b.id))});
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function setup(b){
 const engine=new WorldEngine(world),fresh=engine.createCharacter(legacy,{},b.id),doc=applyPatches(fresh,planRuleStateMigration(fresh,world.rules));
 doc.state.location=b.lair;doc.state.player.hp=10000;doc.state.player.maxHp=10000;
 doc.state.inventory.item_ration={quantity:100,quality:'木',durability:100,weight:.2};
 let n=0;const run=async(d,tool,args,id=`b1-${++n}`)=>{const out=await engine.reduce(d,{tool,args,eventId:id});return {doc:applyPatches(d,out.patches),result:out.result};};
 const enter=d=>run(d,'world_field',{operation:'lair_approach',lair:b.residence.id});
 const deal=(d,extra={},id)=>run(d,'world_field',{operation:'lair_negotiate',lair:b.residence.id,pact:'respect_territory',offer:[{item:'item_ration',quantity:10}],request:[{item:'item_oats',quantity:1}],...extra},id);
 return {engine,doc,run,enter,deal};
}
function draft(doc){return {get:(...p)=>p.reduce((v,k)=>v?.[k],doc),set(p,v){let o=doc;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=v;}};}

test('本批12条模板正文经审核发布，已有及后续首领保持原样',()=>{
 assert.equal(bosses.length,12);assert.equal(bosses.filter(b=>b.cognition&&b.negotiation).length,2);
 assert.equal(validateWorld(world).ok,true);
 for(const e of entries){assert.deepEqual(validateDraft(reviewDraftFor(e),e).errors,[]);assert.deepEqual(world.bosses.find(b=>b.id===e.id),publication.bosses.find(b=>b.id===e.id));}
 assert.deepEqual(byId(mergeB1Publication(before,publication)),byId(world));
 const future=structuredClone(before);future.bosses.push({...structuredClone(before.bosses[0]),id:'boss_later_batch',name:'后批占位',residence:{...before.bosses[0].residence,id:'lair_later_batch'}});
 assert.deepEqual(mergeB1Publication(future,publication).bosses.filter(b=>!ids.has(b.id)),future.bosses);
 assert.deepEqual(mergeB1Publication(world,publication),world);
 const bad=structuredClone(world);bad.bosses.find(b=>ids.has(b.id)).origin+='异文';assert.throws(()=>mergeB1Publication(bad,publication),/冲突/);
});

test('12处真实巢穴可接触；同一个体与部下守恒，独居物种不配同巢部下',async t=>{
 for(const b of bosses)await t.test(b.id,async()=>{
  const {doc,enter}=setup(b),pop=d=>d.state.records[`ecology:${b.residence.habitat}`].populations[b.monster];
  const first=await enter(doc),second=await enter(first.doc);
  assert.equal(first.result.contact.id,b.id);assert.equal(first.doc.state.minute,doc.state.minute+world.rules.bossEcology.approachMinutes);
  const available=Math.min(b.residence.minionCount,pop(doc).count);
  assert.equal(first.result.minions.length,available);assert.equal(pop(first.doc).withdrawn-pop(doc).withdrawn,available);assert.equal(pop(first.doc).count,pop(doc).count-available);
  assert.equal(pop(second.doc).withdrawn,pop(first.doc).withdrawn);assert.equal(second.result.contact.id,b.id);
  assert.deepEqual(first.doc.state.inventory,doc.state.inventory);
  const m=world.monsters.find(m=>m.id===b.monster);if(m.grouping==='独居'||m.habits.includes('不共巢'))assert.equal(b.residence.minionCount,0);
 });
});

test('当地种群耗尽时仍能接触既有首领，但不凭空生成部下',async()=>{
 const b=bosses.find(b=>b.id==='boss_b1_coil_bug'),{doc,enter}=setup(b),population=doc.state.records[`ecology:${b.residence.habitat}`].populations[b.monster];
 population.withdrawn+=population.count;population.count=0;
 const first=await enter(doc);assert.equal(first.result.contact.id,b.id);assert.deepEqual(first.result.minions,[]);
 const after=first.doc.state.records[`ecology:${b.residence.habitat}`].populations[b.monster];assert.deepEqual(after,population);
 const repeat=await enter(first.doc);assert.deepEqual(repeat.doc.state.creatures,first.doc.state.creatures);
});

test('本批12个反击、同类适应及眩光弱点使用现有真实消费者',async t=>{
 for(const b of bosses)await t.test(b.id,async()=>{
  const {engine,doc,enter,run}=setup(b);let d=(await enter(doc)).doc;
  Object.assign(d.state.creatures[b.id],{hp:10000,maxHp:10000});
  for(let i=0;i<2;i++)d=(await run(d,'world_combat',{target:b.id})).doc;
  const actor=d.state.creatures[b.id];assert.equal(actor.battleMemory.tactics.unarmed,2);
  assert.equal(templateBossCounter(draft(d),b,actor,'unarmed',{eyesClosed:false}).damageMultiplier,.9);
  actor.battleMemory.tactics[b.mechanics.weaknesses[0].tactic]=4;
  d.state.effects.weakness={kind:'status',status:'dazzle',target:b.id,power:1,remainingUses:1,expires:d.state.minute+1};
  const tactic=b.mechanics.weaknesses[0].tactic;
  assert.equal(templateBossCounter(draft(d),b,actor,tactic,{eyesClosed:false}).damageMultiplier,1);
  assert.ok(templateBossCounter(draft(d),b,actor,tactic,{eyesClosed:true}).damageMultiplier<1);
  d.state.effects.weakness.remainingUses=0;assert.ok(templateBossCounter(draft(d),b,actor,tactic,{eyesClosed:false}).damageMultiplier<1);
  const a=b.mechanics.abilities[0];d.state.effects={};actor.abilityCounters=0;actor.hp=actor.maxHp*a.belowHpPercent/100;
  assert.equal(applyBossCounterAbility(draft(d),engine,b.id,{eventId:'miss',attackIndex:0,hit:false,remainingHp:actor.hp}),null);
  assert.equal(actor.abilityCounters,0);
  for(let i=1;i<a.every;i++)assert.equal(applyBossCounterAbility(draft(d),engine,b.id,{eventId:`count-${i}`,attackIndex:0,hit:true,remainingHp:actor.hp}),null);
  const out=applyBossCounterAbility(draft(d),engine,b.id,{eventId:'trigger',attackIndex:0,hit:true,remainingHp:actor.hp});assert.equal(out.ability,a.id);
  const effect=d.state.effects['boss_ability:trigger:0'];assert.equal(effect.status,a.effectSpec.status);assert.equal(effect.power,a.effectSpec.power);assert.equal(effect.expires,d.state.minute+a.duration);
 });
});

test('两名智能存在按目标说明拒绝，实际交换库存并记住和平与攻击',async t=>{
 for(const b of bosses.filter(b=>b.cognition))await t.test(b.id,async()=>{
  const {doc,enter,deal,run}=setup(b),first=await enter(doc),n=d=>d.state.creatures[b.id].negotiation;
  assert.equal(first.doc.state.creatures[b.id].cognition.encounters[0].kind,'approach');
  const bad=await deal(first.doc,{request:[{item:'item_oats',quantity:99}]});assert.equal(bad.result.accepted,false);assert.match(bad.result.reason,/库存不足/);assert.deepEqual(bad.doc.state.inventory,first.doc.state.inventory);
  if(b.cognition.goal==='defend_territory'){const denied=await deal(bad.doc,{pact:'nonaggression'});assert.equal(denied.result.accepted,false);assert.match(denied.result.reason,/领地边界/);}
  const q=b.negotiation.stock.find(s=>s.item==='item_oats').quantity,coins=first.doc.state.player.coins;
  const trade=await deal(first.doc,{alliance:true,request:[{item:'item_oats',quantity:q}]},'trade');assert.equal(trade.result.accepted,true);
  assert.equal(trade.doc.state.inventory.item_ration.quantity,90);assert.equal(trade.doc.state.inventory.item_oats.quantity,(first.doc.state.inventory.item_oats?.quantity??0)+q);
  assert.equal(n(trade.doc).inventory.item_oats,undefined);assert.equal(n(trade.doc).inventory.item_ration.quantity,10);assert.equal(n(trade.doc).relation.alliance,true);assert.equal(trade.doc.state.player.coins,coins);
  const exhausted=await deal(trade.doc);assert.equal(exhausted.result.accepted,false);assert.match(exhausted.result.reason,/库存不足/);
  const revisit=await enter(exhausted.doc);assert.deepEqual(n(revisit.doc).inventory,n(trade.doc).inventory);assert.ok(revisit.doc.state.creatures[b.id].cognition.encounters.length>=2);
  Object.assign(revisit.doc.state.creatures[b.id],{hp:10000,maxHp:10000});
  const fought=await run(revisit.doc,'world_combat',{target:b.id},'attack');assert.equal(n(fought.doc).relation,null);assert.equal(n(fought.doc).brokenBy,'attack');
  const refused=await deal(fought.doc,{offer:[],request:[],alliance:true});assert.equal(refused.result.accepted,false);assert.match(refused.result.reason,b.cognition.goal==='defend_territory'?/领地内发起交锋/:/只能议定互不攻击/);
  if(b.cognition.goal==='avoid_conflict'){const peace=await deal(refused.doc,{offer:[],request:[],pact:'nonaggression'});assert.equal(peace.result.accepted,true);assert.equal(n(peace.doc).relation.alliance,false);}
 });
});

test('正式智能存在的记忆、库存和关系重启保留，幂等与回滚不复制物资',async t=>{
 for(const b of bosses.filter(b=>b.cognition))await t.test(b.id,async()=>{
  const {engine,doc}=setup(b),directory=await fs.mkdtemp(path.join(tmpRoot(),'dnd-b1-save-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const reducer=(d,i)=>engine.reduce(d,i),store=new CampaignStorage(directory,{reducer});await store.create({id:'b1',worldVersion:world.version,document:doc});
  await store.transact('b1',{id:'enter',anchor:'a1',input:{tool:'world_field',args:{operation:'lair_approach',lair:b.residence.id},eventId:'enter'}},reducer);
  const entered=(await store.read('b1')).document;
  const transaction={id:'trade',anchor:'a2',input:{tool:'world_field',args:{operation:'lair_negotiate',lair:b.residence.id,pact:'respect_territory',alliance:true,offer:[{item:'item_ration',quantity:10}],request:[{item:'item_oats',quantity:1}]},eventId:'trade'}};
  await store.transact('b1',transaction,reducer);const traded=(await store.read('b1')).document;
  await store.transact('b1',transaction,reducer);assert.deepEqual((await store.read('b1')).document,traded);
  const reboot=new CampaignStorage(directory,{reducer});assert.deepEqual((await reboot.read('b1')).document,traded);assert.deepEqual((await reboot.import(await reboot.export('b1'),'copy')).document,traded);
  assert.deepEqual((await reboot.reconcile('b1',['a1'],null)).document,entered);
  await reboot.transact('b1',{...transaction,id:'retry',input:{...transaction.input,eventId:'retry'}},reducer);assert.equal((await reboot.read('b1')).document.state.inventory.item_oats.quantity,(entered.state.inventory.item_oats?.quantity??0)+1);
 });
});

test('旧战役升级只追加本批巢穴，钱物与旧首领伤势记忆保留，不补交易库存',async()=>{
 const oldEngine=new WorldEngine(before),doc=oldEngine.createCharacter(legacy,{},'b1-old'),b=before.bosses[0];doc.state.location=b.lair;
 const enter=await oldEngine.reduce(doc,{tool:'world_lair',args:{operation:'approach',lair:b.residence.id},eventId:'old-enter'}),old=applyPatches(doc,enter.patches);old.state.creatures[b.id].hp=1;old.state.creatures[b.id].battleMemory.tactics.unarmed=2;
 const incoming=compatibleWorld(before,world).world,plan=planWorldUpgrade(old,before,incoming,{worldHash:'b1-edition',eventId:'upgrade'}),upgraded=applyPatches(old,plan.patches);
 assert.deepEqual(upgraded.state.player,old.state.player);assert.deepEqual(upgraded.state.inventory,old.state.inventory);assert.deepEqual(upgraded.memories,old.memories);assert.deepEqual(upgraded.state.creatures,old.state.creatures);
 for(const b of bosses)assert.ok(upgraded.state.records[`lair:${b.residence.id}`]);
 const {doc:fresh,enter:newEnter,deal}=setup(bosses.find(b=>b.cognition));const seen=(await newEnter(fresh)).doc;delete seen.state.creatures[bosses.find(b=>b.cognition).id].negotiation;
 const refused=await deal(seen);assert.equal(refused.result.accepted,false);assert.match(refused.result.reason,/库存不足/);assert.deepEqual(refused.doc.state.inventory,seen.state.inventory);
});

test('隔离正式发布与重发零写；候选、审核及L4篡改均在写入前拒绝',async t=>{
 const root=await fs.mkdtemp(path.join(tmpRoot(),'dnd-b1-publish-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const folder of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 await fs.mkdir(path.join(root,'drafts'));await fs.cp(path.resolve('world/drafts/w4-b1'),path.join(root,'drafts/w4-b1'),{recursive:true});
 const file=path.join(root,'meta/bosses.json');await fs.writeFile(file,JSON.stringify(before.bosses));const bytes=await fs.readFile(file,'utf8');
 const preview=await publishB1({root});assert.equal(preview.published,false);assert.deepEqual(preview.changed,['meta/bosses.json']);assert.equal(await fs.readFile(file,'utf8'),bytes);
 const first=await publishB1({root,publish:true});assert.deepEqual(first.batchBossIds,bosses.map(b=>b.id));assert.deepEqual(byId(await loadWorld(root)),byId(world));
 const stat=(await fs.stat(file)).mtimeMs;assert.deepEqual((await publishB1({root,publish:true})).changed,[]);
 for(const [name,mutate,pattern]of [['candidate.json',r=>r.bosses[0].origin+='异文',/候选/],[`${bosses[0].id}.json`,r=>r.draft.prose.behavior+='免费',/内容已改变/],['batch-0.json',r=>r.l4.approved=false,/L4/],['batch-0.json',r=>r.l4.wave[0].scores[0]=2,/评分/]]){
  const p=path.join(root,'drafts/w4-b1',name),original=await fs.readFile(p,'utf8'),r=JSON.parse(original);mutate(r);await fs.writeFile(p,JSON.stringify(r));await assert.rejects(publishB1({root,publish:true}),pattern);await fs.writeFile(p,original);
 }
 assert.equal((await fs.stat(file)).mtimeMs,stat);
});

test('目录真实三种子平衡报告覆盖本批，单人≤15%且标准五人55%–65%',async()=>{
 const report=JSON.parse(await fs.readFile('world/design/w4-b1-balance.json','utf8'));assert.equal(report.pass,true);
 for(const b of bosses)for(const seed of [20261010,20330615,409033])for(const mode of ['reference_solo','reference_team']){
  const r=report.results.find(r=>r.boss===b.id&&r.seed===seed&&r.mode===mode);assert.ok(r);assert.equal(r.trials,10000);assert.equal(r.winRate,r.wins/r.trials);assert.equal(r.pass,true);
  assert.ok(mode==='reference_solo'?r.winRate<=.15:r.winRate>=.55&&r.winRate<=.65);
 }
});
