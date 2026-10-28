// A real new character, one campaign, public menu/execute actions only; no AI,
// world variants, imported premises or state writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import {npcAvailability,scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {carryLoad} from '../server-plugin/carry.mjs';
import {characterUiSession,qty} from './helpers/ui-script.mjs';
import {conservation,reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const TRADER='npc_hw_yanzhe',GRAIN='item_wheat_grain',BANK='bank_hw_post';

function balanced(before,after,label){
 assert.deepEqual(conservation(engine,before,after),[],`${label}: money and every stock resource conserve registered sources/sinks`);
 const books=reconcile(engine,after);
 assert.deepEqual(books.mismatches,[],`${label}: legacy balances match ledger`);
 assert.deepEqual(books.lots,[],`${label}: stock batches match ledger`);
 assert.deepEqual(books.audit,[],`${label}: ledger balances`);
 const load=carryLoad(engine,after);
 assert.ok(load.carriedKg<=10+2*after.state.player.attributes['力量'],`${label}: safe carrying capacity`);
}

test('S5 一局：集日买卖 → 租田种收并卖自产粮 → 存钱与具名存单 → 存档重放',async t=>{
 const ui=await characterUiSession(t,{seed:'s5-playthrough'});
 const opening=await ui.read();
 assert.equal(opening.state.player.level,0);
 assert.equal(opening.state.location,'loc_hw');
 assert.deepEqual(opening.state.skills,{});
 let current=opening;const committedClicks=new Set();
 async function step(action,slots={},options={}){
  let before=current,out=await ui.choose(action,slots,options);
  // A player cannot harvest in rain/snow. Observe the actual refusal, prove
  // atomicity, then spend a real day before trying again; no future weather
  // lookup, world edit or skipped labor. Other errors still fail immediately.
  while(action==='farm.private_harvest'&&!out.ok&&out.error==='当前雨雪不宜进行田间工作'){
   assert.deepEqual(await ui.read(),before,'weather refusal does not harvest or move any money/stock');
   await step('time',{until:{dayOffset:1,hour:11}});
   before=current;out=await ui.choose(action,slots,options);
  }
  return acceptedStep(action,slots,before,out);
 }
 async function acceptedStep(action,slots,before,out){
  assert.ok(out.ok,`${action}: ${out.error??''} (cash ${before.state.player.coins})`);
  assert.equal(out.result.ok,true,`${action}: native result`);
  // Legacy farm and settlement actions expose their native effects;
  // timed and financial clicks retain the committed-receipt checks.
  if(action==='farm.buy')assert.equal(out.result.quantity,slots.quantity);
  else if(action==='farm.private_sow')assert.equal(out.result.farm.status,'growing');
  else if(action==='farm.private_harvest')assert.ok(Number.isSafeInteger(out.result.harvested)&&out.result.harvested>0);
  else if(action==='promise.settle')assert.equal(out.result.transferred,slots.coins);
  else assert.equal(out.result.receipt.status,'committed',`${action}: committed receipt`);
  committedClicks.add(out.eventId);
  current=await ui.read();balanced(before,current,action);
  return {before,after:current,result:out.result,eventId:out.eventId};
 }

 // Day 5 is a real market day. The travelling merchant comes to loc_hw at 11.
 await step('time',{until:{dayOffset:4,hour:11}});
 assert.equal(current.state.npcs[TRADER].location,current.state.location);
 const buy=await step('trade.buy',{item:GRAIN,quantity:4},{target:TRADER});
 // 5 baseline × .5 scarcity × 1.2 ask spread × depth 1.00248… × 4
 // = 12.0298…; truncate once => 12 copper (no fabricated stock or quotes).
 assert.equal(buy.result.cost,12);
 assert.equal(buy.before.state.player.coins-buy.after.state.player.coins,12);
 assert.equal(buy.after.state.npcs[TRADER].coins-buy.before.state.npcs[TRADER].coins,12);
 assert.equal(qty(buy.after.state.inventory[GRAIN])-qty(buy.before.state.inventory[GRAIN]),4);
 assert.equal(qty(buy.before.state.npcs[TRADER].inventory[GRAIN])-qty(buy.after.state.npcs[TRADER].inventory[GRAIN]),4);
 const sale=await step('trade.sell_to',{item:GRAIN,quantity:4},{target:TRADER});
 // 5 × .5 × .6 bid spread × depth 1.00727… × regard 1.00105 × 4
 // = 6.04998… => 6 copper: round-trip loss = 12 - 6 = 6.
 assert.equal(sale.result.cost,6);
 assert.equal(sale.after.state.player.coins-sale.before.state.player.coins,6);
 assert.equal(sale.before.state.npcs[TRADER].coins-sale.after.state.npcs[TRADER].coins,6);
 assert.equal(qty(sale.before.state.inventory[GRAIN])-qty(sale.after.state.inventory[GRAIN]),4);
 assert.equal(qty(sale.after.state.npcs[TRADER].inventory[GRAIN])-qty(sale.before.state.npcs[TRADER].inventory[GRAIN]),4);
 assert.ok(sale.result.pricing.spread<buy.result.pricing.spread);

 const item='item_tanned_leather';
 const quote=facilityRuntime().currentTradeQuote(engine.scoped(current),current,{seller:TRADER,item,quantity:1});
 const offered=Math.ceil(quote.listPrice*world.rules.economy.priceFactorLimits.bargain[0]);
 const deal=await step('trade.trade',{seller:TRADER,item,quantity:1,unitPrice:offered},{target:TRADER,search:true});
 assert.ok(offered<quote.listPrice,'price reduced within the existing bargaining interval');
 assert.equal(deal.result.cost,offered);
 assert.equal(deal.before.state.player.coins-deal.after.state.player.coins,offered);
 assert.equal(deal.after.state.npcs[TRADER].coins-deal.before.state.npcs[TRADER].coins,offered);
 assert.equal(qty(deal.after.state.inventory[item])-qty(deal.before.state.inventory[item]),1);
 assert.equal(qty(deal.before.state.npcs[TRADER].inventory[item])-qty(deal.after.state.npcs[TRADER].inventory[item]),1);
 await t.test('店主自主还价并明确同意：现有成交接口只校验报价区间，缺 NPC 议价往返，归 A2 对话决策', {todo:true});

 await step('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});
 const fieldBefore=current;
 const sow=await ui.choose('farm.private_sow',{areaMu:0.01},{search:true});
 assert.equal(sow.ok,false,'public field must not become the player’s private farm');
 assert.match(sow.error,/本人合法持有/);
 current=await ui.read();assert.deepEqual(current,fieldBefore,'rejected sow changes neither state nor books');
 // W8-E8: a real rural smith now stocks the already approved sickle.
 await step('time',{until:{dayOffset:1,hour:9}});
 await step('move',{destination:'bld_hw_forge'},{target:'bld_hw_forge'});
 for(const item of ['item_mining_pick','item_sickle']){
  const quote=facilityRuntime().currentTradeQuote(engine.scoped(current),current,{seller:'npc_hw_duanyan',item,quantity:1});
  const bought=await step('trade.buy',{item,quantity:1},{target:'npc_hw_duanyan'});
  assert.equal(bought.result.cost,Math.trunc(quote.exactTotal));
  assert.equal(qty(bought.after.state.inventory[item])-qty(bought.before.state.inventory[item]),1);
 }
 await step('move',{destination:'bld_hw_council'},{target:'bld_hw_council'});
 const grain=await step('farm.buy',{quantity:8},{search:true});
 assert.equal(qty(grain.after.state.inventory.item_oats)-qty(grain.before.state.inventory.item_oats),8);
 const rentMenu=await ui.menu();assert.ok(rentMenu.actions.some(a=>a.id==='core:trade.rent_in'));
 const rentBefore=current,proposal=await ui.choose('trade.rent_in',{location:'loc_hw_fields',days:240,deadline:current.state.minute+210*1440});
 let rent;
 if(proposal.ok){
  assert.equal(proposal.result.receipt.status,'committed');committedClicks.add(proposal.eventId);
  current=await ui.read();balanced(rentBefore,current,'deferred rent');
  rent={before:rentBefore,after:current,result:proposal.result};
 }else{
  assert.match(proposal.error,/出租人未接受延期交租.*付不起首期租金/);
  assert.deepEqual(await ui.read(),rentBefore,'conditional proposal leaves no debt or lease');
  const condition=/conditions\.prepay=(\d+)/.exec(proposal.error);
  assert.ok(condition,'chief returns the native advance-payment condition');
  const advance=Number(condition[1]);
  // Existing chief decision: 140 rent opportunity + 10 risk - 140 reward.
  assert.equal(advance,10);
  assert.ok(current.state.player.coins>=advance,'actual purse must fund the requested advance');
  rent=await step('trade.rent_in',{location:'loc_hw_fields',days:240,deadline:current.state.minute+210*1440,deposit:advance});
  assert.equal(rent.result.paid,advance);
  assert.equal(rent.after.state.obligations[rent.result.debt].amount,140-advance);
 }
 // Existing monthly rent 35*4=140; deferred credit never forgives later months.
 assert.equal(rent.result.rent,140);assert.equal(rent.result.owner,'loc_hw');
 assert.equal(rent.result.paid,rent.result.rentDueAt===undefined?140:10);
 assert.equal(rent.before.state.player.coins-rent.after.state.player.coins,rent.result.paid);
 assert.equal(rent.after.state.settlements.loc_hw.treasury-rent.before.state.settlements.loc_hw.treasury,rent.result.paid);
 const springDay=world.rules.agriculture.crop.sowDays[0],today=Math.floor(current.state.minute/1440)%360;
 if(today<springDay)await step('time',{until:{dayOffset:springDay-today,hour:9}});
 await step('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});
 const planted=await step('farm.private_sow',{areaMu:1,item:'item_oats'},{search:true});
 // Native acreage is whole mu: 1/15 ha, 100/15 area units, ceil(120/15)=8 seed.
 assert.equal(planted.result.farm.areaUnits,100/15);assert.equal(planted.result.farm.seed,8);
 assert.equal(qty(planted.before.state.inventory.item_oats)-qty(planted.after.state.inventory.item_oats),8);

 const farmId=planted.result.farm.id;
 // Growth counts qualified weather days, not merely elapsed calendar days.
 await step('time',{until:{dayOffset:180,hour:11}});
 for(let day=0;current.state.records[farmId].status==='growing'&&day<45;day++)await step('time',{until:{dayOffset:1,hour:11}});
 const ripe=current.state.records[farmId];assert.equal(ripe.status,'ready');
 assert.equal(ripe.grownDays,180);assert.equal(ripe.qualityDays,180);
 // 1/15 ha * 1700 portions/ha, multiplied by observed mean quality.
 assert.equal(ripe.yield,Math.floor((1700/15)*ripe.qualitySum/ripe.qualityDays));
 assert.ok(current.state.minute<rent.result.deadline,'harvest within the signed lease');
 let harvested=0,cropSale=0,trips=0;
 while(harvested<ripe.yield){
  await step('move',{destination:'loc_hw_fields'},{target:'loc_hw_fields'});
  const capacity=Math.floor((30-carryLoad(engine,current).carriedKg+1e-9)/0.5);
  const cut=await step('farm.private_harvest',{}, {search:true});
  assert.equal(cut.result.harvested,Math.min(ripe.yield-harvested,capacity));
  harvested+=cut.result.harvested;trips++;
  assert.equal(cut.result.remaining,ripe.yield-harvested);
  assert.equal(cut.result.laborMinutes,Math.ceil(480*cut.result.harvested/ripe.yield));
  // No public loose-grain purchase rule exists. Follow the registered
  // merchant to Baishi using the campaign's actual small/large-month calendar,
  // not the obsolete fixed-30-day market calculation.
  const walk=await step('move',{destination:'loc_bs'},{target:'loc_bs'});
  assert.equal(walk.after.state.location,'loc_bs','the grain is actually carried to Baishi');
  assert.equal(walk.after.state.minute-walk.before.state.minute,walk.result.receipt.cost.time);
  let left=cut.result.harvested;
  // First try Yan Zhe's actual shop. The Baishi-only route left 17 portions
  // unsold after exhausting the selected market/bakery/store purses. Return
  // on real roads to existing local food consumers; no NPC is moved or funded.
  const localBuyers={loc_bs:TRADER,loc_hw_dock:'npc_hw_zhengshuisheng',loc_hw_orchard:'npc_hw_meiling',loc_hw_northwood:'npc_hw_wushuo'};
  for(const venue of Object.keys(localBuyers)){
   if(!left)break;
   if(current.state.location!==venue)await step('move',{destination:venue},{target:venue});
   const known=[...new Set([localBuyers[venue],...Object.keys(current.state.npcs).filter(id=>current.state.npcs[id].location===venue)])];
   while(left){
    const scoped=engine.scoped(current),now=current.state.minute;
    const buyers=known.filter(id=>current.state.npcs[id].location===venue&&npcAvailability(scoped,current.state,id).services?.includes('trade')&&(npcAvailability(scoped,current.state,id).until??Infinity)>=now+5);
    if(!buyers.length){
     let next=Infinity;
     for(const id of known){
      if(['患病','昏迷','濒死','死亡'].includes(current.state.npcs[id].status))continue;
      for(let cursor=now;cursor<now+31*1440;){
       const slot=scheduleAt(scoped,id,cursor,current.state);if(!slot)break;
       if(cursor>now&&slot.location===venue&&slot.services.includes('trade')&&slot.until-cursor>=5){next=Math.min(next,cursor);break;}
       cursor=slot.until;
      }
     }
     assert.ok(Number.isFinite(next),`no real forthcoming buyer at ${venue}`);
     await step('time',{minutes:next-now});continue;
    }
    let sold,offer,count,depthBlocked=false;const refusals=[];
    for(const buyer of buyers){
     for(count=Math.min(left,5);count>0;count--){
      offer=facilityRuntime().currentTradeQuote(engine.scoped(current),current,{seller:'player',buyer,item:'item_oats',quantity:count});
      const before=current,attempt=await ui.choose('trade.sell_to',{item:'item_oats',quantity:count},{target:buyer});
      if(!attempt.ok){
       assert.match(attempt.error,/买方余额不足|市场今天没有那么多可成交深度|此刻不提供交易|剩余服务时间不足/);
       assert.deepEqual(await ui.read(),before,'a refused real offer transfers no money or grain');
       depthBlocked ||= /可成交深度/.test(attempt.error);
       refusals.push(buyer+': '+attempt.error);continue;
      }
      sold=await acceptedStep('trade.sell_to',{item:'item_oats',quantity:count},before,attempt);break;
     }
     if(sold)break;
    }
    if(!sold){
     if(depthBlocked){await step('time',{until:{dayOffset:1,hour:9}});continue;}
     assert.ok(refusals.every(x=>/买方余额不足/.test(x)),refusals.join('; '));
     break;
    }
    // Ordinary Baishi: 3 * scarcity 3 * bid .6 * regard 1.00105 * 5
    // = 27.02835 => 27 copper, whenever those observed inputs hold.
    if(offer.explanation.base===3&&offer.explanation.scarcity===3&&offer.explanation.quality===1&&offer.explanation.depth===1&&offer.explanation.spread===0.6&&count===5&&offer.explanation.relation===1.00105)assert.equal(Math.trunc(offer.exactTotal),27);
    assert.equal(sold.result.cost,Math.trunc(offer.exactTotal),'round the actual full quote once');
    assert.equal(sold.after.state.player.coins-sold.before.state.player.coins,sold.result.cost);
    assert.equal(sold.before.state.npcs[offer.buyer].coins-sold.after.state.npcs[offer.buyer].coins,sold.result.cost);
    assert.equal(qty(sold.before.state.inventory.item_oats)-qty(sold.after.state.inventory.item_oats),count);
    cropSale+=sold.result.cost;left-=count;
   }
  }
  assert.equal(left,0,`all actually carried grain must find solvent, present buyers before the next cut; harvested=${harvested}, trips=${trips}, cash=${current.state.player.coins}, cropSale=${cropSale}, location=${current.state.location}, minute=${current.state.minute}`);
 }
 assert.ok(trips>1,'carrying capacity requires real separate trips');
 assert.equal(current.state.records[farmId].harvestedQty,ripe.yield);
 assert.equal(current.state.records[farmId].status,'harvested');
 assert.ok(cropSale>1,'home-grown grain really sold for money');

 if(rent.result.rentDueAt!==undefined){
  if(current.state.minute<rent.result.rentDueAt)await step('time',{minutes:rent.result.rentDueAt-current.state.minute});
  await step('move',{destination:'loc_hw'},{target:'loc_hw'});
  const claims=Object.values(current.state.obligations).filter(o=>o.contract===rent.result.contract&&o.kind==='rent'&&o.amount>o.paid);
  const owed=claims.reduce((n,o)=>n+o.amount-o.paid,0);
  // Deferral preserves every accrued month: initial 140 plus 140 for each
  // monthly boundary before the end of the 240-day lease, never a rent waiver.
  const billedTotal=140*(1+Math.floor((current.state.minute-rent.after.state.records[rent.result.contract].createdAt)/(30*1440)));
  const paidSoFar=current.state.records[rent.result.contract].paid;
  // At/after the agreed date, rentDue may collect the current period when
  // the tenant is at this public counter. Count actual payments exactly once.
  assert.equal(owed,billedTotal-paidSoFar,'all accrued rent is either really paid or still owed');
  assert.ok(current.state.player.coins>=owed,`actual crop proceeds must cover the signed rent; cash=${current.state.player.coins}, owed=${owed}, billed=${billedTotal}, paid=${paidSoFar}, cropSale=${cropSale}, harvested=${harvested}, trips=${trips}; no bank deposit of fictitious net profit`);
  for(const claim of claims){
   const amount=claim.amount-claim.paid,paid=await step('promise.settle',{obligation:claim.id,coins:amount},{search:true});
   assert.equal(paid.after.state.obligations[claim.id].paid,claim.amount);
   assert.equal(paid.after.state.settlements.loc_hw.treasury-paid.before.state.settlements.loc_hw.treasury,amount);
  }
 }

 // Named deposit originals require literacy and real blank paper. Acquire both
 // through school services; the original helper’s mutate option is never used.
 await step('move',{destination:'bld_hw_school'},{target:'bld_hw_school'});
 await step('time',{until:{dayOffset:0,hour:13}});
 let learned=false;
 for(let attempt=0;attempt<3&&!learned;attempt++){
  const lesson=await step('learn',{entity:'skill_literacy',source:'npc_hw_luqing',kind:'skill'},{search:true,eventId:`s5-literacy-${attempt}`});
  learned=lesson.result.success;
 }
 assert.equal(learned,true,'school actually teaches literacy');
 await step('trade.buy',{item:'item_parchment',quantity:1},{target:'npc_hw_luqing'});
 for(let day=0;day<12&&current.state.skills.skill_literacy.proficiency<100;day++){
  await step('practice.session',{skill:'skill_literacy',minutes:480});
  if(current.state.skills.skill_literacy.proficiency<100)await step('time',{until:{dayOffset:1,hour:9}});
 }
 assert.ok(current.state.skills.skill_literacy.proficiency>=100,'learned the required literacy, no ability fixture');
 await step('time',{until:{dayOffset:1,hour:11}});
 await step('move',{destination:'bld_hw_post'},{target:'bld_hw_post'});
 const dep=await step('trade.deposit',{coins:sale.result.cost},{eventId:'s5-grain-deposit'});
 // All 6 copper of the real grain sale enter the vault; 1 fee => 5 principal.
 assert.equal(dep.result.deposited,5);assert.equal(dep.result.fee,1);
 assert.equal(dep.before.state.player.coins-dep.after.state.player.coins,6);
 // Before first use the vault already exists in the ledger, while its legacy
 // bank record is materialized only by the deposit (money.legacyMoney contract).
 assert.equal(dep.after.state.records[BANK].coins-dep.before.ledger.accounts[`${BANK}|coin_river|vault`],6);
 const claim=dep.result.claim;
 const issued=await step('documents:issue',{source:dep.eventId,paper:'item_parchment',kind:'receipt'},{search:true});
 const paper=issued.result.document,original=current.state.itemInstances[paper];
 assert.equal(original.represents,claim);assert.equal(original.document.namedHolder,'player');
 assert.equal(original.document.issuer,BANK);assert.equal(original.document.certifier,'npc_hw_shendu');
 assert.equal(original.document.valid,true);assert.equal(current.state.obligations[claim].terms.requiresInstrument,paper);
 assert.equal(current.holdings.locations[paper].at,'player');
 assert.equal(qty(current.state.inventory.item_parchment),qty(issued.before.state.inventory.item_parchment),'one blank becomes the same written sheet');
 await step('time',{until:{dayOffset:3,hour:11}});
 const inspected=await step('trade.bank_inspect');
 // Three days on principal 5: even the 8% monthly loan-rate ceiling gives
 // 5 × .08 × 4/29 < 1 copper; deposit spread only reduces it. Integer interest
 // is therefore 0 (fraction carried), not a fictional positive payout.
 assert.equal(inspected.result.balance,5);
 const out=await step('trade.withdraw',{coins:2,debt:claim});
 assert.equal(out.result.withdrawn,2);
 assert.equal(out.after.state.player.coins-out.before.state.player.coins,2);
 assert.equal(out.before.state.records[BANK].coins-out.after.state.records[BANK].coins,2);
 assert.equal(out.after.state.obligations[claim].paid,2);
 assert.equal(out.after.state.obligations[claim].interest??0,0);
 assert.equal(out.after.state.records[BANK].accounts.player,3);
 assert.equal(out.after.state.obligations[claim].terms.requiresInstrument,paper);
 assert.equal(out.after.state.itemInstances[paper].document.valid,true);

 // A separate deposit preserves the original named five-copper claim checks.
 // This second claim explicitly uses the proceeds from the real crop above.
 const cropDepositCoins=Math.min(cropSale,current.state.player.coins);
 assert.ok(cropDepositCoins>1,'some crop proceeds remain after real tuition and paper costs');
 const cropDeposit=await step('trade.deposit',{coins:cropDepositCoins},{eventId:'s5-homegrown-deposit'});
 assert.equal(cropDeposit.result.deposited,cropDepositCoins-1);assert.equal(cropDeposit.result.fee,1);
 assert.equal(cropDeposit.before.state.player.coins-cropDeposit.after.state.player.coins,cropDepositCoins);
 assert.equal(cropDeposit.after.state.records[BANK].coins-cropDeposit.before.state.records[BANK].coins,cropDepositCoins);

 const bundle=await ui.server.api('export',{campaignId:ui.campaignId});
 assert.deepEqual(bundle.initial.state,opening.state,'creation state was never replaced with a fixture');
 assert.ok(bundle.events.length>0);
 // index.mjs stores world_act aliases as their native calls for compatibility.
 // Match every durable event to an actual successful public click instead of
 // incorrectly requiring the stored tool name to remain world_act.
 // The host splits a long public time click into <=30-day native events
 // (observed character-ui-17#1..#6); count source clicks, not time segments.
 const recordedClicks=new Set(bundle.events.map(event=>event.input.eventId.replace(/#\d+$/,'')));
 assert.equal(recordedClicks.size,committedClicks.size,'every successful click is durably recorded; no injected setup events');
 assert.ok(bundle.events.every(event=>committedClicks.has(event.input.eventId.replace(/#\d+$/,''))),'all recorded events originate in public menu/tool clicks');
 const {reference}=await ui.server.api('import',{bundle});
 const loaded=await ui.server.api('read',{campaignId:reference.campaignId});
 assert.deepEqual(loaded.document,current,'full event replay restores the identical document, including stock, claims and ledger');
});
