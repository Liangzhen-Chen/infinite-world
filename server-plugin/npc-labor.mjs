// 职业驱动劳动（K3）：职业 → 劳动类别 → 当天的作息槽（一次真实往返的劳动行程）→ 产出、出售、运输。
// 劳动类别只来自职业数据的 labor 属性（professions.json，或 careers.json 同名职业）；人物的职业是名册登记的职业编号，
// 加上与职业名或别名完全一致的职业称谓。这里不认任何职业名、物品编号或地点编号。
// 劳动的去处由世界状态派生：采集取据点的有限资源（sites.mjs 的据点账），伐木取林木存量（forest-water，产物是聚落木料那一种存货），
// 加工是一趟生产行程：缺的投入就近去采或向有铺面的持货人买，再去获准使用的工位（本人的、公用的、付费的）按配方制作（原生 NPC 制作结算），带回成品；
// 出售与运输把本人可售的存货卖给有铺面的收货人，价格走已有的市场报价（稀缺随供给变化）。
// 卡 E2：出售、运输与贩运（去外地向持货人进货带回）不看职业名单，谁去由条件派生：成年、有本钱（钱或可卖的货）、
// 有运力（自己背得动，或货源地有承运），并且知道两地价差（本地行情看得见；外地只认本人在那里的成交与记得的行情，
// 否则只知道公开的区域价）。预期利润要大过路费、运费、工时、口粮、放弃的营业与途中风险（风险从路线的真实事故率与路程推出）。
// 每一项劳动由本人主观视图上的 npcDecision 决定（收益即这趟劳动的真实货值或货款，作为满足需要的量），
// 是否值得去由真实报价与工时价值比较得出（按需求排班）。
import {registerAutonomyProvider,registerAutonomyKind} from './autonomy-candidates.mjs';
import {registerAdvance} from './advance-registry.mjs';
import {recordsWhere} from './storage.mjs';
import {bodyRule} from './primitives-body.mjs';
import {preconditionFailure} from './precondition.mjs';
import {npcAgeAt,householdWorkTime} from './npc-state.mjs';
import {scheduleAt} from './npc-schedule.mjs';
import {personHousehold,placeSettlement,personEmployment} from './entity-view.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {stateReader,goodsWorth} from './valuation.mjs';
import {laborValue,marketQuote,saleableStock,recordMarketDeal,subjectiveMarketQuote,goodsClass,quoteSupply} from './market.mjs';
import {regionalTradeBase,tradeSources} from './settlement-trade.mjs';
import {localSpare,dealingStock} from './distribution.mjs';
import {carryRiskCost,transportServices,quoteTransport,bookTransport} from './transport.mjs';
import {changeItems,transferItems,heldUnit,wearItem} from './items.mjs';
import {bag,BOOKED,stockItem} from './stock.mjs';
import {forestSites,forestView,harvestForest} from './forest-water.mjs';
import {siteResources,siteTake,siteUnlock} from './sites.mjs';
import {shopOfKeeper,currentShops} from './shop.mjs';
import {safeCarryKg,carriedKg,packItemKg} from './carry.mjs';
import {purse,sink,moveCoins,mirrorPartyCoins} from './money.mjs';
import {npcDecision} from './npc-decision.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {holdingSet,declareHoldingWriter} from './holdings.mjs';
import {facilityView} from './facility-state.mjs';
import {npcProficiency} from './npc-growth.mjs';
import {npcCraft} from './npc-autonomy.mjs';
import {stationLicence,fixtureStations} from './workstation-services.mjs';
import {prepareNpcFurnace,readObjectState,storeObjectState,advanceThermalState} from './magic-object.mjs';
import {isItemClass} from './item-class.mjs';
import {environmentFeatures} from './environment-state.mjs';

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
// 每天投入劳动（走路与作业）的工时上限；整趟可以跨几天，按这个上限逐日排，其余时间在外歇宿。
const dailyLabor=e=>config(e).tripMinutes;

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
// 卡 E2：出售（sell）、跨聚落运输（carry）与贩运进货（haul）是派生的买卖劳动，任何成年人都可以做，值不值得做由候选的收益估算决定。
const TRADE_LABOR=Object.freeze(['carry','haul','sell']);
const laborAllowed=(e,state,who,labor)=>TRADE_LABOR.includes(labor)||laborCategories(e,state,who).includes(labor);
// 手艺管哪些加工：职业数据的 processing 属性；一道配方的加工类别是它的 processing，没有就是它要的工位类别。
export function processingCategories(e,state,id){
 const out=new Set();
 for(const p of npcProfessions(e,state,id))for(const c of p.processing??e.world.careers?.[p.id]?.processing??[])out.add(c);
 return out;
}
const recipeCategory=r=>r.processing??r.workstation;
const adult=(e,state,id,minute)=>(npcAgeAt(e,state,id,minute)??0)>=e.rules.npcLife.adultAge;

// ---- 劳动的去处 ----
// 同一决策时刻里同一段路、同一出发钟点只搜一次（一次决策会给许多人、许多候选排行程）。
const routeReads=new WeakMap();
function route(e,document,from,to,at){
 if(from===to)return {minutes:0,cost:0,edges:[]};
 const state=marketState(document.state);
 let rows=routeReads.get(state);if(!rows)routeReads.set(state,rows=new Map());
 const key=`${from}|${to}|${at}`;
 if(!rows.has(key)){let path=null;try{path=e.route(from,to,'walk',at,document.randomSeed);}catch{}rows.set(key,path);}
 return rows.get(key);
}
// 估价、报价与可售存货：各人在同一时刻（每日决策那一刻）按同一份行情去比较，这一刻里别人先排下的行程不改行情。
// 同一时刻、同一份聚落账的各人投影共用同一个状态做这些只读估价，让估价缓存跨人有效。
const marketStates=new WeakMap();
function marketState(state){
 const row=state.settlements&&marketStates.get(state.settlements);
 if(row?.minute===state.minute)return row.state;
 if(state.settlements)marketStates.set(state.settlements,{minute:state.minute,state});
 return state;
}
// 估价在同一决策时刻里只算一次。还没到手的货（要去采的、要做出来的）没有持有人，按本地市场估；手上的货按本人持有估。
const worthReads=new WeakMap();
function worth(e,state,{item,quantity,holder=null,location}){
 const shared=marketState(state);let rows=worthReads.get(shared);if(!rows)worthReads.set(shared,rows=new Map());
 const key=`${item}|${quantity}|${holder}|${location}`;
 if(!rows.has(key))rows.set(key,goodsWorth(stateReader(shared),e,{item,quantity,holder,location}));
 return rows.get(key);
}
const marketDocument=(document,who)=>{const state=marketState(document.state);return state===document.state?document:{...document,state};};
const homeSettlement=(e,state,id)=>personHousehold(e,state,id).value?.settlement??placeSettlement(e,state,state.npcs[id]?.location).value;
// 自然来源：每个来源给出地点、产物、每份工时与当前可取量；取用只经各自规律的账本入口。
function naturalSources(e,state,id,labor){
 const rows=[];
 // 据点：一趟劳动行程走得到的就是本地据点（行程核算在下面）；只去合法的，会被定罪的不去（sites.mjs 的同一条许可规律）。
 if(labor.includes('gather')){
  const settlement=homeSettlement(e,state,id);
  // 挡着资源的机关（锁、栅门）须本人具备条件真去解开：解开的工时计入作业，成功率折进期望收获；解不开的不去。
  for(const r of siteResources(e,state,{holder:id,settlement}))if(r.lawful&&r.gates&&r.remaining>0&&r.minutesPerUnit>0)
   rows.push({labor:'gather',location:r.site,item:r.item,minutesPerUnit:r.minutesPerUnit,available:r.remaining,source:`site:${r.site}:${r.resource}`,resource:r.resource,
    ...(r.gates.length?{gates:r.gates,setupMinutes:r.gates.reduce((n,g)=>n+g.minutes,0),odds:r.gates.reduce((n,g)=>n*g.odds,1)}:{})});
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
// 路线逐段：每条路段的分钟数按路段长度分摊整条路线的真实耗时（耗时与路费以引擎路线为准）。
function legs(e,from,path){
 const rows=(path.edges??[]).map(id=>e.world.routes.find(r=>r.id===id)),total=rows.reduce((n,r)=>n+(r?.lengthKm??0),0);
 let here=from,spent=0;
 return rows.map((row,i)=>{
  const next=row.from===here?row.to:row.from,minutes=i===rows.length-1?path.minutes-spent:Math.round(path.minutes*(total?(row.lengthKm??0)/total:1/rows.length));
  spent+=minutes;const leg={edge:row.id,from:here,to:next,minutes};here=next;return leg;
 });
}
// 一次往返的劳动行程，可以跨日：依次到各站作业（stops：地点与作业分钟），再回家。每天从出发的钟点起，走路与作业合计不超过每日劳动工时，其余时间在当地歇宿。
// 结果是逐段的作息槽（segments），整趟写成一条 market_trip，人物按它出门、过夜、作业、回家。
function itinerary(e,document,who,stops,at,from=document.state.npcs[who].location){
 if(!from||!stops.length||stops.some(s=>!(s.work>0)))return null;
 const daily=dailyLabor(e),hour=at%DAY,segments=[],marks=[],outboundEdges=[];let t=at,used=0,here=from,travelCoins=0;
 const rest=()=>{const until=Math.floor(t/DAY)*DAY+DAY+hour;segments.push({start:t,end:until,location:here,activity:'在外歇宿',rest:true});t=until;used=0;};
 const walk=path=>{
  let chunk=null;
  for(const leg of legs(e,here,path)){
   if(used>0&&used+leg.minutes>daily){if(chunk)segments.push(chunk);chunk=null;rest();}
   chunk??={start:t,end:t,activity:'劳动途中',travel:{from:here,to:here,edges:[]}};
   t+=leg.minutes;used+=leg.minutes;here=leg.to;chunk.end=t;chunk.travel.to=here;chunk.travel.edges.push(leg.edge);
  }
  if(chunk)segments.push(chunk);
  travelCoins+=path.cost??0;
 };
 for(const [i,stop] of stops.entries()){
  const path=route(e,document,here,stop.location,t);if(!path)return null;
  walk(path);outboundEdges.push(...path.edges??[]);const arriveAt=t;
  for(let left=stop.work;left>0;){if(used>=daily)rest();const w=Math.min(left,daily-used);segments.push({start:t,end:t+w,location:stop.location,work:true,stop:i});t+=w;used+=w;left-=w;}
  marks.push({...stop,arriveAt,finishAt:t});
 }
 const back=route(e,document,here,from,t);if(!back)return null;
 walk(back);
 const nights=segments.filter(s=>s.rest).length,activeMinutes=segments.filter(s=>!s.rest).reduce((n,s)=>n+s.end-s.start,0),last=marks.at(-1);
 return {from,to:last.location,stops:marks,departAt:at,arriveAt:last.arriveAt,finishAt:last.finishAt,returnAt:t,firstDayEnd:segments.find(s=>s.rest)?.start??t,nights,activeMinutes,
  work:marks.reduce((n,s)=>n+s.work,0),travelCoins,outboundEdges,inboundEdges:back.edges??[],segments};
}
// ---- 劳动行程占用的作息：出发时刻与放弃的营业 ----
const SLEEP=/睡眠|睡觉|熟睡/,MOVING=/赶路|前往|返回/;
// 一趟行程碰到本人的营业（作息里开着 trade 的时段）、受雇当班或在自己的工作处做活，就要放弃这段收入，计入行程成本：
// 营业按本人近期七日真实成交的日均货款折到每分钟（没有成交记录时，按留在铺上的可售存货货值算作一天能卖出的上限；这趟带走去卖的货不算在内）；当班按受雇合同的工价折到每分钟。
// 已有人按行程来本人这里取货（市场行程登记的接待窗口），那段时间不能走。授课只是可预约时不算占用。
// 本人名下的炉火还烧着（照管中），行程不能把人带离它（leavesFire），这是硬约束而不是可折算的损失：火不离人。
// 本人一天的营业分钟与铺上货值，同一状态里只读一次（一次决策会比较多个出发时刻与多条行程）。
const shopReads=new WeakMap();
function shopRead(e,state,who,day,key,read){
 let rows=shopReads.get(state);if(!rows)shopReads.set(state,rows=new Map());
 const k=`${who}|${day}|${key}`;if(!rows.has(k))rows.set(k,read());return rows.get(k);
}
// 本人一天的作息（按日切开的时段），同一状态里每天只读一次。
function daySlots(e,state,who,day){
 return shopRead(e,state,who,day,'slots',()=>{const out=[];for(let cursor=day;cursor<day+DAY;){const slot=scheduleAt(e,who,cursor,state);if(!slot){out.push({start:cursor,end:day+DAY,slot:null});break;}const end=Math.min(day+DAY,Math.max(cursor+1,slot.until));out.push({start:cursor,end,slot});cursor=end;}return out;});
}
function slotsBetween(e,state,who,from,to){
 const out=[];
 for(let day=Math.floor(from/DAY)*DAY;day<to;day+=DAY)for(const row of daySlots(e,state,who,day))if(row.end>from&&row.start<to)out.push({start:Math.max(from,row.start),end:Math.min(to,row.end),slot:row.slot});
 return out;
}
// 本人的工作处：名册登记的 workplace（状态里改过的以状态为准）。在那里醒着的作息时段就是本人当班做活。
const workplaceOf=(e,state,who)=>state.npcs[who]?.workplace?.location??e.byId.get(who)?.workplace?.location??null;
function onDuty(slot,place){return Boolean(place)&&slot.location===place&&!slot.travel&&!SLEEP.test(slot.activity??'');}
// 自家活计的工价：本人一天的工价（laborValue，按技能阶段派生）摊到当天在工作处当班的分钟上。
function dutyRate(e,document,who,day,place){
 const minutes=daySlots(e,document.state,who,day).reduce((n,r)=>n+(r.slot&&onDuty(r.slot,place)&&!r.slot.services?.includes('trade')?r.end-r.start:0),0);
 return minutes?laborValue(e,document,{worker:who,observer:who}).daily/minutes:0;
}
function forgone(e,document,who,trip,taken={}){
 const state=document.state,day=Math.floor(trip.departAt/DAY)*DAY;let trade=0,work=0,duty=0;
 const job=personEmployment(e,state,who,trip.departAt)?.value,place=workplaceOf(e,state,who);
 if(leavesFire(e,document,who,trip))return Infinity;
 // 行程里走路与作业的分钟（不含在外歇宿）：落在当班时段里的那部分，工时成本已按工价算进行程，不再重复记作放弃的活计。
 const active=(trip.segments??[]).filter(s=>!s.rest);
 const busy=(start,end)=>active.reduce((n,s)=>n+Math.max(0,Math.min(end,s.end)-Math.max(start,s.start)),0);
 for(const {start,end,slot} of slotsBetween(e,state,who,trip.departAt,trip.returnAt)){
  if(!slot)return Infinity;
  if(slot.marketTrip&&!slot.travel&&slot.activity==='接待顾客')return Infinity;
  if(slot.services?.includes('trade'))trade+=end-start;
  else if(job&&slot.location===job.location&&slot.production!==false&&!SLEEP.test(slot.activity??''))work+=end-start;
  else if(onDuty(slot,place))duty+=end-start-busy(start,end);
 }
 let loss=0;
 if(trade){
  const open=daySlots(e,state,who,day).reduce((n,r)=>n+(r.slot?.services?.includes('trade')?r.end-r.start:0),0);
  const since=trip.departAt-7*DAY,sales=recordsWhere(state.records,'category','market_trade').filter(r=>r.seller===who&&r.minute>=since&&r.minute<=state.minute);
  const read=stateReader(marketState(state,who)),shelf=()=>Object.keys(state.npcs[who]?.inventory??{}).reduce((n,item)=>{
   const q=shopRead(e,state,who,day,`q:${item}`,()=>saleableStock(read,e,who,item).available)-(taken[item]??0);
   return q>0?n+(shopRead(e,state,who,day,`w:${item}:${q}`,()=>worth(e,state,{item,quantity:q,holder:who,location:state.npcs[who].location})??0)):n;},0);
  const daily=sales.length?sales.reduce((n,r)=>n+r.totalCoins,0)/7:shelf();
  loss+=Math.ceil(daily*trade/Math.max(open,1));
 }
 // 当班的工钱按合同的日薪与每日工时折到每分钟；合同缺这两项是数据错误，不用缺省值顶替。
 if(work&&job){
  if(!Number.isSafeInteger(job.wage)||job.wage<0||!Number.isSafeInteger(job.workMinutes)||job.workMinutes<1)throw Error(`受雇合同 ${job.id} 须登记 wage 与 workMinutes（整数）`);
  loss+=Math.ceil(job.wage*work/job.workMinutes);
 }
 // 在自己的工作处当班做活：离开的那些时段按自家活计的工价放弃。
 if(duty>0)loss+=Math.ceil(dutyRate(e,document,who,day,place)*duty);
 return loss;
}
// 可以出发的时刻：眼下，以及此后一天内本人作息里每段醒着、不在路上、不营业也不当班的空闲时段的开头（比如营业前的清晨、收工之后）。出发地是那时本人所在的地方。
function departures(e,state,who,at){
 const out=[{at,from:state.npcs[who]?.location}],place=workplaceOf(e,state,who),job=personEmployment(e,state,who,at)?.value;
 let previous=null;
 for(const {start,slot} of slotsBetween(e,state,who,at,at+DAY)){
  if(!slot)break;
  const free=slot.location&&!slot.travel&&!SLEEP.test(slot.activity??'')&&!MOVING.test(slot.activity??'')&&!slot.services?.includes('trade')&&!onDuty(slot,place)&&slot.location!==job?.location;
  if(start>at&&free&&!previous&&out.length<4)out.push({at:start,from:slot.location});
  previous=free;
 }
 return out.filter(d=>d.from);
}
// 同一组作业先按眼下出发排一趟；它若耽误营业或活计，再看别的可出发时刻：把这趟原样挪过去先估放弃的收入，只对最省的那个时刻重排路线
// （要到场接待的对方得在那时开着门）。取放弃的收入最少的，一样少就取眼下这趟。
function plannedTrip(e,document,who,stops,at,taken,ok=()=>true){
 const [now,...later]=departures(e,document.state,who,at),priced=trip=>{if(!trip||!ok(trip))return null;const lost=forgone(e,document,who,trip,taken);return Number.isFinite(lost)?{...trip,forgone:lost}:null;};
 const first=now?priced(itinerary(e,document,who,stops,now.at,now.from)):null;
 if(first?.forgone===0||!later.length)return first;
 const span=first?first.returnAt-first.departAt:null;
 const guess=span===null?later[0]:later.map(d=>({d,lost:forgone(e,document,who,{departAt:d.at,returnAt:d.at+span,segments:first.segments.map(s=>({...s,start:s.start+d.at-first.departAt,end:s.end+d.at-first.departAt}))},taken)})).sort((x,y)=>x.lost-y.lost||x.d.at-y.d.at)[0];
 if(span!==null&&!(guess.lost<first.forgone))return first;
 const other=priced(itinerary(e,document,who,stops,(guess.d??guess).at,(guess.d??guess).from));
 return !first||other&&other.forgone<first.forgone?other??first:first;
}
// 在外过夜的口粮：家户自给的那种粮，按身体每日饱腹消耗折份。它是成本，也占负重，所以一趟能走多远由负重与储粮派生。
// 世界没有登记自给口粮时，在外过夜就无从备粮：当天往返之外的行程不成立。
function rations(e,nights){
 if(!nights)return {item:null,quantity:0};
 const food=e.byId.get(e.rules.householdSubsistence?.foodItem);if(!food?.nutrition?.satiety)return null;
 const perDay=Math.ceil(bodyRule(e,'satiety').drainPerHour.light*24/food.nutrition.satiety);
 return {item:food.id,quantity:nights*perDay};
}
function tripCost(e,document,who,view,trip,home){
 const food=rations(e,trip.nights),read=stateReader(marketState(document.state,who));if(!food)return null;
 const meals=food.quantity?worth(e,document.state,{item:food.item,quantity:food.quantity,holder:who,location:home})??Infinity:0;
 return {coins:trip.travelCoins,value:laborCost(e,document,who,view,trip.activeMinutes)+meals+(trip.forgone??0)};
}
function carryRoom(e,document,who,item,food=null){
 const d=reader(document),kg=packItemKg(d,e,who,item),load=food?.quantity?food.quantity*packItemKg(d,e,who,food.item):0;
 return kg>0?Math.max(0,Math.floor((safeCarryKg(d,e,who)-carriedKg(d,e,who)-load)/kg)):Infinity;
}
function laborCost(e,document,who,view,minutes){return Math.ceil(laborValue(e,document,{worker:who,observer:who,view}).daily*minutes/480);}

export function laborCandidates(e,view,document){
 const state=document.state,who=view.observer,labor=laborCategories(e,state,who),at=view.minute,out=[];
 if(!adult(e,state,who,at))return out;
 const read=stateReader(marketState(state,who)),home=view.self.location,day=Math.floor(at/DAY);
 // 采集与伐木：作业量按据点存量与负重定（口粮也占负重），值不值得去看货值与总工时、路费、口粮的比较。
 if(activeTrip(state,who,at))return out;
 for(const s of naturalSources(e,state,who,labor)){
  let quantity=Math.min(s.available,carryRoom(e,document,who,s.item));if(!(quantity>=1))continue;
  // 货值连作业工时都抵不过，就不必排路线。
  const setup=s.setupMinutes??0,odds=s.odds??1,gateCost=gateMaterials(e,state,s,home);
  if(!(outletWorth(e,document,view,who,{item:s.item,quantity,home,at})*odds>laborCost(e,document,who,view,quantity*s.minutesPerUnit+setup)+gateCost))continue;
  let trip=plannedTrip(e,document,who,[{location:s.location,work:quantity*s.minutesPerUnit+setup}],at);if(!trip)continue;
  // 口粮占的负重可能挤掉几份货：按带上口粮后的负重重算一次。
  const food=rations(e,trip.nights);if(!food)continue;
  const room=carryRoom(e,document,who,s.item,food);
  if(room<quantity){quantity=room;if(quantity<1)continue;trip=plannedTrip(e,document,who,[{location:s.location,work:quantity*s.minutesPerUnit+setup}],at);if(!trip)continue;}
  const value=outletWorth(e,document,view,who,{item:s.item,quantity,home,at})*odds;if(!Number.isFinite(value))continue;
  const priced=tripCost(e,document,who,view,trip,home),cost=priced&&{...priced,value:priced.value+gateCost};if(!cost)continue;
  const utility=value-cost.coins-cost.value;
  if(!(utility>0))continue;
  out.push({id:`labor:${who}:${day}:${s.source}`,kind:'labor',legacy:{kind:'labor_work',labor:s.labor,item:s.item,quantity,source:s.source,...(s.resource?{resource:s.resource}:{}),...(s.tool?{tool:s.tool}:{}),...(s.gates?{gates:s.gates,setupMinutes:setup}:{}),minutesPerUnit:s.minutesPerUnit,...trip},
   cost:{coins:cost.coins,value:cost.value,minutes:trip.activeMinutes},reward:value,needSatisfaction:value,utility});
 }
 // 出售与运输：本人可售的存货卖给有铺面的收货人（收不收由收货人按转卖所得决定）；跨聚落的就是运输（卡 E2：不看职业，条件派生）。
 // 自己有铺面的人在本铺零售（已有的店铺规律），不把铺货送去本地别家；跨聚落去卖时，放弃的营业算进成本（forgone）。
 if(!activeTrip(state,who,at)){
  const settlement=homeSettlement(e,state,who),inventory=state.npcs[who]?.inventory??{},shop=shopOfKeeper(e,who,state),own=shop&&!shop.surplus;// 只卖余货的摊（没有营业时段）照样挑去别家卖

  for(const item of Object.keys(inventory).sort()){
   const available=saleableStock(read,e,who,item).available;if(!(available>0)||!e.byId.get(item)?.basePrice)continue;
   // 先按报价比一遍收货人：本地的都看；外地的只看报价最高、且高过本地最好报价的那一家（更差的去处不必排路线）。
   const capacity=Math.min(available,carryRoom(e,document,who,item));if(!(capacity>=1))continue;
   const offers=[];
   for(const b of buyers(e,state,who,item)){
    const remote=placeSettlement(e,state,b.location).value!==settlement;
    if(!remote&&own)continue;
    const quote=remote?knownQuote(e,document,view,{seller:who,keeper:b.keeper,location:b.location,item,quantity:capacity}):tryQuote(()=>keeperQuote(e,marketDocument(document,who),{seller:who,keeper:b.keeper,location:b.location,item,quantity:capacity}));
    // 货款连在铺里交货的工时都抵不过，就不必排路线。
    if(!quote||!(quote.totalCoins>laborCost(e,document,who,view,config(e).saleMinutes))||quote.totalCoins>(state.npcs[b.keeper]?.coins??0))continue;
    offers.push({b,remote,quote});
   }
   const bestLocal=Math.max(0,...offers.filter(o=>!o.remote).map(o=>o.quote.totalCoins));
   const bestRemote=offers.filter(o=>o.remote&&o.quote.totalCoins>bestLocal).sort((x,y)=>y.quote.totalCoins-x.quote.totalCoins||x.b.keeper.localeCompare(y.b.keeper))[0];
   for(const {b,remote,quote:offer} of offers.filter(o=>!o.remote||o===bestRemote)){
    // 收货人货架上本就经营这件货的，只收到货架上限为止（卖不掉的不收）。
    const shelfRow=shopOfKeeper(e,b.keeper,state)?.restock?.find(r=>r.item===item),shelfRoom=shelfRow?Math.floor(shelfRow.maximum-e.quantity(read,b.keeper,item)):Infinity;
    let quantity=Math.min(capacity,shelfRoom),quote=offer;if(!(quantity>=1))continue;
    if(quantity<capacity){quote=remote?knownQuote(e,document,view,{seller:who,keeper:b.keeper,location:b.location,item,quantity}):tryQuote(()=>keeperQuote(e,marketDocument(document,who),{seller:who,keeper:b.keeper,location:b.location,item,quantity}));if(!quote)continue;}
    const trip=plannedTrip(e,document,who,[{location:b.location,work:config(e).saleMinutes}],at,{[item]:quantity},t=>receiving(e,state,b.keeper,t.stops[0]));if(!trip)continue;
    const food=rations(e,trip.nights);if(!food)continue;
    const room=carryRoom(e,document,who,item,food);
    if(room<quantity){quantity=room;if(quantity<1)continue;quote=remote?knownQuote(e,document,view,{seller:who,keeper:b.keeper,location:b.location,item,quantity}):tryQuote(()=>keeperQuote(e,marketDocument(document,who),{seller:who,keeper:b.keeper,location:b.location,item,quantity}));if(!quote)continue;}
    // 可售存货（saleableStock 已扣除本人与家户的自留）是待售的货，值不值得送去卖看货款能否抵过工时、路费与途中风险。
    const cost=tripCost(e,document,who,view,trip,home);if(!cost)continue;
    const risk=carryRiskCost(document,e,{edges:trip.outboundEdges,cargo:[{item,quantity}],carrier:who});
    const utility=quote.totalCoins-cost.coins-cost.value-risk;
    if(!(utility>0))continue;
    out.push({id:`labor:${who}:${day}:sale:${item}:${b.keeper}`,kind:'labor',legacy:{kind:'labor_sale',labor:remote?'carry':'sell',item,quantity,keeper:b.keeper,...trip},
     cost:{coins:cost.coins,value:cost.value+risk,minutes:trip.activeMinutes},reward:quote.totalCoins,needSatisfaction:quote.totalCoins,utility});
   }
  }
  out.push(...haulCandidates(e,view,document));
 }
 // 加工：一趟生产行程（取得投入、去工位、制作、带回），值不值得看成品货值减去投入、工坊费、工时、路费与口粮。
 if(labor.includes('process'))out.push(...processCandidates(e,view,document));
 return out;
}
// ---- 买卖劳动的估价（卡 E2）----
const tryQuote=read=>{try{return read();}catch{return null;}};
// 知道两地价差：本地行情看得见；外地只认本人在那里的成交与记得的行情（subjectiveMarketQuote），
// 没见过的只知道公开的区域价（产地远近、季节、路况；settlement-trade.regionalTradeBase），不知道那里的存货与需求，按中性供需估。
function knownQuote(e,document,view,{seller,buyer,keeper,location,item,quantity}){
 const business={...shopOfKeeper(e,keeper,document.state),keeper},args={item,location,seller,buyer,quantity,business};
 const seen=tryQuote(()=>subjectiveMarketQuote(e,document,view,args));
 if(seen&&seen.knownFrom!=='catalog_prior')return seen;
 return haulRead(document.state,`public|${item}|${location}|${seller}|${buyer}|${keeper}|${quantity}`,()=>{
  const d=reader(document),place=placeSettlement(e,document.state,location).value??location;
  return tryQuote(()=>marketQuote(d,e,{...args,base:regionalTradeBase(d,e,item,location),supply:{place,goods:goodsClass(e,item),supply:1,demand:1}}));
 });
}
// ---- 可实现价（卡 E2）：外地的需求经价格传回生产者 ----
// 产出（采来的、做出来的）值多少，取就地的货值与“运到外地有铺面的收货人那里卖”的可实现价中高者：
// 外地价是那里的市场报价（供需与区域价都在里面），再扣掉来回路上的工时、路费与途中风险（同买卖劳动一个口径）。
// 每个外地聚落看一位收货人（货架上经营这件货的优先，再按编号）；同一决策时刻里按货、量、出发地只算一次。不按物品分支。
function outletWorth(e,document,view,who,{item,quantity,home,at}){
 const state=document.state,local=worth(e,state,{item,quantity,location:home})??0;
 const settlement=placeSettlement(e,state,home).value;if(!(quantity>=1)||!settlement)return local;
 // 外地的需求怎么传回来：那里有铺面的人货架上经营这件货（收货的订单），或本人知道那里的行情（见过的成交、记得的价）。
 // 价按本人所知（knownQuote：见过的价，否则公开的区域价）；每个外地聚落看一位这样的收货人。
 const outlets=haulRead(state,`outlet|${item}|${home}|${at}`,()=>{
  const bySettlement=new Map();
  for(const b of buyers(e,state,null)){
   const sid=placeSettlement(e,state,b.location).value;if(!sid||sid===settlement||bySettlement.has(sid))continue;
   if(shopOfKeeper(e,b.keeper,state)?.restock?.some(r=>r.item===item&&!r.own))bySettlement.set(sid,b);
  }
  return [...bySettlement.values()].sort((x,y)=>x.keeper.localeCompare(y.keeper)).map(b=>({...b,path:route(e,document,home,b.location,at)})).filter(b=>b.path);
 });
 let best=local;
 for(const o of outlets){
  const quote=knownQuote(e,document,view,{seller:who,buyer:o.keeper,keeper:o.keeper,location:o.location,item,quantity});if(!quote)continue;
  const gross=Math.min(state.npcs[o.keeper]?.coins??0,quote.totalCoins);if(!(gross>best))continue;
  best=Math.max(best,gross-2*(o.path.cost??0)-laborCost(e,document,who,view,2*o.path.minutes)-carryRiskCost(document,e,{edges:o.path.edges,cargo:[{item,quantity}],carrier:who}));
 }
 return best;
}
// ---- 贩运进货（卡 E2）：本地进不到的货，去外地向持货人买来，带回（自己背或在货源地托运）----
// 要的货：本人货架上（或经营者平常的存货，distribution.dealingStock）卖缺的；或者本地有铺面的人货架上卖缺的——买来转卖给他。
// 本地持货人眼下有余量可出让的，不必远行（本地补货另有规律）。货源是这件货的真实货源聚落（settlement-trade.tradeSources），
// 由近到远，找第一个有铺面、手上有这件可卖的货的人。同一决策时刻里，各聚落的缺货与货源只算一次。
const haulReads=new WeakMap();
function haulRead(state,key,read){
 const shared=marketState(state);let rows=haulReads.get(shared);if(!rows)haulReads.set(shared,rows=new Map());
 if(!rows.has(key))rows.set(key,read());return rows.get(key);
}
function localGaps(e,document,settlement){
 return haulRead(document.state,`gaps|${settlement}`,()=>{
  const d=reader(document),rows=[];
  for(const shop of currentShops(e,document.state))if(shop.settlement===settlement)for(const r of shop.restock??[]){
   if(r.source==='settlement'||r.own)continue;
   const gap=r.maximum-e.quantity(d,shop.keeper,r.item);if(gap>=1)rows.push({item:r.item,quantity:gap,keeper:shop.keeper,location:shop.location});
  }
  return rows;
 });
}
const spareHere=(e,document,settlement,item,buyer)=>haulRead(document.state,`spare|${settlement}|${item}|${buyer}`,()=>localSpare(reader(document),e,{settlement,item,buyer}));
function haulWants(e,document,who,settlement){
 const own=shopOfKeeper(e,who,document.state),usual=own?Object.fromEntries((own.restock??[]).filter(r=>r.source!=='settlement'&&!r.own).map(r=>[r.item,r.maximum])):dealingStock(e,who),d=reader(document),rows=[];
 for(const [item,n] of Object.entries(usual).sort()){const gap=n-e.quantity(d,who,item);if(gap>=1)rows.push({item,quantity:gap,keeper:null});}
 for(const g of localGaps(e,document,settlement))if(g.keeper!==who)rows.push(g);
 return rows.filter(r=>spareHere(e,document,settlement,r.item,r.keeper??who)<1);
}
function haulSeller(e,document,who,item,settlement,home,at){
 return haulRead(document.state,`seller|${item}|${settlement}|${home}|${at}`,()=>{
  const state=document.state,read=stateReader(marketState(state)),sources=new Set(tradeSources(reader(document),e,item).filter(s=>s!==settlement));
  if(!sources.size)return null;
  const rows=buyers(e,state,null).filter(b=>sources.has(placeSettlement(e,state,b.location).value))
   .map(b=>({...b,stock:Math.floor(saleableStock(read,e,b.keeper,item,{business:true}).available)})).filter(b=>b.stock>=1)
   .map(b=>({...b,path:route(e,document,home,b.location,at)})).filter(b=>b.path);
  return rows.sort((x,y)=>x.path.minutes-y.path.minutes||x.keeper.localeCompare(y.keeper))[0]??null;
 });
}
function haulCandidates(e,view,document){
 const state=document.state,who=view.observer,at=view.minute,home=view.self.location,out=[];
 const settlement=homeSettlement(e,state,who);if(!settlement||!((state.npcs[who]?.coins??0)>0))return out;
 for(const want of haulWants(e,document,who,settlement)){
  const seller=haulSeller(e,document,who,want.item,settlement,home,at);if(!seller||seller.keeper===who)continue;
  const plan=haulPlan(e,document,view,who,want,seller,home,at);if(plan)out.push(plan);
 }
 return out;
}
function haulPlan(e,document,view,who,want,seller,home,at){
 const state=document.state,day=Math.floor(at/DAY),item=want.item,coins=state.npcs[who].coins??0,to=want.keeper?want.location:home;
 const buy=n=>knownQuote(e,document,view,{seller:seller.keeper,buyer:who,keeper:seller.keeper,location:seller.location,item,quantity:n});
 // 卖给本地收货人的货款：本地行情（供需）在同一决策时刻里各人共用一份（货还没到手，按标准品级）。
 const value=n=>want.keeper?haulRead(state,`resale|${want.keeper}|${item}|${n}`,()=>{
  const d=reader(marketDocument(document,who)),business={...shopOfKeeper(e,want.keeper,state),keeper:want.keeper};
  const supply=haulRead(state,`resale-supply|${want.keeper}|${item}`,()=>tryQuote(()=>quoteSupply(d,e,{item,location:want.location,business})));
  return supply?tryQuote(()=>marketQuote(d,e,{item,location:want.location,seller:null,buyer:want.keeper,quantity:n,business,supply}))?.totalCoins:null;
 }):worth(e,state,{item,quantity:n,holder:who,location:home});
 const quantity=Math.min(want.quantity,seller.stock);
 // 估一眼：货到了值的钱连货款都抵不过，就不必排路线。
 const first=quantity>=1?buy(quantity):null;if(!first||!((value(quantity)??0)>first.totalCoins))return null;
 const stops=[{location:seller.location,work:config(e).saleMinutes,acts:[{kind:'buy',keeper:seller.keeper,item}]},...want.keeper?[{location:want.location,work:config(e).saleMinutes,acts:[{kind:'sell',keeper:want.keeper,item}]}]:[]];
 const trip=plannedTrip(e,document,who,stops,at,{},t=>t.stops.every(stop=>receiving(e,state,stop.acts[0].keeper,stop)));if(!trip)return null;
 const food=rations(e,trip.nights);if(!food)return null;
 const cost=tripCost(e,document,who,view,trip,home);if(!cost)return null;
 const budget=coins-trip.travelCoins,afford=(limit,extra=()=>0)=>{let low=0,high=limit;while(low<high){const mid=Math.ceil((low+high)/2);if((buy(mid)?.totalCoins??Infinity)+extra(mid)<=budget)low=mid;else high=mid-1;}return low;};
 const back=route(e,document,seller.location,to,trip.stops[0].finishAt)?.edges??[];
 const plans=[];
 // 自己背回：一趟背得动的量（口粮也占负重）；途中风险自担。
 const carried=afford(Math.min(quantity,carryRoom(e,document,who,item,food)));
 if(carried>=1)plans.push({quantity:carried,freight:0,risk:carryRiskCost(document,e,{edges:back,cargo:[{item,quantity:carried}],carrier:who}),ship:null});
 // 在货源地托运回家（只给自己的货架进货时）：承运的路程、时间、运费、关税与途中事故都走 transport；风险已在运价里（承运人担责）。
 if(!want.keeper)for(const service of transportServices(e,document,seller.location)){
  const ship=n=>tryQuote(()=>quoteTransport(reader(document),e,{asset:service.asset,from:seller.location,to:home,cargo:[{item,quantity:n}],owner:who}));
  const n=afford(Math.min(want.quantity,seller.stock),m=>ship(m)?.total??Infinity),q=n>=1?ship(n):null;
  if(q)plans.push({quantity:n,freight:q.total,risk:0,ship:{asset:service.asset,to:home}});
 }
 let best=null;
 for(const p of plans){
  const bill=buy(p.quantity),worthHome=value(p.quantity);if(!bill||!worthHome)continue;
  const utility=worthHome-bill.totalCoins-p.freight-cost.coins-cost.value-p.risk;
  if(utility>0&&(!best||utility>best.utility))best={...p,bill,worthHome,utility};
 }
 if(!best)return null;
 // 本钱：到了货源地最多肯付的货款——付到这趟不赚不赔为止，也不超过路费之外手上的钱。
 const pay=Math.floor(Math.min(budget-best.freight,best.worthHome-best.freight-cost.coins-cost.value-best.risk));
 const legacyStops=trip.stops.map((stop,i)=>({...stop,acts:stop.acts.map(act=>({...act,quantity:best.quantity,...act.kind==='buy'?{coins:pay}:{}})),...i===0&&best.ship?{ship:best.ship}:{}}));
 return {id:`labor:${who}:${day}:haul:${item}:${seller.keeper}`,kind:'labor',legacy:{kind:'labor_haul',labor:'haul',...trip,item,quantity:best.quantity,coins:pay+best.freight,stops:legacyStops},
  cost:{coins:cost.coins+best.bill.totalCoins+best.freight,value:cost.value+best.risk,minutes:trip.activeMinutes},reward:best.worthHome,needSatisfaction:best.worthHome,utility:best.utility};
}
// ---- 热工位：工位登记了 thermalRequirement，工序全程要照管炉火 ----
// 与 NPC 就地照管炉火同一口径（magic-object.prepareNpcFurnace）：热源须是本人的或公开的；火只能续、不能凭空点着，
// 到场时炉子得还烧着；整个工序缺的炉料由本人添，炉料是热源认的燃料（热账的燃料表，且属燃料类）。
// 预测按同一份真实热账（advanceThermalState）逐分钟推：先推到到场，再添料推完工序，温度或燃烧不满足就不去；
// 窑的器壁裂损按预测的应力增量折进期望成品（与结算 kilnWorkResult 同一公式）。
function heatSource(e,location,station){const id=station?.thermalRequirement?.feature;return id?environmentFeatures(e).find(f=>f.id===id&&f.location===location&&f.thermalModel)??null:null;}
// 本人名下的热源（按名册一次建表）。
const heatOwners=new WeakMap();
function ownHeat(e,who){
 const key=e.advanceFeatures??e.world;let rows=heatOwners.get(key);
 if(!rows){rows=new Map();for(const f of environmentFeatures(e))if(f.thermalModel&&f.owner){if(!rows.has(f.owner))rows.set(f.owner,[]);rows.get(f.owner).push(f);}heatOwners.set(key,rows);}
 return rows.get(who)??[];
}
// 火没熄不离人：本人名下到出发时还烧着的热源（照管中的炉火）在哪，行程就不能把人带离那里。
function leavesFire(e,document,who,trip){
 for(const row of ownHeat(e,who)){
  const t=heatNow(e,document,row);if(!t?.burning)continue;
  let s;try{s=advanceThermalState(t,row.thermalModel,Math.max(t.lastMinute,trip.departAt),{effects:Object.values(document.state.effects??{}),target:row.id});}catch{continue;}
  if(s.burning&&(trip.segments??[]).some(g=>g.travel||g.location!==row.location))return true;
 }
 return false;
}
const heatAllowed=(row,who)=>Boolean(row)&&(row.owner===who||row.access==='public');
function heatNow(e,document,row){try{return readObjectState(reader(document),row).thermal??null;}catch{return null;}}
// 到场时刻 arriveAt 起做 minutes 分钟：返回 {missingMg, fuels（可选的燃料及份数）, risk（裂损比例）}；炉火撑不到或温度不对返回 null。
function furnaceForecast(e,document,who,location,station,{arriveAt,minutes}){
 const row=heatSource(e,location,station),req=station.thermalRequirement;if(!heatAllowed(row,who))return null;
 const m=row.thermalModel,now=heatNow(e,document,row);if(!now?.burning||now.moistureMg)return null;
 const effects=Object.values(document.state.effects??{});let s;
 try{s=advanceThermalState(now,m,Math.max(now.lastMinute,arriveAt),{effects,target:row.id});}catch{return null;}
 if(!s.burning)return null;
 const missing=Math.max(0,minutes*m.burnMgPerMinute+1-s.fuelMg);
 const fuels=missing?m.fuels.filter(f=>isItemClass(e,f.item,'fuel')).map(f=>({item:f.item,quantity:Math.ceil(missing/f.milligramsPerUnit),milligrams:Math.ceil(missing/f.milligramsPerUnit)*f.milligramsPerUnit})).filter(f=>f.quantity>=1&&f.quantity<=100):[];
 if(missing&&!fuels.length)return null;
 const start={...s,fuelMg:s.fuelMg+(fuels[0]?.milligrams??0),fuelAddedMg:s.fuelAddedMg+(fuels[0]?.milligrams??0)},ok=t=>{const c=t.energyJ/m.heatCapacityJPerC;return c>=req.minimumC&&c<=req.maximumC&&(!req.burning||t.burning);};
 if(!ok(start))return null;
 let t=start;
 try{for(let k=1;k<=minutes;k++){t=advanceThermalState(t,m,t.lastMinute+1,{effects,target:row.id});if(!ok(t))return null;}}catch{return null;}
 const risk=m.kiln?Math.min(1000,(t.crackStressUnits-start.crackStressUnits)*m.kiln.crackPermillePerStress)/1000:0;
 return {feature:row.id,missingMg:missing,fuels,risk,kiln:Boolean(m.kiln)};
}
// ---- 加工的生产行程 ----
// 能做这道配方的地方：不要工位的就地做（配方指定了地点就去那里）；要工位的，是按工位现状（facilityView）可用的同类工位，
// 和采集、采买一样只在本聚落里找（一趟行程走得到）。能不能用只看工位许可（stationLicence：产权、居住、租约、许可或收费），收费的照付工坊费。
// 没有许可的工位，用了就是擅用（K6），这里不去。热工位另要热源是本人的或公开的、眼下还烧着（点不着冷炉）。
function workPlaces(e,document,who,settlement,kinds){
 const state=document.state,out=[];
 for(const place of [...e.world.locations,...Object.values(state.created??{}).filter(p=>p?.id&&!e.byId.has(p.id))]){
  if(!fixtureStations(state.created?.[place.id]??place).some(s=>kinds.has(s.kind))||placeSettlement(e,state,place.id).value!==settlement)continue;
  const v=facilityView(e,state,place.id,who);if(!v?.workstations?.length)continue;
  for(const station of v.workstations){
   if(!kinds.has(station.kind))continue;
   if(station.thermalRequirement){const row=heatSource(e,place.id,station);if(!heatAllowed(row,who)||!heatNow(e,document,row)?.burning)continue;}
   const licence=stationLicence(e,document,station,who);
   if(!licence)continue;
   out.push({location:place.id,station,factor:v.factor||1,fee:licence.basis==='paid'?station.fee??0:0});
  }
 }
 return out;
}
// 缺的投入从哪来：本人职业做得了采集的，去本地据点与林木自己采（与采集劳动同一套来源与许可）；或向本聚落有铺面的持货人按市场报价买。
function supplies(e,document,who,item,quantity,settlement,local){
 const out=[];
 // 生产要的料须拿得准：挡着的机关得本人必定解得开（元素状态或稳过检定）且不耗材料，解开的工时计入这一站。
 for(const s of local.natural)if(s.item===item&&s.available>=quantity&&(s.odds??1)===1&&!(s.gates??[]).some(g=>g.materials?.length))
  out.push({kind:s.labor,location:s.location,work:quantity*s.minutesPerUnit+(s.setupMinutes??0),coins:0,act:{kind:s.labor,item,quantity,source:s.source,minutesPerUnit:s.minutesPerUnit,...(s.resource?{resource:s.resource}:{}),...(s.tool?{tool:s.tool}:{}),...(s.gates?{gates:s.gates}:{})}});
 for(const b of local.keepers){
  if(local.stock(b.keeper,item)<quantity)continue;
  let quote;try{quote=supplierQuote(e,marketDocument(document,who),{buyer:who,keeper:b.keeper,location:b.location,item,quantity});}catch{continue;}
  if(quote.totalCoins>0)out.push({kind:'buy',location:b.location,keeper:b.keeper,work:0,coins:quote.totalCoins,act:{kind:'buy',keeper:b.keeper,item,quantity,coins:quote.totalCoins}});
 }
 return out;
}
// 本地能取得投入的地方，一次决策里只读一次：本人职业做得了的采集（据点、林木），本聚落有铺面的卖家（可售存货按卖家与物品记一次）。
// 不做采集的手艺人缺料就向持货人买，分工照职业。
function localSupply(e,state,who,settlement){
 const read=stateReader(marketState(state,who)),seen=new Map();
 return {natural:naturalSources(e,state,who,laborCategories(e,state,who)),keepers:buyers(e,state,who).filter(b=>placeSettlement(e,state,b.location).value===settlement),
  stock:(keeper,item)=>{const key=`${keeper}|${item}`;if(!seen.has(key))seen.set(key,saleableStock(read,e,keeper,item,{business:true}).available);return seen.get(key);}};
}
// 同一状态里同一买卖双方、同一货与数量的报价只算一次（多道配方常要同一种料）。
const quoteReads=new WeakMap();
function cachedQuote(state,key,read){
 let rows=quoteReads.get(state);if(!rows)quoteReads.set(state,rows=new Map());
 if(!rows.has(key)){try{rows.set(key,{quote:read()});}catch(error){rows.set(key,{error});}}
 const row=rows.get(key);if(row.error)throw row.error;return row.quote;
}
function supplierQuote(e,document,args){return cachedQuote(document.state,`buy|${args.buyer}|${args.keeper}|${args.location}|${args.item}|${args.quantity}`,()=>freshSupplierQuote(e,document,args));}
function freshSupplierQuote(e,document,{buyer,keeper,location,item,quantity}){
 return marketQuote(reader(document),e,{item,location,seller:keeper,buyer,quantity,business:{...shopOfKeeper(e,keeper,document.state),keeper}});
}
const learned=(state,who,r)=>!r.learningRequired||r.teachers?.includes(who)||Boolean(state.npcs[who]?.recipes?.[r.id]);
// 工具不随一批消耗：买来的工具只把这趟磨掉的那一份算作成本，其余仍是本人的家当。
const toolShare=(e,r,item,batches)=>Math.min(1,batches*(r.toolWear??1)/Math.max(1,e.byId.get(item)?.durability??1));
function processCandidates(e,view,document){
 const state=document.state,who=view.observer,here=view.self.location,read=stateReader(marketState(state,who));
 const categories=processingCategories(e,state,who);if(!categories.size)return [];
 const settlement=homeSettlement(e,state,who),daily=dailyLabor(e);
 const recipes=e.world.recipes.filter(r=>categories.has(recipeCategory(r))&&r.materials?.length&&r.minutes>0&&r.output?.item&&learned(state,who,r)&&npcProficiency(e,state,who,r.skill)>=(r.minimumProficiency??0));
 // 只找这些配方要用的工位类别。
 const kinds=new Set(recipes.map(r=>r.workstation).filter(Boolean));
 let places=null,local=null;const options=[];
 for(const r of recipes){
  if(r.workstation)places??=workPlaces(e,document,who,settlement,kinds);
  local??=localSupply(e,state,who,settlement);
  const sites=r.workstation?places.filter(p=>p.station.kind===r.workstation&&(!r.location||p.location===r.location)):[{location:r.location??here,station:null,factor:1,fee:0}];
  const totals=new Map();for(const m of r.materials)totals.set(m.item,(totals.get(m.item)??0)+m.amount);
  let unit=null;
  for(const place of sites){
   const minutes=Math.ceil(r.minutes/place.factor);if(minutes>daily)continue;
   // 批数：一天的作业工时以内，再按每种投入手上有的加上单一来源可得的量封顶。
   let batches=Math.floor(daily/minutes);
   for(const [item,amount] of totals){
    const most=Math.max(0,...local.natural.filter(s=>s.item===item).map(s=>s.available),...local.keepers.map(b=>local.stock(b.keeper,item)));
    batches=Math.min(batches,Math.floor((e.quantity(read,who,item)+most)/amount));
   }
   if(place.fee)batches=Math.min(batches,Math.floor((view.self.coins??0)/place.fee));
   // 窑一次烧一窑：裂损按这一窑的应力算，一站只做一批。
   if(heatSource(e,place.location,place.station)?.thermalModel.kiln)batches=Math.min(batches,1);
   // 负重：每批的料与成品都要背得动（口粮在排出行程后再核）。就在本人所在处做的不用背。
   const d=reader(document),perBatch=r.output.quantity*packItemKg(d,e,who,r.output.item)+[...totals].reduce((n,[item,amount])=>n+amount*packItemKg(d,e,who,item),0);
   if(perBatch>0&&place.location!==here)batches=Math.min(batches,Math.floor((safeCarryKg(d,e,who)-carriedKg(d,e,who))/perBatch));
   // 批数越多越摊得开路程，但量大时买价随稀缺上涨：从能做的最多批起，不成就减半再看。
   if(batches<1)continue;
   // 成品货值只在料取得到时才估（估价要读全市场的供给）。
   unit??=outletWorth(e,document,view,who,{item:r.output.item,quantity:r.output.quantity,home:here,at:view.minute});if(!(unit>0))break;
   // 收益上限：成品货值减去工坊费与作业工时（还没算料、路费、口粮与放弃的营业）。
   options.push({r,place,batches,totals,unit,bound:unit*batches-place.fee*batches-laborCost(e,document,who,view,minutes*batches)});
  }
 }
 // 一个人一次只走一趟：按收益上限从高到低排行程，上限已不超过眼下最好的那趟，后面的就不可能更好，不再排。
 let best=null;
 for(const o of options.filter(o=>o.bound>0).sort((a,b)=>b.bound-a.bound||a.r.id.localeCompare(b.r.id)||a.place.location.localeCompare(b.place.location))){
  if(best&&o.bound<=best.utility)break;
  for(let batches=o.batches;batches>=1;batches=Math.floor(batches/2)){
   const plan=processPlan(e,document,view,o.r,o.place,batches,o.totals,settlement,local,o.unit);
   if(plan){if(!best||plan.utility>best.utility)best=plan;break;}
  }
 }
 return best?[best]:[];
}
function processPlan(e,document,view,r,place,batches,totals,settlement,local,unit){
 const state=document.state,who=view.observer,here=view.self.location,read=stateReader(marketState(state,who)),d=reader(document),day=Math.floor(view.minute/DAY);
 const acts=[];let held=0,bought=0,tools=0;
 const rank=a=>a.coins+laborCost(e,document,who,view,a.work);
 for(const [item,amount] of totals){
  const need=amount*batches,have=Math.min(need,e.quantity(read,who,item)),missing=need-have;
  held+=have?worth(e,state,{item,quantity:have,holder:who,location:here})??Infinity:0;
  if(!missing)continue;
  const best=supplies(e,document,who,item,missing,settlement,local).sort((a,b)=>rank(a)-rank(b)||a.location.localeCompare(b.location))[0];
  if(!best)return null;
  acts.push(best);bought+=best.coins;
 }
 for(const item of r.tools??[]){
  if(usableTool(d,e,who,item))continue;
  // 工具买不到（世界里还没人做出来卖）就照实不做；做工具本身是另一道配方的加工。
  const best=supplies(e,document,who,item,1,settlement,{...local,natural:[]}).sort((a,b)=>a.coins-b.coins||a.location.localeCompare(b.location))[0];
  if(!best)return null;
  acts.push(best);bought+=best.coins;tools+=Math.ceil(best.coins*toolShare(e,r,item,batches))-best.coins;
 }
 const minutes=Math.ceil(r.minutes/place.factor),fee=place.fee*batches;
 // 热工位：按眼下出发先估一遍炉火（到场时刻在排出路线后再核），缺的炉料和别的投入一样从手上、采集或采买来。
 let heat=null,fuel=null;
 if(place.station?.thermalRequirement){
  heat=furnaceForecast(e,document,who,place.location,place.station,{arriveAt:view.minute,minutes:minutes*batches});if(!heat)return null;
  const pick=furnaceFuel(e,document,who,heat,totals,settlement,local,here,rank);if(pick===null)return null;
  if(pick){fuel=pick;held+=pick.held;if(pick.act){acts.push(pick.act);bought+=pick.act.coins;}}
 }
 const gross=unit*batches*(1-(heat?.risk??0)),spent=held+bought+tools+fee;
 // 不算路程与口粮也不值得，就不去排行程。
 if(!(gross-spent-laborCost(e,document,who,view,minutes*batches+acts.reduce((n,a)=>n+a.work,0))>0)||bought+fee>(view.self.coins??0))return null;
 // 同一处的取得并成一站：同一个卖家的货一次买齐，同一处来源的一并采。
 const stops=new Map();
 for(const a of acts){const key=`${a.location}|${a.kind}|${a.keeper??''}`,row=stops.get(key)??{location:a.location,work:0,acts:[]};row.acts.push(a.act);row.work+=a.work;stops.set(key,row);}
 const list=[...stops.values()].map(s=>({...s,work:s.work||config(e).saleMinutes}));
 list.push({location:place.location,work:minutes*batches,acts:[{kind:'craft',recipe:r.id,batches,minutes,station:place.station?.id??null,...(heat?{heat:{feature:heat.feature,...(fuel?{fuel:{item:fuel.item,quantity:fuel.quantity}}:{})}}:{})}]});
 const open=t=>t.stops.every(stop=>stop.acts.every(act=>act.kind!=='buy'||receiving(e,state,act.keeper,stop)));
 const trip=plannedTrip(e,document,who,list,view.minute,{},open);if(!trip)return null;
 // 按排出的到场时刻重核炉火：撑不到、温度不对，或要的炉料比备下的多，就不去。
 if(heat){
  const at=furnaceForecast(e,document,who,place.location,place.station,{arriveAt:trip.stops.at(-1).arriveAt,minutes:minutes*batches});
  if(!at||at.missingMg>(fuel?.milligrams??0)||at.risk>heat.risk)return null;
 }
 const food=rations(e,trip.nights);if(!food)return null;
 // 负重：带去的口粮，加上一路取得的投入与做成的成品，不超过安全负重（整趟不出门就不用背）。
 const load=(food.quantity?food.quantity*packItemKg(d,e,who,food.item):0)+acts.reduce((n,a)=>n+a.act.quantity*packItemKg(d,e,who,a.act.item),0)+batches*r.output.quantity*packItemKg(d,e,who,r.output.item);
 if(trip.segments.some(s=>s.travel)&&carriedKg(d,e,who)+load>safeCarryKg(d,e,who))return null;
 const cost=tripCost(e,document,who,view,trip,here);if(!cost)return null;
 const utility=gross-spent-cost.coins-cost.value;
 if(!(utility>0)||bought+fee+cost.coins>(view.self.coins??0))return null;
 return {id:`labor:${who}:${day}:process:${r.id}:${place.location}`,kind:'labor',
  legacy:{kind:'labor_process',labor:'process',recipe:r.id,batches,station:place.station?.id??null,coins:bought,fee,...trip},
  cost:{coins:cost.coins+bought+fee,value:cost.value+held+tools,minutes:trip.activeMinutes},reward:gross,needSatisfaction:gross,utility};
}
// 炉料：热源认的燃料里，先用手上够数的（扣掉这道配方要用的料），没有就按别的投入一样找最省的采集或采买。
// 返回 undefined 表示不缺料，null 表示炉料取不到。
function furnaceFuel(e,document,who,heat,totals,settlement,local,here,rank){
 if(!heat.missingMg)return undefined;
 const read=stateReader(marketState(document.state,who));
 for(const f of heat.fuels)if(e.quantity(read,who,f.item)-(totals.get(f.item)??0)>=f.quantity)
  return {...f,held:worth(e,document.state,{item:f.item,quantity:f.quantity,holder:who,location:here})??Infinity};
 let best=null;
 for(const f of heat.fuels){
  const have=Math.max(0,e.quantity(read,who,f.item)-(totals.get(f.item)??0)),missing=f.quantity-have;
  const option=supplies(e,document,who,f.item,missing,settlement,local).sort((a,b)=>rank(a)-rank(b)||a.location.localeCompare(b.location))[0];
  if(option&&(!best||rank(option)<rank(best.act)))best={...f,act:option,held:have?worth(e,document.state,{item:f.item,quantity:have,holder:who,location:here})??Infinity:0};
 }
 return best;
}
function receiving(e,state,keeper,stop){
 for(let cursor=stop.arriveAt;cursor<stop.finishAt;){const s=scheduleAt(e,keeper,cursor,state);if(!s||s.location!==stop.location||!s.services?.includes('trade'))return false;cursor=s.until;}
 return isEffective(e,state,keeper)&&!['死亡','濒死','昏迷','患病'].includes(state.npcs[keeper]?.status);
}
// 卡 E2：买卖劳动对任何成年人开放（条件派生），所以醒着的成年人都要看一眼劳动候选。
const relevant=(e,state,id,presence)=>adult(e,state,id,state.minute)&&!/睡眠|睡觉|熟睡/.test(presence?.activity??'');
registerAutonomyProvider('npc_labor',{
 relevant,
 candidateRelevant:(e,document,id,presence)=>relevant(e,document.state,id,presence),
 candidates:laborCandidates
});

// ---- 劳动行程：作息槽是一条 market_trip 记录（逐段 segments），人物按它出门、在外歇宿、作业、回家 ----
const tripKey=task=>`market_trip:labor:${task}`;
const ACTIVITY={gather:'外出采集',fell:'进山伐木',sell:'送货出售',carry:'运货出售',haul:'外出贩运',process:'外出加工'};
const STOP_ACTIVITY={buy:'采买投入',sell:'出售货物',gather:'外出采集',fell:'进山伐木',craft:'加工制作'};
const clone=v=>structuredClone(v);
// 出门在外的人不另起劳动；家户劳动与作息由 market_trip 的整段窗口扣除（household-subsistence、npc-schedule 读它）。
// 已经排定（哪怕还没出发）的劳动行程没走完，不另起一趟。
function activeTrip(state,who,at){return recordsWhere(state.records,'category','market_trip').some(r=>r.actor===who&&r.labor&&at<r.returnAt);}
function validateTrip(d,e,who,a,{at,ignoreTask=false,taskId}={}){
 const state=d.get('state'),n=state.npcs[who],trip=ignoreTask?state.records[tripKey(taskId)]:null;
 if(!ignoreTask&&!(a.departAt>=at&&a.departAt<at+DAY)||!(a.departAt<=a.arriveAt&&a.arriveAt<=a.finishAt&&a.finishAt<=a.returnAt)||!Array.isArray(a.segments)||!Array.isArray(a.stops)||!a.stops.length)throw preconditionFailure('劳动行程无效');
 if(!laborAllowed(e,state,who,a.labor))throw preconditionFailure('本人的职业不做这项劳动');
 if(!ignoreTask){
  const start=a.departAt===at?{location:n.location}:scheduleAt(e,who,a.departAt,state);
  if(start?.location!==a.from||a.departAt===at&&(n.scheduleTravel||n.cognitionTravel)||n.caring||n.levy)throw preconditionFailure('劳动者出发时不在出发地点');
  if(householdWorkTime(e,state,who,a.departAt).unattended)throw preconditionFailure('家中无人照看，不能出门劳动');
  if(activeTrip(state,who,at))throw preconditionFailure('人还在外劳动');
  const fresh=itinerary(e,d.document,who,a.stops.map(s=>({location:s.location,work:s.work})),a.departAt,a.from);
  if(!fresh||fresh.arriveAt!==a.arriveAt||fresh.returnAt!==a.returnAt||fresh.travelCoins!==a.travelCoins||fresh.stops.some((s,i)=>s.finishAt!==a.stops[i].finishAt))throw preconditionFailure('真实路线已改变');
  // 出发当天走路与作业的那段不能是睡觉或另有行程；之后各天由这趟行程占用，作息与家户劳动随之扣除。
  for(let cursor=a.departAt;cursor<a.firstDayEnd;){const s=scheduleAt(e,who,cursor,state);if(!s||SLEEP.test(s.activity??'')||MOVING.test(s.activity??''))throw preconditionFailure('没有完整的劳动空档');cursor=Math.max(cursor+1,s.until);}
  // 放弃的营业或工钱不能比决策时算的多；有人按行程来取货的时段不能走。
  if(!(forgone(e,d.document,who,a,a.kind==='labor_sale'?{[a.item]:a.quantity}:{})<=(a.forgone??0)))throw preconditionFailure('这段时间本人要接待或当差，不值得出门劳动');
  e.assertNpcAutonomyAction(state,[who],{start:a.departAt,minutes:a.returnAt-a.departAt});
  e.assertNpcObligationAction(d,[who],{start:a.departAt,minutes:a.returnAt-a.departAt,location:a.from,kind:'autonomy'});
  if(a.travelCoins+(a.coins??0)+(a.fee??0)>(n.coins??0))throw preconditionFailure('路费与本钱不足');
 }else if(!trip||trip.actor!==who)throw preconditionFailure('劳动行程已不存在');
}
const validGoods=(e,a)=>Number.isSafeInteger(a.quantity)&&a.quantity>=1&&Boolean(e.byId.get(a.item));
function startTrip(d,e,who,a,{actionId}){
 const id=tripKey(actionId),activity=ACTIVITY[a.labor]??'外出劳动';
 d.set(['state','records',id],{id,category:'market_trip',actor:who,from:a.from,to:a.to,departAt:a.departAt,arriveAt:a.arriveAt,finishAt:a.finishAt,returnAt:a.returnAt,
  outboundEdges:a.outboundEdges,inboundEdges:a.inboundEdges,paid:a.travelCoins,sourceEvent:actionId,purpose:`labor:${a.labor}`,labor:a.labor,activity,travelActivity:'劳动途中',
  segments:a.segments.map(s=>s.work?{...s,activity:STOP_ACTIVITY[a.stops[s.stop]?.acts?.[0]?.kind]??activity}:s),action:clone(a)});
 if(a.travelCoins){moveCoins(d,{from:purse(e,who),to:sink('export','travel'),amount:a.travelCoins,writer,eventId:actionId});mirrorPartyCoins(d,e,who,-a.travelCoins,actionId,writer);}
}
// 劳动记录：谁、做了哪类劳动、在哪、产出或卖出了什么、卖给谁、得了多少钱。
function laborRecord(d,actionId,row,part=''){holdingSet(d,null,['state','records',`labor:${actionId}${part}`],{category:'labor',sourceEvent:actionId,...row},writer,actionId);}
const departure=(e,a)=>({summary:`动身去${e.byId.get(a.to)?.name??a.to}${ACTIVITY[a.labor]??'劳动'}${a.nights?`，预计在外${a.nights}夜`:''}。`,spent:{minutes:a.firstDayEnd-a.departAt,coins:a.travelCoins}});
// 解机关要耗的材料，按本人家里的货值折价（它们从本人行囊里出）。
function gateMaterials(e,state,s,home){return (s.gates??[]).flatMap(g=>g.materials??[]).reduce((n,m)=>n+(worth(e,state,{item:m.item,quantity:m.quantity,location:home})??0),0);}
const usableTool=(d,e,who,tool)=>!tool||e.quantity(d,who,tool)>0&&(heldUnit(d,e,who,tool)?.durability??e.byId.get(tool)?.durability??0)>0;

registerAutonomyKind('labor_work',{
 itinerary:true,
 minutes:(e,a)=>a.firstDayEnd-a.departAt,
 validate(d,e,who,a,o){
  if(!validGoods(e,a))throw preconditionFailure('劳动数量无效');
  validateTrip(d,e,who,a,o);
  if(!usableTool(d,e,who,a.tool)||(a.gates??[]).some(g=>!usableTool(d,e,who,g.tool)))throw preconditionFailure('没有完好的实际工具');
 },
 start:startTrip,
 execute:(d,e,who,a)=>departure(e,a)
});
registerAutonomyKind('labor_sale',{
 itinerary:true,
 minutes:(e,a)=>a.firstDayEnd-a.departAt,
 validate(d,e,who,a,o){
  if(!validGoods(e,a))throw preconditionFailure('劳动数量无效');
  validateTrip(d,e,who,a,o);
  const keeper=d.get('state','npcs',a.keeper);
  if(!keeper||!isEffective(e,d.get('state'),a.keeper)||['死亡','濒死','昏迷','患病'].includes(keeper.status))throw preconditionFailure('收货人不能接待');
  if(!o.ignoreTask&&!receiving(e,d.get('state'),a.keeper,a.stops[0]))throw preconditionFailure('收货人没有接待窗口');
 },
 start:startTrip,
 execute:(d,e,who,a)=>departure(e,a)
});
// 贩运行程（卡 E2）：第一站向货源地的持货人买，可能还有一站卖给本地收货人；出发前各站的对方要在铺里接待。
registerAutonomyKind('labor_haul',{
 itinerary:true,
 minutes:(e,a)=>a.firstDayEnd-a.departAt,
 validate(d,e,who,a,o){
  if(!validGoods(e,a)||a.labor!=='haul'||a.stops.some(s=>!Array.isArray(s.acts)||s.acts.length!==1||!['buy','sell'].includes(s.acts[0].kind))||a.stops[0].acts[0].kind!=='buy')throw preconditionFailure('贩运行程无效');
  validateTrip(d,e,who,a,o);
  if(o.ignoreTask)return;
  for(const stop of a.stops)if(!receiving(e,d.get('state'),stop.acts[0].keeper,stop))throw preconditionFailure('对方没有接待窗口');
 },
 start:startTrip,
 execute:(d,e,who,a)=>departure(e,a)
});
// 加工行程：配方仍在本人手艺之内、已经会做、熟练度够；出发前各站的卖家要在铺里接待，工位要仍可获准使用。
registerAutonomyKind('labor_process',{
 itinerary:true,
 minutes:(e,a)=>a.firstDayEnd-a.departAt,
 validate(d,e,who,a,o){
  const state=d.get('state'),r=e.byId.get(a.recipe),craft=a.stops.at(-1)?.acts?.[0];
  if(!r||craft?.kind!=='craft'||craft.recipe!==r.id||!Number.isSafeInteger(a.batches)||a.batches<1||a.stops.some(s=>!Array.isArray(s.acts)||!s.acts.length))throw preconditionFailure('加工行程无效');
  if(!processingCategories(e,state,who).has(recipeCategory(r))||!learned(state,who,r)||npcProficiency(e,state,who,r.skill)<(r.minimumProficiency??0))throw preconditionFailure('这道配方不在本人手艺之内');
  validateTrip(d,e,who,a,o);
  if(o.ignoreTask)return;
  if(craft.station&&!stationAt(e,d,who,a.stops.at(-1).location,craft.station))throw preconditionFailure('没有可用且获准的工作台');
  for(const stop of a.stops)if(stop.acts.some(act=>act.kind==='buy'&&!receiving(e,state,act.keeper,stop)))throw preconditionFailure('卖家没有接待窗口');
 },
 start:startTrip,
 execute:(d,e,who,a)=>departure(e,a)
});
const stationAt=(e,document,who,location,id)=>facilityView(e,document.get('state'),location,who)?.workstations?.find(s=>s.id===id&&(!s.thermalRequirement||heatAllowed(heatSource(e,location,s),who))&&stationLicence(e,document,s,who))??null;

// ---- 每一站作业结束那一刻结算：人确实在作业地，才按实际取得、成交或制作入账 ----
function present(d,e,who,at){
 const n=d.get('state','npcs',who);
 return Boolean(n)&&isEffective(e,d.get('state'),who)&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&(n.location===at||n.location===null&&n.scheduleTravel?.from===at);
}
// 加工行程里自己去采的一站，按它本来的劳动类别（采集或伐木）记，与采集行程同一本账。
function settleWork(d,e,who,a,id,at,part=''){
 const to=bag(e,who,a.item),want=Math.min(a.quantity,carryRoom(e,d.document,who,a.item)),ev=id+part;
 let taken=0,reason=null;
 if(!present(d,e,who,a.to))reason='劳动者没有实际到场';
 else if(!usableTool(d,e,who,a.tool))reason='没有完好的实际工具';
 else if(a.labor==='gather'){
  const [,site]=a.source.split(':');
  if(a.gates?.length&&!siteUnlock(d,e,site,a.resource,{holder:who,eventId:ev}))reason='机关没能解开';
  else taken=siteTake(d,e,site,a.resource,{quantity:want,minutes:a.work-(a.setupMinutes??0),holder:who,settlement:homeSettlement(e,d.get('state'),who),to,eventId:ev});
 }
 else if(a.labor==='fell'){taken=harvestForest(d,e,a.to,want,at,{to,eventId:ev});if(a.tool)wearItem(d,e,who,a.tool,e.rules.forestWater.forest.wear);}
 if(taken)changeItems(d,e,who,a.item,taken,{books:BOOKED});
 laborRecord(d,id,{npc:who,labor:a.labor,location:a.to,minute:at,source:a.source,produced:taken?[{item:a.item,quantity:taken}]:[],success:taken>0,nights:a.nights,...(taken?{}:{reason:reason??'到场后没有可取的资源'})},part);
}
function settleSale(d,e,who,a,id,at){
 const fail=reason=>laborRecord(d,id,{npc:who,labor:a.labor,from:a.from,to:a.to,location:a.to,minute:at,goods:[],success:false,reason,nights:a.nights});
 const state=d.get('state'),keeper=state.npcs[a.keeper];
 if(!present(d,e,who,a.to))return fail('劳动者没有实际到场');
 if(!keeper||keeper.location!==a.to||keeper.scheduleTravel||keeper.cognitionTravel)return fail('收货人实际不在铺里');
 const read=reader(d.document),quantity=Math.min(a.quantity,saleableStock(read,e,who,a.item).available);
 if(quantity<1)return fail('可售存货已经没有了');
 const quote=keeperQuote(e,d.document,{seller:who,keeper:a.keeper,location:a.to,item:a.item,quantity});
 if(!(quote.totalCoins>0)||quote.totalCoins>(keeper.coins??0))return fail('收货人付不起货款');
 const resale=goodsWorth(read,e,{item:a.item,quantity,holder:a.keeper,location:a.to});
 if(npcDecision(subjectiveView(e,d.document,a.keeper),{kind:'buy',from:who,cost:{coins:quote.totalCoins},reward:resale??0}).outcome!=='agree')return fail('收货人不愿按这个价收');
 transferItems(d,e,who,a.keeper,a.item,quantity);
 moveCoins(d,{from:purse(e,a.keeper),to:purse(e,who),amount:quote.totalCoins,writer,eventId:id});
 mirrorPartyCoins(d,e,a.keeper,-quote.totalCoins,id,writer);mirrorPartyCoins(d,e,who,quote.totalCoins,id,writer);
 recordMarketDeal(d,quote,quote.totalCoins,quantity,id);
 laborRecord(d,id,{npc:who,labor:a.labor,side:'sell',buyer:a.keeper,from:a.from,to:a.to,location:a.to,minute:at,goods:[{item:a.item,quantity}],totalCoins:quote.totalCoins,success:true,nights:a.nights});
}
// 采买一站：卖家实际在铺里、货还在、实价不高过计划的本钱、卖家同意，才付款取货；货不够就照实少买。
function settleBuy(d,e,who,a,stop,id,at,part){
 const state=d.get('state'),keeper=stop.acts[0].keeper,k=state.npcs[keeper];
 const fail=reason=>laborRecord(d,id,{npc:who,labor:a.labor,side:'buy',seller:keeper,location:stop.location,minute:at,goods:[],success:false,reason,nights:a.nights},part);
 if(!present(d,e,who,stop.location))return fail('劳动者没有实际到场');
 if(!k||k.location!==stop.location||k.scheduleTravel||k.cognitionTravel)return fail('卖家实际不在铺里');
 const read=reader(d.document),rows=stop.acts.map(act=>({...act,quantity:Math.min(act.quantity,saleableStock(read,e,keeper,act.item,{business:true}).available)})).filter(r=>r.quantity>0);
 if(!rows.length)return fail('卖家可售的货已经没有了');
 const quotes=rows.map(r=>freshSupplierQuote(e,d.document,{buyer:who,keeper,location:stop.location,item:r.item,quantity:r.quantity})),total=quotes.reduce((n,q)=>n+q.totalCoins,0);
 if(total>stop.acts.reduce((n,act)=>n+act.coins,0))return fail('实价高过这趟计划的本钱');
 if(total>(state.npcs[who].coins??0))return fail('本钱不足以付货款');
 if(npcDecision(subjectiveView(e,d.document,keeper),{kind:'sell',from:who,cost:{value:total},reward:total}).outcome!=='agree')return fail('卖家不愿按这个价卖');
 rows.forEach((r,i)=>{
  const q=quotes[i],eventId=`${id}${part}:${r.item}`;
  transferItems(d,e,keeper,who,r.item,r.quantity);
  moveCoins(d,{from:purse(e,who),to:purse(e,keeper),amount:q.totalCoins,writer,eventId});
  mirrorPartyCoins(d,e,who,-q.totalCoins,eventId,writer);mirrorPartyCoins(d,e,keeper,q.totalCoins,eventId,writer);
  recordMarketDeal(d,q,q.totalCoins,r.quantity,eventId);
 });
 laborRecord(d,id,{npc:who,labor:a.labor,side:'buy',seller:keeper,location:stop.location,minute:at,goods:rows.map(r=>({item:r.item,quantity:r.quantity})),totalCoins:total,success:true,nights:a.nights},part);
}
// 制作一站：在获准的工位上逐批走原生的 NPC 制作结算（掷骰、工坊费、工具磨损、成品、制作账、熟练度）；料、工具或工坊费不够就停在那一批。
function settleCraft(d,e,who,a,stop,id,at,part,trip,i){
 const act=stop.acts[0],r=e.byId.get(act.recipe);let furnace=null;
 const before=new Map([r.output.item,...r.materials.map(m=>m.item),...(r.byproducts??[]).map(p=>p.item)].map(item=>[item,e.quantity(d,who,item)]));
 let reason=null,batches=0;
 const station=act.station?stationAt(e,d,who,stop.location,act.station):null,licence=station&&stationLicence(e,d,station,who);
 if(!present(d,e,who,stop.location))reason='劳动者没有实际到场';
 else if(act.station&&!station)reason='工位已不能用';
 else if(act.heat&&!(furnace=furnaceAt(d,e,trip,i,stop,at)).plan)reason=furnace.reason;
 else for(;batches<act.batches;batches++){
  const totals=new Map();for(const m of r.materials)totals.set(m.item,(totals.get(m.item)??0)+m.amount);
  if([...totals].some(([item,n])=>e.quantity(d,who,item)<n)){reason='材料不够再做一批';break;}
  if((r.tools??[]).some(t=>!usableTool(d,e,who,t))){reason='没有完好的实际工具';break;}
  if(licence?.basis==='paid'&&(station.fee??0)>(d.get('state','npcs',who,'coins')??0)){reason='工坊费不够';break;}
  const start=stop.arriveAt+batches*act.minutes;
  npcCraft(d,e,who,r.id,{start,at:start+act.minutes,actionId:`${id}${part}:${batches}`,location:stop.location,minutes:act.minutes,...(furnace?{furnace:{plan:furnace.plan,fuel:batches?[]:furnace.fuel}}:{})});
 }
 const change=[...before].map(([item,n])=>({item,quantity:e.quantity(d,who,item)-n}));
 laborRecord(d,id,{npc:who,labor:a.labor,recipe:r.id,station:act.station,location:stop.location,minute:at,batches,
  produced:change.filter(c=>c.quantity>0),consumed:change.filter(c=>c.quantity<0).map(c=>({item:c.item,quantity:-c.quantity})),success:change.some(c=>c.quantity>0),nights:a.nights,...(reason?{reason}:{})},part);
}
function settleStop(d,e,trip,i){
 const a=trip.action,stop=a.stops[i],who=trip.actor,at=stop.finishAt;
 if(a.kind==='labor_sale')return settleSale(d,e,who,a,trip.sourceEvent,at);
 if(a.kind==='labor_work')return settleWork(d,e,who,a,trip.sourceEvent,at);
 const id=trip.sourceEvent,part=`:${i}`,kind=stop.acts[0].kind;
 if(kind==='buy'){settleBuy(d,e,who,a,stop,id,at,part);if(stop.ship)shipHaul(d,e,who,stop,id,part);return;}
 if(kind==='sell'){const act=stop.acts[0];return settleSale(d,e,who,{...a,keeper:act.keeper,item:act.item,quantity:act.quantity,to:stop.location},`${id}${part}`,at);}
 if(kind==='craft')return settleCraft(d,e,who,a,stop,id,at,part,trip,i);
 stop.acts.forEach((act,j)=>settleWork(d,e,who,{...act,labor:act.kind,to:stop.location,work:act.quantity*act.minutesPerUnit,nights:a.nights},id,at,`${part}:${j}`));
}
// 贩运买到的货在货源地交承运人运回（卡 E2）：运单走 transport 的路线、时间、运费、关税与途中事故，账上记承运人与运单。
// 订不上（承运人已出车、钱不够、路不通），货就留在本人身上自己背回。
function shipHaul(d,e,who,stop,id,part){
 const key=['state','records',`labor:${id}${part}`],row=d.get(...key);if(!row?.success||!row.goods?.length)return;
 try{
  const trip=bookTransport(d,e,{owner:who,recipient:who,from:stop.location,to:stop.ship.to,asset:stop.ship.asset,cargo:row.goods.map(g=>({item:g.item,quantity:g.quantity}))},`${id}${part}:ship`);
  holdingSet(d,null,key,{...d.get(...key),shipment:trip.id,carrier:trip.carrier,freightCopper:trip.freight+trip.toll+trip.tariff},writer,id);
 }catch(error){holdingSet(d,null,key,{...d.get(...key),shipment:null,shipReason:error.message},writer,id);}
}
// 热工位一站：到场那一刻照管炉火——同 NPC 就地照管炉火的 prepareNpcFurnace，热账推到到场、缺多少续多少（只从本人行囊里出，
// 不动这道配方要用的料），工序的温度与燃烧按真实热账核过才开工；结果记在行程上。完工时热账推到完工，炉子已熄或温度出界就不出成品。
// 把这一处热源的热账推到 minute（已经推过的不动）：与时钟推进 advanceMagicObjects 同一个逐分钟热过程。
function settleHeat(d,e,row,minute){
 const state=readObjectState(d,row);if(!state.thermal||state.thermal.lastMinute>=minute)return;
 state.thermal=advanceThermalState(state.thermal,row.thermalModel,minute,{effects:Object.values(d.get('state','effects')??{}),target:row.id});storeObjectState(d,row,state);
}
const heatStop=stop=>stop?.acts?.[0]?.kind==='craft'&&stop.acts[0].heat;
function lightFurnace(d,e,trip,i){
 const a=trip.action,stop=a.stops[i],act=stop.acts[0],who=trip.actor,r=e.byId.get(act.recipe),key=['state','records',trip.id,'furnaces',String(i)];
 if(d.get(...key))return;
 const fail=reason=>d.set(key,{reason});
 const station=stationAt(e,d,who,stop.location,act.station);
 if(!present(d,e,who,stop.location))return fail('劳动者没有实际到场');
 if(!station)return fail('工位已不能用');
 settleHeat(d,e,heatSource(e,stop.location,station),stop.arriveAt);
 const reserved=new Map();for(const m of r.materials)reserved.set(m.item,(reserved.get(m.item)??0)+m.amount*act.batches);for(const item of r.tools??[])reserved.set(item,(reserved.get(item)??0)+1);
 const location=d.get('state','npcs',who,'location'),moved=location!==stop.location;
 if(moved)d.set(['state','npcs',who,'location'],stop.location);
 let prepared;
 try{prepared=prepareNpcFurnace(d,e,station,act.minutes*act.batches,who,reserved);}
 catch(error){if(moved)d.set(['state','npcs',who,'location'],location);return fail(error.message);}
 if(moved)d.set(['state','npcs',who,'location'],location);
 d.set(key,{plan:prepared.plan,fuel:prepared.fuel,minute:stop.arriveAt});
}
function furnaceAt(d,e,trip,i,stop,at){
 const row=d.get('state','records',trip.id,'furnaces',String(i));if(!row?.plan)return {reason:row?.reason??'到场时没能照管上炉火'};
 const station=stationAt(e,d,trip.actor,stop.location,stop.acts[0].station),req=station?.thermalRequirement;if(!req)return {reason:'工位已不能用'};
 const source=heatSource(e,stop.location,station);if(source)settleHeat(d,e,source,at);
 const t=source&&heatNow(e,d.document,source),c=t&&t.energyJ/source.thermalModel.heatCapacityJPerC;
 if(!t||req.burning&&!t.burning||c<req.minimumC||c>req.maximumC)return {reason:'炉火中途熄灭或温度出界'};
 return row;
}
const pendingTrips=state=>recordsWhere(state.records,'category','market_trip').filter(r=>r.labor&&r.action&&r.settledAt===undefined);
const nextStop=trip=>trip.action.stops?.[trip.settledStops??0];
registerAdvance({id:'npc_labor',order:1105,
 nextMinute:(e,d,now)=>Math.min(Infinity,...pendingTrips(d.get('state')).flatMap(r=>{const s=nextStop(r);return [s?.finishAt,heatStop(s)&&!r.furnaces?.[String(r.settledStops??0)]?s.arriveAt:undefined];}).filter(m=>m>now)),
 advance(e,d,{after}){
  for(const trip of pendingTrips(d.get('state'))){const i=trip.settledStops??0,s=trip.action.stops[i];if(heatStop(s)&&s.arriveAt<=after&&!trip.furnaces?.[String(i)])lightFurnace(d,e,trip,i);}
  for(const trip of pendingTrips(d.get('state')).filter(r=>nextStop(r)?.finishAt<=after).sort((a,b)=>nextStop(a).finishAt-nextStop(b).finishAt||a.id.localeCompare(b.id))){
   let i=trip.settledStops??0;
   for(;i<trip.action.stops.length&&trip.action.stops[i].finishAt<=after;i++)settleStop(d,e,trip,i);
   d.set(['state','records',trip.id,'settledStops'],i);
   if(i===trip.action.stops.length)d.set(['state','records',trip.id,'settledAt'],trip.finishAt);
  }
 }
});
