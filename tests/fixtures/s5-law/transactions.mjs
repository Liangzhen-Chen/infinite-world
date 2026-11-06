// Controlled K07/MKT01 observations, separate from the unaltered annual world.
// Existing field/people only. Setup facts describe recoverable ownership,
// inventory and presence; consent and all performance use production writers.
import fs from 'node:fs/promises';
import {loadWorld} from '../../../tools/load-world.mjs';
import {WorldEngine} from '../../../server-plugin/engine.mjs';
import {applyPatches} from '../../../server-plugin/storage.mjs';
import {applyIntentSetup} from '../../../tools/a3-score.mjs';
import {applyConsentEvent} from '../../../server-plugin/action-consent.mjs';
import {fieldRentBasis} from '../../../server-plugin/finance-assets.mjs';
import {recordAgreedQuote} from '../../../server-plugin/shop.mjs';
import {withLedger} from '../../../server-plugin/ledger.mjs';

const DAY=1440,field='loc_hw_fields',tenant='player',owner='npc_hw_ayan',buyer='npc_hw_linsui',item='item_oats';
export async function leaseCycle({poor=false,mode='share'}={}){
 const w=await loadWorld();
 // This controlled harvest anchor fixes both parties on the field all day.
 // Source errands are outside that premise; the annual world remains unaltered.
 delete w.rules.householdSubsistence;
 // Independent anchor: one mu, 1500/15=100 output; ten seeds; a 2-day
 // crop makes a small whole-cycle fixture, never the annual baseline.
 Object.assign(w.rules.forestWater.water,{droughtYieldFloor:1,maximumCropPollutionLoss:0});
 w.rules.weather.seasonalWeights=w.rules.weather.seasonalWeights.map(()=>[1,0,0,0,0,0]);w.rules.weather.states.clear.crop=1;
 for(const r of w.rules.weather.regions)r.temperatures=[20,20,20,20];
 Object.assign(w.rules.agriculture.settlements.find(r=>r.fieldLocation===field),{areaUnits:100,farmWorkers:0,workerFraction:0,processingWorkers:0,freshWorkers:0});
 Object.assign(w.rules.agriculture.crop,{seedPerHa:150,growthDays:2,yieldPerHa:1500});
 w.rules.economy.priceFactorLimits.region=[1,1];w.rules.economy.priceFactorLimits.transport=[1,1];w.rules.settlementTrade.seasonFactors=[1,1,1,1];
 w.items.find(i=>i.id===item).basePrice=1;
 for(const id of [owner,buyer])w.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:field,activity:'休息',services:['trade']}]};
 const e=new WorldEngine(w),legacy=JSON.parse(await fs.readFile(new URL('../legacy/seed.json',import.meta.url),'utf8'));
 let document=e.createCharacter(legacy,{},'K13-lease-control');
 const act=async(tool,args,eventId)=>{const out=await e.reduce(document,{tool,args,eventId});document=applyPatches(document,out.patches);return out.result;};
 await act('world_time',{minutes:6*DAY+480-document.state.minute},'spring');
 const npcs={...document.state.npcs};
 for(const id of [owner,buyer])npcs[id]={...npcs[id],location:field,status:'正常',activity:'休息',coins:5000,inventory:{[item]:{quantity:30}}};
 const setup=applyIntentSetup(e,document,{location:field,coins:3000,inventory:{[item]:30,item_bread:20,item_hoe:1,item_sickle:1},facts:[{path:['state','buildings'],value:{...document.state.buildings,[field]:{condition:100,owner}}},{path:['state','npcs'],value:npcs}]});
 if(setup.setupUnmet.length)throw Error(JSON.stringify(setup.setupUnmet));document=setup.document;
 const now=document.state.minute,due=now+20*DAY,basis=fieldRentBasis(e.primitiveDraft(document),e,field,{areaMu:1,seedItem:item});
 const tenancy={rentMode:mode,inputPayer:'tenant',unharvestedCrops:'tenant',farmOperator:'tenant'};
 const share={outputBasis:'gross',rentPayment:'cash',shareNumerator:3,shareDenominator:10};
 const terms={days:30,location:field,quantity:1,item,prepayment:0,deadline:due,...tenancy,...(mode==='share'?{...share,cropPriceNumerator:basis.quoteBasis.unitPrice.numerator,cropPriceDenominator:basis.quoteBasis.unitPrice.denominator,seedPriceNumerator:basis.quoteBasis.unitPrice.numerator,seedPriceDenominator:basis.quoteBasis.unitPrice.denominator}:{amount:30})};
 const d=e.primitiveDraft(document);applyConsentEvent(d,{engine:e,document:d.document},{actor:owner,eventId:'lease-consent',verb:'consent_given',to:tenant,payload:{scope:'rent',subject:field,purpose:[field],terms,until:now+10}});document=applyPatches(document,d.patches);
 const lease=await act('world_act',{action:'trade.rent_in',slots:{location:field,quantity:1,item,days:30,deadline:due,deposit:0,...tenancy,...(mode==='share'?share:{coins:30})}},'lease-sign');
 if(!lease.contract)throw Error(JSON.stringify(lease));
 await act('world_act',{action:'farm.private_sow',slots:{location:field,areaMu:1,item}},'sow');
 if(poor)e.world.rules.weather.states.clear.crop=.4;
 await act('world_time',{minutes:3*DAY},'grow');
 const trades=[];
 for(let i=0;i<100&&document.state.records[`private-farm:${field}`].status==='ready';i++){
  const harvest=await act('world_act',{action:'farm.private_harvest',slots:{location:field}},`cut-${i}`);
  if(!(harvest.harvested>0))throw Error(JSON.stringify(harvest));
  // Ordinary actual sale clears carried output; failure remains visible.
  try{const sale=await act('world_act',{action:'trade.sell_to',slots:{buyer,item,quantity:harvest.harvested}},`sale-${i}`);trades.push({quantity:harvest.harvested,cost:sale.cost??sale.revenue??null});}
  catch(error){trades.push({quantity:harvest.harvested,error:error.message});break;}
 }
 const row=document.state.records[lease.contract],farm=document.state.records[`private-farm:${field}`];
 return {engine:e,document,mode,poor,output:farm.harvestedQty,complete:farm.status==='harvested',rent:mode==='share'?row.shareAssessed:30,claims:Object.values(document.state.obligations).filter(r=>r.contract===lease.contract),trades};
}

export async function privateTradeProbe(){
 const w=await loadWorld(),e=new WorldEngine(w),legacy=JSON.parse(await fs.readFile(new URL('../legacy/seed.json',import.meta.url),'utf8'));
 // Ten wood weigh20kg; with the authored2.6kg pack this is deliverable
 // under the existing30kg safe load. Twenty wood was not a valid C1 sample.
 let doc=e.initialFromLegacy(legacy,'K13-private-control');const seller='npc_hw_linsui',place='bld_hw_qingdeng',goods='item_wood',quantity=10,totalCoins=12;
 e.byId.get(seller).schedule={default:[{start:0,end:1440,location:place,activity:'休息',services:['trade']}]};
 const setup=applyIntentSetup(e,doc,{minute:600,location:place,coins:1000,facts:[{path:['state','npcs',seller,'location'],value:place},{path:['state','npcs',seller,'inventory'],value:{...doc.state.npcs[seller].inventory,[goods]:quantity}}]});
 if(setup.setupUnmet.length)throw Error(JSON.stringify(setup.setupUnmet));doc=withLedger(e,setup.document).document;
 const d=e.primitiveDraft(doc),at=doc.state.minute;
 d.set(['state','records','world_event:offer'],{category:'world_event',id:'offer',verb:'quoted',actor:seller,minute:at,payload:{to:'player',resource:goods,quantity,totalCoins}});
 recordAgreedQuote(d,e,{id:'K13-private-offer',actor:seller,to:'player',direction:'sell_to_player',resource:goods,quantity,totalCoins,sourceEvent:'world_event:offer',at,expires:at+60});doc=applyPatches(doc,d.patches);
 try{const out=await e.reduce(doc,{tool:'world_trade',args:{seller,item:goods,quantity},eventId:'K13-private-sale'});return {consent:true,deliverable:true,payment:true,rejected:false,reasons:[],result:out.result,document:applyPatches(doc,out.patches)};}
 catch(error){return {consent:true,deliverable:true,payment:true,rejected:true,reasons:[/深度/.test(error.message)?'depth':/价格|价带/.test(error.message)?'reference-band':error.message]};}
}
