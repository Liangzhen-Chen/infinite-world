// 卖自家牲畜（K2 活体行情）：价按 market.livestockValue（物种身体与产出的本地现值）派生；
// 买方本人决定买不买、付得起才成交；所有权经持有写入转给买方。畜群里的一头先经种群库存出口（individuateHerd，
// 头数从畜群账进 sink:individuated）牵出成为个体，再转手，种群账守恒。
import {preconditionFailure} from './precondition.mjs';
import {livestockValue} from './market.mjs';
import {chargeTrade} from './contracts.mjs';
import {advanceHook} from './advance-hooks.mjs';
import {aliveHoldings,declareHoldingWriter,holdingSet,isPhysicallyDead} from './holdings.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
declareHoldingWriter('livestock-sale',{kinds:['tamed_by']});

const alive=(engine,d,id,row)=>row&&!(row.hp<=0)&&!isPhysicallyDead(engine,d,id);
// 交给买方的是哪几头：点名的个体；畜群牵出的几头；或按物种取本人在场的几头。
function heads(d,engine,{seller,target,quantity,location}){
 const creatures=d.get('state','creatures')??{},beast=creatures[target];
 if(beast)return {species:beast.species,ids:[target],herd:null};
 const herd=d.get('holdings','entities',target)?.kind==='population'?d.get('state','records',`husbandry:${target}`):null;
 if(herd){
  if(!aliveHoldings(d,{kind:'owns',holder:seller,subject:herd.id}).length)throw preconditionFailure(`${herd.name}不属于你，不属于你的牲畜不能拿来卖`);
  if(herd.location!==location)throw preconditionFailure(`${herd.name}不在这里`);
  if(quantity>herd.count)throw preconditionFailure(`${herd.name}只有${herd.count}头`);
  return {species:herd.species,ids:null,herd};
 }
 const ids=Object.entries(creatures).filter(([id,c])=>c.species===target&&c.owner===seller&&c.location===location&&alive(engine,d,id,c)).map(([id])=>id).sort();
 if(ids.length<quantity)throw preconditionFailure(`你在这里只有${ids.length}头${engine.byId.get(target)?.name??target}`);
 return {species:target,ids:ids.slice(0,quantity),herd:null};
}
export function sellLivestock(d,engine,{buyer,seller,target,quantity=1,location,eventId}){
 if(!Number.isSafeInteger(quantity)||quantity<1)throw preconditionFailure('头数无效');
 const picked=heads(d,engine,{seller,target,quantity,location}),count=picked.ids?.length??quantity;
 for(const id of picked.ids??[]){
  const c=d.get('state','creatures',id);
  if(c.owner!==seller)throw preconditionFailure(`${c.name}不属于你，不属于你的牲畜不能拿来卖`);
  if(!alive(engine,d,id,c)||c.location!==location)throw preconditionFailure(`${c.name}不在这里或已不是活物`);
 }
 const quote=livestockValue(d,engine,{species:picked.species,location,seller});
 if(!quote)throw preconditionFailure(`${engine.byId.get(picked.species)?.name??picked.species}没有可作价的身体与产出`);
 const cost=Math.trunc(quote.value*count);
 if(cost<1)throw preconditionFailure('这几头牲畜按本地行情不值一文');
 if(engine.actor(d,buyer).coins<cost)throw preconditionFailure('买方余额不足');
 if(d.get('state','npcs',buyer)&&npcDecision(subjectiveView(engine,d.document,buyer),{kind:'buy',from:seller,cost:{coins:cost},reward:Math.trunc(quote.value*count)}).outcome!=='agree')
  throw preconditionFailure(`${engine.byId.get(buyer)?.name??buyer}不愿按这个价买`);
 const ids=picked.ids??advanceHook('individuateHerd')(d,engine,{population:picked.herd.id,count,eventId:`${eventId}:individuate`});
 const payment=chargeTrade(d,engine,{buyer,seller,cost,payment:'cash',description:`${engine.byId.get(picked.species)?.name??picked.species}价款`},eventId);
 for(const id of ids){const c=d.get('state','creatures',id),{herd,...rest}=c;holdingSet(d,null,['state','creatures',id],{...rest,owner:buyer,soldAt:d.get('state','minute'),soldBy:seller},'livestock-sale',eventId);}
 holdingSet(d,null,['state','records',`livestock_sale:${eventId}`],{category:'livestock_sale',buyer,seller,species:picked.species,heads:ids,location,minute:d.get('state','minute'),totalCoins:cost,unitValue:quote.value,basis:{carcass:quote.carcass,products:quote.products,horizonDays:quote.horizonDays},sourceEvent:eventId},'livestock-sale',eventId);
 return {buyer,seller,species:picked.species,heads:ids,quantity:count,cost,pricing:quote,...payment};
}
