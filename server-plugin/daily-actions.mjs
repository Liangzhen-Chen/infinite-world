import {declareLedgerWriter} from './ledger.mjs';
import {actionCostRule,assertActionTime,beginActionActivity,finishActionActivity} from './action-costs.mjs';
import {applyBodyVital} from './primitives-body.mjs';
import {digest} from './storage.mjs';
import {changeItems,transferItems} from './items.mjs';
import {npcRumors,hearNpcRumor,assertRumorConversation} from './npc-rumors.mjs';

declareLedgerWriter('daily-actions',{sinks:['sink:consume']});

function food(engine,raw){
 const item=engine.resolve(raw,'item'),nutrition=engine.byId.get(item)?.nutrition;
 if(!nutrition||!Number.isFinite(nutrition.satiety)||nutrition.satiety<=0||nutrition.satiety>100)throw Error('这件物品没有登记为可食用的一餐');
 return {item,satiety:nutrition.satiety};
}

export async function treatRumor(d,engine,args,eventId){
 const speaker=engine.resolve(args.subject,'npc'),seller=engine.resolve(args.seller,'npc'),item=engine.resolve(args.item,'item');
 if(!engine.byId.get(item)?.nutrition?.hydration)throw Error('请客须选择登记的饮品');
 const rumor=npcRumors(engine,speaker,d.document).find(r=>r.id===args.rumor);
 if(!rumor)throw Error('讲述者没有这条登记传闻');
 const key=`daily:${eventId}`,identity=digest({operation:'treat_rumor',speaker,seller,item,rumor:rumor.id}),old=d.get('state','records',key);
 if(old){if(old.identity!==identity)throw Error('同一事件编号不能改换打听内容');return {...old.result,duplicate:true};}
 const rule=actionCostRule(engine,'talk.ask');assertRumorConversation(d,engine,speaker,rule.timeMin);
 const span=beginActionActivity(d,engine,rule.activity);
 const purchase=await engine.trade(d,{seller,item,quantity:1},`${eventId}:drink`);
 transferItems(d,engine,'player',speaker,item,1);
 const heard=hearNpcRumor(d,engine,{subject:'player',key:rumor.id,rumor:rumor.id,source:speaker,content:rumor.claim},`${eventId}:rumor`);
 const remaining=rule.timeMin-(d.get('state','minute')-span.start);if(remaining>0)engine.advance(d,remaining,eventId);
 const cost=finishActionActivity(d,engine,span),result={...heard,purchase,gift:{item,quantity:1,to:speaker},cost,
  socialEvent:{verb:'gift',target:speaker,value:purchase.cost,tags:['dialogue','gift','treat']}};
 d.set(['state','records',key],{category:'daily_action',identity,result});return result;
}

// Ordering and eating are a single action. Existing trade remains the source
// of stock, retail prices, shop availability and both sides of payment.
export async function orderMeal(d,engine,args,eventId){
 const seller=engine.resolve(args.subject,'npc'),foods=[args.item,...args.side?[args.side]:[]].map(raw=>food(engine,raw));
 const identity=digest({operation:'order_meal',seller,foods}),key=`daily:${eventId}`,previous=d.get('state','records',key);
 if(previous){if(previous.identity!==identity)throw Error('同一事件编号不能改换用餐内容');return {...previous.result,duplicate:true};}
 const rule=actionCostRule(engine,'eat.meal');assertActionTime(d,engine,rule.timeMin);
 const span=beginActionActivity(d,engine,rule.activity),purchases=[];
 for(let i=0;i<foods.length;i++){
  const {item}=foods[i],oldUnits=new Set(d.get(...engine.bagPath('player'),item,'instances')??[]);
  const purchase=await engine.trade(d,{seller,item,quantity:1},`${eventId}:dish:${i}`);
  // Select the newly purchased physical unit, or the untracked portion. An
  // older tracked meal already in the bag must not be eaten in its place.
  const selection=(d.get(...engine.bagPath('player'),item,'instances')??[]).filter(id=>!oldUnits.has(id));
  changeItems(d,engine,'player',item,-1,{selection,books:{flow:'sink:consume',purpose:'meal',writer:'daily-actions',eventId}});
  purchases.push(purchase);
 }
 const remaining=rule.timeMin-(d.get('state','minute')-span.start);
 if(remaining>0)engine.advance(d,remaining,eventId);
 const satiety=Math.min(100,foods.reduce((sum,f)=>sum+f.satiety,0));
 const nourishment=applyBodyVital(d,engine,'player','satiety',satiety,{body:{satiety}});
 const cost=finishActionActivity(d,engine,span),paid=purchases.reduce((sum,p)=>sum+p.cost,0),result={seller,eaten:foods.length,items:foods.map(f=>f.item),purchases,
  paid,nutrition:{satiety:nourishment.delta},cost,socialEvent:{verb:'trade',target:seller,value:paid,tags:['trade','dialogue','cash','meal']},
  actionScope:{kind:'meal',clockManaged:true,minutes:cost.time}};
 d.set(['state','records',key],{category:'daily_action',identity,result});return result;
}

// Eating consumes a real, registered portion; prose and caller-filled gains
// never supply nutrition. The registered meal action selects the food.
export function eatMeal(d,engine,args,eventId){
 const {item,satiety}=food(engine,args.item);
 if(args.quantity!==undefined&&args.quantity!==1)throw Error('用餐一次食用一份');
 const key=`daily:${eventId}`,identity=digest({operation:'eat',item}),previous=d.get('state','records',key);
 if(previous){if(previous.identity!==identity)throw Error('同一事件编号不能改换用餐内容');return {...previous.result,duplicate:true};}
 if(engine.quantity(d,'player',item)<1)throw Error('没有持有这份食物');
 const rule=actionCostRule(engine,'eat.meal');assertActionTime(d,engine,rule.timeMin);
 const span=beginActionActivity(d,engine,rule.activity);
 engine.itemDelta(d,'player',item,-1,{flow:'sink:consume',purpose:'meal',writer:'daily-actions',eventId});
 engine.advance(d,rule.timeMin,eventId);
 const nourishment=applyBodyVital(d,engine,'player','satiety',satiety,{body:{satiety}});
 const cost=finishActionActivity(d,engine,span),result={item,eaten:1,nutrition:{satiety:nourishment.delta},cost,
  actionScope:{kind:'meal',clockManaged:true,minutes:cost.time}};
 d.set(['state','records',key],{category:'daily_action',identity,result});
 return result;
}
