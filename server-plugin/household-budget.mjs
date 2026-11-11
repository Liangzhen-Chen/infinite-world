// Household budgets: reads never write, with one exception — householdPoolTopUp, the only transfer here, which moves coins between purses of one registered household (writer household-pool) just before a payer pays. A target is a preference, never a transfer. One rule for cash: the household's pooled purses (effective members only) in both the subjective read (view.household) and the objective/kernel read (objectiveCash); a payer whose own purse is short tops up from the pool at payment time.
import {bagStock,bag,priceRead,itemResource,crop as cropAccount} from './stock.mjs';
import {coinRead,purse,COIN,moveCoins,mirrorPartyCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {personHousehold,poolMember} from './entity-view.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {bodyDrain} from './primitives-body.mjs';
import {explainDerived} from './derived.mjs';
import {domainRules,privateCropYieldBase} from './domain-rules.mjs';
import {digest,recordsMemo,recordsWhere,stateMemo,PatchCursor} from './storage.mjs';
import {compileRX,evaluateRX,fixedUnits,fixedInteger,FIXED_SCALE} from './rx.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {employmentActive} from './employment-state.mjs';
import {contractTerms,leaseState,tenancyRentAmount} from './contract-state.mjs';
import {householdWorkTime} from './npc-state.mjs';
import {isPhysicallyDead,isEffective} from './lifecycle-state.mjs';
import {physicalItem} from './items.mjs';
import {isItemClass,householdUsage as usageDefinition,usageGrams,mealCapPools,itemMg} from './item-class.mjs';
// Shop restock lists and the upkeep-shortage reader are household facts: they live here (L1) so market and the household packs read them without importing npc-life.
export function registerMerchandiseResolver(fn){registerMerchandiseResolver.fn=fn;}
export function householdUpkeepGap(state,key){const r=state.family?.upkeep?.[key]??{};return Object.fromEntries(Object.entries(r).filter(([k])=>k.endsWith('ShortDays')));}

const DAY=1440,qty=v=>typeof v==='number'?v:v?.quantity??0;
const mealCandidates=Symbol('physical meal candidates'),mealCapCtx=Symbol('meal cap engine and saved state');
const savedMealCap=(d,key)=>d.get('state','family','mealCap',key)??{open:{}};
const preferenceRoll=compileRX('roll("thrift")');
const laborPreferenceRoll=compileRX('roll("reservation")'),laborNoiseRoll=compileRX('roll("choice")');
const actor=(s,id)=>id==='player'?s.player:s.npcs?.[id]??s.creatures?.[id];
const inventory=(s,id)=>{
 const a=actor(s,id),m=a?.materialized;
 return id==='player'?s.inventory??{}:m?.folded?s.records?.[`remote-stock:${m.settlement}`]?.members?.[id]?.inventory??{}:a?.inventory??{};
};
const unpaid=r=>Math.max(0,(r.amount??r.quantity??r.coins??0)-(r.paid??r.fulfilled??0));
const debtor=r=>r.debtor??r.promisor,creditor=r=>r.creditor??r.promisee;
const budgetAccounts=Symbol('household inventory account owners');
const seedRecords=Symbol('household seed records'),futureRecords=Symbol('household future records');
const commitmentMemo=Symbol('household commitments');
const seedInputs=[{path:['records'],kinds:['asset_lease']},{path:['records'],categories:['private_farm']},['minute'],['buildings'],['created']];
const seedRecordInputs={kinds:['asset_lease'],categories:['private_farm']};
// Claims, their quote receipts and source events are the only record inputs.
// Daily household/ecology receipts cannot change a promised inventory unit.
const commitmentRecordInputs={categories:['debt','contract','agreed_quote','agreed_quote_used','agreed_quote_receipt','world_event']};
const commitmentRows=Symbol('household commitment rows');
const commitmentInputs=[{path:['records'],categories:commitmentRecordInputs.categories},['obligations'],['minute']];
const promisedRecords=Symbol('household legacy promises');
const budgetReads=new WeakMap();
const budgetValue=Symbol('budget value'),resourceMemo=Symbol('household resources');
// Kernel reads share work only while this exact draft revision is unchanged.
// Subjective views stay uncached: their observer and evidence are independent inputs.
export function budgetRead(d,engine,key,build){
 const inputs=Array.isArray(key)?key:[key];
 if(!(d.cursor instanceof PatchCursor)||d.document!==d.cursor.root)return d.memo?d.memo(engine,[budgetValue,...inputs],build):build();
 let cache=budgetReads.get(d.cursor);
 if(!cache||cache.cursor!==d.cursor||cache.revision!==d.cursor.revision||cache.engine!==engine){
  cache={cursor:d.cursor,revision:d.cursor.revision,engine,values:new Map()};budgetReads.set(d.cursor,cache);
 }
 let values=cache.values;
 for(const input of inputs){
  let next=values.get(input);if(!next)values.set(input,next=new Map());values=next;
 }
 if(!values.has(budgetValue))values.set(budgetValue,build());
 return values.get(budgetValue);
}
// The shop domain supplies public opening/replenishment facts and bounded
// local quotes. Keeping the resolver here avoids an economy import cycle.
// Hoisted registry: shop.mjs registers during the same import cycle, before this module body runs.
export function registerHouseholdFoodSources(resolve){registerHouseholdFoodSources.fn=resolve;}
const foodSources=(...a)=>registerHouseholdFoodSources.fn?.(...a)??[];
// 食物来源的惯常性（food-habit.mjs）：给每个来源标 luxury；没有注册时全部按日常品。
export function registerHouseholdFoodHabit(fn){registerHouseholdFoodHabit.fn=fn;}
const foodHabit=(d,engine,owner,sources,opts)=>registerHouseholdFoodHabit.fn?.(d,engine,owner,sources,opts)??{rich:true,sources};
// 免费水（journey('water') 的只读判断，household-subsistence.mjs 在模块体内注册）：本户当日取水能补的水分。
// 未注册就是装配错误，直接抛错，不回退为 0（否则会静默退回“全额买水”）。
export function registerHouseholdFreeWater(fn){registerHouseholdFreeWater.fn=fn;}
const freeWater=(...a)=>{
 if(!registerHouseholdFreeWater.fn)throw Error('household free water not registered: household-subsistence.mjs must call registerHouseholdFreeWater');
 return registerHouseholdFreeWater.fn(...a);
};
// 公粮份额（household-subsistence.mjs 在模块体内注册，与午夜 mealDeficit 同一函数）：登记居民由聚落粮库当日覆盖的饱腹比例 0..1。
// 未注册就是装配错误，直接抛错，不回退为 0（否则会静默退回“公粮户也全额采购”）。
export function registerHouseholdPublicShare(fn){registerHouseholdPublicShare.fn=fn;}
const publicShareOf=(...a)=>{
 if(!registerHouseholdPublicShare.fn)throw Error('household public share not registered: household-subsistence.mjs must call registerHouseholdPublicShare');
 return registerHouseholdPublicShare.fn(...a);
};
// 本户当日水分缺口（与预算同一口径：成员日耗水 × 24，含个人修正），交给注册函数折成当日可免费取到的水分 {hydration,source}。
// 免费水在 readHouseholdResources 内计算（budgetRead 的 build 里）：缓存命中的预算读不再重算。缓存本身的范围不变：游标读按草稿 revision（任何写入、含水体与日期变化即换键），
// 非游标读按 d.memo（只读作用域/状态读取器，按 state 对象身份）；没有 memo 的朴素读取器与整份预算一样每次重算（这是等价测试用的对照旁路，不是新增开销）。主观读不缓存。
function freeWaterToday(d,engine,owner,view){
 const state=d.get('state'),f=family(d,engine,owner),members=f.shared?f.members:[owner];
 const hydrationNeed=members.reduce((n,id)=>n+explainDerived(engine,d.document??{state},'body:drain',id,{base:bodyDrain(engine,state,id,'hydration')*24,...(view?{observer:owner,view}:{})}).value,0);
 return freeWater(d,engine,owner,{view,hydrationNeed});
}
// 本户眼下买得到的来源：到货未过、有量、有价、付得起；奢侈来源（惯常性低）在本户现金不宽裕时标 deferred：排在日常来源之后，
// 只补日常补不满的缺口。惯常性按本户看得到的全部来源算（卖家数不受现金影响），再按现金筛。
function accessibleSources(d,engine,owner,{view,cash,commonRisk,payments,now}){
 const all=foodSources(d,engine,owner,{view}),seen=all.filter(r=>r.at>=now&&Math.floor(r.quantity*Math.max(0,1-commonRisk))>0&&r.unitPrice>0);
 const {rich,sources}=foodHabit(d,engine,owner,seen,{view,read:(key,build)=>budgetRead(d,engine,key,build)});
 const out=sources.map(r=>({...r,deferred:r.luxury&&!rich})).filter(r=>r.unitPrice<=cash-payments.filter(p=>p.resource===COIN&&p.at<=r.at).reduce((n,p)=>n+p.amount,0));
 out.considered=all.considered??[];
 return out;
}
// 主观视图里某持有人的物品与账：观察者本人读 view.self，同户成员读 view.household（subjective-view.mjs，只含物品、钱袋余额与现金字段）。
const viewSide=(view,holder)=>holder===view.observer?view.self:view.household?.people?.[holder]??{inventory:{},accounts:{},coins:0,obligations:[]};
// 同户钱袋合计：本人 + 同一登记户其他成员；成员账缺失时退回其现金字段，同本人口径。
const pooledCash=(engine,owner,view)=>Object.entries(view.household?.people??{}).reduce((n,[id,p])=>n+(p.accounts?.[purse(engine,id)]?.balance??p.coins??0),view.self.accounts?.[purse(engine,owner)]?.balance??view.self.coins);
// 客观读（kernel 与 market 的 householdResources）的户池现金：同一登记户共灶成员（本人必入，其余须在世有效、非濒死昏迷）的钱袋合计，与主观读 pooledCash 同一口径（EC-1b U7）。
// 一人户与不共灶者就是本人钱袋。读取不写任何东西；付款人钱袋不够时由 householdPoolTopUp 落账。
const objectiveCash=(d,engine,state,owner)=>{
 const f=family(d,engine,owner),ids=f.shared?f.members:[owner];
 return ids.filter(id=>id===owner||poolMember(engine,state,id))
  .reduce((n,id)=>n+coinRead(d,{point:'assets.cash',account:purse(engine,id),legacy:()=>actor(state,id)?.coins??0}),0);
};
// 同户钱袋转账：主观预算按户池算现金，付款人自己的钱袋不够时，先从同一登记户的其他成员钱袋按编号序补足到 need，再由付款人付款。
// 每笔一条 moveCoins 流水（writer 'household-pool'，eventId 带付款人与对方）并经 mirrorPartyCoins 同步现金字段；币总量不变，转出方只转其余额不会为负；
// 已死亡、濒死、昏迷或不再有效的成员不转（与视图 household 同一条件）。返回实际转入额。
declareLedgerWriter('household-pool');
export function householdPoolTopUp(d,engine,payer,need,eventId){
 const state=d.get('state'),balance=id=>coinRead(d,{point:'assets.cash',account:purse(engine,id),legacy:()=>d.get('state','npcs',id)?.coins??0});
 const first=need-balance(payer);if(!(first>0))return 0;
 let short=first;
 const members=(personHousehold(engine,state,payer).value?.members??[]).filter(id=>id!==payer&&poolMember(engine,state,id)).sort();
 for(const member of members){
  if(short<=0)break;
  const amount=Math.min(short,balance(member));if(!(amount>0))continue;
  const key=`${eventId}:pool:${member}`;
  moveCoins(d,{from:purse(engine,member),to:purse(engine,payer),amount,writer:'household-pool',eventId:key});
  mirrorPartyCoins(d,engine,member,-amount,key,'household-pool');mirrorPartyCoins(d,engine,payer,amount,key,'household-pool');
  short-=amount;
 }
 return first-short;
}
function bagEntries(d,engine,state,holder,view){
 const raw=view?viewSide(view,holder).inventory:inventory(state,holder),held=new Map();
 for(const [name,value]of Object.entries(raw)){
  const resolved=engine.byId.has(name)?name:itemResource(engine,name),item=engine.byId.has(resolved)?resolved:name;
  held.set(item,(held.get(item)??0)+qty(value));
 }
 const items=new Set(held.keys());
 const accounts=view?viewSide(view,holder).accounts:d.get('ledger','accounts');
 const byOwner=recordsMemo(accounts,budgetAccounts,()=>{
  const groups=new Map();
  for(const key of Object.keys(accounts??{})){
   const [owner,resource,purpose]=key.split('|');if(purpose!=='inventory')continue;
   const rows=groups.get(owner)??[];rows.push(resource);groups.set(owner,rows);
  }
  return groups;
 });
 for(const resource of byOwner.get(holder)??[]){
  const item=engine.byId.has(resource)?resource:(engine.rules.economy?.credit?.coinages??[]).find(c=>c.id.replace(/^coinage_/,'coin_')===resource)?.item;
  if(item)items.add(item);
 }
 return [...items].map(item=>[item,held.get(item)??0]);
}
function fieldAccess(engine,state,owner,location,at=state.minute){
 const leases=recordsWhere(state.records,'kind','asset_lease').filter(r=>r.subject===location&&leaseState(engine,state,r,at).active);
 return !leases.some(r=>contractTerms(r,at).tenant!==owner)&&(state.buildings?.[location]?.owner===owner||leases.some(r=>contractTerms(r,at).tenant===owner));
}

// Canonical claims and their compatibility projections represent one promise.
function commitmentAllocation(state){
 const amounts=new Map(),represented=new Set();
 const add=(owner,item,amount)=>{const key=`${owner}:${item}`;amounts.set(key,(amounts.get(key)??0)+amount);};
 for(const r of obligationRows(state)){
  if(r.legacyRecord)represented.add(r.legacyRecord);
  if(!obligationClosed(r))add(debtor(r),r.resource??r.item??r.subject,unpaid(r));
 }
 for(const [key,r]of recordsMemo(state.records,commitmentRows,()=>Object.entries(state.records??{}).filter(([,r])=>r.category==='contract'&&r.kind==='procurement'||r.category==='agreed_quote'),{categories:['contract','agreed_quote']})){
  if(represented.has(key)||r.obligation&&state.obligations?.[r.obligation])continue;
  if(r.category==='contract'&&r.kind==='procurement'&&!obligationClosed(r))add(r.parties?.[1],r.subject,unpaid(r));
  // Keep the existing agreed-price receipt/source gate; a quote is not money.
  if(r.category==='agreed_quote'&&r.direction==='sell_to_player'&&r.at<=state.minute&&state.minute<r.expires&&!state.records[`${key}:used`]&&state.records[`${key}:source`]?.digest===digest(r)){
   const source=state.records[`world_event:${r.sourceEvent?.replace(/^world_event:/,'')}`],p=source?.payload;
   if(source?.verb==='quoted'&&source.actor===r.actor&&source.minute===r.at&&p?.to===r.to&&p.resource===r.resource&&p.quantity===r.quantity&&p.totalCoins===r.totalCoins)add(r.actor,r.resource,r.quantity);
  }
 }
 return amounts;
}
export function householdCommitments(state,owner,item){
 return commitmentAllocation(state).get(`${owner}:${item}`)??0;
}

// Stable keyed RX draw: recoverable from campaign seed + identity, independent
// of query minute/order. P prior lives in market.json, not in actor balances.
export function householdBufferTarget(d,engine,owner,{incomeDays=0,risk=0,commonRisk=0,creditCoverage=0,foodDays=null}={}){
 const document=d.document??{state:d.get('state')},r=engine.world.marketRules;
 const roll=evaluateRX(preferenceRoll,{}, {rollKey:{seed:document.randomSeed,pack:'household',rule:'persistent-thrift',object:owner,date:0}});
 // Archived world tables predate the optional preference mixture. Their
 // existing reserve period remains a single ordinary cycle, without writes.
 const configuration=r.householdBuffer;
 const profile=configuration?configuration.profiles.find(p=>roll<=p.through):{id:'ordinary',cycles:1};
 // An affordable single meal must not erase a six-day income gap. Market
 // access lowers physical retention below, in proportion to food actually
 // fundable; the preference horizon itself remains the full income cycle.
 const cycle=Math.max(r.personalReserveDays,incomeDays);
 const exposure=Math.max(0,risk)+Math.max(0,commonRisk);
 const days=Math.max(0,cycle*profile.cycles*(1+exposure)-Math.min(cycle,Math.max(0,creditCoverage)));
 return {days,cycle,foodDays,profile:profile.id,roll,risk,commonRisk,creditCoverage,source:configuration?'seeded-preference':'legacy-reserve-rule',calibration:configuration?.source??r.source};
}

function family(d,engine,owner){
 const s=d.get('state'),h=personHousehold(engine,s,owner).value;
 // Family membership alone is never authority over another purse. Existing
 // registered households share meals; separate households at one address do
 // not become one budget merely by co-residence or kinship.
 const members=h?.members??[owner],shared=members.length>1;
 return {household:h?.id??null,members,holders:members,shared};
}

function seedNeeds(engine,state,holders){
 const needs=new Map(),field=domainRules(engine).privateField;
 if(!field)return needs;
 for(const record of recordsMemo(state.records,seedRecords,()=>Object.values(state.records??{}).filter(r=>r.kind==='asset_lease'||r.category==='private_farm'),seedRecordInputs)){
  const terms=record.kind==='asset_lease'?contractTerms(record,state.minute):record;
  const r={...terms,...(record.kind==='asset_lease'?terms.rentBasis:{})};
  // A growing crop has already consumed seed. Only a signed next sowing or
  // harvested field still used by its owner asks for a new sowing allocation.
  const owner=r.kind==='asset_lease'?r.tenant:r.owner;
  if(!(r.areaMu>0)||!r.seedItem)continue;
  if(r.kind==='asset_lease'){
   if(!leaseState(engine,state,record).active||r.use!=='field')continue;
   // A leased field can be only partly sown. The actual harvested crop's
   // area is the next-cycle basis; the lease's capacity is not a second plan.
   if(recordsWhere(state.records,'category','private_farm').some(f=>f.location===r.subject&&(['growing','ready'].includes(f.status)||f.status==='harvested'&&f.owner===owner)))continue;
  }else if(r.category!=='private_farm'||r.status!=='harvested'||!fieldAccess(engine,state,owner,r.location))continue;
  const binding=field.crops.find(c=>c.seed===r.seedItem);if(!binding)continue;
  const n=binding.yieldSelector==='field:wheat'
   ?Math.ceil(r.areaMu*engine.world.primitiveTables.yields.rows.find(y=>y.key==='field:wheat/seed').seedPerUnit.qty*field.kgPerJin/engine.byId.get(r.seedItem).weight)
   :Math.ceil(r.areaMu*engine.rules.agriculture.crop.seedPerHa/field.muPerHectare);
  const location=r.subject??r.location,lease=r.kind==='asset_lease'?record:recordsWhere(state.records,'kind','asset_lease').find(l=>l.subject===location&&contractTerms(l,state.minute).tenant===owner&&leaseState(engine,state,l).active);
  const signed=lease&&contractTerms(lease,state.minute),t=signed?.tenancy;
  const ownerSeed=t?.inputPayer==='owner'?n:t?.inputPayer==='shared'?Math.ceil(n*t.ownerInputNumerator/t.ownerInputDenominator):0;
  for(const [payer,amount]of [[owner,n-ownerSeed],[signed?.owner,ownerSeed]])if(amount&&holders.includes(payer)){
   const key=`${payer}:${r.seedItem}`;
   // Lease and farm records can refer to the same field; retain each payer once.
   const old=needs.get(key)??new Map();old.set(location,amount);needs.set(key,old);
  }
 }
 return new Map([...needs].map(([key,fields])=>[key,[...fields.values()].reduce((a,b)=>a+b,0)]));
}

// 单餐可食量上限（D12 材料属性 mealCap，按类推导，按时间累计，见 item-class.mealCapPools）：caps 记着每个池的额度、已吃量与整件开封后的余量。
// 带上限的物品（调味佐餐类、水果、坚果等）按毫克吃：先吃开封余量，不够再开新的一件；吃多少不超过池的额度，主体食物不够时它们补不满缺口。无上限的类别照旧按整件。
// 调用方负责把 rows 里已有的（别的持有人的）吃量事先记入 caps。
const unitMg=r=>Math.round((r.definition?.weight??0)*1e6);
const credit=(r,gain)=>r.eatMg!==undefined?r.eatMg*gain/unitMg(r):r.food*gain;
function allocateMeals(rows,needs,caps){
 const shortfall={};
 for(const need of ['satiety','hydration']){
  let remaining=needs[need]-rows.reduce((n,r)=>n+credit(r,r.definition?.nutrition?.[need]??0),0);
  for(const r of rows){
   const gain=r.definition?.nutrition?.[need]??0;if(gain<=0||remaining<=0)continue;
   const w=unitMg(r),room=caps.roomMg(r.item),free=Math.max(0,r.stock-r.committed-r.seed-r.food);
   if(room<Infinity&&w>0){
    if(r.eatMg!==undefined)continue;
    const open=caps.openMg(r.item),eat=Math.min(open+free*w,room,Math.ceil(remaining*w/gain-1e-9));
    if(!(eat>0))continue;
    const fromOpen=Math.min(open,eat);
    r.eatMg=eat;r.fromOpen=fromOpen;r.food+=Math.ceil((eat-fromOpen)/w-1e-9);remaining-=eat*gain/w;caps.take(r.item,{eatMg:eat,fromOpen});
    continue;
   }
   const used=Math.min(free,Math.ceil(remaining/gain));
   if(used<=0)continue;
   r.food+=used;remaining-=used*gain;
  }
  shortfall[need]=Math.max(0,remaining);
 }
 return shortfall;
}
// 一户吃完后的单餐额度状态（写进存档 state.family.mealCap[户键]）：open = 各件开封后剩下的毫克；当天没吃完的额度不留（不跨日叠加）。
function nextMealCapState(rows,saved){
 const open={...saved.open};
 for(const item of new Set(rows.filter(r=>r.eatMg!==undefined).map(r=>r.item)))open[item]=(saved.open[item]??0)+rows.filter(r=>r.item===item&&r.eatMg!==undefined).reduce((n,r)=>n+r.food*unitMg(r)-r.eatMg,0);
 for(const k of Object.keys(open))if(!(open[k]>0))delete open[k];
 return {open};
}

// Public agriculture has already consumed standard daily portions, whose
// satiety follows the body table's base day. Personal drain modifiers change
// need, never the nutrition in that same ration. Private food fills the gap.
export function householdMealPlan(d,engine,owner,{publicShare=0,sourceNutrition={}}={}){
 const state=d.get('state'),f=family(d,engine,owner);
 const members=f.members.filter(id=>id!=='player'&&!isPhysicallyDead(engine,state,id)&&!state.npcs?.[id]?.levy&&!state.npcs?.[id]?.materialized?.folded);
 const needs=Object.fromEntries(['satiety','hydration'].map(need=>[need,members.reduce((sum,id)=>sum+explainDerived(engine,d.document,'body:drain',id,{base:bodyDrain(engine,state,id,need)*24}).value,0)]));
 const publicNutrition={satiety:members.reduce((n,id)=>n+bodyDrain(engine,state,id,'satiety')*24,0)*Math.max(0,Math.min(1,publicShare)),hydration:0};
 const seeds=stateMemo(state,engine,[seedRecords,JSON.stringify(members)],()=>seedNeeds(engine,state,members),seedInputs);
 const commitments=stateMemo(state,engine,[commitmentMemo],()=>commitmentAllocation(state),commitmentInputs);
 // Meals need physical food, seeds and promises, not a quote/income horizon
 // or a scan of everyone's production tasks for every inventory row.
 const saved=savedMealCap(d,f.household??owner);
 // 开封后的余量（整瓶油、整罐蜜没吃完的部分）不在背包里，也是家里的食物：库存为 0 的行代表它，吃的时候不从背包扣。
 const bags=members.flatMap(holder=>bagEntries(d,engine,state,holder,null).map(e=>[holder,...e])),seen=new Set(bags.map(([,item])=>item));
 for(const item of Object.keys(saved.open))if(!seen.has(item)&&members.length)bags.push([members[0],item,undefined]);
 const rows=bags.flatMap(([holder,item,held])=>{
  const definition=engine.byId.get(item);if(!definition?.nutrition)return [];
  const stock=bagStock(d,engine,{point:'region.material',id:holder,item,legacy:()=>qty(held)}),key=`${holder}:${item}`;
  const committed=commitments.get(key)??0,seed=Math.min(Math.max(0,stock-committed),seeds.get(key)??0);
  return [{holder,item,definition,stock,committed,seed,food:0}];
 }).sort((a,b)=>(a.definition?.shelfLifeDays??Infinity)-(b.definition?.shelfLifeDays??Infinity)||a.item.localeCompare(b.item)||a.holder.localeCompare(b.holder)).map(r=>{
  const held=d.get(...engine.bagPath(r.holder),r.item),units=held?.instances??[];
  const safe=id=>{const f=physicalItem(d,engine,id);return f.contaminated!==true&&f.toxic!==true&&f.condition!==0;};
  const selection=units.filter(safe),loose=safe(r.item)?Math.max(0,r.stock-units.length):0;
  return {...r,definition:engine.byId.get(r.item),stock:Math.min(r.stock,loose+selection.length),selection,food:0};
 });
 return householdMealWithSources({household:f.household,members,needs,publicNutrition,[mealCandidates]:rows,[mealCapCtx]:{engine,saved,days:members.map(()=>1)}},sourceNutrition);
}

// Midnight reads every household's physical bags against one revision. Source
// withdrawals do not alter those bags, so changing the supplied nutrition can
// reuse the same safe units/seeds/promises without rebuilding ledger indexes.
export function householdMealWithSources(plan,sourceNutrition={}){
 const rows=plan[mealCandidates].map(r=>({...r,food:0,eatMg:undefined,fromOpen:undefined})),{engine,saved,days}=plan[mealCapCtx];
 const caps=mealCapPools(engine,{days,saved});for(const r of rows)if(r.stock>0)caps.markHeld(r.item);
 const shortfall=allocateMeals(rows,Object.fromEntries(Object.keys(plan.needs).map(n=>[n,plan.needs[n]-plan.publicNutrition[n]-(sourceNutrition[n]??0)])),caps);
 const bad=caps.violations();if(bad.length)throw Error(`单餐额度不变量被破坏：${bad.join('、')}`);
 return {...plan,shortfall,capState:nextMealCapState(rows,saved),rows:rows.filter(r=>r.food>0||r.eatMg>0).map(({definition,...r})=>({...r,selection:r.selection.slice(0,r.food)}))};
}

export function householdResources(d,engine,owner,{days=null,view=null,risk=0,commonRisk=0,marketSubstitution=true}={}){
 // 免费水依赖日期与水体：随预算读同一缓存（见 freeWaterToday 注释），键里带日期。
 const read=()=>readHouseholdResources(d,engine,owner,{days,view,risk,commonRisk,marketSubstitution,free:freeWaterToday(d,engine,owner,view)});
 return view?read():budgetRead(d,engine,[resourceMemo,owner,days,risk,commonRisk,marketSubstitution,Math.floor(d.get('state','minute')/DAY)],read);
}
function readHouseholdResources(d,engine,owner,{days,view,risk,commonRisk,marketSubstitution,free}){
 const state=d.get('state'),f=family(d,engine,owner),subjective=Boolean(view);
 if(view&&view.observer!==owner)throw Error('Household budget observer mismatch');
 // Knowing the household's mouths does not grant access to their private
 // bags. Subjective needs use known derived facts, with the public body base
 // when another member's private modifiers are unknown.
 // 主观视图下同户成员的背包与钱袋并入这一户的预算，与客观读（f.holders）同一口径；
 const pool=subjective?Object.keys(view.household?.people??{}):[];
 const holders=subjective?[owner,...pool]:f.holders,members=f.shared?f.members:[owner];
 const seeds=subjective?new Map():stateMemo(state,engine,[seedRecords,JSON.stringify(holders)],()=>seedNeeds(engine,state,holders),seedInputs);
 const promises=subjective?view.self.obligations??[]:[...obligationRows(state),...recordsMemo(state.records,promisedRecords,()=>Object.values(state.records??{}).filter(r=>r.kind==='procurement'||r.category==='agreed_quote'))];
 const saved=savedMealCap(d,f.household??owner);
 const rows=holders.flatMap(holder=>{
  const entries=new Map(bagEntries(d,engine,state,holder,view));
  // 开封余量属于这户，由这户的第一位持有人（排序后）的行代表；库存为 0。
  if(holder===holders[0])for(const item of Object.keys(saved.open))if(!entries.has(item)&&engine.byId.has(item))entries.set(item,undefined);
  for(const key of seeds.keys())if(key.startsWith(`${holder}:`))entries.set(key.slice(holder.length+1),entries.get(key.slice(holder.length+1)));
  for(const r of promises){
   const item=r.resource??r.item??r.subject;
   if((debtor(r)??(r.kind==='procurement'?r.parties?.[1]:r.actor))===holder&&engine.byId.has(item)&&!obligationClosed(r)&&!entries.has(item))entries.set(item,undefined);
  }
  return [...entries].map(([item,held])=>{
  const definition=engine.byId.get(item),key=`${holder}:${item}`;
  const stock=subjective?(viewSide(view,holder).accounts?.[bag(engine,holder,item)]?.balance??qty(held)):bagStock(d,engine,{point:'region.material',id:holder,item,legacy:()=>qty(held)});
  return {holder,item,key,definition,stock,food:0,seed:0,seedTarget:0,committed:0,inUse:0};
  });
 }).sort((a,b)=>(a.definition?.shelfLifeDays??Infinity)-(b.definition?.shelfLifeDays??Infinity)||a.item.localeCompare(b.item)||a.holder.localeCompare(b.holder));
 const commitments=subjective?null:stateMemo(state,engine,[commitmentMemo],()=>commitmentAllocation(state),commitmentInputs);
 for(const r of rows){
  r.committed=subjective?(viewSide(view,r.holder).obligations??[]).filter(o=>!obligationClosed(o)&&debtor(o)===r.holder&&(o.resource??o.item??o.subject)===r.item).reduce((n,o)=>n+unpaid(o),0):commitments.get(r.key)??0;
  r.seedTarget=seeds.get(r.key)??0;
  r.seed=Math.min(Math.max(0,r.stock-r.committed),r.seedTarget);
  r.inUse=subjective?0:Object.values(state.npcAutonomy?.tasks??{}).some(t=>t.npc===r.holder&&t.status==='进行中'&&(engine.world.recipes.find(p=>p.id===t.action?.recipe)?.tools??[]).includes(r.item))?1:0;
 }
 // A quote is future access, never current food or cash. Earmark only this
 // person's cash, net of known payments before acquisition; no family purse.
 // 主观读一律按户算一次：本人加同户成员的钱袋合计（同户共灶，李白 11-11）；执行购买时钱不够的部分先在户内钱袋间转账（household-budget.mjs householdPoolTopUp）。
 const cash=view?pooledCash(engine,owner,view):objectiveCash(d,engine,state,owner);
 const payments=futureSources(d,engine,owner,view).payments;
 const sources=marketSubstitution&&cash>0&&commonRisk<1?accessibleSources(d,engine,owner,{view,cash,commonRisk,payments,now:state.minute}):[];
 const nextFood=sources.length?Math.min(...sources.map(r=>r.at)):null;
 // Resolve each person's target once for both nutrient dimensions.
 const horizons=new Map(members.map(id=>{
  const planner=subjective?owner:id;
  const future=days===null?futureSources(d,engine,planner,view).future:[];
  const next=future.find(r=>r.reliable)??future.find(r=>r.source==='harvest');
  const incomeDays=next?Math.max(0,(next.at-state.minute)/DAY):0;
  const incomeRisk=future.length?future.filter(r=>!r.reliable).length/future.length:0;
  return [id,days??householdBufferTarget(d,engine,planner,{incomeDays,risk:risk+incomeRisk,commonRisk,foodDays:nextFood===null?null:(nextFood-state.minute)/DAY}).days];
 }));
 const needs=Object.fromEntries(['satiety','hydration'].map(need=>[need,members.reduce((n,id)=>n+explainDerived(engine,d.document??{state},'body:drain',id,{base:bodyDrain(engine,state,id,need)*24*horizons.get(id),...(view?{observer:owner,view}:{})}).value,0)]));
 // 当日可免费取到的水从水分需求里扣（只扣当日份、不超过需求）；第 2…N 天的水分仍由存量与购买覆盖。
 needs.hydration=Math.max(0,needs.hydration-Math.min(free.hydration,needs.hydration));
 // 聚落公粮每天已覆盖的饱腹（与午夜 mealDeficit 同一份额函数）不用买：按成员标准日耗 × 预算天数 × 公粮份额扣除；个人代谢修正只增减需求，不增减配给本身（同 householdMealPlan）。
 const publicShare=publicShareOf(engine,state,owner);
 const publicSatiety=(wait=null)=>publicShare>0?members.reduce((n,id)=>n+bodyDrain(engine,state,id,'satiety')*24*(wait===null?horizons.get(id):Math.min(wait,horizons.get(id))),0)*publicShare:0;
 needs.satiety=Math.max(0,needs.satiety-publicSatiety());
 // 单餐额度的池：现有累计额度 + 预算期内新增额度（各成员的预算天数），与日推进实际吃掉的量同一套（item-class.mealCapPools）。
 // 两次 newCaps 共用同一份 poolMemo：池只由 engine 与物品定，与额度已用量无关；used/held 等状态仍各自独立。
 const capDays=[...horizons.values()],poolMemo=new Map(),newCaps=()=>{const c=mealCapPools(engine,{days:capDays,saved,poolMemo});for(const r of rows)if(r.stock>0)c.markHeld(r.item);return c;};
 const baseline=rows.map(r=>({...r})),procurementShortfall=allocateMeals(baseline,needs,newCaps());
 // Shared food is allocated once in a stable order. My cash can release my
 // own retained goods, but cannot silently release another holder's reserve
 // by promising that I will feed them later. That requires an actual transfer.
 for(let i=0;i<rows.length;i++)if(rows[i].holder!==owner)Object.assign(rows[i],{food:baseline[i].food,eatMg:baseline[i].eatMg,fromOpen:baseline[i].fromOpen});
 const caps=newCaps();
 for(const r of rows)if(r.eatMg>0)caps.take(r.item,{eatMg:r.eatMg,fromOpen:r.fromOpen});
 const otherFood=Object.fromEntries(Object.keys(needs).map(need=>[need,rows.reduce((n,r)=>n+credit(r,r.definition?.nutrition?.[need]??0),0)]));
 const market={cash,spent:0,coverage:{satiety:0,hydration:0},physicalFloor:{satiety:0,hydration:0},purchases:[],offered:[...new Set([...(sources.considered??[]),...sources.map(r=>r.source)])],freeWater:free,nextFoodAt:nextFood};
 const maxDays=Math.max(0,...horizons.values());
 const deliveries=sources.flatMap(source=>{
  const rows=[source];
  if(source.cycleDays>0)for(let at=source.at+source.cycleDays*DAY;at<=state.minute+maxDays*DAY;at+=source.cycleDays*DAY)rows.push({...source,at});
  return rows;
 });
 // 购买次序（李白 2026-11-10 口径：居民买每铜币有效饱腹最高的东西）：先按到货时间（早到的先用）；同一时间到货的来源，逐次挑“对本户当前剩余缺口
 // 的有效覆盖 ÷ 花费”最高者，买完再按新的剩余缺口重算；最后按物品编号、来源编号的码点序（不用 localeCompare），结果确定。
 // 有效覆盖已计入现金、供货量、单餐额度池（被额度卡住的佐餐品只算额度内买得到、吃得掉的那几件）与缺口（不超过剩余缺口）。
 // 多种营养（satiety、hydration）合成一个价值：每种营养取“覆盖量 ÷ 当前剩余缺口”（即这次购买补上了这一项缺口的多大比例）再相加，
 // 以当前剩余缺口为权重，没有任何拍定系数；只有一种营养有缺口时就是按饱腹 ÷ 单价。
 const cmp=(x,y)=>x<y?-1:x>y?1:0;
 // 日常来源先挑；日常补不满缺口时，被延后的奢侈来源（deferred：奢侈且本户现金不宽裕）才进候选，补剩余缺口。宽裕户的奢侈来源不延后，与日常品同等参与。
 for(const tier of [false,true]){
 const pending=deliveries.filter(x=>Boolean(x.deferred)===tier).sort((a,b)=>a.at-b.at||cmp(a.item,b.item)||cmp(a.source??'',b.source??''));
 while(pending.length){
  const at=pending[0].at,wait=(at-state.minute)/DAY;
  let n=0;while(n<pending.length&&pending[n].at===at)n++;
  const group=pending.splice(0,n);
  if(wait>maxDays)continue;
  const due=payments.filter(r=>r.resource===COIN&&r.at<=at).reduce((m,r)=>m+r.amount,0);
  // 性能：「到货前身体消耗」只取决于（成员、营养项、wait、状态、视角），本组内 wait 与状态都不变（循环只改 market/caps 局部量，
  // 不写状态），每买一件重算得到的是同一个数；按营养项在本组内首次用到时算一次（惰性，抛错时机与原先一致），其后复用。
  const drainBefore=new Map();
  while(group.length){
   const remaining=Object.fromEntries(Object.keys(needs).map(need=>{
    let before=drainBefore.get(need);
    if(before===undefined){before=members.reduce((m,id)=>m+explainDerived(engine,d.document??{state},'body:drain',id,{base:bodyDrain(engine,state,id,need)*24*Math.min(wait,horizons.get(id)),...(view?{observer:owner,view}:{})}).value,0);if(need==='satiety')before=Math.max(0,before-publicSatiety(wait));drainBefore.set(need,before);}
    market.physicalFloor[need]=Math.max(market.physicalFloor[need],before-otherFood[need]-market.coverage[need]);
    return [need,Math.max(0,needs[need]-otherFood[need]-market.physicalFloor[need]-market.coverage[need])];
   }));
   const money=Math.max(0,cash-due-market.spent);
   const options=group.map(source=>{
    const nutrition=engine.byId.get(source.item)?.nutrition??{};
    const wanted=Math.max(0,...Object.keys(needs).filter(k=>nutrition[k]>0).map(k=>Math.ceil(remaining[k]/nutrition[k])));
    const quantity=Math.min(wanted,Math.floor(source.quantity*Math.max(0,1-commonRisk)),Math.floor(money/source.unitPrice),caps.unitsRoom(source.item,wait));
    const cover=Object.fromEntries(Object.keys(needs).map(k=>[k,Math.min(remaining[k],quantity*(nutrition[k]??0))]));
    const value=quantity>0?Object.keys(needs).reduce((m,k)=>m+(remaining[k]>0?cover[k]/remaining[k]:0),0)/(quantity*source.unitPrice):0;
    return {source,quantity,cover,value};
   }).filter(o=>o.quantity>0);
   if(!options.length)break;
   const best=options.reduce((a,b)=>b.value>a.value||b.value===a.value&&(cmp(b.source.item,a.source.item)<0||b.source.item===a.source.item&&cmp(b.source.source??'',a.source.source??'')<0)?b:a);
   const {source,quantity}=best;
   caps.take(source.item,{eatMg:quantity*itemMg(engine,source.item),start:wait});
   const cost=quantity*source.unitPrice;market.spent+=cost;
   for(const need of Object.keys(needs))market.coverage[need]+=best.cover[need];
   market.purchases.push({...source,quantity,cost});
   group.splice(group.indexOf(source),1);
  }
 }
 }
 const shortfall=allocateMeals(rows,Object.fromEntries(Object.keys(needs).map(need=>[need,Math.max(0,needs[need]-market.coverage[need])])),caps);
 {const bad=caps.violations();if(bad.length)throw Error(`单餐额度不变量被破坏：${bad.join('、')}`);}
 reserveUpkeep(engine,state,members,rows);
 // Cash-backed access is not a completed purchase. The real shopping
 // consumer still needs the goods missing from its current physical bags.
 return {owner,household:f.household,members,scope:subjective?'subjective':'kernel',sharedMeals:f.shared,shortfall,procurementShortfall,market,
  seedShortfall:rows.reduce((n,r)=>n+r.seedTarget-r.seed,0),commitmentShortfall:rows.reduce((n,r)=>n+Math.max(0,r.committed-r.stock),0),rows:rows.map(({definition,key,...r})=>{
  const retained=Math.max(r.inUse,r.food+r.seed)+(r.upkeep??0);
  return {...r,consumable:Boolean(definition?.nutrition),retained,available:Math.max(0,r.stock-retained-r.committed)};
 })};
}

// 家户用度自留（K2，与 npc-life 的家户用度同一口径）：npc-life 每天从户里扣的消耗类（householdUsage 的燃料、调味按重量），
// 按一户的日用量 × 一个交易周期（economy.tradeCycleDays）留在家里。书、工具等耐用品（durable）不是按日消耗的，
// 不按“日用量 × 周期”留；正在干活用着的工具由 inUse 留。店主货架上待售的货（本店补货清单）不是家用，不留。读 saleableStock/householdResources 的地方都据此只卖余量。
// 用度定义只有 item-class.mjs 的 householdUsage 一份，这里按状态时刻读它。
export function householdUsage(engine,state,members){return usageDefinition(engine,state.minute,members);}
export const itemGrams=(engine,item)=>Math.max(1,Math.round((engine.byId.get(item)?.weight??0)*1000));
// 这件货顶多少基准克（燃料按有效热值折算，见 item-class.usageGrams；其余等于 itemGrams）。
export const usageItemGrams=(engine,item,cls)=>usageGrams(engine,item,cls,itemGrams(engine,item));
// 家户用度先用同类里最便宜的：价格 ÷ 顶多少基准克。燃料按有效热值折算（热值与含水率已知，见 item-class.usageGrams），其余与未知时按 价格 ÷ 克。
export function usageCost(engine,item){const it=engine.byId.get(item);return (it?.basePrice??0)/(isItemClass(engine,item,'fuel')?usageItemGrams(engine,item,'fuel'):itemGrams(engine,item));}
// 一户一日用掉这件货多少件（不属于消耗类的为 0）。
export function householdDailyUse(engine,state,members,item){
 return householdUsage(engine,state,members).filter(u=>isItemClass(engine,item,u.cls)).reduce((n,u)=>{const g=usageItemGrams(engine,item,u.cls);return g>0?n+u.gramsPerDay/g:n;},0);
}
function reserveUpkeep(engine,state,members,rows){
 const cycle=engine.rules.economy?.tradeCycleDays??1,stock=new Map();
 const merchandise=holder=>{if(!stock.has(holder))stock.set(holder,new Set(registerMerchandiseResolver.fn?.(engine,state,holder)??[]));return stock.get(holder);};
 for(const u of householdUsage(engine,state,members)){
  let grams=u.gramsPerDay*cycle;
  // 家里留着用的是同类里最便宜的那些（usageCost，与 npc-life 实际先用的顺序同一个函数），贵的（如引火包）才是可出让的余货。
  for(const r of [...rows].sort((a,b)=>usageCost(engine,a.item)-usageCost(engine,b.item)||a.item.localeCompare(b.item)||a.holder.localeCompare(b.holder))){
   if(grams<=0)break;
   // 家户用度只扣名册人物的户（npc-life householdUpkeep 只取 state.npcs 里的户员）；玩家不按日自动扣，也就不替他留。
   if(!state.npcs?.[r.holder]||!isItemClass(engine,r.item,u.cls)||merchandise(r.holder).has(r.item))continue;
   const free=Math.max(0,r.stock-r.committed-r.food-r.seed-(r.upkeep??0)),unit=usageItemGrams(engine,r.item,u.cls);
   if(!(unit>0))continue;
   const take=Math.min(free,Math.ceil(grams/unit));
   if(take>0){r.upkeep=(r.upkeep??0)+take;grams-=take*unit;}
  }
 }
}
function futureSources(d,engine,owner,view){
 return view?buildFutureSources(d,engine,owner,view):budgetRead(d,engine,`future:${owner}`,()=>buildFutureSources(d,engine,owner,null));
}
function buildFutureSources(d,engine,owner,view){
 // 主观读：同户成员的未了义务（欠债、已承诺付款、应收工钱）并入这一户的收支，户池现金才扣得掉他们要付的账；客观读本来就读全部义务行。
 const s=d.get('state'),house=new Set([owner,...Object.keys(view?.household?.people??{})]);
 const once=new Set(),rows=view?[...(view.self.obligations??[]),...Object.values(view.household?.people??{}).flatMap(p=>p.obligations??[])].filter(r=>!r.id||!once.has(r.id)&&once.add(r.id)):obligationRows(s),future=[],payments=[];
 for(const r of rows){
  if(obligationClosed(r)||!Number.isFinite(r.deadline))continue;
  const resource=r.resource??r.item??(r.category==='debt'||r.debtor||r.coins!==undefined?COIN:null),amount=unpaid(r);
  if(!amount||!resource)continue;
  const at=Math.max(s.minute,r.dueAt??r.deadline),entry={id:r.id,resource,amount,at,day:at/DAY,source:r.kind??r.type,reliable:resource===COIN&&['wage','rent'].includes(r.kind??r.type)&&r.deadline>=s.minute};
  if(view?house.has(creditor(r)):creditor(r)===owner)future.push(entry);
  if(view?house.has(debtor(r)):debtor(r)===owner)payments.push(entry);
 }
 for(const r of recordsMemo(s.records,futureRecords,()=>{
  const owners=new Map();
  for(const r of Object.values(s.records??{})){
   if(r.kind!=='workshop'&&r.category!=='private_farm')continue;
   const lease=r.lease&&s.records?.[r.lease],terms=lease&&contractTerms(lease,s.minute);
   const ids=new Set([...(r.kind==='workshop'?[r.worker]:[]),...(r.category==='private_farm'?[r.owner,...(terms?.tenancy?.rentMode==='share'?[terms.owner]:[])]:[])]);
   for(const id of ids){const rows=owners.get(id)??[];rows.push(r);owners.set(id,rows);}
  }
  return owners;
 }).get(owner)??[]){
  // Own signed terms are known; a remote farm's current condition is not.
  if(view&&(r.kind==='workshop'||view.self.location!==r.location||!r.lease||contractTerms(s.records?.[r.lease]??{}).tenancy?.rentMode!=='share'))continue;
  if(r.kind==='workshop'&&r.worker===owner){
   const job=contractTerms(r,s.minute);
   if(employmentActive(job,s)&&job.status!=='罢工'&&job.nextWork>s.minute&&job.nextWork<job.deadline&&job.wage>0)
    future.push({id:job.id,resource:COIN,amount:job.wage,at:job.nextWork,day:job.nextWork/DAY,source:'employment',reliable:true});
  }
  if(r.category!=='private_farm'||!['growing','ready'].includes(r.status))continue;
  const lease=r.lease&&s.records?.[r.lease],terms=lease&&contractTerms(lease,s.minute),t=terms?.tenancy;
  const tenant=r.owner===owner,landlord=t?.rentMode==='share'&&terms.owner===owner;
  if(!tenant&&!landlord)continue;
  const at=s.minute+Math.max(0,engine.rules.agriculture.crop.growthDays-r.grownDays)*DAY;
  if(!(fieldAccess(engine,s,r.owner,r.location,at)||t?.unharvestedCrops==='tenant'||r.cropDisposition?.policy==='tenant')||s.buildings?.[r.location]?.condition<=0)continue;
  const base=privateCropYieldBase(engine,r);
  const amount=r.status==='ready'?priceRead(d,{point:'region.material',account:cropAccount(engine,r.location,r.crop),lots:{id:`private:${r.seedEvent}`,after:Math.floor(s.minute/DAY)},legacy:()=>Math.max(0,r.yield-(r.harvestedQty??0))}):Math.floor(view?base:explainDerived(engine,d.document??{state:s},'economy:yield',r.location,{holder:r.owner,base}).value);
  let disposable=amount;
  if(t?.rentMode==='share'&&terms.tenant===r.owner){
   const past=(lease.harvests??[]).filter(h=>h.seedEvent===r.seedEvent).at(-1)?.assessed??0;
   const predicted=(lease.shareAssessed??0)+tenancyRentAmount(t,(r.harvestedQty??0)+amount,r.inputs??[])-past,advance=terms.prepayment??0;
   const owed=Math.max(0,predicted-advance)-Math.max(0,(lease.shareAssessed??0)-advance);
   if(landlord){if(owed)future.push({id:lease.id,resource:t.rentPayment==='kind'?r.crop:COIN,amount:owed,at:Math.max(at,terms.rentDueAt??at),day:Math.max(at,terms.rentDueAt??at)/DAY,source:'harvest-rent',reliable:false});continue;}
   if(t.rentPayment==='kind')disposable=Math.max(0,amount-owed);
   else if(owed)payments.push({id:lease.id,resource:COIN,amount:owed,at:Math.max(at,terms.rentDueAt??at),day:Math.max(at,terms.rentDueAt??at)/DAY,source:'harvest-rent',reliable:false});
  }
  future.push({id:r.id,resource:r.crop,amount:disposable,at,day:at/DAY,source:'harvest',reliable:false});
 }
 return {future:future.sort((a,b)=>a.at-b.at),payments:payments.sort((a,b)=>a.at-b.at)};
}

// Default is the actor's knowledge. Kernel consumers must opt in explicitly.
export function householdBudget(d,engine,owner,{kernel=false,view=null,risk=0,commonRisk=0,creditCoverage=0}={}){
 const state=d.get('state'),document=d.document??{state};
 if(!kernel)view??=subjectiveView(engine,document,owner);
 if(view&&view.observer!==owner)throw Error('Household budget observer mismatch');
 const cash=view?pooledCash(engine,owner,view):objectiveCash(d,engine,state,owner);
 const {future,payments}=futureSources(d,engine,owner,view),reliable=future.find(r=>r.reliable),next=reliable??future.find(r=>r.source==='harvest'),until=next?.at??state.minute+engine.world.marketRules.personalReserveDays*DAY;
 const incomeRisk=future.length?future.filter(r=>!r.reliable).length/future.length:0;
 const purchasable=cash>0&&commonRisk<1?accessibleSources(d,engine,owner,{view,cash,commonRisk,payments,now:state.minute}):[];
 const foodDays=purchasable.length?Math.max(0,(Math.min(...purchasable.map(r=>r.at))-state.minute)/DAY):null;
 const target=householdBufferTarget(d,engine,owner,{incomeDays:(until-state.minute)/DAY,risk:risk+incomeRisk,commonRisk,creditCoverage,foodDays});
 const resources=householdResources(d,engine,owner,{days:target.days,view,risk,commonRisk});
 // Simultaneous contractual receipts precede payments in this projection;
 // nothing is spendable now until its actual transfer has occurred.
 const times=[...new Set([...future,...payments].filter(r=>r.resource===COIN&&r.at<=until).map(r=>r.at))].sort((a,b)=>a-b);
 let balance=cash,gap=0;const timeline=[];
 const net=at=>future.filter(r=>r.resource===COIN&&r.reliable&&r.at===at).reduce((n,r)=>n+r.amount,0)-payments.filter(r=>r.resource===COIN&&r.at===at).reduce((n,r)=>n+r.amount,0);
 for(const at of times){balance+=net(at);gap=Math.max(gap,-balance);timeline.push({at,balance,shortfall:Math.max(0,-balance)});}
 // Hypothetical purchases are a separate scenario, not new obligations or
 // already-spent cash. K09 can compare its gap with the contractual timeline.
 const foodPlan=resources.market.purchases.filter(r=>r.at<=until),foodTimeline=[];
 let plannedBalance=cash,plannedCashShortfall=0;
 for(const at of [...new Set([...times,...foodPlan.map(r=>r.at)])].sort((a,b)=>a-b)){
  const plannedFood=foodPlan.filter(r=>r.at===at).reduce((n,r)=>n+r.cost,0);
  plannedBalance+=net(at)-plannedFood;plannedCashShortfall=Math.max(plannedCashShortfall,-plannedBalance);
  foodTimeline.push({at,balance:plannedBalance,plannedFood,shortfall:Math.max(0,-plannedBalance)});
 }
 return {owner,scope:view?'subjective':'kernel',cash,future,payments,until,nextReliableIncome:reliable??null,horizonSource:next?.id??'short-window-fallback',target,resources,timeline,cashShortfall:gap,foodTimeline,plannedCashShortfall,expectations:view?view.knowledge.facts:{},mutualAidAvailable:0};
}

// K08/K09 get marginal physical/cash budgets, not permission to execute a
// transfer. Raising money remains a request until consent AND actual payment.
export function householdMarginalBudget(budget,{operation,item,quantity=1,unitPrice=0,totalCoins=null,fundingOffer=null}={}){
 if(!Number.isSafeInteger(quantity)||quantity<0||!Number.isFinite(unitPrice)||unitPrice<0||totalCoins!==null&&(!Number.isSafeInteger(totalCoins)||totalCoins<0))throw Error('Invalid marginal budget');
 const price=fixedUnits(unitPrice),cost=totalCoins??fixedInteger(price*BigInt(quantity));
 const own=budget.resources.rows.filter(r=>r.holder===budget.owner&&r.item===item),available=own.reduce((n,r)=>n+r.available,0);
 const consumptionMaximum=own.filter(r=>r.consumable).reduce((n,r)=>n+Math.max(0,r.stock-r.seed-r.committed-r.inUse),0);
 if(!Number.isSafeInteger(cost))throw Error('Invalid marginal budget total');
 if(operation==='sell')return {operation,item,quantity,feasible:quantity<=available,cashDelta:cost,stockDelta:-quantity,maximum:available};
 if(operation==='consume')return {operation,item,quantity,feasible:quantity<=consumptionMaximum,cashDelta:0,stockDelta:-quantity,maximum:consumptionMaximum};
 if(operation==='retain')return {operation,item,quantity,feasible:quantity<=available,cashDelta:0,stockDelta:0,maximum:available};
 if(operation==='buy')return {operation,item,quantity,feasible:cost<=budget.cash,cashDelta:-cost,stockDelta:quantity,maximum:price>0n&&totalCoins===null?Number(BigInt(budget.cash)*FIXED_SCALE/price):null};
 if(operation==='raise'){
  // K09 supplies a quote visible to this actor. Feasibility is conditional
  // on that offer, not proof of consent or permission over the lender's purse.
  const neededAt=budget.timeline.find(r=>r.shortfall>0)?.at??budget.until;
  const timely=Number.isFinite(fundingOffer?.at)&&fundingOffer.at<=neededAt;
  const maximum=timely&&Number.isSafeInteger(fundingOffer?.amount)&&fundingOffer.amount>=0?fundingOffer.amount:0;
  const feasible=quantity>0&&quantity<=maximum;
  return {operation,quantity,feasible,conditional:true,source:fundingOffer?.id??null,at:fundingOffer?.at??null,requires:['consent','transfer'],cashDelta:0,conditionalCashDelta:feasible?quantity:0,stockDelta:0,maximum};
 }
 throw Error('Unknown household operation');
}
export function householdOptions(budget,{item,quantity=1,unitPrice=0,totalCoins=null,fundingOffer=null}={}){
 return ['consume','sell','retain','buy','raise'].map(operation=>householdMarginalBudget(budget,{operation,item,quantity,unitPrice,totalCoins,fundingOffer}));
}

// Cash, meals and the household's retained time remain separate facts. A meal
// offer is only a possible benefit here; settlement still transfers real stock.
export function householdLaborBudget(d,engine,owner,{minute=d.get('state','minute'),wage=0,workMinutes=480,commuteMinutes=0,travelCost=0,outsideWage=0,meals=[],employer=null,seed=d.document?.randomSeed,decisionKey='employment',kernel=false,view=null}={}){
 const state=d.get('state'),time=householdWorkTime(engine,state,owner,minute,{workMinutes,commuteMinutes});
 const config=engine.world.primitiveTables?.yields?.params?.find(r=>r.id==='labor.choice')?.value;
 const draw=(expression,rule,date,object=owner)=>evaluateRX(expression,{}, {rollKey:{seed,pack:'household',rule,object,date}});
 const preference=draw(laborPreferenceRoll,'persistent-reservation',0);
 const percent=config?config.reservationLowPercent+Math.floor((config.reservationHighPercent-config.reservationLowPercent)*(preference-1)/19):100;
 const noise=config?Math.trunc((draw(laborNoiseRoll,'labor-choice',minute,`${owner}:${decisionKey}`)*2-21)*config.noisePercent/19):0;
 if(!kernel)view??=subjectiveView(engine,d.document??{state},owner);
 const resources=householdResources(d,engine,owner,{days:1,marketSubstitution:false,view});
 const foodMissing=resources.procurementShortfall.satiety>0;
 const food=[],allocated=new Map();let remaining=resources.procurementShortfall.satiety;
 for(const meal of meals){
  const nutrition=engine.byId.get(meal.item)?.nutrition?.satiety??0;
  if(!employer||nutrition<=0||!Number.isSafeInteger(meal.quantity)||meal.quantity<=0)continue;
  // Advertised meals are a promise, not knowledge of the employer's purse or
  // pantry. The kernel checks and transfers the actual stock at settlement.
  const stock=kernel?bagStock(d,engine,{point:'labor.stock',id:employer,item:meal.item,legacy:()=>qty(inventory(state,employer)[meal.item])}):meal.quantity;
  const quantity=Math.min(Math.floor(meal.quantity*time.workMinutes/480),Math.max(0,stock-(allocated.get(meal.item)??0)),Math.ceil(Math.max(0,remaining)/nutrition));
  if(!quantity)continue;
  const unitPrice=engine.byId.get(meal.item)?.basePrice??0;
  allocated.set(meal.item,(allocated.get(meal.item)??0)+quantity);
  food.push({item:meal.item,quantity,nutrition:quantity*nutrition,value:quantity*unitPrice});remaining-=quantity*nutrition;
 }
 const cash=Math.ceil(wage*time.workMinutes/480),foodValue=food.reduce((n,r)=>n+r.value,0);
 const alternative=Math.ceil(outsideWage*time.workMinutes/480),commuteCost=Math.ceil(outsideWage*time.commuteMinutes/480)+travelCost;
 const reservation=Math.ceil(alternative*percent/100)+commuteCost;
 const noiseValue=Math.trunc(Math.max(alternative,cash)*noise/100);
 return {time,cash,food,foodValue,foodMissing,alternative,commuteCost,reservation,preferencePercent:percent,noisePercent:noise,noiseValue,net:cash+foodValue-reservation+noiseValue,feasible:time.workMinutes>0&&!time.unattended};
}

// 本户可动用现金（同户共灶成员钱袋合计，客观读口径）：持货人进货等“买得起几件”的二分用它，付款时钱袋不够再 householdPoolTopUp 落账。
export const householdCash=(d,engine,owner)=>objectiveCash(d,engine,d.get('state'),owner);
