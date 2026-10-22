import {preconditionFailure} from './precondition.mjs';
import {vocabulary} from './domain-rules.mjs';
import {transportSegment,stepTransport} from './transport-route.mjs';
import {openGoodsObligation,performGoodsObligation,extendGoodsObligation} from './obligation-conditional.mjs';
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
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('transport',{kinds:['owns','tamed_by'],locations:true});

const DAY=1440,clone=x=>structuredClone(x),path=id=>['state','records',id];
const SPECS=Object.freeze({cart:{mode:'cart',kg:600,m3:3,seats:4,wood:20,metal:2,rate:0.012},boat:{mode:'boat',kg:2400,m3:12,seats:12,wood:60,metal:4,rate:0.008},pack:{mode:'walk',kg:80,m3:0.5,seats:0,wood:0,metal:0,rate:0.02}});
const int=(n,min,label)=>{if(!Number.isSafeInteger(n)||n<min)throw preconditionFailure(`${label}无效`);return n;};
const all=s=>Object.values(s.records??{});
const unfinished=s=>(s.records?.['transport:active']?.ids??[]).map(id=>s.records[id]).filter(Boolean);
const live=s=>unfinished(s).filter(r=>['booked','moving','delayed'].includes(r.status));
function index(d,id,add=true){const ids=d.get(...path('transport:active'),'ids')??[];holdingSet(d,null,path('transport:active'),{category:'transport_index',ids:add?[...new Set([...ids,id])]:ids.filter(x=>x!==id)},'transport');}
const assetKey=id=>id.startsWith('transport_asset:')?id:`transport_asset:${id}`;
const actorLocation=(s,id)=>id==='player'?s.location:s.npcs?.[id]?.location;
const assets=(e,s)=>[...new Map([...openingTransportAssets.filter(a=>e.byId.has(a.owner)&&e.byId.has(a.location)),...all(s).filter(a=>a.category==='transport_asset')].map(a=>[a.id,a])).values()];
function available(e,s,id){const n=s.npcs?.[id];return n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'')&&!n.scheduleTravel&&!n.cognitionTravel&&!e.npcAutonomyBusy(s,id,s.minute)&&!personConstraint(e,s,id)&&(personAge(e,s,id).value??0)>=18;}
function operator(e,s,owner){return s.npcs?.[owner]?owner:groupRepresentative(e,s,owner);}
export function transportAssetView(e,s,id){
 const a=s.records?.[assetKey(id)]??openingTransportAssets.find(a=>a.id===assetKey(id)&&e.byId.has(a.owner)&&e.byId.has(a.location));if(a?.category!=='transport_asset')return null;
 const spec=SPECS[a.kind];let factor=a.destroyedAt!==undefined||a.durability<25?0:a.durability<60?0.5:1,location=a.location;
 if(a.kind==='pack'){
  const c=s.creatures?.[a.animal],rule=e.byId.get(c?.species)?.tamingRule;
  if(!c||c.owner!==a.owner||c.hp<c.maxHp/2||['死亡','昏迷'].includes(c.status)||c.mind?.awakened||c.care?.fatigue>=e.rules.petCare.maximumRideFatigue||c.care?.sickness||c.care?.hunger>=e.rules.petCare.hungryThreshold||s.player.mount===a.animal)factor=0;
  location=c?.location??location;
  if(rule?.carryKg)factor*=Math.min(1,rule.carryKg/spec.kg);
 }
 const lease=all(s).find(r=>r.category==='transport_lease'&&r.asset===a.id&&r.starts<=s.minute&&r.ends>s.minute);
 const busy=unfinished(s).find(r=>r.asset===a.id);
 return {...a,location,holder:lease?.tenant??a.owner,capacityKg:spec.kg*factor,capacityM3:spec.m3*factor,seats:Math.floor(spec.seats*factor),mode:spec.mode,factor,busy:busy?.id??null,
  tags:['item','transport',a.kind,a.kind==='pack'?'flesh':'wood',...(factor===0?['broken']:[])]};
}
export function createTransportAsset(d,e,{owner='player',kind='cart',animal,id},eventId){
 const spec=SPECS[kind];if(!spec)throw preconditionFailure('承运资产类型无效');
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
 holdingSet(d,null,path(key),asset,'transport');return transportAssetView(e,d.get('state'),key);
}
export function transportServices(e,s,location){
 return assets(e,s).map(a=>transportAssetView(e,s,a.id)).filter(a=>a.factor&&!a.busy&&a.location===location).flatMap(a=>{
  const driver=operator(e,s,a.holder),group=groupView(e,s,a.holder);
  if(!available(e,s,driver)||actorLocation(s,driver)!==location||!(group||/商|车|船|驿|运输|脚夫/.test(personOccupation(e,s,driver).value??'')))return [];
  const now=s.minute,depart=Math.ceil(now/60)*60;
  return [{asset:a.id,carrier:a.holder,driver,kind:a.kind,mode:a.mode,capacityKg:a.capacityKg,capacityM3:a.capacityM3,seats:a.seats,nextDeparture:depart,intervalMinutes:60}];
 });
}
function dimensions(e,cargo,passengers){
 let kg=passengers.length*75,m3=passengers.length*0.1;
 for(const c of cargo){int(c.quantity,1,'托运数量');const def=e.byId.get(c.item);if(!def||!(def.weight>=0))throw preconditionFailure('托运物品未登记重量');kg+=c.quantity*def.weight;m3+=c.quantity*(def.volumeM3??def.weight/250);}
 return {kg,m3};
}
export function quoteTransport(d,e,{asset,from,to,cargo=[],passengers=[],departAt=d.get('state','minute')}){
 const s=d.get('state'),a=transportAssetView(e,s,asset);if(!a||!a.factor||a.busy||a.location!==from)throw preconditionFailure('没有同地可用运力');
 const load=dimensions(e,cargo,passengers);if(load.kg>a.capacityKg||load.m3>a.capacityM3||passengers.length>a.seats)throw preconditionFailure('货舱重量、体积或座位容量不足');
 const prior=e.airDraft;e.airDraft=d;let route;try{route=e.route(from,to,a.mode,departAt,d.document.randomSeed);}finally{e.airDraft=prior;}
 const edges=route.edges.map(id=>e.world.routes.find(r=>r.id===id)),distanceKm=edges.reduce((n,r)=>n+r.lengthKm,0);
 const risk=edges.reduce((n,r)=>n+(Number(r.risk)||0),0)/Math.max(1,edges.length);
 const freight=Math.max(1,Math.ceil(distanceKm*Math.max(load.kg,load.m3*250,1)*SPECS[a.kind].rate*(1+risk)));
 let at=from;const passages=edges.map(r=>{const destination=r.from===at?r.to:r.from;at=destination;const tax=tradeTax(e,s,destination,'tariff');return {edge:r.id,destination,treasury:tax.settlement,toll:r.toll,tariff:(r.toll||r.guards?.length)?Math.floor(cargo.reduce((v,c)=>v+c.quantity*(e.byId.get(c.item).basePrice??0),0)*tax.bps/10000):0};});
 const tariff=passages.reduce((n,p)=>n+p.tariff,0);
 return {asset:a.id,mode:a.mode,from,to,departAt,estimatedArrivalAt:departAt+route.minutes,route,passages,load,distanceKm,risk,freight,tariff,toll:route.cost,total:freight+tariff+route.cost};
}
export function leaseTransportAsset(d,e,{asset,tenant='player',minutes,coins},eventId){
 const a=transportAssetView(e,d.get('state'),asset),now=d.get('state','minute');int(minutes,1,'租期');int(coins,1,'租金');
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
 const a=transportAssetView(e,s,asset),service=transportServices(e,s,from).find(x=>x.asset===a?.id);
 if(!service)throw preconditionFailure('承运人当前不能提供班次');
 const departAt=args.departAt??service.nextDeparture;int(departAt,now,'发车时间');
 if(departAt%service.intervalMinutes!==0)throw preconditionFailure('不在承运班次时间');
 if(!forwarding&&!externalValid&&from!==actorLocation(s,owner))throw preconditionFailure('发货人须在装货地点');
 const q=quoteTransport(d,e,{asset:a.id,from,to,cargo,passengers,departAt}),id=`transport:${eventId}`;
 if(!q.route.edges.length)throw preconditionFailure('发货与目的地须为不同地点');
 if(d.get(...path(id)))throw preconditionFailure('运单编号已存在');
 const lease=all(s).find(r=>r.category==='transport_lease'&&r.asset===a.id&&r.ends>now);if(lease&&lease.ends<q.estimatedArrivalAt)throw preconditionFailure('租约不能覆盖承运全程');
 const actors=[service.driver,...passengers,...escort?[escort]:[]];if(new Set(actors).size!==actors.length)throw preconditionFailure('乘客或护送人员重复');
 for(const actor of actors){
  if(actor==='player'){if(s.location!==from)throw preconditionFailure('乘客不在发车地点');}
  else if(!available(e,s,actor)||actorLocation(s,actor)!==from||s.player.companions?.includes(actor))throw preconditionFailure('承运人员或乘客不可行动或不在场');
 }
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
 const row={category:'transport',id,asset:a.id,carrier:service.carrier,driver:service.driver,owner,recipient,from,to,mode:q.mode,status:'booked',createdAt:now,departAt,estimatedArrivalAt:q.estimatedArrivalAt,
  freight:q.freight,tariff:q.tariff,toll:q.toll,routeCost:q.total,cargo:[],passengers:clone(passengers),escort,escortEscrow:escortFee,receiptOf,externalOrder:externalValid?args.externalOrder:null,
  transport:{edges:q.route.edges,edgeIndex:0,location:from,remainingKm:null,movingMinutes:0,restedBudgets:0,nextAt:departAt,segment:null},history:[{minute:now,location:from,kind:'booked'}]};
 if(!d.get(...path(a.id)))holdingSet(d,null,path(a.id),Object.fromEntries(Object.entries(a).filter(([k])=>!['holder','capacityKg','capacityM3','seats','mode','factor','busy','tags'].includes(k))),'transport');
 if(!externalValid)for(const c of cargo){const moved=moveGoods(d,e,owner,c.item,c.quantity,{take:true,trip:id});const units=moved.instances??[];row.cargo.push({...c,instances:units});for(const unit of units)holdingSet(d,null,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner:id,status:'托运'},'transport');}
 financeTransfer(d,e,owner,service.carrier,q.freight+q.toll,eventId);assessTradeTax(d,e,{seller:service.carrier,cost:q.freight,location:from,sourceEvent:eventId});
 // Route tolls and tariffs are actual payments to the current destination treasury.
 for(const p of q.passages){
  if(p.toll&&!groupAccountView(e,d.get('state'),p.treasury))d.set(['state','settlements',p.treasury],{treasury:0,treasuryLedger:[],granary:false,population:0});
  if(p.toll)financeTransfer(d,e,service.carrier,p.treasury,p.toll,`${eventId}:toll:${p.edge}`);
  if(p.tariff)assessTradeTax(d,e,{seller:owner,cost:cargo.reduce((n,c)=>n+c.quantity*(e.byId.get(c.item).basePrice??0),0),location:p.destination,sourceEvent:`${eventId}:${p.edge}`,kind:'tariff'});
 }
 if(escortFee){
  // The existing board's verifiable record objective provides the escort contract.
  const quest=postGeneratedQuest(d,e,{key:`transport:${eventId}`,generator:'npc_needs',label:'承运护送',grade:'D',reward:escortFee,days:Math.max(1,Math.ceil((q.estimatedArrivalAt-now)/DAY)+1),content:`护送运单${id}抵达${to}`,objective:{type:'record',record:id,field:'status',equals:['delivered']},board:from,publisher:owner,funding:{npc:owner},minute:now,cause:id});
  if(!quest)throw preconditionFailure('护送委托无法登记');row.escortQuest=quest.id;row.escortEscrow=0;
  // The quoted mobilization fee is prepaid. Time wages are earned throughout
  // actual custody, including weather waits, rather than the route estimate.
  if(ledgerActive(d)&&(!e.replaying||e.replayResult?.transportObligationVersion===1)){
   const daily=args.escortDailyWage??escortFee;int(daily,0,'护送日薪');
   row.transportObligationVersion=1;row.escortTerms={base:escortFee,daily,starts:now};
   row.escortWage=`${id}:escort-wage`;
   registerEarnedClaim(d,e,{id:row.escortWage,kind:'wage',debtor:owner,creditor:escort,amount:escortFee,createdAt:now,deadline:Number.MAX_SAFE_INTEGER,source:id,
    terms:{accrual:{per:'day',value:daily},onDebtorGone:'accelerate',onCreditorGone:'estate'}});
   holdingSet(d,e,path(quest.id),{category:'contract',id:quest.id,kind:'wage',parties:[owner,escort],debt:`${id}:escort-wage`,escrow:quest.escrow,status:'履行中',createdAt:now},'transport');
  }
  d.set(['state','quests',quest.id],{...quest,status:'进行中',taker:escort,transport:id,...(row.transportObligationVersion===1?{escrow:0}:{} )});
 }
 for(const actor of actors)if(actor!=='player')d.set(['state','npcs',actor,'cognitionTravel'],{transport:id,from,to,depart:departAt,arrive:q.estimatedArrivalAt});
 if(departAt===now){const t=row.transport;t.segment=transportSegment(e,d.get('state'),d.document.randomSeed,t,row.mode,now);t.segmentStartedAt=now;t.nextAt=now+t.segment.minutes;row.status=t.segment.kind==='wait'?'delayed':'moving';
  if(a.animal&&t.segment.kind==='move'){const care=d.get('state','creatures',a.animal,'care');if(care)holdingSet(d,null,['state','creatures',a.animal,'care'],{...care,busyUntil:t.nextAt},'transport');}
 }
 holdingSet(d,null,path(id),row,'transport');index(d,id);return clone(row);
}
function setPosition(d,row,location){
 holdingSet(d,null,[...path(row.asset),'location'],location,'transport');
 const animal=d.get(...path(row.asset),'animal');if(animal)holdingSet(d,null,['state','creatures',animal,'location'],location,'transport');
 for(const actor of [row.driver,...row.passengers,...row.escort?[row.escort]:[]]){
  if(actor==='player')d.set(['state','location'],location);
  else {d.set(['state','npcs',actor,'location'],location);d.set(['state','npcs',actor,'activity'],row.status==='delivered'?'抵达':'承运途中');if(row.status==='delivered')d.remove(['state','npcs',actor,'cognitionTravel']);}
 }
}
export function nextTransportMinute(state,now){return Math.min(Infinity,...live(state).map(r=>r.transport.nextAt).filter(at=>at>now));}
export function advanceTransport(d,e,minute){
 for(const old of live(d.get('state'))){const row=clone(old),t=row.transport;
  if(t.nextAt>minute)continue;
  if(t.nextAt<minute)throw Error('承运时钟越过未处理节点');
  const asset=transportAssetView(e,d.get('state'),row.asset);
  if(!asset?.factor||!d.get('state','npcs',row.driver)||['死亡','昏迷','濒死','患病'].includes(d.get('state','npcs',row.driver,'status'))||personConstraint(e,d.get('state'),row.driver)){
   row.status='delayed';t.nextAt=minute+DAY;row.reason='车船损坏、驮畜失能或承运人无法行动';holdingSet(d,null,path(row.id),row,'transport');continue;
  }
  if(t.segment){const waypoint=stepTransport(e,t,t.segment);
   if(asset.animal&&t.segment.kind==='move'){const care=d.get('state','creatures',asset.animal,'care');if(care)holdingSet(d,null,['state','creatures',asset.animal,'care'],{...care,fatigue:Math.min(100,care.fatigue+Math.ceil(t.segment.minutes/30)*e.rules.petCare.travelFatiguePer30Minutes)},'transport');}
   if(waypoint){row.history.push({minute,location:t.location,kind:'waypoint'});const wear=Math.max(1,Math.ceil(t.segment.distanceKm/20));holdingSet(d,null,[...path(row.asset),'durability'],Math.max(0,asset.durability-wear),'transport');}}
  if(t.edgeIndex>=t.edges.length){
   row.status='delivered';row.arrivedAt=minute;t.nextAt=null;t.segment=null;index(d,row.id,false);
   const handover=!row.cargo.length||actorLocation(d.get('state'),row.recipient)===t.location;
   if(handover){for(const c of row.cargo)moveGoods(d,e,row.recipient,c.item,c.quantity,{instances:c.instances,trip:row.id});row.deliveredCargo=clone(row.cargo);row.cargo=[];}
   row.history.push({minute,location:t.location,kind:'delivered'});setPosition(d,row,t.location);
   if(!handover)row.status='arrived';
   if(row.escortQuest){const q=d.get('state','quests',row.escortQuest);if(q&&(row.transportObligationVersion===1?d.get(...path(q.id),'escrow')>0:q.escrow&&q.status==='进行中')){
    if(row.transportObligationVersion===1)settleEscort(d,e,row,q,minute);
    else{financeChange(d,e,row.escort,q.escrow,`${row.id}:escort`,{account:escrowAccount(q.id),writer:'transport',eventId:`${row.id}:escort`});d.set(['state','quests',q.id],{...q,status:'已完成',escrow:0,rewardPaid:q.escrow,resolvedAt:minute});}
    holdingSet(d,null,path(`${q.id}:已完成`),{category:'quest_receipt',quest:q.id,parties:[q.publisher,q.taker],minute,location:t.location,status:'已完成',escrow:0,rewardPaid:row.escortPaid??q.escrow,refund:0,source:'npc_needs'},'transport');
   }}
   publishTransitionEvent(d,e,{id:`${row.id}:arrival`,verb:'trade',actor:row.carrier,target:row.recipient,location:t.location,minute,tags:['transport'],witnesses:[]});
  }else{
   t.segment=transportSegment(e,d.get('state'),d.document.randomSeed,t,row.mode,minute);t.segmentStartedAt=minute;t.nextAt=minute+t.segment.minutes;
   if(asset.animal&&t.segment.kind==='move'){const care=d.get('state','creatures',asset.animal,'care');if(care)holdingSet(d,null,['state','creatures',asset.animal,'care'],{...care,busyUntil:t.nextAt},'transport');}
   row.status=t.segment.kind==='wait'?'delayed':'moving';row.reason=t.segment.reason??null;
   if(t.segment.kind==='wait')row.history.push({minute,location:t.location,kind:'blocked',edge:t.edges[t.edgeIndex]});
   // Between endpoints the route id and remaining distance, not a false town address, locate the shipment.
   setPosition(d,row,t.location);
  }
  holdingSet(d,null,path(row.id),row,'transport');
 }
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
   row.escortPaid=0;d.set(['state','quests',q.id],{...q,status:'已完成',escrow:0,resolvedAt:minute,rewardPaid:0});return;
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
 const old=d.get(...path(shipment));if(old?.category!=='transport'||!['moving','delayed','intercepted'].includes(old.status))throw preconditionFailure('运单不在可追查的途中');
 const row=clone(old),s=d.get('state'),position=transportPosition(e,s,row);
 if(!row.passengers.includes(actor)&&actor!==row.driver&&(position.location===null||actorLocation(s,actor)!==position.location))throw preconditionFailure('须到运单实际所在路段端点');
 if(recover){if(row.status!=='intercepted'||![row.owner,row.carrier].includes(actor)||row.custodian!==actor&&!(consent&&actorLocation(s,row.custodian)===actorLocation(s,actor)))throw preconditionFailure('须先从实际扣货者取回货物');row.status='delayed';row.transport.nextAt=s.minute+1;row.custodian=null;row.transport.segment=null;}
 else{if(row.escort&&!['死亡','昏迷','濒死'].includes(s.npcs?.[row.escort]?.status)&&!personConstraint(e,s,row.escort))throw preconditionFailure('护送者仍在守卫，须先处理护送者');row.status='intercepted';row.custodian=actor;row.transport.nextAt=null;}
 row.history.push({minute:s.minute,location:row.transport.location,kind:recover?'recovered':'intercepted',actor});holdingSet(d,null,path(row.id),row,'transport');
 publishTransitionEvent(d,e,{id:`${eventId}:transport`,verb:recover?'trade':'theft',actor,target:row.owner,location:row.transport.location,minute:s.minute,tags:['transport'],witnesses:[]});return row;
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
 return {location:moving&&elapsed>0?null:t.location,route:edge?.id??null,from:t.location,to:segment?.destination??null,remainingKm:remaining};
}
export function collectTransport(d,e,id,actor='player'){
 const old=d.get(...path(id));if(old?.category!=='transport'||old.status!=='arrived'||old.recipient!==actor||actorLocation(d.get('state'),actor)!==old.to)throw preconditionFailure('收货人须亲到到货地点提取实际货物');
 const row=clone(old);for(const c of row.cargo)moveGoods(d,e,actor,c.item,c.quantity,{instances:c.instances,trip:id});row.deliveredCargo=clone(row.cargo);row.cargo=[];row.status='delivered';row.collectedAt=d.get('state','minute');holdingSet(d,null,path(id),row,'transport');return row;
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
  int(quantity,1,'损失数量');const row=clone(old),cargo=row.cargo.find(c=>c.item===item);
  if(!cargo||cargo.quantity<quantity)throw preconditionFailure('货损超过实际承运数量');
  const value=quantity*(e.byId.get(item)?.basePrice??0);int(value,0,'货损价值');
  bookStock(d,e,freight(e,shipment,item),-quantity,{flow:'sink:destroy',purpose:'cargo_loss',writer:'transport',eventId});
  const units=(cargo.instances??[]).splice(0,quantity);
  for(const unit of units)holdingSet(d,e,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),status:'损毁',destroyedAt:s.minute,container:shipment},'transport');
  cargo.quantity-=quantity;row.cargo=row.cargo.filter(c=>c.quantity>0);row.losses=[...row.losses??[],key];
  holdingSet(d,e,path(row.id),row,'transport');
  holdingSet(d,e,path(`${key}:facts`),{category:'transport_loss_facts',shipment,item,quantity,actor,cause,minute:s.minute},'transport');
  const loss=registerLoss(d,e,{id:key,victim:row.owner,amount:value,source:shipment});
  registerEarnedClaim(d,e,{id:`${key}:claim`,kind:'compensation',debtor:row.carrier,creditor:row.owner,amount:value,createdAt:s.minute,deadline:s.minute,source:key});
  return loss;
 });
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
 const position=transportPosition(e,s,row),asset=transportAssetView(e,s,row.asset),name=id=>e.byId.get(id)?.name??id;
 return `【时间】${e.calendar(s.minute).text}\n【乘车船】${asset.kind}｜${row.status}｜${name(row.from)}至${name(row.to)}\n【实际位置】${position.location?name(position.location):`${position.route}路段上，距下一节点${position.remainingKm.toFixed(2)}公里`}\n【承运人】${name(row.driver)}｜预计抵达${e.calendar(row.estimatedArrivalAt).text}${row.reason?`｜${row.reason}`:''}\n【你】生命${s.player.hp}/${s.player.maxHp}｜铜${s.player.coins}｜运单${row.id}`;
}
export function destroyTransportAsset(d,e,{asset,cause='destruction',salvage={}},eventId){
 const a=transportAssetView(e,d.get('state'),asset);if(!a)throw Error('Transport asset not found');
 return transition(d,e,{entity:a.id,basis:'destruction',origin:'destruction',eventId,causes:[cause],location:a.location,salvage,
  legacy:()=>{
   holdingSet(d,e,path(a.id),{...d.get(...path(a.id)),category:'transport_asset',id:a.id,kind:a.kind,owner:a.owner,location:a.location,durability:0,destroyedAt:d.get('state','minute')},'transport');
   const wreck=d.get('holdings','protocol','entities',a.id,'wreck');
   for(const old of unfinished(d.get('state')).filter(r=>r.asset===a.id)){
    const row=clone(old);row.status='wrecked';row.reason=cause;row.transport.nextAt=null;row.cargoLocation=wreck;row.shortfallAt=d.get('state','minute');
    for(const cargo of row.cargo)for(const unit of cargo.instances??[]){
     const item=d.get('state','itemInstances',unit);if(item)holdingSet(d,e,['state','itemInstances',unit],{...item,container:wreck,status:'袋内'},'transport');
    }
    publishTransitionEvent(d,e,{id:`${eventId}:shortfall:${row.id}`,verb:'shortfall',actor:a.id,subject:row.id,minute:d.get('state','minute'),visibility:'private',witnesses:[],tags:['protocol','transport'],cause:eventId});
    row.history.push({minute:d.get('state','minute'),location:row.transport.location,kind:'wrecked'});
    holdingSet(d,e,path(row.id),row,'transport');index(d,row.id,false);
    for(const actor of [row.driver,...row.passengers,...row.escort?[row.escort]:[]])if(actor!=='player'&&d.get('state','npcs',actor,'cognitionTravel')?.transport===row.id)d.remove(['state','npcs',actor,'cognitionTravel']);
   }
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
 if(task==='inspect'&&institutionOriginal(e,d.document,asset)?.document?.kind==='transport_claim'){
  if(args.actor!==undefined&&args.actor!=='player')throw Error('Transport inspection requires its player customer');
  return historicalTransportDocument(d,e,{id:asset});
 }
 if(task==='forward'){
  if(args.consent!==true)throw preconditionFailure('远期买卖须有在场卖方本次同意');
  return openGoodsObligation(d,e,{kind:'forward',debtor:e.resolve(args.seller),creditor:'player',item:e.resolve(args.item,'item'),quantity:args.quantity,prepayment:args.coins??0,deadline:args.deadline,location:args.location?e.resolve(args.location):d.get('state','location')},eventId);
 }
 if(task==='fulfill')return performGoodsObligation(d,e,{id:args.business??asset,actor:'player',quantity:args.quantity},eventId);
 if(task==='extend')return extendGoodsObligation(d,e,{id:args.business??asset,actor:'player',deadline:args.deadline},eventId);
 if(task==='destroy'){
  const a=transportAssetView(e,d.get('state'),asset);if(!a||a.owner!=='player'||a.location!==d.get('state','location'))throw Error('Only the present owner can destroy this asset');
  return destroyTransportAsset(d,e,{asset:a.id},eventId);
 }
 if(task==='register')return createTransportAsset(d,e,{kind:args.mode??'cart',animal:args.item},eventId);
 if(task==='trace')return transportTrace(e,d.get('state'),args.business??asset);
 if(task==='collect')return collectTransport(d,e,args.business??asset);
 if(task==='lease'){const a=transportAssetView(e,d.get('state'),asset),counterparty=e.resolve(args.seller);if(args.consent!==true||!available(e,d.get('state'),counterparty)||actorLocation(d.get('state'),counterparty)!==d.get('state','location')||a?.owner!=='player'&&a?.owner!==counterparty)throw preconditionFailure('出租须有在场当事人本次同意');return leaseTransportAsset(d,e,{asset,tenant:a.owner==='player'?counterparty:'player',minutes:args.minutes,coins:args.coins},eventId);}
 if(task==='intercept'||task==='recover')return transportIncident(d,e,{shipment:args.business??asset,recover:task==='recover',consent:args.consent},eventId);
 const cargo=args.item?[{item:e.resolve(args.item),quantity:args.quantity??1}]:[],passengers=[];
 if(task==='inspect'||!asset)return {services:transportServices(e,d.get('state'),d.get('state','location')),usage:'transport: contract资产, location目的地, item/quantity货物, service=passage乘客; post: buyer收件人,item记忆ID'};
 if(task==='repair'){const a=transportAssetView(e,d.get('state'),asset);if(!a||a.destroyedAt!==undefined||a.owner!=='player'||a.busy||a.location!==d.get('state','location'))throw preconditionFailure('资产不在本人可修缮范围');const n=Math.ceil((100-a.durability)/10);if(!n)throw preconditionFailure('资产无需修缮');if(e.quantity(d,'player','item_wood')<n)throw preconditionFailure('修缮木料不足');changeItems(d,e,'player','item_wood',-n,{books:{flow:'sink:consume',purpose:'repair',writer:'transport',eventId}});holdingSet(d,null,[...path(a.id),'durability'],100,'transport');return transportAssetView(e,d.get('state'),a.id);}
 const options={asset,to:e.resolve(args.location),cargo,passengers:args.service==='passage'?['player']:passengers,escort:args.escort?e.resolve(args.escort):null,authorization:args.authorization};
 if(task==='book')return bookTransport(d,e,options,eventId);
 return quoteTransport(d,e,{...options,from:d.get('state','location')});
}
