import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {withWaterEnvironment} from '../tools/prepare-water-environment.mjs';
import {spellBlueprints} from '../world/design/spell-blueprints.mjs';
import {magicEconomyRules} from '../world/design/magic-economy.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyEffects} from '../server-plugin/effects.mjs';
import {recordMagicEconomy,advanceMagicEconomy,validateMagicEconomyRules,magicPriceFactor,purifiedWaterFactor,magicYieldFactor,droughtRelief} from '../server-plugin/magic-economy.mjs';
import {advanceHazardClocks} from '../server-plugin/seasonal-hazards.mjs';
import {regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {npcOpinions} from '../server-plugin/public-opinion.mjs';
import {worldEvents} from '../server-plugin/world-events.mjs';
import {personHousehold,settlementGovernment,lawAuthorities} from '../server-plugin/entity-view.mjs';
import {groupAccountView} from '../server-plugin/group-account.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
function setup(seed='magic-economy',mutate=w=>w){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}mutate(w);
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},seed);
 const wait=async(c,minutes,id='wait')=>applyPatches(c,(await engine.reduce(c,{tool:'world_time',args:{minutes},eventId:id})).patches);
 return {w,engine,doc,wait};
}
function draft(doc){
 return {document:structuredClone(doc),patches:[],messages:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
  set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(m){this.messages.push(m);}};
}
const spellOf=(engine,kind,operation)=>engine.world.spells.find(s=>s.effectSpec?.kind===kind&&(operation===undefined||s.effectSpec.operation===operation));
// Completed casts entered as engine.cast does after the spell's own effect.
function casts(engine,d,{kind,operation,location,n,prefix}){
 const catalog=spellOf(engine,kind,operation);d.set(['state','location'],location);
 return Array.from({length:n},(_,i)=>recordMagicEconomy.call(engine,d,catalog,{},`${prefix}_${i}`));
}
const ledger=(doc,sid='loc_hw')=>doc.state.records[`magic-economy:${sid}`];

test('经济规则另键登记并通过校验；坏规则拒绝',()=>{
 assert.deepEqual(world.rules.magicEconomy,magicEconomyRules);
 assert.deepEqual(validateMagicEconomyRules(world),[]);
 for(const change of [r=>r.kinds.preserve.items.push('item_missing'),r=>r.kinds.purify.householdFactor=2,r=>r.regulation[0].mode='ban',r=>r.regulation[1].licenseCopper=undefined,r=>r.reactions.competitorDelta=5]){
  const bad=structuredClone(world);change(bad.rules.magicEconomy);assert.ok(validateMagicEconomyRules(bad).length,String(change));
 }
});

test('保鲜：覆盖的存粮少腐坏，鲜货报价按日结下降',async()=>{
 const {engine,doc,wait}=setup();
 const d=draft(doc);casts(engine,d,{kind:'care',operation:'preserve_food',location:'bld_hw_school',n:40,prefix:'keep'});
 d.set(['state','location'],doc.state.location);d.set(['state','player','coins'],1000);
 const fishBefore=regionalTradePrice(draft(doc),engine,'item_fish','loc_hw');
 assert.equal(magicPriceFactor(engine,d.document.state,'item_fish','loc_hw'),1,'当日施法未日结前不改价');
 const kept=await wait(await wait(d.document,15*DAY),15*DAY),plain=await wait(await wait(doc,15*DAY),15*DAY);
 const a=kept.state.records['agriculture:loc_hw'],b=plain.state.records['agriculture:loc_hw'];
 assert.ok(ledger(kept).ledger.preserveSaved>0);
 assert.equal(b.ledger.spoiled-a.ledger.spoiled,ledger(kept).ledger.preserveSaved);
 assert.equal(kept.state.settlements.loc_hw.food-plain.state.settlements.loc_hw.food,ledger(kept).ledger.preserveSaved);
 // The window still holds the casts on day 29, so the cut is in force.
 const fish=regionalTradePrice(draft(kept),engine,'item_fish','loc_hw');
 assert.ok(fish<fishBefore,`${fish}<${fishBefore}`);
 assert.equal(regionalTradePrice(draft(kept),engine,'item_salt','loc_hw'),regionalTradePrice(draft(plain),engine,'item_salt','loc_hw'));
 assert.ok(ledger(kept).curve.some(c=>c.kind==='preserve'&&c.permille===magicEconomyRules.kinds.preserve.maximumPriceCutPermille));
 const later=await wait(await wait(kept,16*DAY),15*DAY);
 assert.equal(ledger(later).prices.preserve,undefined,'窗口过后价格回落');
 assert.equal(regionalTradePrice(draft(later),engine,'item_fish','loc_hw'),fishBefore);
});

test('引水：在长庄稼增产、旱灾减产被抵消；无田账时提高产出',async()=>{
 const {engine,doc,wait}=setup();
 const grown=await wait(doc,26*DAY);
 const d=draft(grown),before=structuredClone(d.get('state','records','agriculture:loc_hw').field.cohorts);
 assert.ok(before.length);
 const [out]=casts(engine,d,{kind:'environment',operation:'irrigate',location:'loc_hw_fields',n:1,prefix:'water'});
 assert.equal(out.field.managed,true);assert.ok(out.field.bonusPermille>0);
 const after=d.get('state','records','agriculture:loc_hw').field.cohorts;
 for(const [i,c] of after.entries())assert.ok(c.qualitySum>before[i].qualitySum||!before[i].qualitySum);
 // Repeated casts stop at the per-season cap.
 casts(engine,d,{kind:'environment',operation:'irrigate',location:'loc_hw_fields',n:200,prefix:'flood'});
 const cap=magicEconomyRules.kinds.irrigate.maximumYieldBonusPermille;
 for(const v of Object.values(ledger(d.document).irrigation.cohorts))assert.ok(v<=cap);
 // Drought: the same crop_damage hits the irrigated village less.
 const relief=droughtRelief(engine,d.document.state,'loc_hw',d.get('state','minute'));assert.ok(relief>0);
 const ctx={settlement:'loc_hw',faction:null,minute:d.get('state','minute'),sourceEvent:'drought_test'};
 const dry=draft(grown),wet=d;
 const r0=applyEffects(dry,engine,[{kind:'crop_damage',settlement:'loc_hw',percent:40,minutes:30*DAY,cause:'drought'}],ctx,'world');
 const r1=applyEffects(wet,engine,[{kind:'crop_damage',settlement:'loc_hw',percent:40,minutes:30*DAY,cause:'drought'}],ctx,'world');
 assert.equal(r0.effects[0].percent,40);assert.ok(r1.effects[0].percent<40);assert.equal(r1.effects[0].irrigationReliefPermille,relief);
 const flood=applyEffects(draft(wet.document),engine,[{kind:'crop_damage',settlement:'loc_hw',percent:40,minutes:DAY,cause:'flood'}],ctx,'world');
 assert.equal(flood.effects[0].percent,40,'引水不抵消水灾');
 // A village without a managed farm ledger gets a seasonal output factor.
 const u=draft(doc);delete u.document.state.records['agriculture:loc_hw'];
 casts(engine,u,{kind:'environment',operation:'irrigate',location:'loc_hw_fields',n:3,prefix:'plain'});
 assert.ok(magicYieldFactor(u.document.state,'loc_hw',u.get('state','minute'))>1);
 assert.equal(magicYieldFactor(u.document.state,'loc_hw',u.get('state','minute')+90*DAY),1);
});

test('净水：降低经水传播的疫病，空气传播不受影响',()=>{
 const spring=w=>{w.rules.hazardClock.diseases[0].householdRate=0.6;w.rules.hazardClock.diseases[0].routeRate=0;w.rules.magicEconomy.kinds.purify.coverMinutes=30*DAY;};
 const {engine,doc}=setup('purify',spring);
 const water=engine.rules.hazardClock.diseases.find(x=>x.route==='water'),air=engine.rules.hazardClock.diseases.find(x=>x.route==='air');
 const run=purify=>{
  const d=draft(doc),at=d.get('state','minute');
  if(purify)casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:30,prefix:'clean'});
  const rule=engine.rules.hazardClock.clocks.find(r=>r.kind==='epidemic');
  applyEffects(d,engine,[{kind:'epidemic',disease:water.id,settlement:'loc_hw',cases:2}],{settlement:'loc_hw',faction:null,minute:at,sourceEvent:'outbreak',clock:rule.id},'world');
  advanceHazardClocks(d,engine,{before:at,after:at+6*DAY});
  const ep=Object.values(d.document.state.records).find(r=>r.category==='epidemic');
  return {d,houses:Object.values(ep.households).filter(h=>h.settlement==='loc_hw').length,at};
 };
 const dirty=run(false),clean=run(true);
 assert.ok(clean.houses<dirty.houses,`${clean.houses}<${dirty.houses}`);
 const state=clean.d.document.state;
 assert.ok(purifiedWaterFactor(engine,state,'loc_hw',clean.at+DAY,'household',water)<1);
 assert.equal(purifiedWaterFactor(engine,state,'loc_hw',clean.at+DAY,'household',air),1);
 assert.ok(magicPriceFactor(engine,state,'item_water','loc_hw')<=1);
});

test('受益户立场上升，竞争者立场下降并投诉，投诉生成世界事件与舆论',async()=>{
 const {engine,doc,wait}=setup();
 const d=draft(doc);d.set(['state','player','coins'],1000);
 casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:6,prefix:'well'});
 const next=await wait(d.document,DAY),seen=ledger(next).reactions.purify;
 const farmer=seen.beneficiaries[0],porter='npc_hw_taozhi';assert.ok(farmer);assert.ok(seen.competitors.includes(porter));
 const s0=[standing(engine,doc.state,farmer),standing(engine,doc.state,porter)];
 assert.ok(standing(engine,next.state,farmer)>s0[0],'洗晒、家务户受益');
 assert.ok(standing(engine,next.state,porter)<s0[1],'药铺少了生意');
 const row=ledger(next);assert.ok(row.ledger.lostIncomeCopper>0);
 const complaint=row.complaints.find(c=>c.npc===porter);assert.ok(complaint,'收入受损够多就投诉');
 const events=worldEvents(next.state,e=>e.sourceEvent===complaint.sourceEvent);assert.equal(events.length,1);assert.equal(events[0].verb,'rumor');
 assert.ok(events[0].witnesses.includes(porter));
 assert.ok(next.state.npcs[porter].memoryStream.some(m=>m.kind==='complaint'&&m.sourceEvent===complaint.sourceEvent));
 const opinion=npcOpinions(engine,next,porter).find(o=>o.topic===`event:${complaint.sourceEvent}`);
 assert.equal(opinion?.stance,'oppose');
 assert.ok(standing(engine,next.state,'loc_hw')<standing(engine,doc.state,'loc_hw'),'村子立场因投诉下降');
 // The complaint tightens the village's free quota this month.
 const again=draft(next);const [later]=casts(engine,again,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:1,prefix:'later'});
 assert.equal(later.regulation.free,Math.max(0,magicEconomyRules.regulation[0].freeCastsPerMonth-row.complaints.length*magicEconomyRules.reactions.complaintTightening));
});

test('官府收费、许可与限额；违者立案并有罚则',()=>{
 const {engine,doc}=setup();
 // 河湾：免费额度之后按次收费入公库；没钱付就报案。
 const d=draft(doc);d.set(['state','player','coins'],10);
 const free=magicEconomyRules.regulation[0].freeCastsPerMonth,fee=magicEconomyRules.regulation[0].feeCopper;
 const out=casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:free+6,prefix:'levy'});
 assert.ok(out.slice(0,free).every(o=>!o.regulation.paid&&!o.regulation.violation));
 assert.equal(out[free].regulation.paid,fee);
 assert.equal(d.get('state','settlements','loc_hw','treasury'),doc.state.settlements.loc_hw.treasury+5*fee);
 assert.equal(d.get('state','player','coins'),0);
 const unpaid=out.at(-1).regulation;assert.equal(unpaid.violation,'magic_levy_unpaid');
 const row=d.get('state','records',unpaid.case);
 assert.equal(row.category,'legal_case');assert.equal(row.offense,'magic_levy_unpaid');assert.equal(row.reported,true);assert.equal(row.law,'law_hw_property');
 assert.ok(engine.rules.magicEconomy.penalties[row.offense]);
 // 榆坡：超出免费额度须买当月许可，之后同月不再收。
 const y=draft(doc);y.set(['state','player','coins'],100);
 const yp=casts(engine,y,{kind:'environment',operation:'irrigate',location:'loc_bs_yupo',n:7,prefix:'yp'});
 assert.equal(yp[4].regulation.paid,20);assert.ok(y.get('state','records',yp[4].regulation.licence).expires>y.get('state','minute'));
 assert.equal(yp[6].regulation.paid,undefined);assert.equal(y.get('state','player','coins'),80);
 const broke=draft(doc);broke.set(['state','player','coins'],0);
 assert.equal(casts(engine,broke,{kind:'environment',operation:'irrigate',location:'loc_bs_yupo',n:5,prefix:'nolic'})[4].regulation.violation,'magic_unlicensed');
 // 苇汀：超过月度上限即违规立案。
 const w=draft(doc);w.set(['state','player','coins'],1000);
 const wt=casts(engine,w,{kind:'care',operation:'preserve_food',location:'loc_bs_weiting',n:13,prefix:'wt'});
 assert.equal(wt[11].regulation.paid,3);assert.equal(wt[12].regulation.violation,'magic_over_quota');
 assert.equal(w.get('state','records',wt[12].regulation.case).law,'law_wt_property');
 // 在任官职者自己就是收费的人。
 const o=draft(doc);o.set(['state','player','coins'],0);
 o.set(['state','records','office_test'],{category:'governance_office',office:'office_village_head',holder:'player',settlement:'loc_hw',status:'在任',since:doc.state.minute,until:doc.state.minute+30*DAY});
 const own=casts(engine,o,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:free+3,prefix:'office'});
 assert.ok(own.every(x=>x.regulation.exempt==='在任官职'));
 assert.ok(!Object.values(o.document.state.records).some(r=>r.category==='legal_case'));
});

test('迁居、改业及新展开居民按当前家户与职业结算反应，重放不重复投诉',()=>{
 const {engine,doc}=setup(),d=draft(doc),porter='npc_hw_taozhi',incoming='npc_hw_linsui';
 const old=personHousehold(engine,doc.state,porter).value;
 const home=engine.world.households.find(h=>h.settlement==='loc_bs_yupo');
 d.set(['state','family','households',old.id],{left:[porter]});
 d.set(['state','family','households',home.id],{members:[porter]});
 d.set(['state','npcs',porter,'residence'],{household:home.id,settlement:home.settlement,home:home.homeLocation,since:doc.state.minute});
 // Visiting the old village does not make this household a local competitor.
 d.set(['state','npcs',porter,'location'],'bld_hw_qingdeng');
 d.set(['state','npcs',incoming,'vocation'],{id:'u10_test',name:'担水',since:doc.state.minute});
 const created='npc_u10_new';
 d.set(['state','created',created],{id:created,name:'新住户',occupation:'洗晒',settlement:'loc_hw',location:'loc_hw'});
 d.set(['state','npcs',created],{id:created,location:'loc_hw',coins:0,status:'正常'});
 casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:6,prefix:'current'});
 const before=doc.state.minute,after=(Math.floor(before/DAY)+1)*DAY;
 d.set(['state','minute'],after);advanceMagicEconomy(d,engine,{before,after});
 const row=ledger(d.document),seen=row.reactions.purify;
 assert.ok(!seen.competitors.includes(porter),'迁出者不再承受旧村竞争损失');
 assert.ok(seen.competitors.includes(incoming),'改业后按新职业承担竞争损失');
 assert.ok(seen.beneficiaries.includes(created),'当前展开人物同样参与受益');
 assert.ok(row.complaints.some(c=>c.npc===incoming));
 const once=structuredClone(d.document);advanceMagicEconomy(d,engine,{before,after});assert.deepEqual(d.document,once);
 // Changing livelihood again takes effect on the next day's settlement.
 d.set(['state','npcs',incoming,'vocation'],{id:'u10_test_2',name:'洗晒',since:after});
 casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:1,prefix:'new_job'});
 d.set(['state','minute'],after+DAY);advanceMagicEconomy(d,engine,{before:after,after:after+DAY});
 const current=ledger(d.document).reactions.purify;
 assert.ok(current.beneficiaries.includes(incoming));assert.ok(!current.competitors.includes(incoming));
});

test('收费使用现任官职与统一公账，撤职和空缺即时生效',()=>{
 const {engine,doc}=setup(),d=draft(doc),sid='loc_hw',free=engine.rules.magicEconomy.regulation[0].freeCastsPerMonth;
 const initial=groupAccountView(engine,doc.state,sid).coins,at=doc.state.minute;
 d.set(['state','player','coins'],100);
 d.set(['state','records','office_u10'],{category:'governance_office',office:'office_village_head',holder:'player',settlement:sid,status:'在任',since:at,until:at+DAY});
 const own=casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:free+1,prefix:'head'});
 assert.ok(own.every(o=>o.regulation.exempt==='在任官职'));assert.equal(groupAccountView(engine,d.document.state,sid).coins,initial);
 d.set(['state','records','office_u10','status'],'撤职');
 const [vacant]=casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:1,prefix:'vacant'});
 assert.equal(vacant.regulation.suspended,'当地官职空缺');assert.equal(d.get('state','player','coins'),100);
 const successor='npc_hw_chenbai';
 d.set(['state','records','office_u10_next'],{category:'governance_office',office:'office_village_head',holder:successor,settlement:sid,status:'在任',since:at,until:at+DAY});
 assert.equal(settlementGovernment(engine,d.document.state,sid).head.value,successor);
 const [paid]=casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:1,prefix:'successor'});
 const fee=engine.rules.magicEconomy.regulation[0].feeCopper,account=groupAccountView(engine,d.document.state,sid);
 assert.equal(paid.regulation.paid,fee);assert.equal(account.coins,initial+fee);assert.equal(d.get('state','player','coins'),100-fee);
 assert.equal(account.ledger.at(-1).collector,successor);assert.equal(account.ledger.at(-1).sourceEvent,'successor_0');
 const once=structuredClone(d.document);recordMagicEconomy.call(engine,d,spellOf(engine,'environment','clean_water'),{},'successor_0');assert.deepEqual(d.document,once);
});

test('欠费案件由现任执法者受理，账本证据按经济罚则裁判',async()=>{
 const {engine,doc}=setup(),d=draft(doc),code=engine.rules.law.codes.find(c=>c.id==='law_hw_property');
 const former=code.officers[0];
 d.set(['state','records',`legal_dismissal:${former}`],{category:'legal_dismissal',npc:former,law:code.id,minute:doc.state.minute});
 d.set(['state','player','coins'],0);
 const count=engine.rules.magicEconomy.regulation[0].freeCastsPerMonth+1;
 const out=casts(engine,d,{kind:'environment',operation:'clean_water',location:'bld_hw_qingdeng',n:count,prefix:'judge_levy'}).at(-1);
 const id=out.regulation.case,row=d.get('state','records',id);
 assert.notEqual(row.receiver,former);assert.ok(lawAuthorities(engine,d.document.state,code).includes(row.receiver));
 const judge=lawAuthorities(engine,d.document.state,code,'judge')[0];
 d.set(['state','location'],code.court);d.set(['state','npcs',judge,'location'],code.court);
 const judged=await engine.reduce(d.document,{tool:'world_law',args:{operation:'hear',case:id,authority:judge},eventId:'hear_levy'});
 assert.equal(judged.result.convicted,true);assert.equal(judged.result.judgment.evidenceScore,2);
 const penalty=engine.rules.magicEconomy.penalties.magic_levy_unpaid;
 assert.equal(judged.result.judgment.fine,penalty.baseFine+Math.ceil(row.value*penalty.valueMultiplier));
});

test('真实施法回执带经济结果并进入村账',async()=>{
 const w=withWaterEnvironment(structuredClone(world)),bones=spellBlueprints().filter(r=>r.mechanism==='irrigate');
 for(const bone of bones){if(!w.spells.some(r=>r.id===bone.id))w.spells.push(bone);if(!w.skills.some(r=>r.id===bone.skill))w.skills.push({id:bone.skill,name:bone.name,attribute:'精神',profession:'profession_mage'});}
 const engine=new WorldEngine(w),doc=engine.initialFromLegacy(legacy,'economy-cast');
 doc.state.weather.loc_hw_dock={humidityPercent:70};doc.state.location='loc_hw_dock';Object.assign(doc.state.player,{level:60,mp:500,maxMp:500});
 doc.state.inventory.item_resin={quantity:4,quality:'木',durability:100,weight:0.1};
 for(const bone of bones){doc.state.spells[bone.id]={source:{type:'fixture'}};doc.state.skills[bone.skill]={proficiency:120,daily:{},breakthroughs:[]};}
 for(let i=0;i<100;i++){
  const out=await engine.reduce(doc,{tool:'world_cast',args:{spell:bones[0].id,target:'引水沟'},eventId:`cast_${i}`});
  if(!out.result.success){assert.equal(out.result.economy,undefined);continue;}
  assert.equal(out.result.economy.settlement,'loc_hw');assert.equal(out.result.economy.kind,'irrigate');
  const next=applyPatches(doc,out.patches);assert.equal(ledger(next).casts[0].source,`cast_${i}`);
  return;
 }
 assert.fail('没有成功施法样本');
});
