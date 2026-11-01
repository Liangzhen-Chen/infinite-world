import {preconditionFailure} from './precondition.mjs';
import {requestContractConsent} from './action-consent.mjs';
import {counterpart} from './credit.mjs';
import {vocabulary} from './domain-rules.mjs';
import {transportSegment,stepTransport} from './transport-route.mjs';
import {openGoodsObligation,performGoodsObligation,extendGoodsObligation,cancelGoodsObligation} from './obligation-conditional.mjs';
import {transition} from './transition.mjs';
import {financeBalance,financeTransfer,financeChange} from './finance-bank.mjs';
import {escrow as escrowAccount} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {ledgerActive} from './ledger.mjs';
import {registerEarnedClaim,registerLoss,recoverLoss,lossView,settleClaim} from './obligation-claims.mjs';
import {dueObligation} from './obligation-runtime.mjs';
import {obligationRow,obligationRows,institutionOriginal,institutionPhysicalReference} from './obligation-state.mjs';
import {obligationTransaction} from './transition.mjs';
import {store,freight,bookStock} from './stock.mjs';
// S1b: 托运期间货物记在 transport:<id>|<物品>|freight，交付时转给收货人（组织公库或行囊）。
declareLedgerWriter('transport',{sinks:['sink:consume','sink:destroy']});
import {assessTradeTax,tradeTax} from './finance-tax.mjs';
import {changeItems} from './items.mjs';
import {personOccupation,personConstraint,personAge,groupView,groupRepresentative} from './entity-view.mjs';
import {assertNpcObligationAction} from './npc-obligations.mjs';
import {assertLocationAccess} from './location-access.mjs';
import {assertWaterEarthMovement} from './magic-water-earth.mjs';
import {postGeneratedQuest} from './quest-sources.mjs';
import {groupAccountView,groupAccountPath,ensureGroupAccount} from './group-account.mjs';
import {publishTransitionEvent} from './world-events.mjs';
import {openingTransportAssets} from '../world/design/transport-rules.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings,holdingsView,ensureHoldings,setLocation} from './holdings.mjs';
import {derived} from './derived.mjs';
import {refundContractEscrow} from './contracts.mjs';
import {marketQuote} from './market.mjs';
import {partyDeterrence} from './deterrence.mjs';
import {valuation} from './valuation.mjs';
import {carryOverKg} from './carry.mjs';
import transportBalance from '../world/rules/tables/balance/transport.json' with {type:'json'};
declareHoldingWriter('transport',{kinds:['owns','tamed_by'],locations:true});

const DAY=1440,clone=x=>structuredClone(x),path=id=>['state','records',id];
// 车船规格与发车班次读 balance/transport.json 的 carrier:* / departure:* 行（原硬编码 SPECS 数值搬入，不变）。
const tableOf=e=>e.world.balance?.transport??transportBalance;
const tableRow=(e,key)=>tableOf(e).rows.find(r=>r.key===key);
const specOf=(e,kind)=>tableRow(e,`carrier:${kind}`);
const tableParam=(e,id)=>tableOf(e).params.find(p=>p.id===id).value;
// 下一班发车：驿站（信件：无货无客）每日固定钟点，过点次日；车行/船行整点随到随发，过截件钟点次日起发。
export function carrierDeparture(e,selector,now){
 const row=tableRow(e,`departure:${selector}`),day=now-now%DAY,at=now%DAY;
 if(!row)return now;
 if(row.at!==undefined)return at<=row.at?day+row.at:day+DAY+row.at;
 const departure=Math.max(row.resume,Math.ceil(at/60)*60);
 return departure<row.cutoff?day+departure:day+DAY+row.resume;
}
// 信件 = 没有货、没有客、也没有护送的一趟（驿传）；这样的运单没有别的用途。
const isLetter=(cargo,passengers,escort)=>!cargo.length&&!passengers.length&&!escort;
const int=(n,min,label)=>{if(!Number.isSafeInteger(n)||n<min)throw preconditionFailure(`${label}无效`);return n;};
const all=s=>Object.values(s.records??{});
const unfinished=s=>(s.records?.['transport:active']?.ids??[]).map(id=>s.records[id]).filter(Boolean);
const live=s=>unfinished(s).filter(r=>['booked','moving','delayed'].includes(r.status));
// Booked cart consignments may share a departure; moving/intercepted loads keep
// their reservation until arrival. Cargo and payment accounts remain per order.
const occupied=s=>unfinished(s).filter(r=>['booked','moving','delayed','intercepted'].includes(r.status));
const batchOf=(s,row)=>row.batch?occupied(s).filter(r=>r.batch===row.batch):[row];
const batchLoad=rows=>rows.reduce((n,r)=>({kg:n.kg+r.load.kg,m3:n.m3+r.load.m3,seats:n.seats+r.passengers.length}),{kg:0,m3:0,seats:0});
function joiningBatch(s,a,from,to,letter){
 const rows=occupied(s).filter(r=>r.asset===a.id);
 if(!rows.length)return [];
 if(letter||a.kind!=='cart'||rows.some(r=>r.status!=='booked'||!r.batch||r.from!==from||r.to!==to))throw preconditionFailure('没有同地同程、尚未发车的可并载车次');
 return rows;
}
function tripClock(e,s,a,{from,to,load,passengers,letter,requested}){
 const rows=joiningBatch(s,a,from,to,letter),rules=e.rules.travel.carriers?.cart;
 const batched=a.kind==='cart'&&!letter&&rules;
 if(!batched)return {departAt:carrierDeparture(e,letter?'post':'cart',requested),rows,travelWindow:null};
 const booked=batchLoad(rows),kg=booked.kg+load.kg,m3=booked.m3+load.m3,seats=booked.seats+passengers.length;
 const filled=Math.max(kg/a.capacityKg,m3/a.capacityM3,a.seats?seats/a.seats:0)*1000>=rules.batching.minLoadPermille;
 const closes=rows[0]?.batchClosesAt??carrierDeparture(e,'cart',s.minute)+Math.ceil(rules.batching.waitDays*DAY);
 const departAt=carrierDeparture(e,'cart',Math.max(requested,...rows.map(r=>r.batchNotBefore??r.createdAt),filled?s.minute:closes));
 const start=tableRow(e,'departure:cart').resume;
 return {departAt,rows,batch:rows[0]?.batch??null,batchClosesAt:closes,travelWindow:rules.dailyJourney.nightTravel?null:{start,end:start+e.rules.travel.dailyTravelMinutes}};
}
const initialJourney=(edges,from,departAt,travelWindow)=>({edges,edgeIndex:0,location:from,remainingKm:null,movingMinutes:0,restedBudgets:0,nextAt:departAt,segment:null,...travelWindow?{travelWindow}:{} });
// Quote and execution use the same segments, including weather and overnight
// stops. The planning bound is the existing weather route planner's 1000 steps.
function arrivalMinute(e,s,seed,edges,from,mode,departAt,travelWindow){
 const t=initialJourney(edges,from,departAt,travelWindow);let minute=departAt;
 for(let steps=0;steps<1000;steps++){
  if(t.edgeIndex>=edges.length)return minute;
  const segment=transportSegment(e,s,seed,t,mode,minute);minute+=segment.minutes;stepTransport(e,t,segment);
 }
 throw preconditionFailure('承运行程超过路线规划步数限制');
}
function index(d,id,add=true,key='transport:active'){const ids=d.get(...path(key),'ids')??[];holdingSet(d,null,path(key),{category:'transport_index',ids:add?[...new Set([...ids,id])]:ids.filter(x=>x!==id)},'transport');}
// Wrecked shipments leave the live index at once but stay here until their cargo, freight and escort accounts are settled.
const pendingWrecks=s=>(s.records?.['transport:wrecked']?.ids??[]).map(id=>s.records[id]).filter(r=>r?.status==='wrecked'&&r.settledAt===undefined);
const assetKey=id=>id.startsWith('transport_asset:')?id:`transport_asset:${id}`;
const actorLocation=(s,id)=>id==='player'?s.location:s.npcs?.[id]?.location;
const assets=(e,s)=>[...new Map([...openingTransportAssets.filter(a=>e.byId.has(a.owner)&&e.byId.has(a.location)),...all(s).filter(a=>a.category==='transport_asset')].map(a=>[a.id,a])).values()];
function available(e,s,id){const n=s.npcs?.[id];return n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'')&&!n.scheduleTravel&&!n.cognitionTravel&&!e.npcAutonomyBusy(s,id,s.minute)&&!personConstraint(e,s,id)&&(personAge(e,s,id).value??0)>=18;}
function availableForBatch(e,s,id,rows){
 const n=s.npcs?.[id];
 if(rows.some(r=>r.driver===id&&r.id===n?.cognitionTravel?.transport))return available(e,{...s,npcs:{...s.npcs,[id]:{...n,cognitionTravel:null}}},id);
 return available(e,s,id);
}
function operator(e,s,owner){return s.npcs?.[owner]?owner:groupRepresentative(e,s,owner);}
function draftAnimals(e,document,asset){
 const s=document.state,view=holdingsView(document),reserved=new Set(occupied(s).filter(r=>r.asset!==asset.id).flatMap(r=>r.draftSources??[]));
 const owned=new Set(['owns','tamed_by'].flatMap(kind=>aliveHoldings(view,{kind,holder:asset.owner}).map(r=>r.subject)));
 const sources=[];let hasDraftAnimal=false;
 for(const id of owned){
  if(reserved.has(id)||asset.animal&&id!==asset.animal)continue;
  const c=s.creatures?.[id];
  if(c){
   if((e.byId.get(c.species)?.tamingRule?.carryKg??0)>0)hasDraftAnimal=true;
   if(c.location!==asset.location||c.hp<c.maxHp/2||['死亡','昏迷','患病'].includes(c.status)||c.mind?.awakened||c.care?.sickness||c.care?.fatigue>=e.rules.petCare.maximumRideFatigue||c.care?.hunger>=e.rules.petCare.hungryThreshold||s.player.mount===id)continue;
   const capacity=e.byId.get(c.species)?.tamingRule?.carryKg??0;if(capacity>0)sources.push({id,kg:capacity});
  }else{
   const population=all(s).find(r=>r.category==='husbandry'&&r.id===id);
   if(population?.location!==asset.location)continue;
   const perHead=e.byId.get(population.species)?.tamingRule?.carryKg??0;if(perHead>0)hasDraftAnimal=true;
   const healthy=population.health?population.health.S+population.health.R:population.count;
   if(perHead>0&&healthy>0)sources.push({id,kg:Math.min(population.count,healthy)*perHead});
  }
 }
 // A cart whose owner keeps no draft animal at all is a hand cart: its driver
 // pulls it, bounded by the driver's own carrying strength (combat.derivedStats).
 if(!hasDraftAnimal&&!asset.animal){
  const puller=asset.owner==='player'?'player':operator(e,s,asset.owner);
  if(puller&&(puller==='player'||occupied(s).some(r=>r.asset===asset.id&&r.driver===puller)||available(e,s,puller))&&!occupied(s).some(r=>r.asset!==asset.id&&r.driver===puller)){
   // Same carrying rule as combat.derivedStats (carryBase + strength * carryPerStrength); not imported across packs.
   const attributes=puller==='player'?s.player?.attributes:(s.npcs?.[puller]?.attributes??e.byId.get(puller)?.attributes),c=e.rules.combat.character;
   sources.push({id:puller,kg:Math.max(1,c.carryBase+(attributes?.力量??10)*c.carryPerStrength)});
  }
 }
 return sources;
}
export function transportAssetView(e,document,id){
 const s=document.state;
 const a=s.records?.[assetKey(id)]??openingTransportAssets.find(a=>a.id===assetKey(id)&&e.byId.has(a.owner)&&e.byId.has(a.location));if(a?.category!=='transport_asset')return null;
 const spec=specOf(e,a.kind);let factor=a.destroyedAt!==undefined||a.durability<25?0:a.durability<60?0.5:1,location=a.location;
 if(a.kind==='pack'){
  const c=s.creatures?.[a.animal],rule=e.byId.get(c?.species)?.tamingRule;
  if(!c||c.owner!==a.owner||c.hp<c.maxHp/2||['死亡','昏迷'].includes(c.status)||c.mind?.awakened||c.care?.fatigue>=e.rules.petCare.maximumRideFatigue||c.care?.sickness||c.care?.hunger>=e.rules.petCare.hungryThreshold||s.player.mount===a.animal)factor=0;
  location=c?.location??location;
  if(rule?.carryKg)factor*=Math.min(1,rule.carryKg/spec.kg);
 }
 const draft=a.kind==='cart'?draftAnimals(e,document,a):[],draftKg=draft.reduce((sum,r)=>sum+r.kg,0);
 const capacityFactor=derived(e,document,'transport:capacity',a.id,{holder:a.owner,base:1});
 const kg=(a.kind==='cart'?Math.min(spec.kg,draftKg):spec.kg)*factor*capacityFactor;
 const ratio=kg/spec.kg;
 const lease=all(s).find(r=>r.category==='transport_lease'&&r.asset===a.id&&r.starts<=s.minute&&r.ends>s.minute);
 const busy=occupied(s).find(r=>r.asset===a.id);
 return {...a,location,holder:busy?.carrier??lease?.tenant??a.owner,capacityKg:kg,capacityM3:spec.m3*ratio,seats:Math.floor(spec.seats*ratio),draftSources:draft.map(r=>r.id),mode:spec.mode,factor,busy:busy?.id??null,
  tags:['item','transport',a.kind,a.kind==='pack'?'flesh':'wood',...(factor===0?['broken']:[])]};
}
export function createTransportAsset(d,e,{owner='player',kind='cart',animal,id},eventId){
 return obligationTransaction(d,()=>createTransportAssetInner(d,e,{owner,kind,animal,id},eventId));
}
function createTransportAssetInner(d,e,{owner,kind,animal,id},eventId){
 ensureHoldings(d,e);
 const spec=specOf(e,kind);if(!spec)throw preconditionFailure('承运资产类型无效');
 const s=d.get('state'),key=assetKey(id??eventId),location=actorLocation(s,owner)??actorLocation(s,operator(e,s,owner));
 if(!location||d.get(...path(key)))throw preconditionFailure('资产地点或编号无效');
 if(kind==='pack'){
  const c=s.creatures?.[animal];
  if(!c||c.owner!==owner||c.location!==location||c.hp<=0||s.player.mount===animal||all(s).some(a=>a.category==='transport_asset'&&a.animal===animal))throw preconditionFailure('需要本人同地、未骑乘且未登记的驮畜');
  const species=e.byId.get(c.species),care=species?.tamingRule;
  if(!care?.carryKg||c.mind?.awakened)throw preconditionFailure('该动物没有驮运能力');
 }else{
  const stock=groupAccountView(e,s,owner)?.items;
  if((stock?.item_wood??e.quantity(d,owner,'item_wood'))<spec.wood||(stock?.item_iron??e.quantity(d,owner,'item_iron'))<spec.metal)throw preconditionFailure('制造车船的木料或铁料不足');
  const build={flow:'sink:consume',purpose:'build',writer:'transport',eventId};
  moveGoods(d,e,owner,'item_wood',spec.wood,{take:true,books:build});moveGoods(d,e,owner,'item_iron',spec.metal,{take:true,books:build});
 }
 const asset={category:'transport_asset',id:key,kind,owner,location,durability:100,maxDurability:100,animal:animal??null,createdAt:s.minute,sourceEvent:eventId};
 holdingSet(d,null,path(key),asset,'transport');return transportAssetView(e,d.document,key);
}
export function transportServices(e,document,location){
 const s=document.state;
 return assets(e,s).map(a=>transportAssetView(e,document,a.id)).filter(a=>a.factor&&a.capacityKg>0&&a.location===location).flatMap(a=>{
  const rows=occupied(s).filter(r=>r.asset===a.id);
  if(rows.length&&(a.kind!=='cart'||rows.some(r=>r.status!=='booked'||!r.batch)))return [];
  const driver=operator(e,s,a.holder),group=groupView(e,s,a.holder);
  if(!availableForBatch(e,s,driver,rows)||actorLocation(s,driver)!==location||!(group||/商|车|船|驿|运输|脚夫/.test(personOccupation(e,s,driver).value??'')))return [];
  const used=batchLoad(rows);if(used.kg>=a.capacityKg||used.m3>=a.capacityM3||a.seats&&used.seats>=a.seats)return [];
  const now=s.minute,depart=rows[0]?.departAt??carrierDeparture(e,'cart',now);
  return [{asset:a.id,carrier:a.holder,driver,kind:a.kind,mode:a.mode,capacityKg:a.capacityKg-used.kg,capacityM3:a.capacityM3-used.m3,seats:a.seats-used.seats,nextDeparture:depart,intervalMinutes:60}];
 });
}
function dimensions(e,cargo,passengers){
 let kg=passengers.length*75,m3=passengers.length*0.1;
 for(const c of cargo){int(c.quantity,1,'托运数量');const def=e.byId.get(c.item);if(!def||!(def.weight>=0))throw preconditionFailure('托运物品未登记重量');kg+=c.quantity*def.weight;m3+=c.quantity*(def.volumeM3??def.weight/250);}
 return {kg,m3};
}
export function quoteTransport(d,e,{asset,from,to,cargo=[],passengers=[],owner='player',escort=null,departAt:requested=d.get('state','minute')}){
 const s=d.get('state'),a=transportAssetView(e,d.document,asset);if(!a||!a.factor||!a.capacityKg||a.location!==from)throw preconditionFailure('没有同地可用运力');
 const letter=isLetter(cargo,passengers,escort),load=dimensions(e,cargo,passengers),clock=tripClock(e,s,a,{from,to,load,passengers,letter,requested}),{departAt}=clock;
 const used=batchLoad(clock.rows);if(load.kg+used.kg>a.capacityKg||load.m3+used.m3>a.capacityM3||passengers.length+used.seats>a.seats)throw preconditionFailure('货舱重量、体积或座位容量不足');
 const prior=e.airDraft;e.airDraft=d;let route;try{route=e.route(from,to,a.mode,departAt,d.document.randomSeed);}finally{e.airDraft=prior;}
 if(clock.rows.length&&(route.edges.length!==clock.rows[0].transport.edges.length||route.edges.some((id,i)=>id!==clock.rows[0].transport.edges[i])))throw preconditionFailure('原车次路线已变化，不能并入不同路线');
 const edges=route.edges.map(id=>e.world.routes.find(r=>r.id===id)),distanceKm=edges.reduce((n,r)=>n+r.lengthKm,0);
 const billableKg=Math.max(load.kg,load.m3*250,1),capacityFactor=Math.max(1,specOf(e,a.kind).kg/a.capacityKg);
 let at=from;const passages=edges.map(r=>{
  const destination=r.from===at?r.to:r.from;at=destination;
  const guards=new Set((r.guards??[]).filter(id=>available(e,s,id)&&[r.from,r.to].includes(actorLocation(s,id))));
  const bonded=escort&&available(e,s,escort)&&actorLocation(s,escort)===from;
  if(bonded)guards.add(escort);
  // 战力、装备、护送义务与车队标签进同一个队伍威慑 base；槽修正项随后叠加。
  const party=partyDeterrence(e,d,{guards:[...guards],bonded:bonded?[escort]:[],tags:[...a.tags,...a.marks??[]]});
  const deterrence=derived(e,d.document,'combat:deterrence',a.id,{target:r.id,base:party.base});
  const risk=derived(e,d.document,'transport:risk',a.id,{target:r.id,base:Math.max(0,Number(r.risk)||0)*(1-deterrence)});
  const tax=tradeTax(e,s,destination,'tariff');
  const cargoValue=Math.trunc(cargo.reduce((v,c)=>v+c.quantity*marketQuote(d,e,{item:c.item,location:destination,seller:owner,instances:c.instances}).explanation.value.value,0));
  return {edge:r.id,destination,treasury:tax.settlement,toll:clock.rows.length?0:r.toll,risk,deterrence,cargoValue,tariff:(r.toll||r.guards?.length)?Math.floor(cargoValue*tax.bps/10000):0,freight:letter?r.lengthKm*tableParam(e,'unit.liPerKm')*tableParam(e,'post.feePerLi'):r.lengthKm*billableKg*specOf(e,a.kind).rate*capacityFactor*(1+risk)};
 });
 const risk=distanceKm?passages.reduce((sum,p,i)=>sum+p.risk*edges[i].lengthKm,0)/distanceKm:0;
 const freight=Math.max(1,Math.ceil(passages.reduce((sum,p)=>sum+p.freight,0)));
 const tariff=passages.reduce((n,p)=>n+p.tariff,0);
 const estimatedArrivalAt=arrivalMinute(e,s,d.document.randomSeed,route.edges,from,a.mode,departAt,clock.travelWindow),toll=passages.reduce((n,p)=>n+p.toll,0);
 return {asset:a.id,mode:a.mode,from,to,departAt,estimatedArrivalAt,route:{...route,minutes:estimatedArrivalAt-departAt},passages,load,distanceKm,risk,capacityFactor,freight,tariff,toll,total:freight+tariff+toll,...clock.batchClosesAt!==undefined?{batch:clock.batch,batchClosesAt:clock.batchClosesAt,travelWindow:clock.travelWindow}:{} };
}
// F010：模拟范围外的来货（店铺外路补货）不再免费入库——按挑夫背货的运价（balance/transport.json carrier:pack）、沿途关口通行费与进口关税，
// 由收货人实际支付。与 quoteTransport 同一套口径：运价按路程×计费重量×费率，关税按到岸聚落的 tariff 税率与货值。
export function porterCharges(d,e,{from,to,cargo,owner,minute=d.get('state','minute')}){
 const s=d.get('state'),route=e.route(from,to,'walk',minute,d.document.randomSeed),load=dimensions(e,cargo,[]);
 const billableKg=Math.max(load.kg,load.m3*250,1),edges=route.edges.map(id=>e.world.routes.find(r=>r.id===id));
 let at=from,freight=0,tariff=0;
 for(const r of edges){
  const destination=r.from===at?r.to:r.from;at=destination;
  freight+=r.lengthKm*billableKg*specOf(e,'pack').rate;
  if(r.toll||r.guards?.length){
   const rate=tradeTax(e,s,destination,'tariff'),value=cargo.reduce((v,c)=>v+c.quantity*marketQuote(d,e,{item:c.item,location:destination,seller:owner}).explanation.value.value,0);
   tariff+=Math.floor(Math.trunc(value)*rate.bps/10000);
  }
 }
 const duties=tariff+(route.cost??0);
 return {route,freight:Math.max(1,Math.ceil(freight)),tariff,toll:route.cost??0,duties,total:Math.max(1,Math.ceil(freight))+duties};
}
export function leaseTransportAsset(d,e,{asset,tenant='player',minutes,coins},eventId){
 const a=transportAssetView(e,d.document,asset),now=d.get('state','minute');int(minutes,1,'租期');int(coins,1,'租金');
 if(!a||a.busy||a.holder!==a.owner||a.owner===tenant||a.location!==actorLocation(d.get('state'),tenant))throw preconditionFailure('资产不能出租');
 financeBalance(d,e,a.owner);financeTransfer(d,e,tenant,a.owner,coins,eventId);assessTradeTax(d,e,{seller:a.owner,cost:coins,location:a.location,sourceEvent:eventId});
 const row={category:'transport_lease',asset:a.id,tenant,owner:a.owner,starts:now,ends:now+minutes,coins};holdingSet(d,null,path(`transport_lease:${eventId}`),row,'transport');return row;
}
// S1b: trip = 托运记录键（货物在途账户的所属实体）。
// books = 不经托运时的对方（造车船消耗的木铁）。
function moveGoods(d,e,owner,item,quantity,{take=false,instances=[],trip,books=null}={}){
 const group=groupView(e,d.get('state'),owner);books??={account:freight(e,trip,item),writer:'transport',eventId:trip};
 // Group storage and treasury use the same authoritative account as F1.
 if(group){const account=ensureGroupAccount(d,e,owner),amount=(account.items[item]??0)+(take?-quantity:quantity);if(amount<0)throw preconditionFailure('组织公库实物不足');
  bookStock(d,e,store(e,owner,item),take?-quantity:quantity,books);
  d.set(groupAccountPath(owner),{...account,items:{...account.items,[item]:amount}});return {instances:[]};}
 const moved=changeItems(d,e,owner,item,take?-quantity:quantity,{preserve:take,selection:take?null:undefined,books});
 if(!take&&instances.length){
  const p=[...e.bagPath(owner),item,'instances'];d.set(p,[...d.get(...p)??[],...instances]);
  for(const unit of instances)holdingSet(d,null,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner,status:'持有'},'transport');
 }
 return moved;
}
export function bookTransport(d,e,args,eventId){
 return obligationTransaction(d,()=>bookTransportInner(d,e,args,eventId));
}
function bookTransportInner(d,e,args,eventId){
 const {owner='player',recipient=owner,to,cargo=[],passengers=[],asset,escort=null,receiptOf=null}=args,s=d.get('state'),from=args.from??actorLocation(s,owner),now=s.minute;
 const postal=args.post&&s.records?.[args.post],previous=postal&&s.records?.[postal.shipment];
 const forwarding=postal?.category==='post'&&postal.from===owner&&previous?.status==='delivered'&&previous.to===from;
 const external=args.externalOrder&&s.records?.[args.externalOrder];
 const externalValid=external?.category==='settlement_trade'&&external.seller===owner&&external.status==='in-transit'&&cargo.length===1&&cargo[0].item===external.item&&cargo[0].quantity===external.quantity;
 const a=transportAssetView(e,d.document,asset),service=transportServices(e,d.document,from).find(x=>x.asset===a?.id);
 if(!service)throw preconditionFailure('承运人当前不能提供班次');
 if(args.departAt!==undefined)int(args.departAt,now,'发车时间');
 if(!forwarding&&!externalValid&&from!==actorLocation(s,owner))throw preconditionFailure('发货人须在装货地点');
 const q=quoteTransport(d,e,{asset:a.id,from,to,cargo,passengers,owner,escort,departAt:args.departAt}),id=`transport:${eventId}`,departAt=q.departAt;
 if(args.departAt!==undefined&&q.departAt!==args.departAt)throw preconditionFailure('不在承运班次时间');
 const joining=q.batch?occupied(s).filter(r=>r.batch===q.batch):[];
 if(!q.route.edges.length)throw preconditionFailure('发货与目的地须为不同地点');
 if(d.get(...path(id)))throw preconditionFailure('运单编号已存在');
 const lease=all(s).find(r=>r.category==='transport_lease'&&r.asset===a.id&&r.ends>now);if(lease&&lease.ends<q.estimatedArrivalAt)throw preconditionFailure('租约不能覆盖承运全程');
 const actors=[service.driver,...passengers,...escort?[escort]:[]];if(new Set(actors).size!==actors.length)throw preconditionFailure('乘客或护送人员重复');
 for(const actor of actors){
  if(actor==='player'){if(s.location!==from)throw preconditionFailure('乘客不在发车地点');}
  else if(!availableForBatch(e,s,actor,actor===service.driver?joining:[])||actorLocation(s,actor)!==from||s.player.companions?.includes(actor))throw preconditionFailure('承运人员或乘客不可行动或不在场');
 }
 if(joining.some(r=>[...r.passengers,...r.escort?[r.escort]:[]].some(actor=>actors.includes(actor))))throw preconditionFailure('乘客或护送人员已在本车次登记');
 for(const actor of actors)assertWaterEarthMovement(d,actor);
 e.assertNpcAutonomyAction(s,actors,{start:now,minutes:q.estimatedArrivalAt-now});
 assertNpcObligationAction(d,e,actors,{start:now,minutes:q.estimatedArrivalAt-now,location:to,kind:'move'});
 if(!forwarding&&!externalValid)assertNpcObligationAction(d,e,[owner],{start:now,minutes:0,location:from,kind:'trade'});
 let checkpoint=from;for(const edgeId of q.route.edges){const edge=e.world.routes.find(r=>r.id===edgeId);checkpoint=edge.from===checkpoint?edge.to:edge.from;if(passengers.includes('player'))assertLocationAccess(d,e,checkpoint,{authorization:args.authorization,arrivalMinute:q.estimatedArrivalAt,companions:passengers.filter(p=>p!=='player')});}
 const totals=new Map();for(const c of cargo)totals.set(c.item,(totals.get(c.item)??0)+c.quantity);
 if(!externalValid)for(const [item,n]of totals)if((groupAccountView(e,s,owner)?.items?.[item]??e.quantity(d,owner,item))<n)throw preconditionFailure('发货人实际货物不足');
 financeBalance(d,e,service.carrier);financeBalance(d,e,recipient);
 const escortFee=escort?Math.max(e.rules.quests.rewardCopperRanges.D[0],Math.min(e.rules.quests.rewardCopperRanges.D[1],Math.ceil(q.distanceKm*(1+q.risk)))):0;
 if(financeBalance(d,e,owner)<q.total+escortFee)throw preconditionFailure('托运运费或护送资金不足');
 for(const p of q.passages)if(p.toll&&(!p.treasury||!groupAccountView(e,s,p.treasury)&&!e.world.settlementProfiles?.some(r=>r.id===p.treasury)))throw preconditionFailure('收费路段没有已登记的收款公账');
 const row={category:'transport',id,asset:a.id,cargoLocation:a.id,carrier:service.carrier,driver:service.driver,owner,recipient,from,to,mode:q.mode,status:'booked',createdAt:now,departAt,estimatedArrivalAt:q.estimatedArrivalAt,
  freight:q.freight,tariff:q.tariff,toll:q.toll,routeCost:q.total,cargo:[],load:q.load,draftSources:a.draftSources,passengers:clone(passengers),escort,escortEscrow:escortFee,receiptOf,externalOrder:externalValid?args.externalOrder:null,
  ...args.authorization!==undefined?{authorization:args.authorization}:{},
  ...q.batchClosesAt!==undefined?{batch:q.batch??id,batchClosesAt:q.batchClosesAt,batchNotBefore:args.departAt??now}:{},
  transport:initialJourney(q.route.edges,from,departAt,q.travelWindow),history:[{minute:now,location:from,kind:'booked'}]};
 if(!d.get(...path(a.id)))holdingSet(d,null,path(a.id),Object.fromEntries(Object.entries(a).filter(([k])=>!['holder','capacityKg','capacityM3','seats','draftSources','mode','factor','busy','tags'].includes(k))),'transport');
 if(!externalValid)for(const c of cargo){const moved=moveGoods(d,e,owner,c.item,c.quantity,{take:true,trip:id});const units=moved.instances??[];row.cargo.push({...c,instances:units});for(const unit of units)holdingSet(d,null,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner:id,status:'托运'},'transport');}
 financeTransfer(d,e,owner,service.carrier,q.freight+q.toll,eventId);assessTradeTax(d,e,{seller:service.carrier,cost:q.freight,location:from,sourceEvent:eventId});
 // Route tolls and tariffs are actual payments to the current destination treasury.
 for(const p of q.passages){
  if(p.toll&&!groupAccountView(e,d.get('state'),p.treasury))d.set(['state','settlements',p.treasury],{treasury:0,treasuryLedger:[],granary:false,population:0});
  if(p.toll)financeTransfer(d,e,service.carrier,p.treasury,p.toll,`${eventId}:toll:${p.edge}`);
  if(p.tariff)assessTradeTax(d,e,{seller:owner,cost:p.cargoValue,location:p.destination,sourceEvent:`${eventId}:${p.edge}`,kind:'tariff'});
 }
 if(escortFee){
  // The existing board's verifiable record objective provides the escort contract.
  const quest=postGeneratedQuest(d,e,{key:`transport:${eventId}`,generator:'npc_needs',label:'承运护送',grade:'D',reward:escortFee,days:Math.max(1,Math.ceil((q.estimatedArrivalAt-now)/DAY)+1),content:`护送运单${id}抵达${to}`,objective:{type:'record',record:id,field:'status',equals:['delivered']},board:from,publisher:owner,funding:{npc:owner},minute:now,cause:id});
  if(!quest)throw preconditionFailure('护送委托无法登记');row.escortQuest=quest.id;row.escortEscrow=0;
  // The quoted mobilization fee is prepaid. Time wages are earned throughout
  // actual custody, including weather waits, rather than the route estimate.
  if(ledgerActive(d)){
   const daily=args.escortDailyWage??escortFee;int(daily,0,'护送日薪');
   row.escortTerms={base:escortFee,daily,starts:now};
   row.escortWage=`${id}:escort-wage`;
   registerEarnedClaim(d,e,{id:row.escortWage,kind:'wage',debtor:owner,creditor:escort,amount:escortFee,createdAt:now,deadline:Number.MAX_SAFE_INTEGER,source:id,
    terms:{accrual:{per:'day',value:daily},onDebtorGone:'accelerate',onCreditorGone:'estate'}});
   holdingSet(d,e,path(quest.id),{category:'contract',id:quest.id,kind:'wage',parties:[owner,escort],debt:`${id}:escort-wage`,escrow:quest.escrow,status:'履行中',createdAt:now},'transport');
  }
  d.set(['state','quests',quest.id],{...quest,status:'进行中',taker:escort,transport:id,...(Boolean(row.escortWage)?{escrow:0}:{} )});
 }
 for(const actor of actors)if(actor!=='player')d.set(['state','npcs',actor,'cognitionTravel'],{transport:id,from,to,depart:departAt,arrive:q.estimatedArrivalAt});
 holdingSet(d,null,path(id),row,'transport');index(d,id);
 if(row.batch)retimeBatch(d,e,[...joining,row],departAt,q.estimatedArrivalAt);
 else if(departAt===now){startLeg(d,e,row,now);holdingSet(d,null,path(id),row,'transport');}
 return clone(d.get(...path(id)));
}
function startLeg(d,e,row,minute){
 const t=row.transport;
 t.segment=transportSegment(e,d.get('state'),d.document.randomSeed,t,row.mode,minute);t.segmentStartedAt=minute;t.nextAt=minute+t.segment.minutes;
 if(row.departedAt===undefined&&t.movingMinutes===0&&t.segment.kind==='move'){row.departedAt=minute;row.history.push({minute,location:t.location,kind:'departed'});}
 row.status=t.segment.kind==='wait'?'delayed':'moving';row.reason=t.segment.reason??null;
 const animal=d.get(...path(row.asset),'animal'),care=animal&&d.get('state','creatures',animal,'care');
 if(care&&t.segment.kind==='move')holdingSet(d,null,['state','creatures',animal,'care'],{...care,busyUntil:t.nextAt},'transport');
}
function retimeBatch(d,e,rows,departAt,estimatedArrivalAt){
 const now=d.get('state','minute'),actors=[...new Set(rows.flatMap(r=>[r.driver,...r.passengers,...r.escort?[r.escort]:[]]))];
 e.assertNpcAutonomyAction(d.get('state'),actors,{start:now,minutes:estimatedArrivalAt-now});
 assertNpcObligationAction(d,e,actors,{start:now,minutes:estimatedArrivalAt-now,location:rows[0].to,kind:'move'});
 const lease=all(d.get('state')).find(r=>r.category==='transport_lease'&&r.asset===rows[0].asset&&r.ends>now);
 if(lease&&lease.ends<estimatedArrivalAt)throw preconditionFailure('租约不能覆盖并载承运全程');
 for(const row of rows)if(row.passengers.includes('player')){
  let at=row.from;
  for(const id of row.transport.edges){const edge=e.world.routes.find(r=>r.id===id);at=edge.from===at?edge.to:edge.from;assertLocationAccess(d,e,at,{authorization:row.authorization,arrivalMinute:estimatedArrivalAt,companions:row.passengers.filter(p=>p!=='player')});}
 }
 for(const old of rows){
  const row=clone(old);row.departAt=departAt;row.estimatedArrivalAt=estimatedArrivalAt;row.transport.nextAt=departAt;
  for(const actor of [row.driver,...row.passengers,...row.escort?[row.escort]:[]])if(actor!=='player')d.set(['state','npcs',actor,'cognitionTravel'],{transport:row.id,from:row.from,to:row.to,depart:departAt,arrive:estimatedArrivalAt});
  if(departAt===now)startLeg(d,e,row,now);
  holdingSet(d,null,path(row.id),row,'transport');
  const order=row.externalOrder&&d.get(...path(row.externalOrder));
  if(order)holdingSet(d,null,path(row.externalOrder),{...order,estimatedArrivalAt},'transport');
 }
}
function setPosition(d,e,row,location){
 holdingSet(d,null,[...path(row.asset),'location'],location,'transport');
 const animal=d.get(...path(row.asset),'animal');if(animal){holdingSet(d,null,['state','creatures',animal,'location'],location,'transport');setLocation(d,{entity:animal,at:location,mode:'place',writer:'transport',engine:e});}
 for(const id of row.draftSources??[]){
  if(d.get('state','creatures',id))holdingSet(d,null,['state','creatures',id,'location'],location,'transport');
  else {const key=Object.keys(d.get('state','records')).find(k=>d.get('state','records',k,'category')==='husbandry'&&d.get('state','records',k,'id')===id);if(key)holdingSet(d,null,['state','records',key,'location'],location,'transport');}
  setLocation(d,{entity:id,at:location,mode:'place',writer:'transport',engine:e});
 }
 for(const actor of [row.driver,...row.passengers,...row.escort?[row.escort]:[]]){
  if(actor==='player')d.set(['state','location'],location);
  else {d.set(['state','npcs',actor,'location'],location);d.set(['state','npcs',actor,'activity'],row.status==='delivered'?'抵达':'承运途中');if(row.status==='delivered')d.remove(['state','npcs',actor,'cognitionTravel']);}
 }
}
export function nextTransportMinute(state,now){return Math.min(pendingWrecks(state).length?now+1:Infinity,...live(state).map(r=>r.transport.nextAt).filter(at=>at>now));}
export function advanceTransport(d,e,minute){
 if(!pendingWrecks(d.get('state')).length&&!live(d.get('state')).some(r=>r.transport.nextAt<=minute))return;
 return obligationTransaction(d,()=>advanceTransportInner(d,e,minute));
}
function advanceTransportInner(d,e,minute){
 for(const wreck of pendingWrecks(d.get('state')))settleWreckedShipment(d,e,wreck.id,minute);
 const pending=live(d.get('state')),vehicles=new Map(pending.map(r=>[r.asset,transportAssetView(e,d.document,r.asset)])),loads=new Map(pending.map(r=>[r.id,batchLoad(batchOf(d.get('state'),r))])),worn=new Set();
 for(const old of pending){const row=clone(old),t=row.transport;
  if(t.nextAt>minute)continue;
  if(t.nextAt<minute)throw Error('承运时钟越过未处理节点');
  const asset=vehicles.get(row.asset),load=loads.get(row.id),vehicle=row.batch??row.id;
  if(!asset?.factor||!asset.capacityKg||load.kg>asset.capacityKg||load.m3>asset.capacityM3||!d.get('state','npcs',row.driver)||['死亡','昏迷','濒死','患病'].includes(d.get('state','npcs',row.driver,'status'))||personConstraint(e,d.get('state'),row.driver)){
   row.status='delayed';t.nextAt=minute+DAY;row.reason='车船损坏、驮畜失能或承运人无法行动';holdingSet(d,null,path(row.id),row,'transport');continue;
  }
  if(t.segment){const waypoint=stepTransport(e,t,t.segment);
   if(asset.animal&&t.segment.kind==='move'&&!worn.has(vehicle)){const care=d.get('state','creatures',asset.animal,'care');if(care)holdingSet(d,null,['state','creatures',asset.animal,'care'],{...care,fatigue:Math.min(100,care.fatigue+Math.ceil(t.segment.minutes/30)*e.rules.petCare.travelFatiguePer30Minutes)},'transport');}
   if(waypoint){row.history.push({minute,location:t.location,kind:'waypoint'});if(!worn.has(vehicle)){const wear=Math.max(1,Math.ceil(t.segment.distanceKm/20));holdingSet(d,null,[...path(row.asset),'durability'],Math.max(0,asset.durability-wear),'transport');}}
   worn.add(vehicle);}
  if(t.edgeIndex>=t.edges.length){
   row.status='delivered';row.arrivedAt=minute;t.nextAt=null;t.segment=null;index(d,row.id,false);
   const present=pending.some(r=>(r.batch??r.id)===vehicle&&r.passengers.includes(row.recipient))||actorLocation(d.get('state'),row.recipient)===t.location;
   const handover=!row.cargo.length||present&&carryOverKg(d,e,row.recipient,dimensions(e,row.cargo,[]).kg)===0;
   if(handover){for(const c of row.cargo)moveGoods(d,e,row.recipient,c.item,c.quantity,{instances:c.instances,trip:row.id});row.deliveredCargo=clone(row.cargo);row.cargo=[];}
   row.history.push({minute,location:t.location,kind:'delivered'});setPosition(d,e,row,t.location);
   if(!handover){row.status='arrived';row.cargoLocation=t.location;
    for(const c of row.cargo)for(const unit of c.instances??[])holdingSet(d,null,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),container:t.location},'transport');
   }
   if(row.escortQuest)finishEscort(d,e,row,minute,t.location,'已完成');
   if(row.losses?.length)notifyShipment(d,e,row,`运单${row.id}到货短少：途中已有${row.losses.length}笔货损，实收货物少于托运数量。`,minute,t.location);
   publishTransitionEvent(d,e,{id:`${row.id}:arrival`,verb:'trade',actor:row.carrier,target:row.recipient,location:t.location,minute,tags:['transport'],witnesses:[]});
  }else{
   startLeg(d,e,row,minute);
   if(t.segment.kind==='wait'||t.segment.kind==='rest')row.history.push({minute,location:t.location,kind:t.segment.kind==='rest'?'overnight':'blocked',edge:t.edges[t.edgeIndex]});
   // Between endpoints the route id and remaining distance, not a false town address, locate the shipment.
   setPosition(d,e,row,t.location);
  }
  holdingSet(d,null,path(row.id),row,'transport');
 }
}
function finishEscort(d,e,row,minute,location,status){
 const q=d.get('state','quests',row.escortQuest);
 if(!q||!(Boolean(row.escortWage)?d.get(...path(q.id),'escrow')>0:q.escrow&&q.status==='进行中'))return;
 let rewardPaid=row.escortPaid??q.escrow,refund=0;
 if(Boolean(row.escortWage))settleEscort(d,e,row,q,minute);
 else if(status==='已完成'){financeChange(d,e,row.escort,q.escrow,`${row.id}:escort`,{account:escrowAccount(q.id),writer:'transport',eventId:`${row.id}:escort`});d.set(['state','quests',q.id],{...q,status:'已完成',escrow:0,rewardPaid:q.escrow,resolvedAt:minute});}
 else{
  // Pay-on-delivery escort of a shipment that never arrived: the deposit goes back to its payer.
  financeChange(d,e,row.owner,q.escrow,`${row.id}:escort-refund`,{account:escrowAccount(q.id),writer:'transport',eventId:`${row.id}:escort-refund`});
  d.set(['state','quests',q.id],{...q,status:'失败',escrow:0,rewardPaid:0,refund:q.escrow,resolvedAt:minute});rewardPaid=0;refund=q.escrow;
 }
 holdingSet(d,null,path(`${q.id}:${status}`),{category:'quest_receipt',quest:q.id,parties:[q.publisher,q.taker],minute,location,status,escrow:0,rewardPaid,refund,source:'npc_needs'},'transport');
}
// The owner and the recipient learn of a shipment's failure from the carrier's notice:
// the player gets a message and a memory, an NPC hears it as first-hand hearsay from the carrier.
function notifyShipment(d,e,row,text,minute,location){
 const informed=[];
 for(const who of new Set([row.recipient,row.owner])){
  if(who===row.carrier)continue;
  if(who==='player'){
   const key=`transport:${row.id}:${minute}`;
   d.set(['memories',`player::${key}`],{subject:'player',key,content:text,source:row.carrier,sourceType:'听说',channel:'transport',reliability:'承运人通报',location,minute,sourceEvent:row.id,participants:['player',row.carrier],keywords:['运单'],pinned:false});
   d.say?.(text);informed.push(who);
  }else if(d.get('state','npcs',who)){
   // The carrier's own notice, in the same memory shape other channels use (npc-cognition's heard-row); not retold, so not distorted.
   const stream=d.get('state','npcs',who,'memoryStream')??[],id=`heard_transport-notice:${row.id}:${minute}:${who}`;
   if(stream.some(m=>m.id===id))continue;
   d.set(['state','npcs',who,'memoryStream'],[...stream,{id,rootMemoryId:`transport-notice:${row.id}:${minute}`,sourceEvent:row.id,kind:'transport',minute,occurredAt:minute,location,participants:[row.carrier,row.owner,row.recipient],content:text,sourceType:'听说',heardFrom:row.carrier,channel:'transport',messageId:row.id,salience:2,emotion:'待核实',transmissionChain:[{from:row.carrier,to:who,minute,channel:'transport',messageId:row.id,input:text,content:text,distortion:'承运人通报，原文'}],distortion:'承运人通报，原文',reliability:'承运人通报',private:true,permittedRecipients:[who]}]);
   informed.push(who);
  }
 }
 if(informed.length){row.informed=[...new Set([...row.informed??[],...informed])];row.history=[...row.history??[],{minute,location,kind:'informed',who:informed}];}
}
// Final accounting of a shipment whose carrier asset was destroyed in transit. The cargo
// stays on the wreck until this runs; afterwards it is written off, the carrier owes the
// owner the cargo value and the freight, the escort deposit is released and the owner and
// recipient are told. Idempotent: a second call finds settledAt and returns the same row.
export function settleWreckedShipment(d,e,id,minute=d.get('state','minute')){
 return obligationTransaction(d,()=>{
  const old=d.get(...path(id));
  if(old?.category!=='transport'||old.status!=='wrecked'||old.settledAt!==undefined)return old;
  const base=`${id}:wreck`;
  for(const c of clone(old.cargo))recordCargoLoss(d,e,id,{item:c.item,quantity:c.quantity,actor:old.carrier,cause:vocabulary(e,'law','cargoClaimKind'),key:`transport_loss:${id}:${base}:${c.item}`},`${base}:${c.item}`);
  let row=clone(d.get(...path(id)));
  if(row.freight>0&&row.carrier!==row.owner&&ledgerActive(d)){
   registerEarnedClaim(d,e,{id:`${id}:freight-refund`,kind:'compensation',debtor:row.carrier,creditor:row.owner,amount:row.freight,createdAt:minute,deadline:minute,source:id});
   row.freightRefund=`${id}:freight-refund`;
  }
  if(row.escortQuest)finishEscort(d,e,row,minute,row.transport.location,'失败');
  row.settledAt=minute;row.history.push({minute,location:row.transport.location,kind:'settled'});
  const lost=(row.losses??[]).length;
  notifyShipment(d,e,row,`运单${id}的承运资产在途中损毁，${lost?'货物已按货损处理，':''}承运人须退还运费${row.freight}铜${lost?'并赔偿货值':''}。`,minute,row.transport.location);
  holdingSet(d,e,path(id),row,'transport');index(d,id,false,'transport:wrecked');
  return row;
 });
}
function settleEscort(d,e,row,q,minute){
 return obligationTransaction(d,()=>{
  const id=row.escortWage;
  // Arrival is an observed end of work, including for a protocol successor.
  // No signer is invented for this natural service boundary.
  for(const claim of obligationRows(d.get('state')).filter(o=>o.kind==='wage'&&o.source===row.id&&o.endedAt===undefined))
   d.set(['state','obligations',claim.id],{...claim,endedAt:minute,deadline:minute});
  const view=dueObligation(d.get('state'),id),procedure=d.get('state','records',`transition_procedure:${row.owner}`);
  if(view.row.debtor!==row.owner||!view.owed||procedure&&procedure.phase!=='closed'){
   row.escortEarned=obligationRows(d.get('state')).filter(o=>o.kind==='wage'&&o.source===row.id).reduce((n,o)=>n+dueObligation(d.get('state'),o).owed,0);
   row.escortPaid=0;d.set(['state','quests',q.id],{...q,status:'已完成',escrow:0,resolvedAt:minute,rewardPaid:0});
   // The wage claim stays with whoever now controls it, but the prefunded escrow
   // must not stay booked in an account nobody can reach: return it to its owner.
   const contract=d.get(...path(q.id));
   if(contract?.category==='contract'&&contract.escrow)holdingSet(d,e,path(q.id),{...refundContractEscrow(d,contract,e),status:'已终止',endedAt:minute},'transport');
   return;
  }
  // Transfer custody of the existing escrow mirror; the ledger account stays
  // unchanged. It must never be represented in quests and contracts at once.
  d.set(['state','quests',q.id],{...q,status:'已完成',escrow:0,resolvedAt:minute});
  const escrow=d.get(...path(q.id));
  holdingSet(d,e,path(q.id),{...escrow,status:'已终止',endedAt:minute},'transport');
  const paid=settleClaim(d,e,{id,payer:row.owner,amount:Math.min(escrow.escrow,dueObligation(d.get('state'),id).owed),escrowContract:q.id},`${row.id}:escort`);
  d.set(['state','quests',q.id,'rewardPaid'],paid.transferred);
  row.escortWage=id;row.escortEarned=paid.transferred+paid.remaining;row.escortPaid=paid.transferred;
  return paid;
 });
}
export function transportIncident(d,e,{shipment,actor='player',recover=false,consent=false},eventId){
 return obligationTransaction(d,()=>transportIncidentInner(d,e,{shipment,actor,recover,consent},eventId));
}
function transportIncidentInner(d,e,{shipment,actor,recover,consent},eventId){
 const old=d.get(...path(shipment));if(old?.category!=='transport'||!['moving','delayed','intercepted'].includes(old.status))throw preconditionFailure('运单不在可追查的途中');
 const s=d.get('state'),members=batchOf(s,old),position=transportPosition(e,s,old);
 if(!members.some(r=>r.passengers.includes(actor)||actor===r.driver)&&(position.location===null||actorLocation(s,actor)!==position.location))throw preconditionFailure('须到运单实际所在路段端点');
 if(recover){if(old.status!=='intercepted'||![old.owner,old.carrier].includes(actor)||old.custodian!==actor&&!(consent&&actorLocation(s,old.custodian)===actorLocation(s,actor)))throw preconditionFailure('须先从实际扣货者取回货物');}
 else if(members.some(r=>r.escort&&!['死亡','昏迷','濒死'].includes(s.npcs?.[r.escort]?.status)&&!personConstraint(e,s,r.escort)))throw preconditionFailure('护送者仍在守卫，须先处理护送者');
 for(const prior of members){
  const row=clone(prior);
  if(recover){row.status='delayed';row.transport.nextAt=s.minute+1;row.custodian=null;row.transport.segment=null;}
  else{row.status='intercepted';row.custodian=actor;row.transport.nextAt=null;}
  row.history.push({minute:s.minute,location:row.transport.location,kind:recover?'recovered':'intercepted',actor});holdingSet(d,null,path(row.id),row,'transport');
  publishTransitionEvent(d,e,{id:`${eventId}:transport:${row.id}`,verb:recover?'trade':'theft',actor,target:row.owner,location:row.transport.location,minute:s.minute,tags:['transport'],witnesses:[]});
 }
 return clone(d.get(...path(old.id)));
}
export function transportTrace(e,s,id,viewer='player'){
 const r=s.records?.[id];if(r?.category!=='transport')throw preconditionFailure('运单不存在');
 if(![r.owner,r.recipient,r.carrier,r.driver,r.custodian,...r.passengers].includes(viewer))throw preconditionFailure('没有查询该运单的身份');
 return {id:r.id,status:r.status,position:transportPosition(e,s,r),estimatedArrivalAt:r.estimatedArrivalAt,arrivedAt:r.arrivedAt??null,reason:r.reason,history:clone(r.history)};
}
export function transportPosition(e,s,row){
 const t=row.transport,edge=e.world.routes.find(r=>r.id===t.edges[t.edgeIndex]),segment=t.segment;
 const moving=row.status==='moving'&&segment?.kind==='move',elapsed=moving?Math.max(0,Math.min(segment.minutes,s.minute-(t.segmentStartedAt??s.minute))):0;
 const remaining=edge?Math.max(0,(t.remainingKm??edge.lengthKm)-(moving?segment.distanceKm*elapsed/segment.minutes:0)):0;
 const inRoute=edge&&((t.remainingKm??edge.lengthKm)<edge.lengthKm-1e-9||moving&&elapsed>0);
 return {location:inRoute?null:t.location,route:edge?.id??null,from:t.location,to:segment?.destination??null,remainingKm:remaining};
}
export function collectTransport(d,e,id,actor='player'){
 return obligationTransaction(d,()=>collectTransportInner(d,e,id,actor));
}
function collectTransportInner(d,e,id,actor){
 const old=d.get(...path(id));if(old?.category!=='transport'||old.status!=='arrived'||old.recipient!==actor||actorLocation(d.get('state'),actor)!==old.to)throw preconditionFailure('收货人须亲到到货地点提取实际货物');
 const row=clone(old);for(const c of row.cargo)moveGoods(d,e,actor,c.item,c.quantity,{instances:c.instances,trip:id});row.deliveredCargo=clone(row.cargo);row.cargo=[];row.status='delivered';row.collectedAt=d.get('state','minute');holdingSet(d,null,path(id),row,'transport');return row;
}
// Only a not-yet-departed consignment can be unloaded at origin. Cancellation
// needs the present carrier's agreement; paid route tolls/taxes remain paid.
export function cancelTransport(d,e,{shipment,actor='player'},eventId){
 return obligationTransaction(d,()=>{
  const old=d.get(...path(shipment)),s=d.get('state');
  if(old?.status==='cancelled'&&old.cancelEvent===eventId&&old.cancelledBy===actor)return clone(old);
  if(!eventId||old?.category!=='transport'||old.status!=='booked'||s.minute>=old.departAt||old.externalOrder||old.owner!==actor||actorLocation(s,actor)!==old.from||actorLocation(s,old.driver)!==old.from)throw preconditionFailure('须货主与现场承运人同意，在发车前取消未出发运单');
  const agreement=requestContractConsent(d,e,{from:old.driver,to:actor,scope:'amend',purpose:old.id,subject:old.id,terms:{quantity:0,fee:old.freight,location:old.from},cost:{coins:old.freight},eventId});
  if(!agreement.allowed)throw preconditionFailure('承运人未同意本次取消和运费退款');
  const row=clone(old);
  for(const c of row.cargo)moveGoods(d,e,row.owner,c.item,c.quantity,{instances:c.instances,trip:row.id});
  if(row.freight&&row.carrier!==row.owner)financeTransfer(d,e,row.carrier,row.owner,row.freight,eventId);
  row.returnedCargo=clone(row.cargo);row.cargo=[];row.status='cancelled';row.cancelledAt=s.minute;row.cancelledBy=actor;row.cancelEvent=eventId;row.cancelConsent=agreement.source;row.transport.nextAt=null;
  if(row.escortQuest)finishEscort(d,e,row,s.minute,row.from,'失败');
  for(const who of [row.driver,...row.passengers,...row.escort?[row.escort]:[]])if(who!=='player'&&d.get('state','npcs',who,'cognitionTravel')?.transport===row.id)d.remove(['state','npcs',who,'cognitionTravel']);
  row.history.push({minute:s.minute,location:row.from,kind:'cancelled'});
  holdingSet(d,null,path(row.id),row,'transport');index(d,row.id,false);
  const remaining=occupied(d.get('state')).filter(r=>row.batch&&r.batch===row.batch);
  if(remaining.length){
   const a=transportAssetView(e,d.document,row.asset),clock=tripClock(e,d.get('state'),a,{from:row.from,to:row.to,load:{kg:0,m3:0},passengers:[],letter:false,requested:s.minute});
   const arrival=arrivalMinute(e,d.get('state'),d.document.randomSeed,remaining[0].transport.edges,row.from,row.mode,clock.departAt,clock.travelWindow);
   retimeBatch(d,e,remaining,clock.departAt,arrival);
  }
  return clone(row);
 });
}
// A loss consumes the actual freight first. Its compensation and any legal
// recovery share C's loss id, so restitution cannot pay the same loss twice.
export function damageTransportCargo(d,e,{shipment,item,quantity,actor='player',cause=vocabulary(e,'law','cargoClaimKind')},eventId){
 return obligationTransaction(d,()=>{
  const key=`transport_loss:${shipment}:${eventId}`,prior=lossView(d.get('state'),key);
  if(prior){const facts=d.get(...path(`${key}:facts`));if(facts?.item!==item||facts?.quantity!==quantity||facts?.actor!==actor||facts?.cause!==cause)throw preconditionFailure('货损事件编号冲突');return prior;}
  const old=d.get(...path(shipment)),s=d.get('state');
  if(old?.category!=='transport'||!['booked','moving','delayed','intercepted','arrived'].includes(old.status))throw preconditionFailure('没有仍在承运或托存的货物');
  const position=transportPosition(e,s,old),onboard=[old.driver,...old.passengers,...old.escort?[old.escort]:[]].includes(actor);
  if(![old.carrier,old.driver].includes(actor)||!onboard&&(position.location===null||actorLocation(s,actor)!==position.location))throw preconditionFailure('货损须由现场承运人确认；货主单方索赔须经法律裁定');
  return recordCargoLoss(d,e,shipment,{item,quantity,actor,cause,key},eventId);
 });
}
function recordCargoLoss(d,e,shipment,{item,quantity,actor,cause,key},eventId){
  const s=d.get('state');
  int(quantity,1,'损失数量');const old=d.get(...path(shipment)),row=clone(old),cargo=row.cargo.find(c=>c.item===item);
  if(!cargo||cargo.quantity<quantity)throw preconditionFailure('货损超过实际承运数量');
  // 货损按货物此刻在所在地的估值（市场估值投影，不含商家价差），不是目录基价；没有估值依据的货物不能静默记 0。
  const priced=valuation(d,e,{role:'goods',item,quantity,location:transportPosition(e,s,old).location??old.from,holder:old.owner});
  if(priced.value===null)throw preconditionFailure(`货物无法估值：${priced.unvaluable}`);
  const value=priced.value;int(value,0,'货损价值');
  bookStock(d,e,freight(e,shipment,item),-quantity,{flow:'sink:destroy',purpose:'cargo_loss',writer:'transport',eventId});
  const units=(cargo.instances??[]).splice(0,quantity);
  for(const unit of units)holdingSet(d,e,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),status:'损毁',destroyedAt:s.minute,container:shipment},'transport');
  cargo.quantity-=quantity;row.cargo=row.cargo.filter(c=>c.quantity>0);row.losses=[...row.losses??[],key];
  row.load=dimensions(e,row.cargo,row.passengers);
  holdingSet(d,e,path(row.id),row,'transport');
  holdingSet(d,e,path(`${key}:facts`),{category:'transport_loss_facts',shipment,item,quantity,actor,cause,minute:s.minute},'transport');
  const loss=registerLoss(d,e,{id:key,victim:row.owner,amount:value,source:shipment});
  registerEarnedClaim(d,e,{id:`${key}:claim`,kind:'compensation',debtor:row.carrier,creditor:row.owner,amount:value,createdAt:s.minute,deadline:s.minute,source:key});
  return loss;
}
export function compensateTransportLoss(d,e,{loss,amount,payer,actor=payer},eventId){
 return obligationTransaction(d,()=>{
  const row=lossView(d.get('state'),loss);if(!row)throw preconditionFailure('没有已登记的承运货损');
  let result;
  const recovery=recoverLoss(d,e,{id:loss,amount,payer},eventId,n=>{result=settleClaim(d,e,{id:`${loss}:claim`,payer,actor,amount:n},eventId);});
  return result??settleClaim(d,e,{id:`${loss}:claim`,payer,actor,amount:recovery.amount},eventId);
 });
}
export function transportScene(e,document){
 const s=document.state,row=unfinished(s).find(r=>r.passengers.includes('player'));if(!row)return null;
 const position=transportPosition(e,s,row),asset=transportAssetView(e,document,row.asset),name=id=>e.byId.get(id)?.name??id;
 return `【时间】${e.calendar(s.minute).text}\n【乘车船】${asset.kind}｜${row.status}｜${name(row.from)}至${name(row.to)}\n【实际位置】${position.location?name(position.location):`${position.route}路段上，距下一节点${position.remainingKm.toFixed(2)}公里`}\n【承运人】${name(row.driver)}｜预计抵达${e.calendar(row.estimatedArrivalAt).text}${row.reason?`｜${row.reason}`:''}\n【你】生命${s.player.hp}/${s.player.maxHp}｜铜${s.player.coins}｜运单${row.id}`;
}
export function destroyTransportAsset(d,e,{asset,cause='destruction',salvage={}},eventId){
 const a=transportAssetView(e,d.document,asset);if(!a)throw Error('Transport asset not found');
 return transition(d,e,{entity:a.id,basis:'destruction',origin:'destruction',eventId,causes:[cause],location:a.location,salvage,
  legacy:()=>{
   const wreck=d.get('holdings','protocol','entities',a.id,'wreck');
   // Freight accounts hang on the shipment's cargo location: move them to the wreck before the
   // asset record is rewritten, or the destruction invariant sees accounts owned by a gone vehicle.
   for(const old of unfinished(d.get('state')).filter(r=>r.asset===a.id)){
    const row=clone(old);row.status='wrecked';row.reason=cause;row.transport.nextAt=null;row.cargoLocation=wreck;row.shortfallAt=d.get('state','minute');
    for(const cargo of row.cargo)for(const unit of cargo.instances??[]){
     const item=d.get('state','itemInstances',unit);if(item)holdingSet(d,e,['state','itemInstances',unit],{...item,container:wreck,status:'袋内'},'transport');
    }
    publishTransitionEvent(d,e,{id:`${eventId}:shortfall:${row.id}`,verb:'shortfall',actor:a.id,subject:row.id,minute:d.get('state','minute'),visibility:'private',witnesses:[],tags:['protocol','transport'],cause:eventId});
    row.history.push({minute:d.get('state','minute'),location:row.transport.location,kind:'wrecked'});
    holdingSet(d,e,path(row.id),row,'transport');index(d,row.id,false);index(d,row.id,true,'transport:wrecked');
    for(const actor of [row.driver,...row.passengers,...row.escort?[row.escort]:[]])if(actor!=='player'&&d.get('state','npcs',actor,'cognitionTravel')?.transport===row.id)d.remove(['state','npcs',actor,'cognitionTravel']);
   }
   holdingSet(d,e,path(a.id),{...d.get(...path(a.id)),category:'transport_asset',id:a.id,kind:a.kind,owner:a.owner,location:a.location,durability:0,destroyedAt:d.get('state','minute')},'transport');
  }});
}
export function historicalTransportDocument(d,e,{id,actor='player'}){
 const s=d.get('state'),paper=institutionOriginal(e,d.document,id),doc=paper?.document,event=s.records?.[doc?.sourceEvent],cargo=institutionOriginal(e,d.document,doc?.describes),p=event?.payload;
 const identifies=institutionPhysicalReference(d.document,p?.subject)===doc?.describes;
 const location=actor==='player'?s.location:s.npcs?.[actor]?.location;
 if(doc?.kind!=='transport_claim'||doc.owner!==actor||paper.owner!==actor||paper.location!==location||paper.durability<=0||paper.destroyedAt!==undefined||event?.verb!=='observed'||p.observer!==actor||cargo?.owner!==actor||cargo.location!==location||!identifies)throw Error('Transport inspection requires the customer original and actual cargo');
 return {document:id,source:doc.sourceEvent,carrier:event.actor,customer:actor,subject:doc.describes,delayMinutes:p.terms.delayMinutes,cause:p.terms.cause,compensated:p.terms.compensated,
  condition:cargo.maxDurability?100*cargo.durability/cargo.maxDurability:cargo.condition??null,compensation:null};
}
export function transportAction(d,e,args,eventId){
 const task=args.task??'quote',asset=args.contract;
 if(task==='cancel')return cancelTransport(d,e,{shipment:args.business??asset},eventId);
 if(task==='forward_cancel')return cancelGoodsObligation(d,e,{id:args.business??asset,actor:'player'},eventId);
 if(task==='inspect'&&institutionOriginal(e,d.document,asset)?.document?.kind==='transport_claim'){
  if(args.actor!==undefined&&args.actor!=='player')throw Error('Transport inspection requires its player customer');
  return historicalTransportDocument(d,e,{id:asset});
 }
 if(task==='forward'){
  return obligationTransaction(d,()=>{
  const selling=args.buyer!==undefined,debtor=selling?'player':e.resolve(args.seller),creditor=selling?e.resolve(args.buyer):'player',party=selling?creditor:debtor;
  const item=e.resolve(args.item,'item'),location=args.location?e.resolve(args.location):d.get('state','location');
  const value=marketQuote(d,e,{item,location,seller:debtor,buyer:creditor}).listPrice*args.quantity;
  const terms={item,quantity:args.quantity,prepayment:args.coins??(selling?Math.ceil(value):0),deadline:args.deadline,location};
  counterpart(d,e,party,{consent:true,minutes:0});
  // What delivering owned goods really costs the debtor is the spot value he gives up, but a
  // regional scarcity premium above the goods' derived baseline is not a cash cost to him
  // (and a glut below it lowers the cost): the opportunity value is the lesser of the two.
  const baseline=valuation(d,e,{role:'baseline',item,quantity:args.quantity,holder:debtor});
  if(baseline.value===null)throw preconditionFailure(`无从估价：${baseline.unvaluable}`);
  const opportunity=Math.min(value,baseline.value);
  const agreement=requestContractConsent(d,e,{from:party,scope:'forward',purpose:'player',subject:item,terms,cost:selling?{coins:terms.prepayment}:{value:opportunity},reward:selling?value:terms.prepayment,eventId});
  counterpart(d,e,party,{consent:agreement.allowed,minutes:0});
  return openGoodsObligation(d,e,{kind:'forward',debtor,creditor,...terms,terms:{consent:agreement.source}},eventId);
  });
 }
 if(task==='fulfill')return performGoodsObligation(d,e,{id:args.business??asset,actor:'player',quantity:args.quantity},eventId);
 if(task==='extend')return extendGoodsObligation(d,e,{id:args.business??asset,actor:'player',deadline:args.deadline},eventId);
 if(task==='destroy'){
  const a=transportAssetView(e,d.document,asset);if(!a||a.owner!=='player'||a.location!==d.get('state','location'))throw Error('Only the present owner can destroy this asset');
  return destroyTransportAsset(d,e,{asset:a.id},eventId);
 }
 if(task==='register')return createTransportAsset(d,e,{kind:args.mode??'cart',animal:args.item},eventId);
 if(task==='trace')return transportTrace(e,d.get('state'),args.business??asset);
 if(task==='collect')return collectTransport(d,e,args.business??asset);
 if(task==='lease'){const a=transportAssetView(e,d.document,asset),counterparty=e.resolve(args.seller);if(args.consent!==true||!available(e,d.get('state'),counterparty)||actorLocation(d.get('state'),counterparty)!==d.get('state','location')||a?.owner!=='player'&&a?.owner!==counterparty)throw preconditionFailure('出租须有在场当事人本次同意');return leaseTransportAsset(d,e,{asset,tenant:a.owner==='player'?counterparty:'player',minutes:args.minutes,coins:args.coins},eventId);}
 if(task==='intercept'||task==='recover')return transportIncident(d,e,{shipment:args.business??asset,recover:task==='recover',consent:args.consent},eventId);
 const cargo=args.item?[{item:e.resolve(args.item),quantity:args.quantity??1}]:[],passengers=[];
 if(task==='inspect'||!asset)return {services:transportServices(e,d.document,d.get('state','location')),usage:'transport: contract资产, location目的地, item/quantity货物, service=passage乘客; post: buyer收件人,item记忆ID'};
 if(task==='repair'){const a=transportAssetView(e,d.document,asset);if(!a||a.destroyedAt!==undefined||a.owner!=='player'||a.busy||a.location!==d.get('state','location'))throw preconditionFailure('资产不在本人可修缮范围');const n=Math.ceil((100-a.durability)/10);if(!n)throw preconditionFailure('资产无需修缮');if(e.quantity(d,'player','item_wood')<n)throw preconditionFailure('修缮木料不足');changeItems(d,e,'player','item_wood',-n,{books:{flow:'sink:consume',purpose:'repair',writer:'transport',eventId}});holdingSet(d,null,[...path(a.id),'durability'],100,'transport');return transportAssetView(e,d.document,a.id);}
 const options={asset,to:e.resolve(args.location),cargo,passengers:args.service==='passage'?['player']:passengers,escort:args.escort?e.resolve(args.escort):null,authorization:args.authorization};
 if(task==='book')return bookTransport(d,e,options,eventId);
 return quoteTransport(d,e,{...options,from:d.get('state','location')});
}
