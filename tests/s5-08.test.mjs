import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {withLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {openGoodsObligation,performGoodsObligation,cancelGoodsObligation} from '../server-plugin/obligation-conditional.mjs';
import {closeObligation} from '../server-plugin/obligation-runtime.mjs';
import {marketQuote,forwardSupply,forwardReliability} from '../server-plugin/market.mjs';
import {trackTransferUnit} from '../server-plugin/items.mjs';
import {ensureHoldings,openHolding,holdingsView,located,aliveHoldings} from '../server-plugin/holdings.mjs';
import {createTransportAsset,transportAssetView,quoteTransport,bookTransport,advanceTransport,nextTransportMinute,transportPosition} from '../server-plugin/transport.mjs';
import {advanceSettlementTrade,nextSettlementTradeMinute} from '../server-plugin/settlement-trade.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const seller='npc_hw_duanyan',item='item_steel_arming_sword',location='bld_hw_forge';
function scene(modifiers=[]){
 const w={...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,...modifiers]}};
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s508-forward');
 // Opening stock, cash and co-presence are not examined by the forward tests.
 const prepared=applyIntentSetup(engine,initial,{minute:600,location,coins:100000,facts:[
  {path:['state','npcs',seller,'location'],value:location},
  {path:['state','npcs',seller,'inventory',item],value:100}
 ]});assert.deepEqual(prepared.setupUnmet,[]);
 let document=withLedger(engine,prepared.document).document;
 return {engine,get document(){return document;},replace(doc){document=doc;},read(){return engine.primitiveDraft(document);},
  mutate(fn){const draft=engine.primitiveDraft(document),result=fn(draft);document=applyPatches(document,draft.patches);assert.deepEqual(document,draft.document);return result;}};
}
function sign(f,id,{quantity=10,prepayment=1150,deadline=2000}={}){
 return f.mutate(d=>openGoodsObligation(d,f.engine,{id,kind:'forward',debtor:seller,creditor:'player',item,quantity,prepayment,deadline,location},`sign:${id}`));
}
function history(f){sign(f,'history',{quantity:4,prepayment:460});f.mutate(d=>performGoodsObligation(d,f.engine,{id:'history',quantity:4},'deliver:history'));}
const expectation=f=>forwardSupply(f.read(),f.engine,item,location);
const reliability=f=>forwardReliability(f.read(),f.engine,seller);
const quote=f=>marketQuote(f.read(),f.engine,{item,location,seller,buyer:'player'});

test('no history and no pledge cannot discount spot prices; prepayment really moves',()=>{
 const f=scene(),before=quote(f),cash=f.document.state.player.coins,recipient=f.document.state.npcs[seller].coins;
 sign(f,'unproven');
 // S=100, shelf D=2; 230*clamp(2/100,.5,3)=115.
 // Reserving ten leaves90, D10 still clamps to .5; reliability starts0.
 assert.equal(before.totalCoins,115);assert.equal(quote(f).totalCoins,115);
 assert.equal(expectation(f).expected,0);assert.equal(reliability(f).reliability,0);
 assert.equal(f.document.state.player.coins,cash-1150);
 assert.equal(f.document.state.npcs[seller].coins,recipient+1150);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
});

test('actual performance establishes reliability; paid proportion and threshold constrain expected stock',()=>{
 const f=scene();history(f);sign(f,'half',{prepayment:575});
 // Signed unit value115, ten units cost1150, 575/1150=.5.
 // One completed performance =>1; min(10,stock96)*1*.5=5.
 assert.equal(f.document.state.obligations.half.terms.forward.consideration,1150);
 assert.equal(reliability(f).reliability,1);assert.equal(expectation(f).expected,5);
 sign(f,'quarter',{prepayment:288});
 // 288/1150 < authored .5 threshold: this second promise contributes0.
 assert.equal(expectation(f).rows.find(r=>r.id==='quarter').expected,0);
 sign(f,'full');assert.equal(expectation(f).rows.find(r=>r.id==='full').expected,10);
 const before=structuredClone(f.document),read=f.read();
 forwardSupply(read,f.engine,item,location);marketQuote(read,f.engine,{item,location,seller,buyer:'player'});
 assert.deepEqual(read.document,before);assert.deepEqual(read.patches,[]);assert.deepEqual(f.document,before);
});

test('the real market quote consumes expected deliveries, with independent copper anchors',()=>{
 const unproven=scene();sign(unproven,'sixty',{quantity:60,prepayment:6900});
 // Unproven reservation: stock100-60=40; D=max(shelf2,promises60)=60.
 // No expected stock: 230*60/40=345 copper, never an unsupported discount.
 assert.equal(quote(unproven).totalCoins,345);
 const trained=scene();history(trained);sign(trained,'sixty',{quantity:60,prepayment:6900});
 // The four delivered swords remain at this market in the player's bag.
 // Current S=(96-60)+4=40, expected60*reliability1*paid1=60.
 // D60 / effective S100=.6; 230*.6=138 copper.
 assert.equal(expectation(trained).expected,60);assert.equal(quote(trained).totalCoins,138);
});

test('the prepayment threshold is authored through the existing derived registry',()=>{
 const f=scene([{id:'paid-threshold',pack:'core',target:'economy:forwardPaidThreshold',stage:'mul',value:0.5}]);history(f);
 sign(f,'quarter-eight',{quantity:8,prepayment:230});
 // Consideration8*115=920; paid230/920=.25 meets .5*.5=.25.
 // min(promised8,stock96)*reliability1*paid.25 = 2.
 assert.equal(expectation(f).expected,2);
});

test('a physical pledged original backs only its actual value, shared across claims',()=>{
 const f=scene();sign(f,'secured');
 const original=f.mutate(d=>{
  const id=trackTransferUnit(d,f.engine,seller,item,'identify-collateral');ensureHoldings(d,f.engine);
  openHolding(d,{kind:'pledged',holder:'secured',subject:id,writer:'obligation-runtime',eventId:'pledge-original',engine:f.engine});return id;
 });
 // The original's market value is230*.5=115, the forward signed115/unit.
 // No performance history: min(promised10,pledged115/115)=1 expected unit.
 assert.equal(reliability(f).reliability,0);assert.equal(expectation(f).expected,1);
 sign(f,'shared');
 f.mutate(d=>openHolding(d,{kind:'pledged',holder:'shared',subject:original,writer:'obligation-runtime',eventId:'share-pledge',engine:f.engine}));
 // Two live claims share115: each has57.5 of backing, so each expects.5.
 assert.deepEqual(expectation(f).rows.map(r=>r.expected),[0.5,0.5]);assert.equal(expectation(f).expected,1);
 sign(f,'default',{deadline:601});
 // Clock value is a premise here; native partitioned advancement is tested below.
 const later=applyIntentSetup(f.engine,f.document,{minute:602});assert.deepEqual(later.setupUnmet,[]);f.replace(later.document);
 // D15 §15.6 zeros all future weights during the default ban, including pledges.
 assert.equal(expectation(f).expected,0);
});

test('cancellation is nonperformance and its weight uses the derived slot',()=>{
 const f=scene([{id:'cancel-weight',pack:'core',target:'economy:forwardCancellation',stage:'mul',value:3}]);
 history(f);sign(f,'cancelled');
 f.mutate(d=>closeObligation(d,f.engine,{id:'cancelled',actor:'player',party:'player',reason:'creditor_waiver'},'waive'));
 sign(f,'remaining');
 // One success / (one success + one cancellation * weight3) = .25;
 // ten fully prepaid units * .25 = 2.5 expected units (D15 §15.6).
 assert.equal(reliability(f).reliability,0.25);
 assert.equal(expectation(f).expected,2.5);
 assert.equal(expectation(f).rows.length,1);
});

test('default zeros all not-yet-due forwards for one quarter; partitioning time is equivalent',()=>{
 const f=scene();history(f);sign(f,'late',{deadline:601});sign(f,'future',{deadline:300000});
 const base=f.document;
 const at=minute=>applyIntentSetup(f.engine,base,{minute}).document;
 f.replace(at(602));assert.equal(reliability(f).reliability,0);assert.equal(expectation(f).expected,0);
 assert.equal(reliability(f).blockedUntil,130201); // 601+90*1440.
 f.replace(at(130202));
 // After the ban, one success / (one success + one default)=.5.
 assert.equal(reliability(f).reliability,0.5);assert.equal(expectation(f).expected,5);
 const large=expectation(f),small=applyIntentSetup(f.engine,at(70000),{minute:130202});
 assert.deepEqual(small.setupUnmet,[]);f.replace(small.document);assert.deepEqual(expectation(f),large);
});

test('several promises share actual inventory once, rather than duplicating capacity',()=>{
 const f=scene();history(f);sign(f,'first',{quantity:80,prepayment:9200});sign(f,'second',{quantity:80,prepayment:55200});
 // After delivering four, debtor stock96. The first promise backs80;
 // the second can back16, even though it promises another80.
 const rows=expectation(f).rows;assert.equal(rows[0].capacity,80);assert.equal(rows[1].capacity,16);
 assert.equal(expectation(f).expected,96);
});

test('failed performance writes nothing and forward projections survive native storage',async t=>{
 const f=scene();history(f);sign(f,'saved',{prepayment:575});const before=structuredClone(f.document),expected=expectation(f);
 assert.throws(()=>f.mutate(d=>performGoodsObligation(d,f.engine,{id:'saved',quantity:101},'too-many')));
 assert.deepEqual(f.document,before);
 const draft=f.read(),draftBefore=structuredClone(draft.document);
 assert.throws(()=>openGoodsObligation(draft,f.engine,{id:'broke',kind:'forward',debtor:seller,creditor:'player',item,quantity:1,prepayment:1000000,deadline:2000,location},'cannot-pay'));
 assert.deepEqual(draft.document,draftBefore);assert.deepEqual(draft.patches,[]);
 const root=await fs.mkdtemp(path.join(tmpRoot(),'s508-save-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(document,input)=>f.engine.reduce(document,input),store=new CampaignStorage(root,{reducer});
 await store.create({id:'forward',worldVersion:world.version,document:f.document});
 f.replace((await new CampaignStorage(root,{reducer}).read('forward')).document);
 assert.deepEqual(expectation(f),expected);assert.deepEqual(auditLedger(f.document.ledger),[]);
});

test('native time advancement in one or two steps yields the same forward projection',async()=>{
 const f=scene();history(f);sign(f,'due-soon',{deadline:601});sign(f,'later',{deadline:3000});const start=f.document;
 const advance=async(document,minutes,eventId)=>{
  const out=await f.engine.reduce(document,{tool:'world_time',args:{minutes},eventId});
  assert.equal(out.result.ok,true);return applyPatches(document,out.patches);
 };
 const large=await advance(start,2,'one-step');
 const small=await advance(await advance(start,1,'first-step'),1,'second-step');
 f.replace(large);const expected=expectation(f),trust=reliability(f);
 f.replace(small);assert.deepEqual(expectation(f),expected);assert.deepEqual(reliability(f),trust);
 assert.equal(trust.reliability,0);assert.equal(expected.expected,0);
 assert.deepEqual(small.state.obligations,large.state.obligations);
 assert.deepEqual(auditLedger(small.ledger),[]);assert.deepEqual(auditLedger(large.ledger),[]);
});

const driver='npc_hw_zhengshuisheng',guard='npc_hw_shendu',recipient='npc_hw_hezhou',quarry='site_w5_white_quarry';
function carrierScene(heads=2,modifiers=[]){
 const w=structuredClone(world);w.rules.settlementTrade.lanes=[];
 w.derived.modifiers.push(...modifiers);
 // Existing roads and actors, with declared toll terms. Weather is unrelated
 // to these tax/risk/capacity assertions; use the published clear-weather row.
 w.rules.weather.persistence=0;w.rules.weather.seasonalWeights=Array.from({length:4},()=>[100,0,0,0,0,0]);
 w.routes.find(r=>r.id==='route_hw_bs').toll=3;w.routes.find(r=>r.id==='route_w5_white_quarry').toll=4;
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s508-carriage');
 const animals=Array.from({length:heads},(_,i)=>({id:`s508-draft-${i}`,template:'agent',kind:'creature',species:'monster_slate_horn_bull',location:'loc_hw'}));
 const out=applyIntentSetup(engine,initial,{minute:600,location:'loc_hw',coins:100000,inventory:{item_oats:120},instances:animals,
  holdings:animals.map(a=>({id:`title-${a.id}`,kind:'tamed_by',holder:driver,subject:a.id})),facts:[
   ...[driver,guard].map(id=>({path:['state','npcs',id],value:{...initial.state.npcs[id],location:'loc_hw',activity:'营业'}})),
   {path:['state','npcs',driver,'inventory'],value:{item_wood:{quantity:40},item_iron:{quantity:4}}},
   {path:['state','npcs',recipient,'location'],value:'loc_bs'},
   // A well-supplied destination isolates the published scarcity floor in the tax anchor.
   {path:['state','npcs',recipient,'inventory'],value:{item_oats:{quantity:10000}}}
  ]});assert.deepEqual(out.setupUnmet,[]);
 let document=withLedger(engine,out.document).document;
 const f={engine,animals,get document(){return document;},replace(next){document=next;},read(){return engine.primitiveDraft(document);},
  mutate(fn){const d=engine.primitiveDraft(document),result=fn(d);document=applyPatches(document,d.patches);return result;},
  async act(tool,args,eventId){const out=await engine.reduce(document,{tool,args,eventId});document=applyPatches(document,out.patches);return out;}};
 f.asset=f.mutate(d=>createTransportAsset(d,engine,{owner:driver,kind:'cart',id:'s508-cart'},'build:s508')).id;
 return f;
}
const cargo=[{item:'item_oats',quantity:100}];
const carriageQuote=(f,extra={})=>quoteTransport(f.read(),f.engine,{asset:f.asset,from:'loc_hw',to:quarry,cargo,...extra});
const cashTotal=document=>Object.entries(document.ledger.accounts).filter(([key])=>key.split('|')[1]==='coin_river').reduce((sum,[,amount])=>sum+amount,0);

test('two published road legs expose tariff, risk, deterrence and draft-capacity copper anchors',()=>{
 const f=carrierScene(),plain=carriageQuote(f),protectedQuote=carriageQuote(f,{escort:guard});
 // D05 §5.1: min(cart600, two bulls*30)=60kg; oats100*.5=50kg.
 // Capacity surcharge600/60=10. Published roads24+5.3=29.3km.
 assert.equal(transportAssetView(f.engine,f.document,f.asset).capacityKg,60);
 assert.deepEqual(plain.route.edges,['route_hw_bs','route_w5_white_quarry']);
 assert.equal(plain.capacityFactor,10);assert.equal(plain.load.kg,50);
 // One available escort: deterrence1/(1+1)=.5; each native risk1*(1-.5)=.5.
 // ceil(29.3*50*.012*10*1.5)=264; without deterrence ceil(...*2)=352.
 assert.equal(protectedQuote.passages[0].deterrence,0.5);assert.equal(protectedQuote.risk,0.5);
 assert.equal(protectedQuote.freight,264);assert.equal(plain.freight,352);
 // Grain supply at Baishi clamps scarcity to.5:100*(3*.5)=150 copper.
 // Kingdom tariff800bps + town100bps=900; floor(150*.09)=13 at each gate.
 assert.deepEqual(protectedQuote.passages.map(p=>p.cargoValue),[150,150]);
 assert.deepEqual(protectedQuote.passages.map(p=>p.tariff),[13,13]);
 assert.equal(protectedQuote.tariff,26);assert.equal(protectedQuote.toll,7);assert.equal(protectedQuote.total,297);
 const full=carrierScene(20); // min(600,20*30)=600, surcharge1.
 assert.equal(carriageQuote(full).freight,36); // ceil(29.3*50*.012*2).
 // Existing published routes use risk0..2 as a freight premium, not a
 // probability. Keep the native risk2 input distinct from risk1 (D15 §15.7).
 full.engine.world.routes.find(r=>r.id==='route_hw_bs').risk=2;
 assert.equal(carriageQuote(full).passages[0].risk,2);
});

test('native capacity modifiers and actual draft illness change capacity; overloading writes nothing',()=>{
 const f=carrierScene(4,[{id:'transport-capacity',pack:'core',target:'transport:capacity',stage:'mul',value:0.5}]);
 // min(600,4*30)*.5=60kg, not a hand-filled cart capacity.
 assert.equal(transportAssetView(f.engine,f.document,f.asset).capacityKg,60);
 const sick=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','creatures',f.animals[0].id,'hp'],value:0}]});
 assert.deepEqual(sick.setupUnmet,[]);f.replace(sick.document);
 assert.equal(transportAssetView(f.engine,f.document,f.asset).capacityKg,45); // 3*30*.5.
 const d=f.read(),before=structuredClone(d.document);
 assert.throws(()=>bookTransport(d,f.engine,{asset:f.asset,to:quarry,cargo},'overload'),/容量/);
 assert.deepEqual(d.document,before);assert.deepEqual(d.patches,[]);
});

test('a current closure rejects or reroutes without charging the rejected trip',()=>{
 const f=carrierScene(),prepared=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:{...f.document.state.records,'s508-blockade':{category:'war_disruption',since:0,until:3000,routes:['route_w5_white_quarry'],locations:[],factor:1}}}]});
 assert.deepEqual(prepared.setupUnmet,[]);f.replace(prepared.document);
 const d=f.read(),before=structuredClone(d.document);
 assert.throws(()=>bookTransport(d,f.engine,{asset:f.asset,to:quarry,cargo},'closed'),/路线/);
 assert.deepEqual(d.document,before);assert.deepEqual(d.patches,[]);
 // A blocked direct trunk can use the two existing halfway-post roads.
 const detour=applyIntentSetup(f.engine,before,{facts:[{path:['state','records','s508-blockade','routes'],value:['route_hw_bs']}]});
 assert.deepEqual(detour.setupUnmet,[]);f.replace(detour.document);
 assert.deepEqual(carriageQuote(f).route.edges,['route_w5_halfway_post_hw','route_w5_halfway_post_bs','route_w5_white_quarry']);
});

test('fare and goods remain in real carrier/freight accounts and survive a native save',async t=>{
 const f=carrierScene(),before=structuredClone(f.document),cash=cashTotal(before);
 const trip=f.mutate(d=>bookTransport(d,f.engine,{asset:f.asset,to:quarry,cargo},'s508-book'));
 // Freight352, tariff26 and toll7 cost385. Carrier receives352 and pays
 // home commercial tax floor(352*.05)=17, retaining335 in the actual purse.
 assert.equal(before.state.player.coins-f.document.state.player.coins,385);
 assert.equal(f.document.state.npcs[driver].coins-before.state.npcs[driver].coins,335);
 assert.equal(f.document.ledger.accounts[`${trip.id}|item_oats|freight`],100);
 assert.equal(cashTotal(f.document),cash);assert.deepEqual(auditLedger(f.document.ledger),[]);
 const out=await f.act('world_time',{minutes:10},'s508-midway');assert.equal(out.result.ok,true);
 const current=f.document.state.records[trip.id],position=transportPosition(f.engine,f.document.state,current);
 assert.equal(position.location,null);assert.equal(position.route,'route_hw_bs');
 // No anonymous in-transit money balance is invented; the paid purse belongs
 // to the driver currently travelling with this physical shipment.
 assert.equal(current.carrier,driver);assert.equal(current.driver,driver);assert.equal(cashTotal(f.document),cash);
 const root=await fs.mkdtemp(path.join(tmpRoot(),'s508-carriage-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(document,input)=>f.engine.reduce(document,input),store=new CampaignStorage(root,{reducer});
 await store.create({id:'carriage',worldVersion:world.version,document:f.document});
 const loaded=(await new CampaignStorage(root,{reducer}).read('carriage')).document;
 assert.deepEqual(loaded,f.document);assert.deepEqual(auditLedger(loaded.ledger),[]);
});

test('the native catalogue signs and mutually cancels a forward, refunds cash and lowers reliability',async()=>{
 const f=scene();history(f);const cash=f.document.state.player.coins;
 const signed=await f.engine.reduce(f.document,{tool:'world_act',args:{action:'transport:forward.sign',slots:{seller,item,quantity:10,coins:1150,deadline:2000}},eventId:'catalog-forward'});
 assert.equal(signed.result.ok,true,JSON.stringify(signed.result));f.replace(applyPatches(f.document,signed.patches));
 // The canonical adapter's id is deterministic, regardless of tool wrapping.
 const row=Object.values(f.document.state.obligations).find(r=>r.kind==='forward'&&r.id!=='history');assert.ok(row);
 const cancelled=await f.engine.reduce(f.document,{tool:'world_act',args:{action:'transport:forward.cancel',slots:{contract:row.id}},eventId:'catalog-cancel'});
 assert.equal(cancelled.result.ok,true,JSON.stringify(cancelled.result));f.replace(applyPatches(f.document,cancelled.patches));
 assert.equal(f.document.state.obligations[row.id].endReason,'mutual_cancellation');
 assert.equal(f.document.state.obligations[row.id].cancellation.refund,1150);assert.equal(f.document.state.player.coins,cash);
 // One actual delivery and one actual mutual cancellation:1/(1+1)=.5.
 assert.equal(reliability(f).reliability,0.5);assert.equal(expectation(f).expected,0);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
 const before=structuredClone(f.document),d=f.read();
 assert.throws(()=>bookTransport(d,f.engine,{asset:'missing',to:quarry,cargo},'missing-carrier'));
 assert.deepEqual(d.document,before);assert.deepEqual(d.patches,[]);
});

test('actual sown acreage bounds forward production before and after the native ripening tick',async()=>{
 const w=structuredClone(world);w.rules.weather.persistence=0;w.rules.weather.seasonalWeights=Array.from({length:4},()=>[100,0,0,0,0,0]);
 const e=new WorldEngine(w),initial=e.createCharacter(seed,{},'s508-farm');
 let out=applyIntentSetup(e,initial,{location:'loc_hw_fields',inventory:{item_wheat_seed:20,item_wheat_grain:1,item_hoe:1,item_sickle:1},facts:[
  {path:['state','buildings'],value:{...initial.state.buildings,loc_hw_fields:{...initial.state.buildings.loc_hw_fields,owner:'player',condition:100}}}
 ]});assert.deepEqual(out.setupUnmet,[]);let document=out.document;
 const act=async(tool,args,eventId)=>{const result=await e.reduce(document,{tool,args,eventId});assert.equal(result.result.ok,true,JSON.stringify(result.result));document=applyPatches(document,result.patches);return result;};
 await act('world_time',{minutes:6*1440},'spring-for-sowing');
 await act('world_farm',{operation:'private_sow',areaMu:2,item:'item_wheat_seed'},'s508-sow');
 const id='private-farm:loc_hw_fields',old=document.state.records[id],days=w.rules.agriculture.crop.growthDays-1;
 // Actual sowing created the cohort. The elapsed growing season and the
 // counterparty's cash/presence are premises, not the mechanisms examined.
 out=applyIntentSetup(e,document,{facts:[
  {path:['state','records',id],value:{...old,grownDays:days,qualityDays:days,qualitySum:days}},
  {path:['state','npcs',seller],value:{...document.state.npcs[seller],location:'loc_hw_fields',coins:200000}}
 ]});assert.deepEqual(out.setupUnmet,[]);document=withLedger(e,out.document).document;
 let d=e.primitiveDraft(document),now=document.state.minute;
 openGoodsObligation(d,e,{id:'farm-history',kind:'forward',debtor:'player',creditor:seller,item:'item_wheat_grain',quantity:1,deadline:now+100,location:'loc_hw_fields'},'farm-history');
 performGoodsObligation(d,e,{id:'farm-history',actor:'player',quantity:1},'deliver-farm-history');document=d.document;
 d=e.primitiveDraft(document);
 openGoodsObligation(d,e,{id:'crop-forward',kind:'forward',debtor:'player',creditor:seller,item:'item_wheat_grain',quantity:500,prepayment:20000,deadline:now+3*1440,location:'loc_hw_fields'},'crop-forward');
 document=d.document;
 // D15 §15.6: use a separate real-runtime branch for the early promise. If
 // retained through ripening it would default and correctly zero every weight,
 // masking the production-capacity assertion rather than testing ripening.
 const early=e.primitiveDraft(document);
 openGoodsObligation(early,e,{id:'too-early',kind:'forward',debtor:'player',creditor:seller,item:'item_wheat_grain',quantity:10,prepayment:500,deadline:now+30,location:'loc_hw_fields'},'too-early');
 const project=()=>forwardSupply(e.primitiveDraft(document),e,'item_wheat_grain','loc_hw_fields');
 // 2mu *150jin/mu *.5kg/jin /.5kg/portion *179/179 =300.
 // There are no harvested portions; promise500 is capped at real crop300.
 assert.equal(project().rows.find(r=>r.id==='crop-forward').production,300);
 assert.equal(project().rows.find(r=>r.id==='crop-forward').expected,300);
 assert.equal(forwardSupply(early,e,'item_wheat_grain','loc_hw_fields').rows.find(r=>r.id==='too-early').expected,0);
 await act('world_time',{minutes:2*1440},'ripen-real-crop');
 // The last clear-weather growth tick contributes.9: floor(300*179.9/180)=299.
 assert.equal(document.state.records[id].yield,299);
 assert.equal(project().expected,299);assert.equal(document.ledger.accounts['loc_hw_fields|item_wheat_grain|crop'],299);
 assert.deepEqual(auditLedger(document.ledger),[]);
});

test('partial mutual cancellation refunds only undelivered goods; an unfunded refund writes nothing',()=>{
 const f=scene();history(f);sign(f,'part-cancel');
 f.mutate(d=>performGoodsObligation(d,f.engine,{id:'part-cancel',quantity:3},'part-delivery'));
 f.mutate(d=>{const unit=trackTransferUnit(d,f.engine,seller,item,'cancellation-collateral');ensureHoldings(d,f.engine);openHolding(d,{kind:'pledged',holder:'part-cancel',subject:unit,writer:'obligation-runtime',engine:f.engine,eventId:'secure-cancellation'});});
 const payable=f.document,prepared=applyIntentSetup(f.engine,payable,{facts:[{path:['state','npcs',seller,'coins'],value:0}]});
 assert.deepEqual(prepared.setupUnmet,[]);const blocked=f.engine.primitiveDraft(prepared.document),before=structuredClone(blocked.document);
 assert.throws(()=>cancelGoodsObligation(blocked,f.engine,{id:'part-cancel'},'no-refund-money'));
 assert.deepEqual(blocked.document,before);assert.deepEqual(blocked.patches,[]);
 const cash=f.document.state.player.coins;
 const result=f.mutate(d=>cancelGoodsObligation(d,f.engine,{id:'part-cancel'},'partial-cancel'));
 // Ten prepaid at1150, three actually delivered: floor(1150*7/10)=805 back.
 assert.equal(result.cancelled,7);assert.equal(result.refund,805);assert.equal(f.document.state.player.coins,cash+805);
 assert.equal(aliveHoldings(f.read(),{kind:'pledged',holder:'part-cancel'}).length,0);
 const after=structuredClone(f.document);
 assert.deepEqual(f.mutate(d=>cancelGoodsObligation(d,f.engine,{id:'part-cancel'},'partial-cancel')),result);
 assert.deepEqual(f.document,after);assert.deepEqual(auditLedger(f.document.ledger),[]);
});

test('purchase money has a native counter escrow location while real grain is in transit',()=>{
 const w=structuredClone(world),lane=w.rules.settlementTrade.lanes[0];
 w.rules.settlementTrade.lanes=[lane];lane.maximumQuantity=10;
 w.rules.weather.persistence=0;w.rules.weather.seasonalWeights=Array.from({length:4},()=>[100,0,0,0,0,0]);
 const e=new WorldEngine(w),initial=e.createCharacter(seed,{},'s508-escrow'),depart=7*1440+540;
 const prepared=applyIntentSetup(e,initial,{minute:depart});assert.deepEqual(prepared.setupUnmet,[]);
 const d=e.primitiveDraft(withLedger(e,prepared.document).document),before=structuredClone(d.document),key=`settlement-trade:${lane.id}:7`;
 advanceSettlementTrade(d,e,depart);const order=d.get('state','records',key);
 assert.equal(order.status,'in-transit');assert.equal(order.quantity,10);
 // Frozen native contract:10 portions * signed3 copper =30 in escrow.
 assert.equal(order.unitPriceCopper,3);assert.equal(order.escrowCopper,30);
 const counter=w.rules.agriculture.settlements.find(p=>p.settlement===lane.buyer).counter;
 assert.equal(order.escrowCustodian,lane.buyer);assert.equal(order.escrowLocation,counter);
 assert.equal(located(holdingsView(d.document),key),counter);
 assert.equal(d.get('ledger','accounts',`${key}|coin_river|escrow`),30);
 assert.equal(before.state.settlements[lane.buyer].treasury-d.get('state','settlements',lane.buyer,'treasury'),30);
 assert.equal(cashTotal(d.document),cashTotal(before));assert.deepEqual(auditLedger(d.document.ledger),[]);
 assert.ok(Number.isFinite(nextSettlementTradeMinute(d.get('state'),e,depart)));
 for(let n=0;n<20&&d.get('state','records',key,'status')==='in-transit';n++){
  const at=nextSettlementTradeMinute(d.get('state'),e,d.get('state','minute'));
  d.set(['state','minute'],at);advanceSettlementTrade(d,e,at);
 }
 assert.equal(d.get('state','records',key,'status'),'delivered');assert.equal(d.get('ledger','accounts',`${key}|coin_river|escrow`),0);
 assert.equal(d.get('state','settlements',lane.seller,'treasury')-before.state.settlements[lane.seller].treasury,30);
 assert.equal(cashTotal(d.document),cashTotal(before));assert.deepEqual(auditLedger(d.document.ledger),[]);
 const settled=structuredClone(d.document);advanceSettlementTrade(d,e,d.get('state','minute'));assert.deepEqual(d.document,settled);
});

test('native transport advancement is partition invariant and carries the real draft animals',async()=>{
 const f=carrierScene(),q=carriageQuote(f),trip=f.mutate(d=>bookTransport(d,f.engine,{asset:f.asset,to:quarry,cargo},'clock-trip')),start=f.document;
 const advance=async(document,minutes,eventId)=>{
  const out=await f.engine.reduce(document,{tool:'world_time',args:{minutes},eventId});assert.equal(out.result.ok,true);return applyPatches(document,out.patches);
 };
 const large=await advance(start,q.estimatedArrivalAt-start.state.minute,'large-transport');
 const middle=await advance(start,100,'first-transport'),small=await advance(middle,q.estimatedArrivalAt-middle.state.minute,'second-transport');
 assert.deepEqual(small.state.records[trip.id],large.state.records[trip.id]);
 assert.deepEqual(small.state.records[f.asset],large.state.records[f.asset]);
 assert.equal(large.state.records[trip.id].status,'arrived');
 for(const animal of f.animals){
  assert.equal(large.state.creatures[animal.id].location,quarry);
  assert.equal(located(holdingsView(large),animal.id),quarry);
 }
 // D05 §5.1 / I2: other native travellers pay the declared3-copper trunk
 // toll to the existing export sink. Include this real boundary outflow;
 // freight, tariff and escrow transfers themselves must still conserve cash.
 const tollFlow='sink:export|coin_river|travel';
 assert.equal((large.ledger.flows[tollFlow]??0)-(start.ledger.flows[tollFlow]??0),3);
 assert.equal((small.ledger.flows[tollFlow]??0)-(start.ledger.flows[tollFlow]??0),3);
 // F010: the tavern's route arrival of rations in the same wait also pays its porters through the same export sink
 // ('sink:export|coin_river|freight', read from the ledger flows, not recomputed).
 const freight='sink:export|coin_river|freight',freightOf=(d)=>(d.ledger.flows[freight]??0)-(start.ledger.flows[freight]??0);
 assert.equal(cashTotal(large)+3+freightOf(large),cashTotal(start));assert.equal(cashTotal(small)+3+freightOf(small),cashTotal(start));
 assert.deepEqual(auditLedger(large.ledger),[]);assert.deepEqual(auditLedger(small.ledger),[]);
});

test('a player can offer real goods, fulfil them and initiate a mutually agreed cancellation',async()=>{
 const f=scene(),setup=applyIntentSetup(f.engine,f.document,{inventory:{[item]:2}});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 const act=async(action,slots,eventId)=>{const out=await f.engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId});assert.equal(out.result.ok,true,JSON.stringify(out.result));f.replace(applyPatches(f.document,out.patches));return out;};
 await act('transport:forward.offer',{buyer:seller,item,quantity:1,coins:0,deadline:2000},'offer-gift');
 const first=Object.values(f.document.state.obligations).find(r=>r.kind==='forward');assert.equal(first.debtor,'player');
 await act('transport:forward.fulfill',{contract:first.id,quantity:1},'perform-offer');
 assert.equal(f.document.state.obligations[first.id].status,'completed');assert.equal(f.engine.quantity(f.read(),'player',item),1);
 const cash=f.document.state.player.coins;
 await act('transport:forward.offer',{buyer:seller,item,quantity:1,deadline:2000},'offer-paid');
 const second=Object.values(f.document.state.obligations).find(r=>r.kind==='forward'&&r.id!==first.id);
 // 230*.5=115 copper. The buyer actually prepays the derived signed value.
 assert.equal(second.terms.forward.consideration,115);assert.equal(f.document.state.player.coins,cash+115);
 await act('transport:forward.cancel',{contract:second.id},'cancel-offer');
 assert.equal(f.document.state.player.coins,cash);assert.equal(f.document.state.obligations[second.id].cancellation.refund,115);
 assert.equal(forwardReliability(f.read(),f.engine,'player').reliability,0.5);
 assert.deepEqual(auditLedger(f.document.ledger),[]);
});
