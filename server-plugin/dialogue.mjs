import {preconditionFailure} from './precondition.mjs';
import {goodsWorth} from './valuation.mjs';
import {pruneRecords} from './record-cleanup.mjs';
import {reject} from './action-rejection.mjs';
import {facilityRuntime} from './facility-state.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
// Deterministic conversation adapter. Existing promises/items/coins remain the
// authoritative executors; speech alone cannot grant a permission or a reward.
import fs from 'node:fs';
import {subjectiveView,subjectiveFact,conversationLanguage as language} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {moveCoins,purse} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {recordLie} from './lies.mjs';
import {eatMeal,orderMeal,treatRumor,readNotice,overhearRumor} from './daily-actions.mjs';
import {actionCostRule,beginActionActivity,finishActionActivity} from './action-costs.mjs';
import {assertRumorConversation} from './npc-rumors.mjs';
import {advanceWithNpcParticipants} from './npc-schedule.mjs';
import {transferItems} from './items.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {recordsWhere} from './storage.mjs';
declareHoldingWriter('dialogue-state');
export function activeConversation(state,npc){
 return recordsWhere(state.records,'category','conversation').find(r=>r.active&&r.participants.includes('player')&&r.participants.includes(npc)&&r.location===state.location&&state.npcs?.[npc]?.location===state.location)??null;
}
export function initializeConversation(d,e,row,context){
 const s=d.get('state');
 if(context?.origin!=='initial'||!context.eventId||typeof row.id!=='string'||!row.id||s.records?.[`conversation:${row.id}`]||row.active!==true||typeof row.mainTopicFinished!=='boolean'||!Array.isArray(row.participants)||row.participants.length!==2||!row.participants.includes('player')||new Set(row.participants).size!==2)throw Error('Invalid initial conversation');
 const npc=row.participants.find(id=>id!=='player'),n=s.npcs?.[npc];
 if(!n||n.location!==s.location||n.scheduleTravel||n.cognitionTravel||isPhysicallyDead(e,s,npc)||activeConversation(s,npc)||!language(subjectiveView(e,d.document,npc),e,d))throw Error('Conversation requires present communicating participants');
 holdingSet(d,e,['state','records',`conversation:${row.id}`],{...row,category:'conversation',location:s.location,sourceEvent:context.eventId},'dialogue-state');
}
declareLedgerWriter('dialogue',{});
const prefix='对话请求：';
const templateRoot=new URL('../world/templates/dialogue/common/plain/',import.meta.url);
const bargaining=JSON.parse(fs.readFileSync(new URL('../world/rules/tables/bargaining.json',import.meta.url),'utf8'));
const row=(d,npc)=>d.get('state','npcs',npc);
function present(d,engine,raw){
 const npc=engine.resolve(raw,'npc'),n=row(d,npc);
 if(!n||n.location!==d.get('state','location')||n.scheduleTravel||n.cognitionTravel||isPhysicallyDead(engine,d,npc)||['濒死','昏迷'].includes(n.status))throw preconditionFailure('对方不在这里或无法交谈');
 return npc;
}
function line(engine,view,action,decision,detail=''){
 const name=action==='request'?'request':action;
 const templates=engine.world.dialogueTemplates;
 let rows=templates?.[`${view.self.culture}/plain/${name}_${decision.outcome}.json`]??templates?.[`common/plain/${name}_${decision.outcome}.json`]??templates?.['common/plain/default_agree.json'];
 if(!rows)try{rows=JSON.parse(fs.readFileSync(new URL(`${name}_${decision.outcome}.json`,templateRoot),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;rows=JSON.parse(fs.readFileSync(new URL('default_agree.json',templateRoot),'utf8'));}
 const vars={name:view.self.name,reason:decision.reason,detail,topic:view.knowledge.memories.at(-1)?.content??view.self.activity??'',price:decision.conditions?.prepay??'',alternative:decision.alternatives.map(a=>a.name).filter((x,i,a)=>a.indexOf(x)===i).join('、')};
 const selected=rows.find(r=>r.when&&r.when===`season() == '${view.observable.season}'`)??rows.find(r=>!r.when)??rows[0];
 return selected.text.replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'');
}
function save(d,npc,eventId,action,decision,text,extra={}){
 const s=d.get('state'),previous=activeConversation(s,npc),id=previous?.id??`dialogue:${eventId}`;
 const conversation={...previous,id,category:'conversation',participants:['player',npc],location:s.location,mainTopicFinished:previous?.mainTopicFinished??false,active:action!=='leave',sourceEvent:previous?.sourceEvent??eventId,lastReply:eventId,...(action==='leave'?{endedAt:s.minute}:{} )};
 holdingSet(d,null,['state','records',`conversation:${id}`],conversation,'dialogue-state');
 // Ended conversations are history: keep only the latest few.
 pruneRecords(d,'conversation',{exempt:r=>r.active,max:32});
 const dialogue={npc,action,decision,text,...extra,conversation:{id,active:conversation.active,mainTopicFinished:conversation.mainTopicFinished}};
 d.set(['state','dialogues',npc],{...dialogue,minute:d.get('state','minute'),sourceEvent:eventId});
 return {dialogue};
}
// Native request adapters share the same conversation lifecycle and archive.
export {save as saveDialogue};
export function dialogueRequest(d,engine,args,eventId){
 if(!args.content?.startsWith(prefix))return null;
 const npc=present(d,engine,args.promisor),view=subjectiveView(engine,d.document,npc);
 if(!language(view,engine,d))return save(d,npc,eventId,'request',npcDecision(view,{kind:'greet'}),'言语不通，请先找通译。');
 const kind=args.type,decision=npcDecision(view,{kind,from:'player',cost:{minutes:args.minutes??0},service:kind});
 const content=args.content.slice(prefix.length),pending={...args,content,consent:true};
 if(decision.outcome==='defer')d.set(['state','records',`dialogue_due:${eventId}`],{category:'dialogue_pending',npc,due:decision.due,request:pending});
 if(decision.outcome!=='agree')return save(d,npc,eventId,'request',decision,line(engine,view,'request',decision),{pending});
 const detail=engine.promise(d,pending,eventId);
 return {...detail,...save(d,npc,eventId,'request',decision,line(engine,view,'request',decision))};
}
export function applyDialogue(d,engine,args,eventId){
 if(args.key==='dialogue:read_notice')return readNotice(d,engine,args,eventId);
 if(args.key==='dialogue:overhear')return overhearRumor(d,engine,args,eventId);
 if(args.key==='dialogue:eat_meal')return eatMeal(d,engine,args,eventId);
 if(args.key==='dialogue:order_meal')return orderMeal(d,engine,args,eventId);
 if(args.key==='dialogue:treat_rumor')return treatRumor(d,engine,args,eventId);
 if(!args.key?.startsWith('dialogue:'))return null;
 const npc=present(d,engine,args.subject),view=subjectiveView(engine,d.document,npc),action=args.key.slice(9);
 const previous=d.get('state','dialogues',npc),communicates=language(view,engine,d);
 if(!communicates&&!['greet','leave','interpreter'].includes(action))return save(d,npc,eventId,action,npcDecision(view,{kind:'greet'}),'言语不通，只能寒暄、手势交易，或找通译。');
 let decision=npcDecision(view,{kind:action,from:'player'}),detail='',cost,gift;
 if(action==='guide_request'){
  decision=npcDecision(view,{kind:'带路',from:'player'});
  const rule=actionCostRule(engine,'talk.ask');assertRumorConversation(d,engine,npc,rule.timeMin);
  const span=beginActionActivity(d,engine,rule.activity);
  advanceWithNpcParticipants(d,engine,rule.timeMin,eventId,[npc]);cost=finishActionActivity(d,engine,span);
  return {...save(d,npc,eventId,'request',decision,line(engine,view,'request',decision,'具体目的地和条款须另行约定；本次答复不成立带路义务。')),
   cost,socialEvent:{verb:'request',target:npc,tags:['dialogue','guide']}};
 }else if(action==='ask'){
  const known=subjectiveFact(view,args.content);
  detail=known?`${known.kind==='belief'?'我猜':known.kind==='prior'?'按常理说':'我知道'}：${typeof known.value==='string'?known.value:JSON.stringify(known.value)}`:'这件事我不知道。';
  const rule=engine.replaying&&!engine.replayResult?.cost?null:actionCostRule(engine,'talk.ask');
  if(rule){
  assertRumorConversation(d,engine,npc,rule.timeMin);
  if(args.source){
   const item=engine.resolve(args.source,'item');
   transferItems(d,engine,'player',npc,item,1);
   gift={item,quantity:1};
  }
  const span=beginActionActivity(d,engine,rule.activity);
  advanceWithNpcParticipants(d,engine,rule.timeMin,eventId,[npc]);
  cost=finishActionActivity(d,engine,span);
  }
 }else if(action==='greet'){
  const memory=[...view.knowledge.memories].reverse().find(m=>m.participants?.includes('player')&&m.kind!=='dialogue');
  const clause=memory&&view.self.clauses.find(c=>memory.id?.endsWith(`:obligation_${c.id}`));
  detail=memory?`我还记得${clause?.content?`${clause.content}，`:''}${memory.content}`:Object.values(view.self.goals).flat().find(g=>(g.progress??0)<100)?.content??view.self.activity;
 }else if(action==='public_key')decision=npcDecision(view,{kind:'public_key',service:'granary'});
 else if(action==='accept'){
  if(previous?.action==='haggle'&&previous.pendingTrade&&previous.decision.outcome==='agree'){
   return engine.trade(d,previous.pendingTrade,eventId).then(trade=>({...trade,...save(d,npc,eventId,action,decision,`${view.self.name}：依谈好的价格成交。`),socialEvent:{verb:'trade',actor:'player',target:npc,value:trade.cost,tags:['trade','dialogue','cash']}}));
  }
  if(!previous?.pending||previous.decision.outcome!=='conditional')throw preconditionFailure('没有待接受的条件');
  const price=previous.decision.conditions.prepay;
  const confirmed=npcDecision(view,{kind:previous.pending.type,from:'player',prepaid:true,reward:price,cost:{minutes:previous.pending.minutes??0}});
  if(confirmed.outcome!=='agree')return save(d,npc,eventId,'request',confirmed,line(engine,view,'request',confirmed),{pending:previous.pending});
  decision=confirmed;
  moveCoins(d,{from:purse(engine,'player'),to:purse(engine,npc),amount:price,writer:'dialogue',eventId});
  d.set(['state','player','coins'],d.get('state','player','coins')-price);
  d.set(['state','npcs',npc,'coins'],row(d,npc).coins+price);
  const result=engine.promise(d,{...previous.pending,consent:true},eventId);
  return {...result,...save(d,npc,eventId,action,decision,`${view.self.name}：收到${price}文，就照约定办。`)};
 }else if(['persuade','threaten','bribe','deceive'].includes(action)){
  // Use the established contested check; a successful roll never overrides a
  // red line or invents consent. Subsequent requests are still adjudicated.
  const judgement=engine.check(d,{attribute:'魅力',opponent:{npc,attribute:'精神'}},eventId);
  detail=judgement.success?'我听到了你的说法，具体的事还得另议。':'这番话没能说服我。';
  let lie=null;
  if(action==='deceive'&&judgement.success){
   const known=subjectiveView(engine,d.document,'player').knowledge.memories.find(m=>m.id===args.source||m.sourceEvent===args.source);
   if(!known)throw preconditionFailure('欺骗需要本人已知的实情来源编号');
   lie=recordLie(d,engine,{subject:npc,source:'player',key:`dialogue_${eventId}`,content:args.content,truth:known.content,motive:'对话欺骗'},eventId);
  }
  return {...lie,...save(d,npc,eventId,action,decision,line(engine,view,action,decision,detail),{judgement,tags:[action],...(communicates?.interpreter?{actedAs:communicates.interpreter}:{})}),
   socialEvent:{verb:action==='threaten'?'clash':action==='deceive'?'deceive':'pact',target:npc,tags:['dialogue',action,judgement.success?'success':'attempt']}};
 }else if(action==='tell'){
  const known=subjectiveView(engine,d.document,'player').knowledge.memories.find(m=>m.id===args.source||m.sourceEvent===args.source);
  if(!known)reject('E-ACTION-KNOWLEDGE','告知需要本人已知的来源编号',{missing:['需要本人已知的消息来源编号'],repair:['先取得消息，再用本人已知的真实来源编号告知']});
  if(args.content!==known.content)throw preconditionFailure('告知须保留已知版本；改编说法请用欺骗动作');
  const memory={...structuredClone(known),id:`tell_${eventId}`,sourceEvent:known.sourceEvent??known.id,sourceType:'转述',minute:view.minute,participants:['player',npc],content:args.content};
  if(known.private&&!(known.permittedRecipients??known.knownBy??[]).includes(npc))throw preconditionFailure('这份私密信息不能转述给对方');
  d.set(['state','npcs',npc,'memoryStream'],[...row(d,npc).memoryStream??[],memory]);detail=args.content;
 }else if(action==='haggle'){
  const offered=Number(args.content);if(!Number.isSafeInteger(offered)||offered<1)throw preconditionFailure('还价须是正整数文钱');
  const rules=engine.rules.bargaining??bargaining,rule=Array.isArray(rules)?rules.find(r=>!r.selector.culture||r.selector.culture===view.self.culture):rules;
  const rounds=(previous?.action==='haggle'?previous.rounds??0:0)+1,max=rule.maxRounds;
  decision=npcDecision(view,{kind:'haggle',reward:offered});
  if(rounds>max){decision={...decision,outcome:'refuse',reason:'已经谈过几轮，不再还价。'};}
  const item=args.source?engine.resolve(args.source,'item'):null;
  const observed=item?facilityRuntime().currentTradeQuote(engine,d.document,{seller:npc,item}).listPrice:null;
  if(observed&&offered<Math.ceil(observed*(1-(rule.concession[Math.min(rounds-1,rule.concession.length-1)]??0))))decision={...decision,outcome:'refuse',reason:'这个出价太低，还要再商量。'};
  return save(d,npc,eventId,action,decision,line(engine,view,action,decision,`你的出价是${offered}文；成交仍须确认具体交易。`),{rounds,offer:offered,...(item?{pendingTrade:{seller:npc,item,quantity:1,unitPrice:offered}}:{})});
 }else if(action==='interpreter')detail=view.observable.people.filter(p=>p.id!==npc).map(p=>p.name).join('、')||'这里没有可找的通译。';
 else if(action==='leave')detail='回头见。';
 else if(action!=='greet')throw preconditionFailure('未知对话动作');
 const giftValue=gift?goodsWorth(d,engine,{item:gift.item,quantity:1,holder:'player'}):undefined;
 const unknown=gift&&giftValue===null?{unvaluable:'对方无法估值',valuationNote:'无从估价：对方无法估值，不计价值，只计心意。'}:{};
 if(unknown.unvaluable)d.say(unknown.valuationNote);
 return {...save(d,npc,eventId,action,decision,line(engine,view,action,decision,detail),communicates?.interpreter?{actedAs:communicates.interpreter}:{}),...unknown,
  ...(cost?{cost}:{}),...(gift?{gift,socialEvent:{verb:'gift',target:npc,value:giftValue,...unknown,tags:['dialogue','gift']}}:{})};
}
export {npcDecision,subjectiveView};
