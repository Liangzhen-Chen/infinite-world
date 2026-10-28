import {preconditionFailure} from './precondition.mjs';
import {holdingSet} from './holding-sources.mjs';
import {declareHoldingWriter} from './holdings.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {moveCoins,purse,fund,dedicatedCoinKey,dedicatedCoinAccount} from './money.mjs';
import {relationView} from './npc-state.mjs';
import {worldEvent} from './world-events.mjs';
import {filingKnowledge} from './legal-reactions.mjs';
import {institutionOffices,officeOnDuty,lawAuthorities} from './entity-view.mjs';
import {canAct} from './action-capacity.mjs';
import {representationEffect,hireAdvocate} from './legal-representation.mjs';
import {institutionOriginal} from './obligation-state.mjs';
import {documentAccessible,canReadDocument} from './documents.mjs';
import {openObligation,settleObligation,closeObligation} from './obligation-runtime.mjs';
import {legalCodeAt,legalCodeById} from './law-codes.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {persistable} from './storage.mjs';

declareHoldingWriter('legal-appeal',{entities:['case']});
declareLedgerWriter('legal-appeal');
export const TRIAL_VERSION=1;
const path=id=>['state','records',id];
const put=(d,e,row)=>holdingSet(d,e,path(row.id),row,'legal-appeal');
const fail=message=>{throw preconditionFailure(message);};
const unit=n=>Math.max(0,Math.min(1,n));

function fineCollection(e,document,obligation,payer,authority=null){
 const s=document.state,row=s.records[obligation.terms.case],code=row&&legalCodeById(e,row.law,s),account=dedicatedCoinAccount(s,obligation.creditor,'legal_treasury');
 if(!row?.judgment||row.fineObligation!==obligation.id||row.judgment.sourceEvent!==obligation.terms.judgmentEvent||row.fineDischarged||row.appeal?.outcome==='overturned'||row.appeal?.pending&&row.appeal.staysExecution||!account||!code)return null;
 const at=payer==='player'?s.location:s.npcs[payer]?.location;if(at!==account.seat||s.location!==at)return null;
 const offices=institutionOffices(e,s).filter(o=>o.seat===at&&o.authority?.operations?.includes('collect_fine')&&(!o.authority.case||o.authority.case===row.id)&&(!o.authority.obligation||o.authority.obligation===obligation.id)&&officeOnDuty(e,s,o,o.holder));
 const ids=[...offices.map(o=>o.holder),...(at===code.court?lawAuthorities(e,s,code,'officer'):[])];
 for(const id of ids){if(authority&&authority!==id)continue;const body=id==='player'?s.player:s.npcs[id],here=id==='player'?s.location:body?.location;
  if(here===at&&canAct({engine:e,document},id,'talk').allowed&&!/睡|昏|失能/.test(body?.activity??body?.status??''))return {collector:id,seat:at,account:account.account,dedicated:true,creditor:obligation.creditor};
 }
 return null;
}
registerAdvanceHook('legalFineCollection',fineCollection);
registerAdvanceHook('legalFineOrder',(e,document,args)=>{
 const row=document.state.records[args.terms.case],code=row&&legalCodeById(e,row.law,document.state);
 return Boolean(row?.judgment?.convicted&&args.id===(row.fineObligation??`legal_fine:${row.id}:${row.judgment.sourceEvent}`)&&row.judgment.sourceEvent===args.terms.judgmentEvent&&row.judgment.judge===args.actor&&row.offender===args.debtor&&row.judgment.fine===args.amount&&code);
});
registerAdvanceHook('legalFineSettled',(d,e,obligation,eventId)=>{
 const row=d.get(...path(obligation.terms.case));if(!row)return;
 put(d,e,{...row,finePaid:obligation.paid,fineDischarged:obligation.paid>=obligation.amount,executionEvent:eventId,stage:'execution'});
});
function ensureFine(d,e,row,code,judge,eventId){
 if(!row.judgment?.convicted||row.judgment.fine<=0)return row;
 let owner=row.settlement??code.settlement;
 for(let at=row.location;!owner&&at;at=e.byId.get(at)?.parent)if(d.get('state','settlements',at))owner=at;
 owner??=row.law;
 const offices=institutionOffices(e,d.get('state')).filter(o=>o.authority?.operations?.includes('collect_fine')&&legalCodeAt(e,o.seat,d.get('state'))?.id===row.law);
 const procedure=row.judgment.procedure??code.procedure;
 const seat=procedure?.fineCollectionSite??(offices.length===1?offices[0].seat:row.court);
 const account=dedicatedCoinAccount(d.get('state'),owner,'legal_treasury');
 if(!account)holdingSet(d,e,path(dedicatedCoinKey(owner,'legal_treasury')),{category:'money_account',owner,purpose:'legal_treasury',account:`${owner}|coin_river|legal_treasury`,coins:0,seat},'legal-appeal');
 const id=row.fineObligation??`legal_fine:${row.id}:${row.judgment.sourceEvent}`;
 put(d,e,row);
 if(!d.get('state','obligations',id))openObligation(d,e,{id,actor:judge,debtor:row.offender,creditor:owner,kind:'fine',subject:row.id,amount:row.judgment.fine,
  terms:{case:row.id,legalFineVersion:1,judgmentEvent:row.judgment.sourceEvent,collectionSite:seat}},`${eventId}:fine`,{authorize:()=>({allowed:true})});
 return {...row,fineObligation:id};
}

// Snapshot only the submitting speaker's version. Scoring never resolves its
// source event or consults the private suspicion, inventory or criminal truth.
export function trialTestimony(d,e,row,actor,source){
 const known=filingKnowledge(e,d,actor,source),event=worldEvent(d.get('state'),known.sourceEvent);
 const view=known.direct?event?.perception?.versions?.[actor]:null;
 const stance=relationView(e,d.get('state'),actor,row.offender).trust??0;
 return {kind:known.direct?'eyewitness':'statement',witness:actor,source:known.sourceEvent,
  testified:true,identified:known.direct,minute:d.get('state','minute'),version:known.version,
  quality:{stance,lineOfSight:view?.identified===false?0:view?.visual===false&&!view?.tactile?0:1,completeness:known.direct&&view?.complete!==false?1:0}};
}

export function trialEvidenceScore(row,code,{advocate=null,legacy=false}={}){
 const rule=code.procedure?.evidence??{},weights=rule.weights??{eyewitness:1,confession:2,document:2,statement:0};
 if(!legacy&&(!rule.weights||!Number.isFinite(rule.convictionThreshold?.[row.offense])))fail('法典未规定本罪的证据权重或定罪阈值，不能猜测');
 const seen=new Set(),items=[];
 for(const entry of row.evidence??[]){
  const key=entry.kind==='document'?`document:${entry.document}`:entry.kind==='confession'?`confession:${entry.subject}`:`witness:${entry.witness}:${entry.source}`;
  if(seen.has(key))continue;seen.add(key);
  if(entry.disproven||entry.invalidatedAt!==undefined||entry.falseStatement)continue;
  let quality=0,polarity=1;
  if(entry.kind==='eyewitness'&&entry.testified&&entry.identified){
   const q=entry.quality;if(!q)continue;
   quality=unit(q.lineOfSight)*unit(q.completeness)*(1-unit(Math.abs(q.stance??0)/100)*(rule.stanceDiscount??0));
  }else if(entry.kind==='confession'&&entry.subject===row.offender)quality=1;
  else if(entry.kind==='document'&&entry.verification){
   const v=entry.verification;quality=v.authentic?unit(v.completeness):0;polarity=v.polarity;
  }
  const base=(weights[entry.kind]??0)*quality*polarity;
  // The existing advocate's derived skill enters the documented weight slot;
  // it cannot fabricate evidence. Its effect is recorded with the judgment.
  const multiplier=advocate&&polarity>0?1-advocate.discount:1;
  items.push({key,base,slot:'law:evidenceWeight',modifiers:advocate?[{source:advocate.npc,mul:multiplier}]:[],weight:base*multiplier});
 }
 const threshold=rule.convictionThreshold?.[row.offense]??code.evidenceRequired;
 if(!Number.isFinite(threshold)||threshold<=0)fail('适用程序未规定该罪名的定罪阈值');
 return {score:items.reduce((sum,item)=>sum+item.weight,0),threshold,items};
}

function officer(d,e,code,args,{review=false,collect=false}={}){
 const s=d.get('state'),id=args.authority,at=id==='player'?s.location:s.npcs?.[id]?.location;
 const judges=review?code.appeal?.judges:lawAuthorities(e,s,code,collect?'officer':'judge');
 const offices=institutionOffices(e,s).filter(o=>o.holder===id&&o.seat===s.location&&officeOnDuty(e,s,o,id));
 const permission=collect?'collect_fine':review?'review_case':'judge_case';
 if(!id||at!==s.location||!canAct({engine:e,document:d.document},id,'talk').allowed||
  !(judges?.includes(id)||offices.some(o=>o.authority?.operations?.includes(permission))))fail('须由在场、在岗且有权的审理或执行人办理');
 if(id!=='player'&&['convicted','fine','outcome','decision','accept','consent'].some(k=>args[k]!==undefined))fail('不能替 NPC 审理人填写裁判或同意');
 if(id==='player'&&!offices.length)fail('玩家须本人实际担任并当值该职位');
 return id;
}
function transferFine(d,e,row,amount,eventId,authority=null){
 if(row.fineObligation){
  const obligation=d.get('state','obligations',row.fineObligation),account=dedicatedCoinAccount(d.get('state'),obligation.creditor,'legal_treasury');
  if(amount>0){
   const actor=row.offender==='player'?'player':authority;
   const paid=settleObligation(d,e,{id:row.fineObligation,actor,payer:row.offender,amount,...(authority?{authority}:{})},eventId,
    actor===row.offender?{}:{authorize:({actor,party})=>({allowed:party===row.offender&&fineCollection(e,d.document,obligation,party,authority)?.collector===actor})});
   return {...paid,from:paid.accounts.from,to:paid.accounts.to,amount,protocol:true};
  }
  if(!account||account.coins< -amount)fail('实际公库余额不足，未执行返还');
  moveCoins(d,{from:account.account,to:purse(e,row.offender),amount:-amount,writer:'legal-appeal',eventId});
  const body=row.offender==='player'?['state','player','coins']:['state','npcs',row.offender,'coins'];d.set(body,d.get(...body)-amount);
  return {from:account.account,to:purse(e,row.offender),amount:-amount};
 }
 const id=`legal_treasury:${row.law}`,old=d.get(...path(id))??{id,category:'legal_treasury',law:row.law,coins:0};
 const body=row.offender==='player'?['state','player','coins']:['state','npcs',row.offender,'coins'];
 const balance=d.get(...body);
 if(amount>0&&balance<amount||amount<0&&old.coins< -amount)fail('实际账户余额不足，未执行转移');
 moveCoins(d,{from:amount>0?purse(e,row.offender):fund(id),to:amount>0?fund(id):purse(e,row.offender),amount:Math.abs(amount),writer:'legal-appeal',eventId});
 d.set(body,balance-amount);holdingSet(d,e,path(id),{...old,coins:old.coins+amount},'legal-appeal');
 return {from:amount>0?purse(e,row.offender):fund(id),to:amount>0?fund(id):purse(e,row.offender),amount:Math.abs(amount)};
}
function complete(d,e,row,result,eventId,extra={}){
 row=persistable(row);put(d,e,row);
 const record={id:`legal_trial:${eventId}`,category:'legal_trial',trialVersion:TRIAL_VERSION,case:row.id,
  row:structuredClone(row),result:persistable(result),...extra};
 holdingSet(d,e,path(record.id),record,'legal-appeal');
 return {...result,trialRecord:record};
}
function verify(d,e,row,id,judge,eventId){
 const paper=institutionOriginal(e,d.document,id),doc=paper?.document;
 if(!doc||!documentAccessible(e,d.document,id)||!canReadDocument(e,d.get('state'),judge,paper))fail('核验须出示审理人能阅读的原件');
 const issued=worldEvent(d.get('state'),doc.issuedEvent),source=worldEvent(d.get('state'),doc.sourceEvent);
 const sale=source&&d.get('state','records',`item_sale:${source.id}`);
 const authentic=Boolean(issued?.target===id&&issued.source?.event===doc.sourceEvent&&source&&doc.valid!==false);
 const original=doc.records?.find(r=>r.event===doc.sourceEvent)?.version;
 const completeness=original===doc.content&&paper.durability>0?1:0;
 // A pre-existing purchase of this same physical item rebuts its alleged theft.
 const ownership=authentic&&sale?.buyer===row.offender&&sale.instances?.includes(row.stolen?.unit)&&source.minute<=row.minute;
 return {authentic,completeness,polarity:ownership?-1:source?.id===row.sourceEvent?1:0,by:judge,sourceEvent:eventId,minute:d.get('state','minute')};
}

export function trialAction(d,e,row,code,args,eventId,{penalty,submitDocument,advance,notify}={}){
 const op=args.operation,s=d.get('state');
 const supported=['hear','request_hearing','appeal','request_review','review','decide_case','pay','execute_fine','submit_evidence','verify_evidence','hire_advocate'];
 if(!supported.includes(op))return null;
 const recorded=e.replaying?e.replayResult?.trialRecord:null,prior=s.records[`legal_trial:${eventId}`];
 if(prior){if(prior.case!==row.id)fail('法律事件编号已被其他案件使用');return {...prior.result,trialRecord:prior};}
 if(recorded?.trialVersion===1){
  if(recorded.case!==row.id)fail('复演案件不符');
  if(recorded.minutes)advance(d,e,recorded.minutes,eventId,[recorded.authority].filter(x=>x!=='player'));
  if(recorded.row.fineObligation&&!row.fineObligation)ensureFine(d,e,recorded.row,code,recorded.authority,eventId);
  if(recorded.transfer)transferFine(d,e,row,recorded.transfer.signedAmount,eventId,recorded.authority);
  if(recorded.waived&&row.fineObligation)closeObligation(d,e,{id:row.fineObligation,actor:recorded.authority,party:d.get('state','obligations',row.fineObligation,'creditor'),reason:'creditor_waiver'},`${eventId}:waive`,{authorize:()=>({allowed:true})});
  if(recorded.notification){put(d,e,structuredClone(recorded.row));notify?.(d.get(...path(row.id)),recorded.notification);}
  return complete(d,e,structuredClone(recorded.row),recorded.result,eventId,Object.fromEntries(['minutes','authority','transfer','waived','notification'].filter(k=>recorded[k]!==undefined).map(k=>[k,recorded[k]])));
 }
 const party=row.offender==='player'||row.victim==='player'||row.parties?.includes('player');
 if(['appeal','submit_evidence','hire_advocate'].includes(op)&&!party)fail('只有本案当事人可以提出此申请');
 if(op==='hire_advocate')return hireAdvocate(d,e,row,args,eventId);
 if(op==='submit_evidence'){
  if(s.location!==row.court)fail('须在案件法院递交证据');
  if(args.document){const evidence=submitDocument(d,e,{case:row.id,document:args.document},eventId);return complete(d,e,d.get(...path(row.id)),{case:row.id,submitted:true,evidence},eventId);}
  const witness=args.witness??'player',at=witness==='player'?s.location:s.npcs[witness]?.location;
  if(at!==s.location||!canAct({engine:e,document:d.document},witness,'talk').allowed)fail('证人须本人清醒在场');
  const evidence=trialTestimony(d,e,row,witness,args.source??row.sourceEvent);
  if(evidence.source!==row.sourceEvent)fail('证言与所指控事件不符');
  return complete(d,e,{...row,evidence:[...row.evidence,evidence]},{case:row.id,submitted:true,evidence},eventId);
 }
 if(op==='appeal'){
  if(row.appeal?.pending||row.appeal?.outcome)fail('不能重复提出同一上诉');
  if(!row.judgment||s.minute>(row.appealDeadline??Infinity))fail('不在可提出上诉的阶段或 appeal period 已届满');
  const judge=officer(d,e,code,args,{review:true});
  const type=row.kind??(row.civilMatter?'civil':'criminal'),stay=code.procedure?.appealStaysExecution;
  const stays=typeof stay==='boolean'?stay:stay?.[type];
  if(typeof stays!=='boolean')fail('法典未规定本类案件上诉是否停止执行');
  const appeal={pending:true,acceptedAt:s.minute,authority:judge,staysExecution:stays,originalJudgment:structuredClone(row.judgment),sourceEvent:eventId};
  return complete(d,e,{...row,stage:'appeal',appeal},{case:row.id,accepted:true,appeal},eventId);
 }
 if(op==='verify_evidence'){
  const judge=officer(d,e,code,args,{review:code.appeal?.judges?.includes(args.authority)});if(s.location!==row.court)fail('须到本案法院核验');
  if(!row.evidence.some(x=>x.document===args.document))fail('须先递交该原件');
  const verification=verify(d,e,row,args.document,judge,eventId);
  return complete(d,e,{...row,evidence:row.evidence.map(x=>x.document===args.document?{...x,verification}:x)},{case:row.id,verification},eventId);
 }
 if(op==='pay'||op==='execute_fine'){
  const judge=officer(d,e,code,args,{collect:true});
  if(row.fineDischarged)fail('罚款已清偿或免除，不能重复执行');
  if(!row.judgment||row.appeal?.outcome==='overturned')fail('没有未执行的有效罚款');
  if(row.appeal?.pending&&row.appeal.staysExecution)fail('本类上诉期间停止执行');
  const at=row.offender==='player'?s.location:s.npcs[row.offender]?.location;
  const obligation=row.fineObligation&&s.obligations?.[row.fineObligation],site=obligation?.terms.collectionSite??row.court;
  if(s.location!==site||at!==s.location){
   return complete(d,e,{...row,stage:'pursuit'},{case:row.id,executed:false,stage:'pursuit',reason:'当事人已离开可执行处，未扣款'},eventId);
  }
  if(!canAct({engine:e,document:d.document},row.offender,'talk').allowed)fail('当事人眼下不可及');
  const fine=Math.max(0,row.judgment.fine-(row.finePaid??0));
  if(!fine)fail('本案没有未缴罚款');
  advance(d,e,10,eventId,[judge].filter(x=>x!=='player'));
  if((row.offender==='player'?d.get('state','location'):d.get('state','npcs',row.offender,'location'))!==site) return complete(d,e,{...row,stage:'pursuit'},{case:row.id,executed:false,stage:'pursuit'},eventId,{minutes:10,authority:judge});
  const transfer=transferFine(d,e,row,fine,eventId,judge);
  const compensation=row.judgment.compensation??0;
  const settlement=Number.isSafeInteger(compensation)&&compensation>=0
   ?compensation>0&&!row.compensationPaid?{status:'待赔偿'}:{status:'已结案',compensationPaid:true,closed:d.get('state','minute')}:{};
  return complete(d,e,{...row,...settlement,finePaid:(row.finePaid??0)+fine,fineDischarged:true,stage:'execution',executionEvent:eventId},
   {case:row.id,fine,executed:true,transfer},eventId,{minutes:10,authority:judge,transfer:{...transfer,signedAmount:fine}});
 }
 const review=['review','request_review'].includes(op)||op==='decide_case'&&row.appeal?.pending,judge=officer(d,e,code,args,{review});
 if(op==='decide_case'&&(judge!=='player'||typeof args.convicted!=='boolean'))fail('亲自裁判须由玩家本人担任审理职位，并明确裁决');
 if(judge==='player'&&op!=='decide_case')fail('你本人正在审理席位，请亲自裁决，不能向自己申请');
 if(s.location!==row.court)fail('须到案件法院审理');
 if(review&&!row.appeal?.pending||!review&&(row.judgment&&row.judgment.convicted!==false||!row.reported))fail('案件不在本次审理阶段');
 if(review&&judge===row.judgment.judge)fail('原审判者须回避复审');
 const minutes=review?code.appeal?.minutes:code.hearingMinutes;
 if(!Number.isSafeInteger(minutes)||minutes<0)fail('法典未规定审理耗时');
 advance(d,e,minutes,eventId,[judge].filter(x=>x!=='player'));
 officer(d,e,code,args,{review});
 const scored=trialEvidenceScore(row,code,{advocate:representationEffect(d,e,row)});
 if(op==='decide_case'&&args.convicted&&scored.score<scored.threshold)fail('已提交证据低于本罪定罪阈值，不能定罪');
 const convicted=op==='decide_case'?args.convicted:scored.score>=scored.threshold;
 const p=row.normSnapshot?row.normSnapshot.penalty:penalty,unvaluable=row.value===null;if(convicted&&(!p||!unvaluable&&!Number.isFinite(row.value)))fail('行为时罪名、刑罚或案值缺失，不能猜测判罚');
 const fine=convicted?p.baseFine+(unvaluable?0:Math.ceil(row.value*p.valueMultiplier)):0;
 const judgment={...(review?row.judgment:{}),judge,sourceEvent:eventId,minute:d.get('state','minute'),fine,evidenceScore:scored.score,evidence:scored,convicted,
  authoritySource:judge==='player'?'player_office':'npc_judicial_rules',substantiveLaw:structuredClone(row.normSnapshot),procedure:structuredClone(code.procedure??{}),
  ...(unvaluable?{compensation:null,unvaluable:'无法核定案值',valuationNote:'无从估价：无法核定案值，仅适用基础罚则，不加案值倍数；赔偿待核定。'}:{})};
 let next={...row,status:convicted?'已裁定':'证据不足',stage:convicted?'judged':'closed',judgment,...(!review?{finePaid:0,fineDischarged:!convicted,appeal:null}:{}),
  ...(!review&&Number.isSafeInteger(code.procedure?.appealWindowMinutes)?{appealDeadline:d.get('state','minute')+code.procedure.appealWindowMinutes}:{})};
 let transfer,waived=false;
 if(review){
  const refund=Math.max(0,(row.finePaid??0)-fine);
  if(refund){if(code.procedure?.refundOnReversal!==true)fail('法典未配置已缴罚款的返还规则');transfer=transferFine(d,e,row,-refund,eventId);next.finePaid=(row.finePaid??0)-refund;}
  next.fineDischarged=(next.finePaid??0)>=fine;
  next.appeal={...row.appeal,pending:false,outcome:convicted?(fine===row.judgment.fine?'upheld':'amended'):'overturned',decisionEvent:eventId};
  if(next.appeal.outcome==='upheld')next.judgment={...judgment,sourceEvent:row.judgment.sourceEvent,reviewEvent:eventId};
  if(!convicted&&row.fineObligation){const old=d.get('state','obligations',row.fineObligation);closeObligation(d,e,{id:old.id,actor:judge,party:old.creditor,reason:'creditor_waiver'},`${eventId}:waive`,{authorize:()=>({allowed:true})});waived=true;}
 }
 if(!review)next=ensureFine(d,e,next,code,judge,eventId);
 const notification=!review&&convicted?'conviction':review&&!convicted?'overturned':null;
 if(notification){put(d,e,next);notify?.(next,notification);next=d.get(...path(row.id));}
 if(unvaluable)d.say(judgment.valuationNote);
 return complete(d,e,next,{case:row.id,convicted,judgment:next.judgment,...(unvaluable?{unvaluable:judgment.unvaluable,factSummary:judgment.valuationNote}:{}),...(review?{upheld:next.appeal.outcome==='upheld',appeal:next.appeal}:{}),...(transfer?{refund:transfer.amount}:{}),
  worldEvent:{verb:'judgment',actor:judge,target:row.offender,case:row.id,visibility:row.private?'private':'public',tags:['law','judgment'],payload:{case:row.id,convicted,fine,evidenceScore:scored.score}}},eventId,
  {minutes,authority:judge,...(notification?{notification}:{}),...(waived?{waived:true}:{}),...(transfer?{transfer:{...transfer,signedAmount:-transfer.amount}}:{})});
}
