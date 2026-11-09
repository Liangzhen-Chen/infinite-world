// 只读诊断探针（C、E 组差异来源）：只在内存里按测试同样步骤搭场景，只打印 JSON 行，不写任何世界数据或文件。
// 用法：run-script <dir> tools/probe-ce.mjs scene=finance|budget|s3fin|restock|gucen [variant=s4|owner2|receipt]
// 夹具：finance/s3fin 直接导入 tests/helpers/finance.mjs；budget/restock/gucen 的夹具原在各测试文件内部，
// 这里按测试同样步骤在探针里构造（不迁移夹具、不改任何测试）。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,PatchCursor} from '../server-plugin/storage.mjs';
import {householdResources,registerHouseholdFoodSources} from '../server-plugin/household-budget.mjs';
import {quoteSupply,saleableStock,registerShopShelves} from '../server-plugin/market.mjs';
import {currentShops} from '../server-plugin/shop.mjs';
import {netAssets} from '../server-plugin/finance-assets.mjs';
import {adoptLegacyObligation} from '../server-plugin/obligation-runtime.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {marketScheduleAt,subsistenceScheduleAt} from '../server-plugin/npc-state.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {applyIntentSetup} from './a3-score.mjs';
import {resyncBooks} from '../tests/helpers/ledger-sync.mjs';
import {fixture as finFixture,host as finHost} from '../tests/helpers/finance.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.split('=')).filter(p=>p.length===2));
const scene=args.scene,DAY=1440,ITEM='item_bread';
const emit=(tag,obj)=>console.log(JSON.stringify({scene,tag,...obj}));
const safe=(tag,fn)=>{try{return fn();}catch(err){emit(tag,{error:String(err?.message??err).slice(0,300)});return null;}};
const qty=v=>typeof v==='number'?v:v?.quantity??0;
const reader=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const WORLD_CACHE={};
const world=async()=>WORLD_CACHE.w??=await loadWorld();
const legacy=async()=>JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));

// ---- 通用读取 ----
const fmtRow=r=>({holder:r.holder,item:r.item,stock:r.stock,food:r.food,seed:r.seed,committed:r.committed,upkeep:r.upkeep??0,retained:r.retained,available:r.available});
function resources(d,e,id,opts={}){
 const r=householdResources(d,e,id,opts);
 return {owner:id,members:r.members,sharedMeals:r.sharedMeals,
  cash:r.market.cash,spent:r.market.spent,coverage:r.market.coverage,physicalFloor:r.market.physicalFloor,nextFoodAt:r.market.nextFoodAt,
  purchases:r.market.purchases.map(p=>({source:p.source,seller:p.seller,item:p.item,at:p.at,quantity:p.quantity,unitPrice:p.unitPrice,cost:p.cost,cycleDays:p.cycleDays??null,basis:p.priceBasis})),
  shortfall:r.shortfall,rows:r.rows.filter(x=>x.item===ITEM||x.consumable&&x.stock>0).map(fmtRow)};
}
const residents=e=>[...new Set([...(e.world.households??[]).filter(h=>h.settlement==='loc_hw').flatMap(h=>h.members),'player'])];
const sourcesOf=(d,e,id)=>registerHouseholdFoodSources.fn?.(d,e,id,{view:null})??[];
// 供给/需求分解 + 每位居民（开/关口粮市场顶替）的面包预留，验证“同一卖家存量被每个买方各算一次”
function market(label,d,e,place,extra={}){
 safe(`${label}:supplyDemand`,()=>{
  const q=quoteSupply(d,e,{item:ITEM,location:extra.location??place});
  let shelf=null;try{shelf=[...registerShopShelves.fn?.(e,place)??[]].filter(r=>r.item===ITEM).reduce((n,r)=>n+r.maximum+(r.reserve??0),0);}catch{}
  const sumRows=q.rows.reduce((n,r)=>n+r.retained-(r.upkeep??0)+r.committed,0);
  emit(`${label}:supplyDemand`,{supply:q.supply,demand:q.demand,shelf,sumRowsRetainedPlusCommitted:sumRows,inferredPersonalDemand:q.demand-sumRows,
   rows:q.rows.map(r=>({owner:r.owner,stock:r.stock,retained:r.retained,upkeep:r.upkeep??0,committed:r.committed,available:r.available}))});
 });
 const sellers=new Map(),per=[];
 for(const id of residents(e)){
  safe(`${label}:resources:${id}`,()=>{
   const on=resources(d,e,id,{days:extra.days??null}),off=resources(d,e,id,{marketSubstitution:false,days:extra.days??null});
   const bread=x=>x.rows.filter(r=>r.item===ITEM&&r.holder===id)[0]??null;
   per.push({owner:id,retainedOn:bread(on)?.retained??null,retainedOff:bread(off)?.retained??null,coverage:on.coverage,purchases:on.purchases});
   emit(`${label}:resources`,{on,retainedOff:bread(off)?.retained??null,availableOff:bread(off)?.available??null});
   for(const p of on.purchases){
    const key=`${p.seller}|${p.source}|${p.item}`,row=sellers.get(key)??{seller:p.seller,source:p.source,item:p.item,buyers:[],boughtTotal:0};
    row.buyers.push({owner:id,quantity:p.quantity,unitPrice:p.unitPrice,at:p.at});row.boughtTotal+=p.quantity;sellers.set(key,row);
   }
  });
  safe(`${label}:sources:${id}`,()=>emit(`${label}:foodSources`,{owner:id,sources:sourcesOf(d,e,id).map(s=>({source:s.source,seller:s.seller,item:s.item,at:s.at,quantity:s.quantity,unitPrice:s.unitPrice,cycleDays:s.cycleDays??null,basis:s.priceBasis}))}));
 }
 for(const row of sellers.values()){
  const sellerAvail=safe(`${label}:sellerAvail`,()=>householdResources(d,e,row.seller,{marketSubstitution:false}).rows.find(r=>r.holder===row.seller&&r.item===row.item)?.available??null);
  emit(`${label}:sellerShare`,{...row,buyersCount:row.buyers.length,sellerAvailable:sellerAvail,countedMoreThanAvailable:sellerAvail!==null&&row.boughtTotal>sellerAvail});
 }
 emit(`${label}:retainedDelta`,{sumRetainedOn:per.reduce((n,x)=>n+(x.retainedOn??0),0),sumRetainedOff:per.reduce((n,x)=>n+(x.retainedOff??0),0)});
}

// ---- 场景 ----
async function finance(){
 const f=finFixture(),d=f.draft(),post=f.doc.state.location;
 emit('setup',{location:post,minute:f.doc.state.minute});
 market('after-fixture',d,f.e,'loc_hw',{location:post});d.done();
}
async function s3fin(){
 const f=finFixture(),host=finHost;
 const equity=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'equity');
 f.doc.state.records[`finance_profit:${host}`]={category:'finance_profit',issuer:host,net:1000};
 let d=f.draft();const before=netAssets(d,f.e,host);
 emit('step1',{hostCoins:f.doc.state.npcs[host].coins,netAssetsBefore:before,expected:[634,670],equity:equity?.contract??null});
 market('step1',d,f.e,'loc_hw',{location:f.doc.state.location});d.done();
 const at=f.doc.state.records[equity.contract].nextDividend,amount=f.doc.state.npcs[host].coins;
 f.doc.state.records.wages={category:'debt',kind:'wage',debtor:host,creditor:'npc_hw_ayan',amount,paid:0,createdAt:600,deadline:at,status:'待偿还'};
 d=f.draft();emit('step2',{netAssets:netAssets(d,f.e,host),expected:68});
 market('step2',d,f.e,'loc_hw',{location:f.doc.state.location});
 adoptLegacyObligation(d,f.e,'wages');emit('step2:adopted',{netAssets:netAssets(d,f.e,host)});d.done();
}
async function budget(){
 const members=['npc_hw_linsui'],owner='npc_hw_linsui',other='npc_hw_duanyan',item='item_bread';
 const w=structuredClone(await world()),lg=await legacy();
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>!members.includes(id))})).filter(h=>h.members.length);
 w.households.push({id:'house_budget_fixture_0',members,settlement:'loc_hw',homeLocation:'bld_hw_qingdeng',tenure:'沿用已发布住处，独立登记家计'});
 for(const r of w.primitiveTables.body.rows)if(r.need==='satiety'&&r.selector==='person')r.drainPerHour.light=10/24;
 w.items.find(i=>i.id===item).nutrition={satiety:1};
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];
 const engine=new WorldEngine(w);let document=engine.initialFromLegacy(lg,'household-budget');
 document.state.minute=0;
 for(const id of members){document.state.npcs[id].inventory={};document.state.npcs[id].coins=0;}
 document.state.npcs[owner].inventory={[item]:20};document.state.npcs[owner].coins=5;
 // 同测试第二条：种子、租约、承诺
 const w2=engine.world,seed=w2.domainRules.privateField.crops[0];
 seed.seed=item;seed.yieldSelector='field:wheat';
 w2.items.find(i=>i.id===item).weight=w2.domainRules.privateField.kgPerJin;
 w2.primitiveTables.yields.rows.find(r=>r.key==='field:wheat/seed').seedPerUnit.qty=4;
 const st=document.state,DAYS=DAY;
 st.records['budget-lease']={id:'budget-lease',category:'contract',kind:'asset_lease',subject:'bld_hw_qingdeng',tenant:owner,use:'field',status:'有效',createdAt:0,deadline:20*DAYS,rentBasis:{areaMu:1,seedItem:item}};
 st.obligations['budget-promise']={id:'budget-promise',kind:'forward',debtor:owner,creditor:other,resource:item,amount:3,paid:0,status:'pending',deadline:DAYS,legacyRecord:'budget-projection'};
 st.records['budget-projection']={category:'contract',kind:'procurement',parties:[other,owner],subject:item,quantity:3,status:'pending'};
 document.ledger=openLedger(engine,document);
 const d={get document(){return document;},get:(...p)=>p.reduce((v,k)=>v?.[k],document)};
 const row=householdResources(d,engine,owner,{days:1}).rows.find(r=>r.item===item);
 emit('assert-row',{got:[row.stock,row.food,row.seed,row.committed,row.available],expectedOld:[20,10,4,3,3],expectedNew:[20,7,4,3,6]});
 emit('owner',{on:resources(d,engine,owner,{days:1}),off:resources(d,engine,owner,{days:1,marketSubstitution:false}),sources:sourcesOf(d,engine,owner).map(s=>({source:s.source,seller:s.seller,item:s.item,at:s.at,quantity:s.quantity,unitPrice:s.unitPrice,cycleDays:s.cycleDays??null,basis:s.priceBasis}))});
 market('budget',d,engine,'loc_hw',{days:1,location:'bld_hw_qingdeng'});
}

const inn='bld_hw_qingdeng',forge='bld_hw_forge',town='loc_bs';
async function restock(){
 const world0=await world(),lg=await legacy();
 const host='npc_hw_linsui',smith='npc_hw_duanyan',merchant='npc_hw_yanzhe',holder='npc_hw_shendu';
 const placeOf={[host]:inn,[smith]:forge,[merchant]:town};
 const w=structuredClone(world0),engine=new WorldEngine(w);
 let doc=engine.initialFromLegacy(lg,'shop-restock');
 doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=500;
 for(const [id,loc] of Object.entries(placeOf))doc.state.npcs[id]={...doc.state.npcs[id],coins:200,location:loc,activity:'营业',status:'正常',goals:{},memoryStream:[]};
 for(const [id,npc] of Object.entries(doc.state.npcs))if(!placeOf[id])npc.coins=0;
 for(const npc of w.npcs.filter(n=>placeOf[n.id])){delete npc.tier;npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:['trade']}]};}
 doc.state.settlements[town]={...structuredClone(doc.state.settlements.loc_hw),name:'白石镇',population:1000,treasury:900};
 const act=async(tool,a,eventId)=>{const out=await engine.reduce(doc,{tool,args:a,eventId});doc=applyPatches(doc,out.patches);return out.result;};
 const snap=label=>{
  const d=reader(doc);
  emit(`${label}:host`,{breadQty:qty(doc.state.npcs[host].inventory[ITEM]),inventoryKeys:Object.keys(doc.state.npcs[host].inventory),coins:doc.state.npcs[host].coins});
  safe(`${label}:on`,()=>emit(`${label}:hostResourcesOn`,resources(d,engine,host)));
  safe(`${label}:off`,()=>emit(`${label}:hostResourcesOff`,resources(d,engine,host,{marketSubstitution:false})));
  safe(`${label}:saleable`,()=>emit(`${label}:saleable`,saleableStock(d,engine,host,ITEM)));
  safe(`${label}:sources`,()=>emit(`${label}:foodSources`,{sources:sourcesOf(d,engine,host).map(s=>({source:s.source,seller:s.seller,item:s.item,at:s.at,quantity:s.quantity,unitPrice:s.unitPrice,cycleDays:s.cycleDays??null,basis:s.priceBasis}))}));
  safe(`${label}:shop`,()=>emit(`${label}:shop`,{shops:currentShops(engine,doc.state).filter(s=>s.keeper===host||s.settlement==='loc_hw').map(s=>({id:s.id,keeper:s.keeper,location:s.location,cycleDays:s.cycleDays,firstDay:s.firstDay,restock:s.restock,ledgerEntries:(doc.state.records[`shop:${s.id}`]?.entries??[]).filter(x=>x.item===ITEM).slice(-3)}))}));
  const holders=Object.entries(doc.state.npcs).map(([id,n])=>[id,qty(n.inventory?.[ITEM])]).filter(x=>x[1]>0);
  emit(`${label}:breadHolders`,{holders});
 };
 for(const item of ['item_fruit_porridge','item_milk'])delete doc.state.npcs[host].inventory[item];resyncBooks(engine,doc);
 snap('before-buy2');
 await act('world_trade',{seller:host,item:ITEM,quantity:2},'buy-bread');
 snap('after-buy2');
 try{const r=await act('world_trade',{seller:host,item:ITEM,quantity:4},'too-many');emit('too-many',{accepted:true,result:r});}catch(err){emit('too-many',{accepted:false,message:String(err?.message??err).slice(0,200)});}
 // 对照：顶替关闭后，是否 saleable 满足“被拒”（available<4）
 safe('assert-line75',()=>{const d=reader(doc);emit('assert-line75',{availableOn:resources(d,engine,host).rows.find(r=>r.holder===host&&r.item===ITEM)?.available,availableOff:resources(d,engine,host,{marketSubstitution:false}).rows.find(r=>r.holder===host&&r.item===ITEM)?.available,saleable:saleableStock(d,engine,host,ITEM).available});});
 market('after-buy2',reader(doc),engine,'loc_hw',{location:inn});
}

// ---- gucen ----
const GU='npc_hw_gucen';
const trace=[];
function installTrace(){
 const orig=PatchCursor.prototype.apply;
 PatchCursor.prototype.apply=function(patch,clone){
  try{
   const p=patch?.path??[];
   if(p.includes(GU)&&(['scheduleTravel','cognitionTravel'].includes(p.at(-1))||p.at(-1)===GU&&(patch.value?.scheduleTravel||patch.value?.cognitionTravel)))
    trace.push({op:patch.op,path:p.join('/'),value:patch.value?.scheduleTravel??patch.value??null,stack:String(new Error().stack).split('\n').slice(2,14).map(s=>s.trim().replace(/^at /,'').replace(/\(?file:\/\/\/[^)]*\//,'(')).filter(s=>!/probe-ce/.test(s)).slice(0,10)});
  }catch{}
  return orig.call(this,patch,clone);
 };
}
function gucenState(label,e,doc){
 const n=doc.state.npcs?.[GU],trip=n?.scheduleTravel??null,m=doc.state.minute;
 const origin=trip?{atDepart:trip.depart,market:safe('mk',()=>marketScheduleAt(doc.state,GU,trip.depart))?.activity??null,subsistence:safe('sub',()=>subsistenceScheduleAt(e,doc.state,GU,trip.depart))?.activity??null,flaggedSubsistence:Boolean(trip.subsistence),
  routineSlotAtDepart:safe('slot',()=>{const s=scheduleAt(e,GU,trip.depart,doc.state);return s?{location:s.location,activity:s.activity,until:s.until}:null;})}:null;
 emit(label,{minute:m,location:n?.location,activity:n?.activity,scheduleTravel:trip,cognitionTravel:n?.cognitionTravel??null,minutesLeft:trip?trip.arrive-m:null,origin,
  traces:trace.splice(0).map(t=>({op:t.op,path:t.path,from:t.value?.from,to:t.value?.to,depart:t.value?.depart,arrive:t.value?.arrive,subsistence:t.value?.subsistence,stack:t.stack}))});
}
async function stealLoop(e,doc,label,{action,slots,idPrefix,extractCase=false}){
 for(let i=0;i<30;i++){
  const out=await e.reduce(doc,{tool:'world_act',eventId:`${idPrefix}-${i}`,args:{action,slots}});
  const ok=out.result.success??out.result.receipt?.legacy?.success;
  const next=applyPatches(doc,out.patches);
  if(i===0||ok)gucenState(`${label}:steal#${i}${ok?':success':''}`,e,next);else trace.length=0;
  if(ok)return next;
 }
 return null;
}
async function gucen(){
 installTrace();
 const variant=args.variant??'all',want=v=>variant==='all'||variant===v,lg=await legacy();
 const setupShow=(label,e,doc,setup)=>{const r=applyIntentSetup(e,doc,setup);emit(`${label}:setupUnmet`,{setup:Object.keys(setup),unmet:r.setupUnmet});gucenState(`${label}:afterSetup`,e,r.document);return r.document;};
 if(want('s4')){ // s4-filing.test.mjs scene()+steal()+submitted() 第一步
  const e=new WorldEngine(await world()),initial=e.createCharacter(lg,{},'s406-filing');
  let doc=setupShow('s4:scene',e,initial,{location:'bld_hw_qingdeng',minute:600,present:['npc_hw_gucen','npc_hw_linsui','npc_hw_hezhou'],coins:100});
  const next=await stealLoop(e,doc,'s4',{action:'core:crime.steal',slots:{target:'npc_hw_linsui',coins:1},idPrefix:'filing-theft'});
  if(next)setupShow('s4:reposition',e,next,{location:next.state.location,minute:next.state.minute,present:[GU]});
 }
 if(want('owner2')){ // a3-owner2-R R2：删掉 householdSubsistence
  const w=structuredClone(await world());delete w.rules.householdSubsistence;
  const e=new WorldEngine(w),initial=e.createCharacter(lg,{},'owner2-R');
  const doc=setupShow('owner2:scene',e,initial,{location:'bld_hw_qingdeng',minute:600,present:['npc_hw_linsui','npc_hw_gucen','npc_hw_yanzhe']});
  const next=await stealLoop(e,doc,'owner2',{action:'core:crime.steal',slots:{target:'npc_hw_linsui',item:'item_bread'},idPrefix:'R2-actual-theft'});
  if(next)setupShow('owner2:reposition',e,next,{present:[GU]});
 }
 if(want('receipt')){ // a3-precondition-receipt filingPremises(53) 的 else 分支：删掉 householdSubsistence
  const w=structuredClone(await world());delete w.rules.householdSubsistence;
  const e=new WorldEngine(w),initial=e.createCharacter(lg,{},'a3-precondition-receipt');
  const doc=setupShow('receipt:scene',e,initial,{location:'bld_hw_qingdeng',minute:600,present:['npc_hw_linsui','npc_hw_gucen']});
  const next=await stealLoop(e,doc,'receipt',{action:'core:crime.steal',slots:{target:'npc_hw_linsui',item:'item_ration'},idPrefix:'native-53-theft'});
  if(next)setupShow('receipt:reposition',e,next,{location:'loc_hw_gate',present:[GU]});
 }
}

const scenes={finance,budget,s3fin,restock,gucen};
if(!scenes[scene]){console.error('scene=finance|budget|s3fin|restock|gucen [variant=s4|owner2|receipt]');process.exit(2);}
await scenes[scene]();
