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
import {openGoodsObligation,performGoodsObligation} from '../server-plugin/obligation-conditional.mjs';
import {closeObligation} from '../server-plugin/obligation-runtime.mjs';
import {marketQuote,forwardSupply,forwardReliability} from '../server-plugin/market.mjs';
import {trackTransferUnit} from '../server-plugin/items.mjs';
import {ensureHoldings,openHolding} from '../server-plugin/holdings.mjs';

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
