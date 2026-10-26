import {derived} from './derived.mjs';
import {accrueStock,registerLegacyStock,moveStock} from './stock.mjs';
import {declareLedgerWriter,accountKey} from './ledger.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings,ensureHoldings} from './holdings.mjs';
import {addPopulation,populationHealth,advancePopulationDisease} from './population-health.mjs';
import {preconditionFailure} from './precondition.mjs';
import {produceItems} from './items.mjs';

declareLedgerWriter('husbandry',{sources:{'src:birth':{'*':100000},'src:husbandry':{'*':100000}},sinks:['sink:consume','sink:decay','sink:death']});
declareHoldingWriter('husbandry',{kinds:['owns'],entities:['population'],locations:true});
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
 for(const old of Object.values(d.get('state','records')??{}).filter(r=>r.category==='husbandry')){
  if(old.lastDay!==day-1)throw Error('家畜日结不连续');
  const row=structuredClone(old),p=profile(e,row.species);if(!p)throw Error('家畜物种养殖参数缺失');
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
  const died=advancePopulationDisease(d,e,row,row.id,e.byId.get(row.species),row.capacity),heads=row.count;
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
