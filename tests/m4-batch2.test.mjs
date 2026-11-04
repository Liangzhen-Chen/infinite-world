import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';
import{loadWorld}from'../tools/load-world.mjs';import{WorldEngine}from'../server-plugin/engine.mjs';import{applyPatches}from'../server-plugin/storage.mjs';
import{withPetRules}from'../world/design/pet-foundation.mjs';import{batch2SpellCandidates,batch2BossCandidates}from'../world/design/m4-batch2-candidates.mjs';
import{validateMagicCatalog}from'../server-plugin/magic.mjs';import{assertTargetFacts}from'../server-plugin/magic-targeting.mjs';
import{magicStatusStats,applyMagicStatus,consumeTransientMagic,magicIlluminates}from'../server-plugin/magic-status.mjs';
import{consumeMagicProtection,applyProtectionPrimitive}from'../server-plugin/magic-primitives.mjs';import{inspectMagicMarks}from'../server-plugin/magic-marks.mjs';
import{validateBossMechanics,templateBossCounter,applyBossCounterAbility}from'../server-plugin/boss-abilities.mjs';
import{bossFoundation}from'../world/design/boss-foundation.mjs';import{planRuleStateMigration}from'../server-plugin/rule-state-migration.mjs';import{validateWorld}from'../tools/validate-world.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),source=await loadWorld();
function draft(document){return{document,get(...p){return p.reduce((v,k)=>v?.[k],document);},set(p,v){let o=document;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=structuredClone(v);},remove(p){let o=document;for(const k of p.slice(0,-1))o=o[k];delete o[p.at(-1)];},say(){}};}
function assertTransientConsumed(out,id){
 const changes=out.patches.filter(p=>p.path[0]==='state'&&p.path[1]==='effects'&&p.path[2]===id);
 assert.equal(changes.filter(p=>p.op==='set'&&p.path[3]==='remainingUses'&&p.value===0).length,1);
 assert.equal(changes.at(-1).op,'delete');
 assert.equal(out.document.state.effects[id],undefined);
}
function setup({bosses=false}={}){
 const world=withPetRules(structuredClone(source));for(const spell of batch2SpellCandidates()){if(!world.spells.some(s=>s.id===spell.id))world.spells.push(spell);if(!world.skills.some(s=>s.id===spell.skill))world.skills.push({id:spell.skill,name:spell.name,attribute:'精神',profession:null});}
 // T157怪物聚居地的首领由聚居地登记引用，换成本批候选首领时须保留它们，否则聚居地校验断开。
 if(bosses){const leaders=new Set(world.locations.map(l=>l.monsterSociety?.leader).filter(Boolean));world.bosses=[...batch2BossCandidates(),...world.bosses.filter(b=>leaders.has(b.id))];world.rules.bossEcology=bossFoundation().rules;}
 const engine=new WorldEngine(world);let document=engine.initialFromLegacy(seed,'m4-batch2');if(bosses)document=applyPatches(document,planRuleStateMigration(document,world.rules));document.state.player.mp=1000;document.state.player.maxMp=1000;document.state.location='loc_hw_dock';
 for(const s of world.spells){document.state.spells[s.id]={source:{type:'fixture'}};document.state.skills[s.skill]={proficiency:299,daily:{},breakthroughs:[]};}
 for(const item of['item_resin','item_charcoal','item_parchment']){const def=world.items.find(i=>i.id===item);document.state.inventory[item]={quantity:item==='item_parchment'?1:10,quality:def.quality,durability:def.durability,weight:def.weight};}
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result,patches:out.patches};};
 const cast=async(c,spell,args={},prefix='cast')=>{let last;for(let i=0;i<50;i++){const eventId=`${prefix}_${i}`,out=await run(c,'world_cast',{spell,target:'player',...args},eventId);if(out.result.success)return{...out,eventId};last=out.result;}throw Error(`夹具无成功骰点:${spell}:${JSON.stringify(last)}`);};
 return{world,engine,document,run,cast};
}
test('16候选与4模板只接受真实原语字段，未提供条件的目标不得放行',()=>{
 const spells=batch2SpellCandidates();assert.equal(spells.length,16);for(const s of spells)assert.deepEqual(validateMagicCatalog(s,{requireHandler:true}),[],s.id);
 for(const b of batch2BossCandidates())assert.deepEqual(validateBossMechanics(b),[],b.id);
 const s=structuredClone(spells.find(s=>s.mechanism==='calm'));s.effectSpec.power=20;assert.ok(validateMagicCatalog(s).length);
 assert.throws(()=>assertTargetFacts({rangeMeters:3},{distanceMeters:4,lineOfSight:true}),/射程/);assert.throws(()=>assertTargetFacts({rangeMeters:3},{distanceMeters:1,lineOfSight:false}),/视线/);assert.throws(()=>assertTargetFacts({rangeMeters:3},null),/事实/);
});
test('完整候选世界通过严格schema，所有16条具备真实引擎施法覆盖，剩余状态与护卫不是仅目录声明',async()=>{
 const{world,engine,document,cast,run}=setup({bosses:true});assert.deepEqual((await validateWorld(world)).errors,[]);
 document.state.records.permit={category:'authorization',action:'mental_magic',subject:'player',grantor:'npc_hw_gucen',location:document.state.location,expires:document.state.minute+200};
 document.state.effects.suggestion={kind:'status',status:'compulsion',target:'player',power:2,expires:document.state.minute+200};
 const ids=['spell_light_05','spell_light_11','spell_shadow_09','spell_mind_08','spell_mind_11'];
 for(const id of ids){const casted=await cast(document,id,{permit:'permit'},id);assert.ok(casted.result.success,id);
  if(id==='spell_mind_11'){assert.equal(casted.document.state.effects.suggestion.power,1);continue;}
  assert.equal(casted.document.state.effects[casted.eventId].kind,'status');
  casted.document.state.npcs.npc_hw_linsui.location=casted.document.state.location;casted.document.state.npcs.npc_hw_linsui.hp=5000;casted.document.state.npcs.npc_hw_linsui.maxHp=5000;
  casted.document.state.player.hp=5000;casted.document.state.player.maxHp=5000;
  const exchanged=await run(casted.document,'world_combat',{target:'npc_hw_linsui'},`exchange_${id}`);assert.equal(typeof exchanged.result.damage,'number');
  // A bout lasts one minute: observe consumption before the expiry deletion.
  if(['spell_light_05','spell_mind_08'].includes(id)){
   assert.equal(casted.document.state.effects[casted.eventId].remainingUses,1);
   assertTransientConsumed(exchanged,casted.eventId);
   assert.deepEqual(consumeTransientMagic(draft(exchanged.document),'player',engine.magicStatusContext(draft(exchanged.document),'player')),[]);
  }
 }
 document.state.player.attributes.精神=30;
 const summoned=await cast(document,'spell_summon_13',{},'elemental');const guarded=await run(summoned.document,'world_companion',{operation:'summon_guard',summon:summoned.eventId},'elemental_guard');assert.equal(guarded.result.absorption,7);
});
test('公开痕迹入口采用真实天气微光，照明改变后暗字隐藏；夜视只缓解微光交锋惩罚',async()=>{
 const{engine,document,cast,run}=setup();document.state.minute=1;
 for(let i=0;i<100;i++){document.randomSeed=`dim_seed_${i}`;if(engine.magicStatusContext(draft(document),'player').illumination==='dim')break;}
 assert.equal(engine.magicStatusContext(draft(document),'player').illumination,'dim');
 const mark=await cast(document,'spell_shadow_03',{target:'item_parchment',text:'借桶后还到渡口'},'readable');
 const read=await run(mark.document,'world_field',{operation:'environment_inspect_marks',target:'item_parchment'},'read_marks');assert.equal(read.result.marks[0].text,'借桶后还到渡口');
 const lit=await cast(mark.document,'spell_summon_05',{},'lit');const hidden=await run(lit.document,'world_field',{operation:'environment_inspect_marks',target:'item_parchment'},'lit_read');assert.deepEqual(hidden.result.marks,[]);
 const vision=await cast(document,'spell_shadow_09',{},'vision');vision.document.state.npcs.npc_hw_linsui.location=document.state.location;vision.document.state.npcs.npc_hw_linsui.hp=5000;vision.document.state.npcs.npc_hw_linsui.maxHp=5000;vision.document.state.player.hp=5000;vision.document.state.player.maxHp=5000;
 const ordinary=structuredClone(vision.document);delete ordinary.state.effects[vision.eventId];let improved=false;
 for(let i=0;i<100;i++){const id=`vision_combat_${i}`,a=await run(ordinary,'world_combat',{target:'npc_hw_linsui'},id),b=await run(vision.document,'world_combat',{target:'npc_hw_linsui'},id);if(b.result.damage>a.result.damage){improved=true;break;}}
 assert.equal(improved,true,'相同骰点下夜视实际改善微光命中');
});
test('四个首领均经真实接近与交锋触发能力，逐击防护和生命结算保持一致',async()=>{
 for(const definition of batch2BossCandidates()){
  const{document,run}=setup({bosses:true});document.state.location=definition.lair;document.state.player.hp=5000;document.state.player.maxHp=5000;
  const contact=await run(document,'world_lair',{operation:'approach',lair:definition.residence.id},`approach_${definition.id}`);const current=contact.document;
  const actor=current.state.creatures[definition.id];actor.hp=Math.floor(actor.maxHp/2);actor.abilityCounters=2;
  applyProtectionPrimitive(draft(current),{target:'player',spec:{kind:'protection',power:5000,damageTypes:['physical'],stacking:'strongest'},spell:'fixture',duration:10},'ward');
  current.state.effects.dazzle={kind:'status',target:definition.id,status:'dazzle',power:2,remainingUses:1,expires:current.state.minute+1};
  let triggered;for(let i=0;i<40;i++){const c=await run(current,'world_combat',{target:definition.id},`boss_exchange_${definition.id}_${i}`);if(c.result.abilities?.length){triggered=c;break;}}
  assert.ok(triggered,definition.id);assert.equal(triggered.result.received,0);assert.equal(triggered.document.state.player.hp,5000);
  // Expiry removes the exhausted record after the first counterattack consumes it.
  assertTransientConsumed(triggered,'dazzle');
  // The counter's one-minute fear is also applied before this bout expires it.
  const fear=triggered.patches.find(p=>p.op==='set'&&p.path[1]==='effects'&&p.value?.status==='fear'&&p.value.target==='player');
  assert.ok(fear);assert.ok(triggered.result.abilities.some(a=>a.effect===fear.path[2]&&a.status==='fear'));
  assert.equal(fear.value.expires,triggered.document.state.minute);assert.equal(triggered.document.state.effects[fear.path[2]],undefined);
 }
});
test('条件状态改变真实战斗修正，闭眼不吃眩光且一次出手后用尽，不知事实不给伪装奖励',()=>{
 const d=draft({state:{minute:10,effects:{}}});applyMagicStatus(d,{target:'player',status:'dazzle',power:2,duration:1,source:'test'},'dazzle');
 assert.equal(magicStatusStats(d,'player').hit,0);assert.equal(magicStatusStats(d,'player',{eyesClosed:true}).hit,0);assert.equal(magicStatusStats(d,'player',{eyesClosed:false}).hit,-.04);
 assert.deepEqual(consumeTransientMagic(d,'player',{eyesClosed:true}),[]);consumeTransientMagic(d,'player',{eyesClosed:false});assert.equal(magicStatusStats(d,'player',{eyesClosed:false}).hit,0);
 applyMagicStatus(d,{target:'player',status:'camouflage',power:6,duration:5,source:'test'},'camo');assert.equal(magicStatusStats(d,'player').evasion,0);
 assert.equal(magicStatusStats(d,'player',{illumination:'lit',raining:false,moving:false}).evasion,.06);assert.equal(magicStatusStats(d,'player',{illumination:'lit',raining:true,moving:false}).evasion,.03);
 applyMagicStatus(d,{target:'player',status:'nightvision',power:3,duration:5,source:'test'},'night');assert.equal(magicStatusStats(d,'player',{illumination:'dark'}).nightVision,0);assert.equal(magicStatusStats(d,'player',{illumination:'dim'}).nightVision,.06);
});
test('真实自愿精神施法：缺行政许可照样施放并定罪，目标同意仍单独验证，未解析的他人距离不能由工具参数伪造',async()=>{
 const{document,engine,cast,run}=setup();document.state.effects.fear={kind:'status',target:'player',status:'fear',power:2,expires:document.state.minute+100};
 // K6 依据（审查 C-d、D4 1457de49 恢复的反例）：无证精神施法是犯罪，不是做不到；施放发生并命中擅施心术。
 {const unlicensed=await run(document,'world_cast',{spell:'spell_mind_01',target:'player'},'no-permit');assert.ok(unlicensed.document.state.player.mp<document.state.player.mp);
  const o=unlicensed.result.offenses?.find(o=>o.offense==='mental_magic');assert.ok(o);assert.equal(unlicensed.document.state.records[o.record].sourceEvent,'no-permit');}
 document.state.records.permit={category:'authorization',action:'mental_magic',subject:'player',grantor:'npc_hw_gucen',location:document.state.location,expires:document.state.minute+60};
 const c=await cast(document,'spell_mind_01',{permit:'permit'},'calm');assert.equal(c.document.state.effects.fear.power,1);assert.equal(c.document.state.player.mp,document.state.player.mp-1);
 document.state.npcs.npc_hw_linsui.location=document.state.location;
 await assert.rejects(run(document,'world_cast',{spell:'spell_mind_01',target:'林穗',permit:'permit',distanceMeters:0,lineOfSight:true},'fake'),/目标超过法术实际射程/);
 engine.magicTargetFacts=()=>({distanceMeters:1,lineOfSight:true});await assert.rejects(run(document,'world_cast',{spell:'spell_mind_01',target:'林穗',permit:'permit'},'no-consent'),/本人/);
 document.state.records.consent={category:'authorization',action:'mental_magic',subject:'npc_hw_linsui',grantor:'npc_hw_linsui',grantee:'player',expires:document.state.minute+60};
 /* K6 依据（审查 C-d）：有本人同意、缺行政许可，施放发生并命中擅施心术 */{const r=await run(document,'world_cast',{spell:'spell_mind_01',target:'林穗',authorization:'consent'},'no-permit-other');const o=r.result.offenses?.find(o=>o.offense==='mental_magic');assert.ok(o);assert.equal(r.document.state.records[o.record].sourceEvent,'no-permit-other');}
 // This case isolates consent; movement during casting is covered by magic-primitives.
 delete engine.byId.get('npc_hw_linsui').schedule;
 document.state.npcs.npc_hw_linsui.activity='待客';document.state.effects.nfear={kind:'status',target:'npc_hw_linsui',status:'fear',power:2,expires:document.state.minute+100};
 const c2=await cast(document,'spell_mind_01',{target:'林穗',permit:'permit',authorization:'consent'},'consent');assert.equal(c2.document.state.effects.nfear.power,1);
});
test('祝福只抵消已有恐惧惩罚，不添加命中奖励，解除不改写人物记忆',async()=>{
 const{document,cast}=setup();document.state.effects.fear={kind:'status',target:'player',status:'fear',power:2,expires:document.state.minute+100};
 const c=await cast(document,'spell_faith_01');assert.equal(magicStatusStats(draft(c.document),'player').hit,-.02);delete c.document.state.effects.fear;assert.equal(magicStatusStats(draft(c.document),'player').hit,0);
});
test('真实召唤光源与续约保留维持时点、实际扣供品，契约阅读及解离不生成永久宠物',async()=>{
 const{document,engine,run,cast}=setup();const first=await cast(document,'spell_summon_05',{},'fire');assert.equal(magicIlluminates(draft(first.document)),true);
 const waited=await run(first.document,'world_time',{minutes:35},'wait35');const effect=waited.document.state.effects[first.eventId],nextUpkeep=effect.nextUpkeep,before=waited.document.state.inventory.item_resin.quantity;
 const extended=await cast(waited.document,'spell_summon_09',{target:first.eventId},'extend');assert.equal(extended.document.state.effects[first.eventId].nextUpkeep,nextUpkeep);assert.equal(extended.document.state.inventory.item_resin.quantity,before-1);
 const read=await cast(extended.document,'spell_summon_03',{target:first.eventId},'read');assert.equal(read.result.summons[0].id,first.eventId);
 const dismissed=await cast(read.document,'spell_summon_12',{target:first.eventId},'dismiss');assert.equal(dismissed.document.state.effects[first.eventId],undefined);assert.equal(magicIlluminates(draft(dismissed.document)),false);
 assert.deepEqual(dismissed.document.state.pets,document.state.pets);assert.equal(engine.byId.has(first.eventId),false);
});
test('召唤守卫有有限额度，水体不足或离开水边即停止吸收；解离删除护层',async()=>{
 const{document,engine,run,cast}=setup();const c=await cast(document,'spell_summon_08',{target:'feature_hw_pool'},'water');const reserve=c.document.state.effects[c.eventId].guardReserve;assert.equal(reserve,7);
 const guarded=await run(c.document,'world_summon',{operation:'guard',summon:c.eventId},'guard');const d=draft(structuredClone(guarded.document));assert.equal(consumeMagicProtection(d,'player',10).absorbed,7);assert.equal(consumeMagicProtection(d,'player',10).absorbed,0);
 await assert.rejects(run(guarded.document,'world_summon',{operation:'guard',summon:c.eventId},'again'),/额度/);
 const away=draft(structuredClone(guarded.document));away.set(['state','records','local_player_position'],{location:document.state.location,point:[5,0]});assert.equal(consumeMagicProtection(away,'player',10).absorbed,0);
 const dry=draft(structuredClone(guarded.document));dry.set(['state','records','physical_feature:feature_hw_pool'],{state:{waterMl:0}});assert.equal(consumeMagicProtection(dry,'player',10).absorbed,0);
 const ended=await run(guarded.document,'world_summon',{operation:'dismiss',summon:c.eventId},'dismiss-guard');assert.equal(ended.document.state.effects.guard,undefined);
});
test('三种痕迹写入实际介质并可读取，暗字耗材、单件、光照和到期均有限制',async()=>{
 const{document,engine,cast,run}=setup();document.state.location='loc_hw_dock';
 const a=await cast(document,'spell_shadow_03',{target:'item_parchment',text:'渡口取料须先问主人'},'ink');assert.equal(a.document.state.inventory.item_charcoal.quantity,9);
 assert.deepEqual(inspectMagicMarks(draft(a.document),engine,{target:'item_parchment'},{illumination:'lit'}),[]);assert.equal(inspectMagicMarks(draft(a.document),engine,{target:'item_parchment'},{illumination:'dim'})[0].text,'渡口取料须先问主人');
 const b=await cast(document,'spell_fire_07',{target:'item_parchment',text:'火纹记号'},'fire-mark');assert.equal(inspectMagicMarks(draft(b.document),engine,{target:'item_parchment'})[0].text,'火纹记号');
 const c=await cast(document,'spell_earth_03',{target:'feature_hw_plot',text:'此处留印'},'soil');assert.equal(inspectMagicMarks(draft(c.document),engine,{target:'feature_hw_plot'})[0].text,'此处留印');
 const copied=structuredClone(document);copied.state.inventory.item_parchment.quantity=2;await assert.rejects(run(copied,'world_cast',{spell:'spell_shadow_03',target:'item_parchment',text:'两张'},'stack'),/单件/);
 a.document.state.minute+=1440;assert.deepEqual(inspectMagicMarks(draft(a.document),engine,{target:'item_parchment'},{illumination:'dim'}),[]);
});
test('首领模板适应封顶，实际弱点可解除该次防备，闭眼与已用尽眩光不触发',()=>{
 const boss=batch2BossCandidates()[0],actor={battleMemory:{tactics:{armed:20}}},d=draft({state:{minute:0,effects:{dazzle:{kind:'status',target:boss.id,status:'dazzle',power:2,expires:1,remainingUses:1}}}});
 assert.equal(templateBossCounter(d,boss,actor,'armed').damageMultiplier,.7);assert.equal(templateBossCounter(d,boss,actor,'armed',{eyesClosed:false}).damageMultiplier,1);
 consumeTransientMagic(d,boss.id,{eyesClosed:false});assert.equal(templateBossCounter(d,boss,actor,'armed',{eyesClosed:false}).damageMultiplier,.7);
 const invalid=structuredClone(boss);invalid.mechanics.adaptation.maximum=2;assert.ok(validateBossMechanics(invalid).length);
});
test('首领每次真实命中推进有限能力计数，未命中不施加，状态共用精神抗性',()=>{
 const boss=batch2BossCandidates()[0],document={state:{minute:0,location:'loc_hw_northwood',effects:{},records:{},player:{hp:100,maxHp:100},creatures:{[boss.id]:{boss:boss.id,location:'loc_hw_northwood',hp:40,maxHp:100}}}},d=draft(document),engine={byId:new Map([[boss.id,boss]])};
 assert.equal(applyBossCounterAbility(d,engine,boss.id,{eventId:'miss',attackIndex:0,hit:false}),null);assert.equal(document.state.creatures[boss.id].abilityCounters,undefined);
 for(let i=0;i<2;i++)assert.equal(applyBossCounterAbility(d,engine,boss.id,{eventId:'hit',attackIndex:i,hit:true}),null);
 const result=applyBossCounterAbility(d,engine,boss.id,{eventId:'hit',attackIndex:2,hit:true});assert.equal(result.status,'fear');assert.equal(magicStatusStats(d,'player').hit,-.02);
 assert.throws(()=>applyBossCounterAbility(d,engine,boss.id,{eventId:'hit',attackIndex:2,hit:true}),/重复/);
});
