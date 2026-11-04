// 职业驱动劳动（K3）：职业 → 劳动类别 → 当天的作息槽（一次真实往返的劳动行程）→ 产出、出售、运输。
// 劳动类别只来自职业数据的 labor 属性（professions.json，或 careers.json 同名职业）；人物的职业是名册登记的职业编号，
// 加上与职业名或别名完全一致的职业称谓。这里不认任何职业名、物品编号或地点编号。
// 劳动的去处由世界状态派生：采集取据点的有限资源（sites.mjs 的据点账），伐木取林木存量（forest-water，产物是聚落木料那一种存货），
// 加工走已有的配方制造，出售与运输把本人可售的存货卖给有铺面的收货人，价格走已有的市场报价（稀缺随供给变化）。
// 每一项劳动由本人主观视图上的 npcDecision 决定（收益即这趟劳动的真实货值或货款，作为满足需要的量），
// 是否值得去由真实报价与工时价值比较得出（按需求排班）。
import {registerAutonomyProvider,registerAutonomyKind} from './autonomy-candidates.mjs';
import {preconditionFailure} from './precondition.mjs';
import {npcAgeAt,householdWorkTime} from './npc-state.mjs';
import {scheduleAt} from './npc-schedule.mjs';
import {personHousehold,placeSettlement} from './entity-view.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {stateReader,goodsWorth} from './valuation.mjs';
import {laborValue,marketQuote,saleableStock,recordMarketDeal} from './market.mjs';
import {changeItems,transferItems,heldUnit,wearItem} from './items.mjs';
import {bag,BOOKED,stockItem} from './stock.mjs';
import {forestSites,forestView,harvestForest} from './forest-water.mjs';
import {siteResources,siteTake} from './sites.mjs';
import {shopOfKeeper} from './shop.mjs';
import {safeCarryKg,carriedKg,packItemKg} from './carry.mjs';
import {purse,sink,moveCoins,mirrorPartyCoins} from './money.mjs';
import {npcDecision} from './npc-decision.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {holdingSet,declareHoldingWriter} from './holdings.mjs';

const DAY=1440,writer='npc-labor';
declareLedgerWriter(writer,{sinks:['sink:export']});
declareHoldingWriter(writer,{kinds:[]});
const reader=document=>({document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)});
// 劳动的工时参数只来自 rules.npcLabor；缺了是数据错误，不用缺省值顶替。
function config(e){
 const c=e.rules.npcLabor;
 if(!Number.isSafeInteger(c?.tripMinutes)||c.tripMinutes<1||!Number.isSafeInteger(c?.saleMinutes)||c.saleMinutes<1)throw Error('rules.npcLabor 须登记 tripMinutes 与 saleMinutes（正整数分钟）');
 return c;
}
// 一天里交给自主劳动的整段工时上限，与 npc-autonomy 的每日自主工时同一口径。
const tripLimit=e=>config(e).tripMinutes;

// ---- 职业 → 劳动类别 ----
export function npcProfessions(e,state,id){
 const n=state?.npcs?.[id],b=e.byId.get(id),ids=n?.professions??b?.professions??[],title=n?.occupation??b?.occupation;
 const out=new Map(ids.map(p=>[p,e.byId.get(p)]).filter(([,p])=>p));
 if(title)for(const p of e.world.professions??[])if(p.name===title||p.aliases?.includes(title))out.set(p.id??p.name,p);
 return [...out.values()];
}
export function laborCategories(e,state,id){
 const out=new Set();
 for(const p of npcProfessions(e,state,id))for(const c of p.labor??e.world.careers?.[p.id]?.labor??[])out.add(c);
 return [...out].sort();
}
const adult=(e,state,id,minute)=>(npcAgeAt(e,state,id,minute)??0)>=e.rules.npcLife.adultAge;

// ---- 劳动的去处 ----
function route(e,document,from,to,at){
 try{return from===to?{minutes:0,cost:0,edges:[]}:e.route(from,to,'walk',at,document.randomSeed);}
 catch{return null;}
}
const homeSettlement=(e,state,id)=>personHousehold(e,state,id).value?.settlement??placeSettlement(e,state,state.npcs[id]?.location).value;
// 自然来源：每个来源给出地点、产物、每份工时与当前可取量；取用只经各自规律的账本入口。
function naturalSources(e,state,id,labor){
 const rows=[];
 // 据点：一趟劳动行程走得到的就是本地据点（行程核算在下面）；只去合法的，会被定罪的不去（sites.mjs 的同一条许可规律）。
 if(labor.includes('gather')){
  const settlement=homeSettlement(e,state,id);
  for(const r of siteResources(e,state,{holder:id,settlement}))if(r.lawful&&r.remaining>0&&r.minutesPerUnit>0)
   rows.push({labor:'gather',location:r.site,item:r.item,minutesPerUnit:r.minutesPerUnit,available:r.remaining,source:`site:${r.site}:${r.resource}`,resource:r.resource});
 }
 const forest=e.rules.forestWater?.forest;
 if(labor.includes('fell')&&forest&&e.quantity(stateReader(state),id,forest.tool)>0)
  for(const s of forestSites(e)){
   const place=e.byId.get(s.location),owner=place?.site?.owner??place?.owner;
   if(owner&&owner!==id||place?.access?.requiresConsent||place?.site)continue;
   const reserve=forestView(e,state,s.location)?.reserve??0;
   if(reserve>0)rows.push({labor:'fell',location:s.location,item:stockItem(e,'wood'),minutesPerUnit:forest.minutes,available:Math.min(reserve,forest.maximumCut),source:`forest:${s.location}`,tool:forest.tool});
  }
 return rows;
}
// 有铺面、按引擎报价收货的人；运输去别的聚落，出售只在本聚落。
function buyers(e,state,who,item){
 return e.world.npcs.filter(n=>n.id!==who&&(n.serviceCatalog??[]).some(s=>s.kind==='trade'&&s.price?.mode==='engineQuote')&&shopOfKeeper(e,n.id,state)&&state.npcs[n.id]&&isEffective(e,state,n.id))
  .flatMap(n=>{const at=state.npcs[n.id].workplace?.location??n.workplace?.location??(n.schedule?.default??[]).find(s=>s.services?.includes('trade'))?.location;return at?[{keeper:n.id,location:at}]:[];});
}
function keeperQuote(e,document,{seller,keeper,location,item,quantity}){
 const d=reader(document),business=shopOfKeeper(e,keeper,document.state);
 return marketQuote(d,e,{item,location,seller,buyer:keeper,quantity,business:{...business,keeper}});
}
// 一次往返的劳动行程：出发、到达、在场工作、返回，全部按真实路线与作息核对。
function itinerary(e,document,who,to,work,at){
 const from=document.state.npcs[who].location,out=route(e,document,from,to,at);if(!out)return null;
 const arriveAt=at+out.minutes,finishAt=arriveAt+work,back=route(e,document,to,from,finishAt);if(!back)return null;
 const returnAt=finishAt+back.minutes;
 if(returnAt-at>tripLimit(e)||work<=0)return null;
 return {from,to,departAt:at,arriveAt,finishAt,returnAt,travelCoins:(out.cost??0)+(back.cost??0),outboundEdges:out.edges??[],inboundEdges:back.edges??[]};
}
function carryRoom(e,document,who,item){
 const d=reader(document),kg=packItemKg(d,e,who,item);
 return kg>0?Math.max(0,Math.floor((safeCarryKg(d,e,who)-carriedKg(d,e,who))/kg)):Infinity;
}
function laborCost(e,document,who,view,minutes){return Math.ceil(laborValue(e,document,{worker:who,observer:who,view}).daily*minutes/480);}

export function laborCandidates(e,view,document){
 const state=document.state,who=view.observer,labor=laborCategories(e,state,who),at=view.minute,out=[];
 if(!labor.length||!adult(e,state,who,at))return out;
 const read=stateReader(state),home=view.self.location,day=Math.floor(at/DAY);
 // 采集与伐木：可取的量按工时与负重定，值不值得去看本地真实估值（稀缺越高越值得）。
 const probes=new Map();
 for(const s of naturalSources(e,state,who,labor)){
  const room=carryRoom(e,document,who,s.item);
  if(!probes.has(s.location))probes.set(s.location,itinerary(e,document,who,s.location,s.minutesPerUnit,at));
  const probe=probes.get(s.location);if(!probe)continue;
  const work=Math.min(tripLimit(e)-(probe.returnAt-probe.finishAt)-(probe.arriveAt-at),s.minutesPerUnit*Math.min(s.available,room));
  const quantity=Math.floor(work/s.minutesPerUnit);if(quantity<1)continue;
  const trip=itinerary(e,document,who,s.location,quantity*s.minutesPerUnit,at);if(!trip)continue;
  const worth=goodsWorth(read,e,{item:s.item,quantity,holder:who,location:home});if(!Number.isFinite(worth))continue;
  const minutes=trip.returnAt-at,cost=laborCost(e,document,who,view,minutes)+trip.travelCoins,utility=worth-cost;
  if(utility<=0)continue;
  out.push({id:`labor:${who}:${day}:${s.source}`,kind:'labor',legacy:{kind:'labor_work',labor:s.labor,item:s.item,quantity,source:s.source,resource:s.resource,tool:s.tool,minutesPerUnit:s.minutesPerUnit,...trip},
   cost:{coins:trip.travelCoins,minutes},reward:worth,needSatisfaction:worth,utility});
 }
 // 出售与运输：本人可售的存货卖给有铺面的收货人；跨聚落的就是运输。
 // 自己有铺面的人在本铺零售（已有的店铺规律），不再把铺货送去别家。
 if((labor.includes('sell')||labor.includes('carry'))&&!shopOfKeeper(e,who,state)){
  const settlement=homeSettlement(e,state,who),inventory=state.npcs[who]?.inventory??{};
  for(const item of Object.keys(inventory).sort()){
   const available=saleableStock(read,e,who,item).available;if(!(available>0)||!e.byId.get(item)?.basePrice)continue;
   for(const b of buyers(e,state,who,item)){
    const remote=placeSettlement(e,state,b.location).value!==settlement;
    if(remote?!labor.includes('carry'):!labor.includes('sell'))continue;
    const trip=itinerary(e,document,who,b.location,config(e).saleMinutes,at);if(!trip)continue;
    let quote;try{quote=keeperQuote(e,document,{seller:who,keeper:b.keeper,location:b.location,item,quantity:available});}catch{continue;}
    if(!(quote.totalCoins>0)||quote.totalCoins>(state.npcs[b.keeper]?.coins??0))continue;
    // 可售存货（saleableStock 已扣除本人与家户的自留）是待售的货，值不值得送去卖看货款能否抵过工时与路费。
    const minutes=trip.returnAt-at,cost=laborCost(e,document,who,view,minutes)+trip.travelCoins,utility=quote.totalCoins-cost;
    if(utility<=0)continue;
    out.push({id:`labor:${who}:${day}:sale:${item}:${b.keeper}`,kind:'labor',legacy:{kind:'labor_sale',labor:remote?'carry':'sell',item,quantity:available,keeper:b.keeper,...trip},
     cost:{coins:trip.travelCoins,minutes},reward:quote.totalCoins,needSatisfaction:quote.totalCoins,utility});
   }
  }
 }
 // 加工：不需拜师的配方，本人手上有料，成品值超过料与工。
 if(labor.includes('process'))for(const r of e.world.recipes){
  if(r.learningRequired&&!r.teachers?.includes(who)&&!state.npcs[who]?.recipes?.[r.id])continue;
  if(r.location&&r.location!==home||!r.materials?.length||r.materials.some(m=>e.quantity(read,who,m.item)<m.amount)||(r.tools??[]).some(t=>e.quantity(read,who,t)<1))continue;
  const worth=goodsWorth(read,e,{item:r.output.item,quantity:r.output.quantity,holder:who,location:home});
  const inputs=r.materials.reduce((n,m)=>n+(goodsWorth(read,e,{item:m.item,quantity:m.amount,holder:who,location:home})??Infinity),0);
  const utility=worth-inputs-laborCost(e,document,who,view,r.minutes);
  if(Number.isFinite(utility)&&utility>0)out.push({id:`labor:${who}:${day}:process:${r.id}`,kind:'labor',legacy:{kind:'craft',recipe:r.id},cost:{minutes:r.minutes,value:inputs},reward:worth,needSatisfaction:worth,utility});
 }
 return out;
}
const relevant=(e,state,id,presence)=>Boolean(laborCategories(e,state,id).length)&&adult(e,state,id,state.minute)&&!/睡眠|睡觉|熟睡/.test(presence?.activity??'');
registerAutonomyProvider('npc_labor',{
 relevant,
 candidateRelevant:(e,document,id,presence)=>relevant(e,document.state,id,presence),
 candidates:laborCandidates
});

// ---- 劳动行程：作息槽是一条 market_trip 记录，人物按它出门、在场、回家 ----
const tripKey=task=>`market_trip:labor:${task}`;
const ACTIVITY={gather:'外出采集',fell:'进山伐木',sell:'送货出售',carry:'运货出售'};
function validateTrip(d,e,who,a,{at,ignoreTask=false,taskId}={}){
 const state=d.get('state'),n=state.npcs[who],trip=ignoreTask?state.records[tripKey(taskId)]:null;
 if(!Number.isSafeInteger(a.quantity)||a.quantity<1||!e.byId.get(a.item)||a.departAt!==at&&!ignoreTask||a.returnAt-a.departAt>tripLimit(e)||a.finishAt<a.arriveAt)throw preconditionFailure('劳动行程或数量无效');
 if(!laborCategories(e,state,who).includes(a.labor))throw preconditionFailure('本人的职业不做这项劳动');
 if(!ignoreTask){
  if(n.location!==a.from||n.scheduleTravel||n.cognitionTravel||n.caring||n.levy)throw preconditionFailure('劳动者不在出发地点');
  if(householdWorkTime(e,state,who,at).unattended)throw preconditionFailure('家中无人照看，不能出门劳动');
  const fresh=itinerary(e,d.document,who,a.to,a.finishAt-a.arriveAt,at);
  if(!fresh||fresh.arriveAt!==a.arriveAt||fresh.returnAt!==a.returnAt||fresh.travelCoins!==a.travelCoins)throw preconditionFailure('真实路线已改变');
  for(let cursor=at;cursor<a.returnAt;){const s=scheduleAt(e,who,cursor,state);if(!s||s.location!==a.from||/睡眠|睡觉|熟睡|赶路|前往|返回/.test(s.activity??''))throw preconditionFailure('没有完整的劳动空档');cursor=s.until;}
  e.assertNpcAutonomyAction(state,[who],{start:at,minutes:a.returnAt-at});
  e.assertNpcObligationAction(d,[who],{start:at,minutes:a.returnAt-at,location:a.from,kind:'autonomy'});
  if(a.travelCoins>(n.coins??0))throw preconditionFailure('路费不足');
 }else if(!trip||trip.actor!==who||state.minute<a.finishAt||!(n.location===a.to||n.location===null&&n.scheduleTravel?.from===a.to))throw preconditionFailure('劳动者没有实际到场');
}
function startTrip(d,e,who,a,{actionId}){
 const id=tripKey(actionId);
 d.set(['state','records',id],{id,category:'market_trip',actor:who,from:a.from,to:a.to,departAt:a.departAt,arriveAt:a.arriveAt,finishAt:a.finishAt,returnAt:a.returnAt,
  outboundEdges:a.outboundEdges,inboundEdges:a.inboundEdges,paid:a.travelCoins,sourceEvent:actionId,purpose:`labor:${a.labor}`,labor:a.labor,activity:ACTIVITY[a.labor]??'外出劳动',travelActivity:'劳动途中'});
 if(a.travelCoins){moveCoins(d,{from:purse(e,who),to:sink('export','travel'),amount:a.travelCoins,writer,eventId:actionId});mirrorPartyCoins(d,e,who,-a.travelCoins,actionId,writer);}
}
// 劳动记录：谁、做了哪类劳动、在哪、产出或卖出了什么、卖给谁、得了多少钱。
function laborRecord(d,actionId,row){holdingSet(d,null,['state','records',`labor:${actionId}`],{category:'labor',sourceEvent:actionId,...row},writer,actionId);}

registerAutonomyKind('labor_work',{
 itinerary:true,
 minutes:(e,a)=>a.finishAt-a.departAt,
 validate(d,e,who,a,o){
  validateTrip(d,e,who,a,o);
  if(a.tool&&(e.quantity(d,who,a.tool)<1||(heldUnit(d,e,who,a.tool)?.durability??e.byId.get(a.tool)?.durability??0)<=0))throw preconditionFailure('没有完好的实际工具');
 },
 start:startTrip,
 execute(d,e,who,a,{actionId,at}){
  const to=bag(e,who,a.item),room=carryRoom(e,d.document,who,a.item),want=Math.min(a.quantity,room);
  let taken=0;
  if(a.labor==='gather'){const [,site]=a.source.split(':');taken=siteTake(d,e,site,a.resource,{quantity:want,minutes:a.finishAt-a.arriveAt,holder:who,settlement:homeSettlement(e,d.get('state'),who),to,eventId:actionId});}
  else if(a.labor==='fell'){taken=harvestForest(d,e,a.to,want,at,{to,eventId:actionId});if(a.tool)wearItem(d,e,who,a.tool,e.rules.forestWater.forest.wear);}
  if(taken)changeItems(d,e,who,a.item,taken,{books:BOOKED});
  laborRecord(d,actionId,{npc:who,labor:a.labor,location:a.to,minute:at,source:a.source,produced:taken?[{item:a.item,quantity:taken}]:[],success:taken>0});
  if(!taken)throw preconditionFailure('到场后没有可取的资源');
  return {summary:`去${e.byId.get(a.to)?.name??a.to}${ACTIVITY[a.labor]??'劳动'}，得${e.byId.get(a.item)?.name??a.item}${taken}份。`,spent:{minutes:a.finishAt-a.departAt,coins:a.travelCoins}};
 }
});

registerAutonomyKind('labor_sale',{
 itinerary:true,
 minutes:(e,a)=>a.finishAt-a.departAt,
 validate(d,e,who,a,o){
  validateTrip(d,e,who,a,o);
  const keeper=d.get('state','npcs',a.keeper);
  if(!keeper||!isEffective(e,d.get('state'),a.keeper)||['死亡','濒死','昏迷','患病'].includes(keeper.status))throw preconditionFailure('收货人不能接待');
  for(let cursor=a.arriveAt;cursor<a.finishAt;){const s=scheduleAt(e,a.keeper,cursor,d.get('state'));if(!s||s.location!==a.to||!s.services?.includes('trade'))throw preconditionFailure('收货人没有接待窗口');cursor=s.until;}
 },
 start:startTrip,
 execute(d,e,who,a,{actionId,at}){
  const state=d.get('state'),keeper=state.npcs[a.keeper];
  if(!keeper||keeper.location!==a.to||keeper.scheduleTravel||keeper.cognitionTravel)throw preconditionFailure('收货人实际不在铺里');
  const read=reader(d.document),quantity=Math.min(a.quantity,saleableStock(read,e,who,a.item).available);
  if(quantity<1)throw preconditionFailure('可售存货已经没有了');
  const quote=keeperQuote(e,d.document,{seller:who,keeper:a.keeper,location:a.to,item:a.item,quantity});
  if(!(quote.totalCoins>0)||quote.totalCoins>(keeper.coins??0))throw preconditionFailure('收货人付不起货款');
  const resale=goodsWorth(read,e,{item:a.item,quantity,holder:a.keeper,location:a.to});
  if(npcDecision(subjectiveView(e,d.document,a.keeper),{kind:'buy',from:who,cost:{coins:quote.totalCoins},reward:resale??0}).outcome!=='agree')throw preconditionFailure('收货人不愿按这个价收');
  transferItems(d,e,who,a.keeper,a.item,quantity);
  moveCoins(d,{from:purse(e,a.keeper),to:purse(e,who),amount:quote.totalCoins,writer,eventId:actionId});
  mirrorPartyCoins(d,e,a.keeper,-quote.totalCoins,actionId,writer);mirrorPartyCoins(d,e,who,quote.totalCoins,actionId,writer);
  recordMarketDeal(d,quote,quote.totalCoins,quantity,actionId);
  laborRecord(d,actionId,{npc:who,labor:a.labor,side:'sell',buyer:a.keeper,from:a.from,to:a.to,location:a.to,minute:at,goods:[{item:a.item,quantity}],totalCoins:quote.totalCoins,success:true});
  return {summary:`把${e.byId.get(a.item)?.name??a.item}${quantity}份${a.labor==='carry'?'运到':'送到'}${e.byId.get(a.to)?.name??a.to}，卖给${e.byId.get(a.keeper)?.name??a.keeper}，得${quote.totalCoins}铜。`,spent:{minutes:a.finishAt-a.departAt,coins:a.travelCoins}};
 }
});
