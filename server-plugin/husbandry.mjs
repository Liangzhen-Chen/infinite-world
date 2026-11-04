import {derived} from './derived.mjs';
import {accrueStock,registerLegacyStock,moveStock} from './stock.mjs';
import {declareLedgerWriter,accountKey} from './ledger.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings,ensureHoldings} from './holdings.mjs';
import {addPopulation,populationHealth,advancePopulationDisease,takePopulation} from './population-health.mjs';
import {monsterStats} from './combat-state.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {digest} from './storage.mjs';
import {spiritStateFor} from './creature-nature.mjs';
import {preconditionFailure} from './precondition.mjs';
import {produceItems} from './items.mjs';

declareLedgerWriter('husbandry',{sources:{'src:birth':{'*':100000},'src:husbandry':{'*':100000}},sinks:['sink:consume','sink:decay','sink:death','sink:individuated']});
declareHoldingWriter('husbandry',{kinds:['owns'],entities:['population','creature'],locations:true});
const path=id=>['state','records',`husbandry:${id}`];
const resource=species=>`population_${species}`;
const animals=row=>accountKey(row.id,resource(row.species),'population');
const produce=(row,item)=>accountKey(row.id,item,'yield');
const profile=(e,species)=>e.byId.get(species)?.husbandry;
registerLegacyStock('husbandry',(_e,state,add)=>{
 for(const row of Object.values(state.records??{}).filter(r=>r.category==='husbandry')){
  add(animals(row),row.count);for(const [item,n]of Object.entries(row.produce??{}))add(produce(row,item),n);
 }
});
export function advanceHusbandry(d,e,day){
 if(!e.world.monsters.some(s=>s.husbandry))return;
 ensureHoldings(d,e);
 const rows=Object.values(d.get('state','records')??{}).filter(r=>r.category==='husbandry').map(r=>structuredClone(r)).sort((a,b)=>a.id.localeCompare(b.id,'en'));
 const groups=new Map();
 for(const row of rows){
  if(row.lastDay!==day-1)throw Error('家畜日结不连续');
  if(!profile(e,row.species))throw Error('家畜物种养殖参数缺失');
  const species=e.byId.get(row.species),key=JSON.stringify([row.location,row.species,row.disease??species.ecology?.disease??null]);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 // No pen/isolation model exists here: co-located herds of one species share
 // contact space regardless of ownership or how many account rows store them.
 const deaths=new Map();
 for(const group of groups.values()){
  const opening=group.map(row=>row.count);
  advancePopulationDisease(d,e,group,group.map(row=>row.id),e.byId.get(group[0].species),group.reduce((n,row)=>n+row.capacity,0));
  group.forEach((row,i)=>deaths.set(row.id,opening[i]-row.count));
 }
 for(const row of rows){
  const p=profile(e,row.species);
  // A genuine title transfer changes who must supply feed. Synchronize the
  // source projection with the native owns edge before settling this day.
  const owners=aliveHoldings(d,{kind:'owns',subject:row.id});
  row.owner=owners.length===1?owners[0].holder:null;
  populationHealth(row);const eventId=`husbandry:${row.id}:${day}`;
  for(const batch of row.batches)if(batch.quantity&&batch.expiresDay!==null&&batch.expiresDay<=day+1){
   row.produce[batch.item]-=batch.quantity;
   moveStock(d,{from:produce(row,batch.item),to:`sink:decay|${batch.item}|husbandry`,amount:batch.quantity,writer:'husbandry',eventId});
   batch.quantity=0;
  }
  row.batches=row.batches.filter(b=>b.quantity);
  const died=deaths.get(row.id),heads=row.count;
  moveStock(d,{from:animals(row),to:`sink:death|${resource(row.species)}|herd`,amount:died,writer:'husbandry',eventId});
  const feed=Math.ceil(derived(e,d.document,'husbandry:feed',row.id,{base:heads*p.feed.perHead,target:row.species}));
  const available=row.owner?e.quantity(d,row.owner,p.feed.item):0;
  // Feed transfers use the ordinary owner inventory adapter, never a
  // second stock. Unfed populations do not mint births or live products.
  const fed=feed===0||available>=feed;
  if(fed&&feed){
   e.itemDelta(d,row.owner,p.feed.item,-feed,{flow:'sink:consume',purpose:'husbandry_feed',writer:'husbandry',eventId});
  }
  if(fed){
   const expected=heads>=2?derived(e,d.document,'population:birthRate',row.id,{base:heads*p.birthPerHeadDay,target:row.species}):0;
   const born=Math.min(Math.max(0,row.capacity-heads),accrueStock(row,'birth',expected));
   addPopulation(row,{S:born,I:0,R:0});row.born+=born;
   moveStock(d,{from:`src:birth|${resource(row.species)}|herd`,to:animals(row),amount:born,writer:'husbandry',eventId});
   for(const yieldRow of p.yields.alive){
    const quantity=accrueStock(row,`yield:${yieldRow.item}`,derived(e,d.document,'economy:yield',row.id,{base:heads*yieldRow.perHeadDay,holder:row.owner,target:yieldRow.item}));
    row.produce[yieldRow.item]=(row.produce[yieldRow.item]??0)+quantity;
    if(quantity){const days=e.byId.get(yieldRow.item).shelfLifeDays;
     row.batches.push({item:yieldRow.item,quantity,day:day+1,expiresDay:days===null||days===undefined?null:day+1+days});
    }
    moveStock(d,{from:`src:husbandry|${yieldRow.item}|alive`,to:produce(row,yieldRow.item),amount:quantity,writer:'husbandry',eventId});
   }
  }
  row.lastDay=day;holdingSet(d,e,path(row.id),row,'husbandry',eventId);
 }
}
export function husbandryAction(d,args,eventId){
 ensureHoldings(d,this);
 if(args.operation==='husbandry_inspect'&&!args.target)return {herds:Object.values(d.get('state','records')??{}).filter(r=>r.category==='husbandry'&&r.location===d.get('state','location')&&aliveHoldings(d,{kind:'owns',holder:'player',subject:r.id}).length).map(r=>({target:r.id,name:r.name,species:r.species,count:r.count,produce:structuredClone(r.produce)}))};
 const id=args.target,row=d.get(...path(id));
 if(!row||row.category!=='husbandry'||row.location!==d.get('state','location'))throw preconditionFailure('这里没有该家畜种群');
 if(!aliveHoldings(d,{kind:'owns',holder:'player',subject:id}).length)throw preconditionFailure('没有这群家畜的所有权');
 if(args.operation==='husbandry_inspect')return {target:id,name:row.name,species:row.species,count:row.count,produce:structuredClone(row.produce)};
 const item=args.item,amount=args.quantity??1,p=profile(this,row.species),yieldRow=p?.yields.alive.find(r=>r.item===item);
 if(!yieldRow||!Number.isSafeInteger(amount)||amount<1||amount>200||(row.produce[item]??0)<amount)throw preconditionFailure('没有足量已产生的活体产物');
 this.advance(d,yieldRow.collectMinutes*amount,eventId);
 const current=d.get(...path(id));
 if(d.get('state','location')!==row.location||!aliveHoldings(d,{kind:'owns',holder:'player',subject:id}).length||(current.produce[item]??0)<amount)return {success:false,obtained:[],reason:'采集完成前现场或权利已改变'};
 const next=structuredClone(current),instances=[];let left=amount;
 for(const batch of next.batches){
  if(batch.item!==item||!batch.quantity)continue;
  const n=Math.min(left,batch.quantity);
  instances.push(...produceItems(d,this,item,n,{eventId:`${eventId}:${batch.day}`,recipe:{kind:'husbandry',population:id,day:batch.day},maker:id,producedAt:batch.day*1440,books:{account:produce(row,item),writer:'husbandry',eventId}}));
  batch.quantity-=n;left-=n;if(!left)break;
 }
 if(left)throw Error('活体产物批次与储量不守恒');
 next.produce[item]-=amount;next.batches=next.batches.filter(b=>b.quantity);
 holdingSet(d,this,path(id),next,'husbandry',eventId);
 return {success:true,target:id,obtained:[{item,quantity:amount,instances}],minutes:yieldRow.collectMinutes*amount};
}

// Population stock adapter (01 §1.6 sink:individuated): the only open writer of
// a herd's count. In one transaction n head leave the herd account for
// sink:individuated, the S/I/R subaccounts follow them, and n creatures of the
// species stand where the herd is, owned by the herd's owner. Living bodies
// then share every individual law (vital, death, carcass, gather).
export function individuateHerd(d,engine,{population,count,eventId}){
 ensureHoldings(d,engine);
 const row=d.get(...path(population));
 if(!row||row.category!=='husbandry')throw preconditionFailure('这里没有该家畜种群');
 if(!Number.isSafeInteger(count)||count<1||count>row.count)throw preconditionFailure(`${row.name}只有${row.count}头`);
 const next=structuredClone(row),taken=takePopulation(next,count),species=engine.byId.get(row.species);
 if(!species)throw Error('家畜物种定义缺失');
 moveStock(d,{from:animals(row),to:`sink:individuated|${resource(row.species)}|herd`,amount:count,writer:'husbandry',eventId});
 holdingSet(d,engine,path(population),next,'husbandry',eventId);
 const owners=aliveHoldings(d,{kind:'owns',subject:population}),owner=owners.length===1?owners[0].holder:row.owner??null;
 const level=species.levelRange?.[0]??species.level??1,stats=monsterStats({level,template:species.template??2},engine.rules),ids=[];
 // Infected head leave first only in proportion (takePopulation); mark them.
 const sick=[...Array(taken.I).fill('I'),...Array(taken.R).fill('R')];
 for(let i=0;i<count;i++){
  // Same identity shape as a wild individual (wildlife.mjs createWildlifeInstance).
  const hash=digest([d.document.randomSeed,eventId,population,i]).slice(0,16),id=`monster_instance_${hash}`,name=`${species.name}·${hash.slice(0,4)}`;
  if(d.get('state','created',id)||d.get('state','creatures',id))throw Error('个体化编号重复');
  holdingSet(d,null,['state','created',id],{id,name,aliases:[],monster:species.id,template:species.template,scope:row.location},'husbandry',eventId);
  holdingSet(d,null,['state','creatures',id],{name,species:species.id,herd:population,location:row.location,level,hp:stats.maxHp,maxHp:stats.maxHp,status:'正常',owner,individuatedAt:d.get('state','minute'),...(sick[i]?{populationHealth:sick[i]}:{}),...spiritStateFor(species)},'husbandry',eventId);
  ids.push(id);
 }
 return ids;
}
registerAdvanceHook('individuateHerd',individuateHerd);
