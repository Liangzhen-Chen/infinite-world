import {preconditionFailure} from './precondition.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {actionCostRule,assertActionTime,beginActionActivity,finishActionActivity} from './action-costs.mjs';
import {applyBodyVital} from './primitives-body.mjs';
import {digest} from './storage.mjs';
import {changeItems,transferItems} from './items.mjs';
import {npcRumors,hearNpcRumor,assertRumorConversation} from './npc-rumors.mjs';

declareLedgerWriter('daily-actions',{sinks:['sink:consume']});

function food(engine,raw){
 const item=engine.resolve(raw,'item'),nutrition=engine.byId.get(item)?.nutrition;
 if(!nutrition&&engine.byId.get(item)?.foodState==='raw')throw preconditionFailure('这是生料，须经加热烹制（配方里烧火）才能当一餐');
 if(!nutrition||!Number.isFinite(nutrition.satiety)||nutrition.satiety<=0)throw preconditionFailure('这件物品没有登记为可食用的一餐');
 // K4: nutrition may be derived at load (recipe inputs conserved); a derived meal also carries the water its inputs brought.
 return {item,satiety:nutrition.satiety,hydration:Number.isFinite(nutrition.hydration)&&nutrition.hydration>0?nutrition.hydration:0};
}
// Apply both vitals a portion carries; hydration only when the food actually holds water.
// A portion larger than one meal is still eaten: the body absorbs only up to its table cap (body.json max, via
// writeBodyNeed). The rest is wasted, not kept: a portion is one indivisible unit in the bag (integer stock, no
// half-portion item), so the whole unit leaves to sink:consume and the receipt reports what the body did not take.
function nourish(d,engine,foods){
 const out={},wasted={};
 for(const need of ['satiety','hydration']){
  const offered=foods.reduce((n,f)=>n+f[need],0);if(need==='hydration'&&!(offered>0))continue;
  const delta=applyBodyVital(d,engine,'player',need,offered,{body:{[need]:offered}}).delta;
  out[need]=delta;if(offered>delta)wasted[need]=+(offered-delta).toFixed(3);
 }
 return {nutrition:out,...(Object.keys(wasted).length?{wasted}:{})};
}

export async function treatRumor(d,engine,args,eventId){
 const speaker=engine.resolve(args.subject,'npc'),seller=engine.resolve(args.seller,'npc'),item=engine.resolve(args.item,'item');
 if(!engine.byId.get(item)?.nutrition?.hydration)throw preconditionFailure('请客须选择登记的饮品');
 const rumor=npcRumors(engine,speaker,d.document).find(r=>r.id===args.rumor);
 if(!rumor)throw preconditionFailure('讲述者没有这条登记传闻');
 const key=`daily:${eventId}`,identity=digest({operation:'treat_rumor',speaker,seller,item,rumor:rumor.id}),old=d.get('state','records',key);
 if(old){if(old.identity!==identity)throw preconditionFailure('同一事件编号不能改换打听内容');return {...old.result,duplicate:true};}
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
 if(previous){if(previous.identity!==identity)throw preconditionFailure('同一事件编号不能改换用餐内容');return {...previous.result,duplicate:true};}
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
 const {nutrition,wasted}=nourish(d,engine,foods);
 const cost=finishActionActivity(d,engine,span),paid=purchases.reduce((sum,p)=>sum+p.cost,0),result={seller,eaten:foods.length,items:foods.map(f=>f.item),purchases,
  paid,nutrition,...(wasted?{wasted}:{}),cost,socialEvent:{verb:'trade',target:seller,value:paid,tags:['trade','dialogue','cash','meal']},
  actionScope:{kind:'meal',clockManaged:true,minutes:cost.time}};
 d.set(['state','records',key],{category:'daily_action',identity,result});return result;
}

// Eating consumes a real, registered portion; prose and caller-filled gains
// never supply nutrition. The registered meal action selects the food.
export function eatMeal(d,engine,args,eventId){
 const meal=food(engine,args.item),{item}=meal;
 if(args.quantity!==undefined&&args.quantity!==1)throw preconditionFailure('用餐一次食用一份');
 const key=`daily:${eventId}`,identity=digest({operation:'eat',item}),previous=d.get('state','records',key);
 if(previous){if(previous.identity!==identity)throw preconditionFailure('同一事件编号不能改换用餐内容');return {...previous.result,duplicate:true};}
 if(engine.quantity(d,'player',item)<1)throw preconditionFailure('没有持有这份食物');
 const rule=actionCostRule(engine,'eat.meal');assertActionTime(d,engine,rule.timeMin);
 const span=beginActionActivity(d,engine,rule.activity);
 engine.itemDelta(d,'player',item,-1,{flow:'sink:consume',purpose:'meal',writer:'daily-actions',eventId});
 engine.advance(d,rule.timeMin,eventId);
 const {nutrition,wasted}=nourish(d,engine,[meal]);
 const cost=finishActionActivity(d,engine,span),result={item,eaten:1,nutrition,...(wasted?{wasted}:{}),cost,
  actionScope:{kind:'meal',clockManaged:true,minutes:cost.time}};
 d.set(['state','records',key],{category:'daily_action',identity,result});
 return result;
}

export function readNotice(d,engine,args,eventId){
 const key=`daily:${eventId}`,identity=digest({operation:'read_notice',notice:args.notice}),old=d.get('state','records',key);
 if(old){if(old.identity!==identity)throw preconditionFailure('同一事件编号不能更换告示');return {...old.result,duplicate:true};}
 const location=d.get('state','location'),notice=engine.byId.get(location)?.notices?.find(n=>n.id===args.notice);
 if(!notice||!notice.text?.trim()||notice.postedAt!==undefined&&notice.postedAt>d.get('state','minute')||notice.until!==undefined&&notice.until<=d.get('state','minute'))throw preconditionFailure('这里没有这份有效告示');
 const rule=actionCostRule(engine,'read.notice');assertActionTime(d,engine,rule.timeMin);
 const span=beginActionActivity(d,engine,rule.activity);
 engine.advance(d,rule.timeMin,eventId);
 if(d.get('state','location')!==location||d.get('state','player','status')!=='正常')throw preconditionFailure('阅读完成前已离场或失去行动能力');
 const memoryId=`player::notice:${notice.id}`,memory={subject:'player',key:`notice:${notice.id}`,content:notice.text,source:notice.id,sourceType:'阅读',channel:'read',reliability:'原文',location,minute:d.get('state','minute'),sourceEvent:eventId,participants:['player'],keywords:[],pinned:false};
 d.set(['memories',memoryId],memory);
 const result={notice:notice.id,memoryId,content:notice.text,source:notice.id,cost:finishActionActivity(d,engine,span),actionScope:{kind:'reading',clockManaged:true,minutes:rule.timeMin}};
 d.set(['state','records',key],{category:'daily_action',identity,result});return result;
}

export function overhearRumor(d,engine,args,eventId){
 const key=`daily:${eventId}`,identity=digest({operation:'overhear',conversation:args.conversation}),old=d.get('state','records',key);
 if(old){if(old.identity!==identity)throw preconditionFailure('同一事件编号不能更换旁听来源');return {...old.result,duplicate:true};}
 const location=d.get('state','location'),speech=engine.byId.get(location)?.publicConversations?.find(n=>n.id===args.conversation);
 if(!speech)throw preconditionFailure('这里没有这段公开交谈');
 const rumor=npcRumors(engine,speech.speaker,d.document).find(r=>r.id===speech.rumor);
 if(!rumor)throw preconditionFailure('讲述者当前不知道这条传闻');
 const rule=actionCostRule(engine,'talk.overhear');assertRumorConversation(d,engine,speech.speaker,rule.timeMin);
 const span=beginActionActivity(d,engine,rule.activity);
 const heard=hearNpcRumor(d,engine,{subject:'player',key:rumor.id,rumor:rumor.id,source:speech.speaker,content:rumor.claim},eventId,{channel:'overhear',minutes:rule.timeMin,sourceLabel:speech.label??'当地闲谈'});
 const result={...heard,cost:finishActionActivity(d,engine,span),actionScope:{kind:'overhearing',clockManaged:true,minutes:d.get('state','minute')-span.start}};
 d.set(['state','records',key],{category:'daily_action',identity,result});return result;
}
