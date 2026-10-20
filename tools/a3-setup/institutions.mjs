import {registerSetupLoader} from './index.mjs';
import {SOCIAL_VERBS,publishWorldEvents} from '../../server-plugin/world-events.mjs';
import {applyConsentEvent} from '../../server-plugin/action-consent.mjs';
import {aliveHoldings} from '../../server-plugin/holdings.mjs';
import {accountKey,openLedger} from '../../server-plugin/ledger.mjs';
import {legacyMoney,mirrorPartyCoins,partyAccount} from '../../server-plugin/money.mjs';
import {changeItems} from '../../server-plugin/items.mjs';
import {BOOKED} from '../../server-plugin/stock.mjs';
import {openObligation} from '../../server-plugin/obligation-runtime.mjs';
import {obligationRow} from '../../server-plugin/obligation-state.mjs';
import {npcServices} from '../../server-plugin/npc-state.mjs';
import {facilityView} from '../../server-plugin/facility-state.mjs';

// Historical premises are not actions to replay. In particular a paid event
// never calls trade/transfer, and a case event never calls crime/report/judge.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const alias=x=>text(x)&&!['__proto__','constructor','prototype'].includes(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const keys=(row,allowed)=>Object.keys(row).every(k=>allowed.includes(k));
const sections={history:'01 §1.7、06 §6.3（历史事件与本人同意）',accounts:'01 §1.6（账户开账）',obligations:'01 §1.4、05 §5.2.7（旧义务与案件）',documents:'01 §1.2、05 §5.2.7（同一凭证与证据来源）',cases:'05 §5.2.7（案件程序）',permits:'01 §1.3、06 §6.3（有限许可）',examinations:'06 §6.3（真实考官与认证）',appointments:'06 §6.3（服务与预约）',quotes:'01 §1.6（真实报价）',workstationAccess:'06 §6.6（工位与费用）'};
const gap=(ctx,item,field,reason)=>ctx.unmet(item,`${reason}；设计 ${sections[field]}`);
function rows(ctx,setup,field,load){
 if(!Array.isArray(setup[field])){ctx.unmet(field,'expected an array');return;}
 for(const [i,row] of setup[field].entries()){
  const item=`${field}[${i}]`;
  if(!object(row)){ctx.unmet(item,'expected an object');continue;}
  try{load(row,item);}catch(error){ctx.unmet(item,`${error.message}；设计 ${sections[field]}`);}
 }
}
const requireShape=(condition,message)=>{if(!condition)throw Error(message);};
const state=ctx=>ctx.document.state;
const known=(ctx,id)=>alias(id)&&(id==='player'||Boolean(ctx.actor(id)||ctx.engine.byId.get(id)||state(ctx).created?.[id]||ctx.document.holdings?.entities?.[id]||ctx.engine.rules.economy?.credit?.banks?.some(b=>b.id===id)));
function selector(ctx,value){
 if(typeof value==='string')return ctx.ref(value);
 requireShape(object(value)&&['authorized_owner','authorized_manager'].includes(value.role)&&text(value.of)&&keys(value,['role','of']),'unresolved authority selector');
 const subject=ctx.ref(value.of),kinds=value.role==='authorized_owner'?['owns']:['operates','owns'];
 const ids=[...new Set(aliveHoldings(ctx.engine.primitiveDraft(ctx.document),{subject}).filter(h=>kinds.includes(h.kind)).map(h=>h.holder))];
 requireShape(ids.length===1,'authority selector needs one existing owner/manager; no authority is invented');
 return ids[0];
}
function eventSource(ctx,id){
 requireShape(text(id)&&Object.hasOwn(ctx.bindings,id),`unresolved sourceEvent: ${id}`);
 const key=ctx.ref(id),row=state(ctx).records?.[key];
 requireShape(row?.category==='world_event',`sourceEvent is not a loaded history event: ${id}`);
 return row;
}
// Only event endpoint fields are references. Text, scope and source.row must
// never be rewritten just because they happen to equal an alias.
function historyPayload(ctx,row){
 const out=structuredClone(row);
 for(const key of ['actor','to','target','owner','observer','debtor','creditor','court','subject','case','location'])if(typeof out[key]==='string')out[key]=ctx.ref(out[key]);
 if(Array.isArray(out.witnesses))out.witnesses=out.witnesses.map(ctx.ref);
 return out;
}
const eventFields=['id','verb','at','source','actor','subject','service','to','resource','item','quantity','totalCoins','principal','fee','owner','balance','purpose','scope','terms','expires','revoked','debtor','creditor','amount','observer','location','currentlyVisible','atBeforeDetention','name','witnesses','court','case','vocation','condition','damage','target','fine','effective','fireIntensity','spell','atDay','netCoins','acquired','openingStockOnly'];
const verbs=new Set(['appointment_agreed','quoted','opening_balance','paid','permission_granted','consented','crafted','obligation_opened','observed','theft','purchase_receipt','case_registered','judged','evidence_found','qualified','accepted_cargo','delivered','arrest_order','hostile_encounter','ignited','summoned','rite_scheduled','ownership_transferred_and_delivered','trade_completed','refused','wanted_issued']);
function loadHistory(ctx,setup){
 const ids=new Set();
 rows(ctx,setup,'history',(row,item)=>{
  requireShape(keys(row,eventFields)&&alias(row.id)&&!ids.has(row.id)&&!Object.hasOwn(ctx.bindings,row.id)&&!state(ctx).records?.[`world_event:${row.id}`]&&verbs.has(row.verb)&&integer(row.at)&&row.at<=state(ctx).minute&&object(row.source)&&keys(row.source,['kind','row'])&&row.source.kind==='corpus_premise'&&text(row.source.row),'invalid history identity, verb, time or corpus premise source');
  ids.add(row.id);
  for(const field of ['balance','amount','quantity','totalCoins','principal','fee','expires','fine','fireIntensity','atDay'])if(Object.hasOwn(row,field))requireShape(integer(row[field]),`invalid history ${field}`);
  if(row.witnesses!==undefined)requireShape(Array.isArray(row.witnesses)&&row.witnesses.every(x=>known(ctx,ctx.ref(x))),'invalid history witnesses');
  if(row.revoked!==undefined)requireShape(typeof row.revoked==='boolean','invalid revoked flag');
  if(['consented','refused'].includes(row.verb))requireShape(text(row.actor)&&text(row.scope)&&text(row.subject??row.spell)&&integer(row.expires)&&row.expires>row.at&&row.revoked===false&&(row.verb==='refused'||text(row.to)&&object(row.terms)),'invalid explicit consent/refusal scope, terms or expiry');
  if(row.verb==='opening_balance')requireShape(text(row.owner)&&text(row.resource)&&integer(row.balance),'opening_balance needs owner/resource/balance');
  if(row.verb==='obligation_opened')requireShape(text(row.subject)&&text(row.debtor)&&text(row.creditor)&&integer(row.amount),'obligation_opened needs claim and parties');
  let actor=row.actor??row.observer??row.owner??row.debtor??row.court;
  if(!actor&&['judged','arrest_order'].includes(row.verb))actor=setup.cases?.find(c=>c.id===row.subject)?.court;
  if(!actor){gap(ctx,item,'history','缺少可表达无主体历史事件的原生写入接点，不补造事件行为人');return;}
  actor=selector(ctx,actor);
  requireShape(known(ctx,actor),'history actor does not exist');
  const payload=historyPayload(ctx,row),key=`world_event:${row.id}`;
  // publishWorldEvents is the native event writer. Explicit empty subscribers
  // avoid replaying old gossip, reputation, ownership or money consequences.
  if(ctx.native(item,d=>{
   SOCIAL_VERBS.add(row.verb);
   publishWorldEvents(d,ctx.engine,[{id:row.id,verb:row.verb,actor,target:typeof payload.to==='string'?payload.to:payload.target??null,minute:row.at,location:payload.location??null,visibility:'private',witnesses:payload.witnesses??[],tags:[],source:payload.source,payload}],{before:d.get('state'),args:{},detail:{},eventId:row.id,tool:'a3-history'},[]);
   requireShape(d.get('state','records',key)?.category==='world_event','native history event was not persisted');
  }))ctx.bindings[row.id]=key;
  else return;
  if(row.verb!=='consented')return;
  // The native consent writer can express scope + purposes + expiry, but no
  // fee, quantity, batch, role or other conditional terms. Do not widen them.
  if(Object.keys(row.terms).some(k=>k!=='spell')||row.terms.spell!==undefined&&ctx.ref(row.subject)!==actor){gap(ctx,item,'history','缺少保留同意条件 terms 与受术对象的原生接点；仅保存历史，不授予无条件同意');return;}
  if(row.expires<=state(ctx).minute)return;
  ctx.native(item,d=>{
   const now=d.get('state','minute');d.set(['state','minute'],row.at);
   applyConsentEvent(d,{engine:ctx.engine,document:d.document},{actor,eventId:row.id,verb:'consent_given',to:ctx.ref(row.to),payload:{scope:row.scope,purpose:[ctx.ref(row.terms.spell??row.subject)],until:row.expires}});
   d.set(['state','minute'],now);
  });
 });
}

function loadAccounts(ctx,setup){
 const seen=new Set();
 rows(ctx,setup,'accounts',(row,item)=>{
  requireShape(keys(row,['owner','resource','purpose','balance','sourceEvent','seat','container','balanceMode'])&&text(row.owner)&&text(row.resource)&&text(row.purpose)&&integer(row.balance)&&[undefined,'ensure_existing'].includes(row.balanceMode),'invalid account snapshot');
  const owner=ctx.ref(row.owner),key=accountKey(owner,row.resource,row.purpose),source=eventSource(ctx,row.sourceEvent);
  requireShape(!seen.has(key),'duplicate account snapshot');seen.add(key);
  requireShape(source.verb==='opening_balance'&&source.payload.owner===owner&&source.payload.resource===row.resource&&source.payload.balance===row.balance,'opening balance source does not match account snapshot');
  requireShape(known(ctx,owner)||ctx.engine.rules.economy?.credit?.banks?.some(b=>b.id===owner),'unknown account owner');
  if(row.seat!==undefined)requireShape(ctx.engine.world.locations.some(l=>l.id===ctx.ref(row.seat)),'unknown account seat');
  if(row.container!==undefined){gap(ctx,item,'accounts','缺少钱袋容器与原生现金账户绑定接点，不把容器现金复制到随身账户');return;}
  if(row.resource==='coin_river'){
   const nativeKey=partyAccount(ctx.engine,state(ctx),owner);
   if(key!==nativeKey){gap(ctx,item,'accounts',`缺少账户用途 ${row.purpose} 的原生开账/消费接点，不能合并为 ${nativeKey}`);return;}
   ctx.native(item,d=>{
    const old=legacyMoney(ctx.engine,d.get('state')).get(key)??0;
    if(row.balanceMode!=='ensure_existing')mirrorPartyCoins(d,ctx.engine,owner,row.balance-old,ctx.ref(row.sourceEvent),'a3-institutions');
    d.set(['ledger'],openLedger(ctx.engine,d.document));
   });
  }else{
   requireShape(row.purpose==='inventory'&&ctx.actor(owner)&&ctx.engine.world.items.some(i=>i.id===row.resource),'unsupported resource/account purpose or actor');
   ctx.native(item,d=>{
    const old=ctx.engine.quantity(d,owner,row.resource);
    if(row.balanceMode!=='ensure_existing')changeItems(d,ctx.engine,owner,row.resource,row.balance-old,{books:BOOKED});
    d.set(['ledger'],openLedger(ctx.engine,d.document));
   });
  }
 });
}
function loadObligations(ctx,setup){
 rows(ctx,setup,'obligations',(row,item)=>{
  requireShape(keys(row,['id','name','kind','debtor','creditor','amount','paid','openedAt','dueAt','sourceEvent','terms'])&&alias(row.id)&&['loan','deposit','fine','delivery','upkeep'].includes(row.kind)&&text(row.debtor)&&text(row.creditor)&&row.debtor!==row.creditor&&integer(row.amount)&&integer(row.paid)&&row.paid<=row.amount&&integer(row.openedAt)&&row.openedAt<=state(ctx).minute&&integer(row.dueAt)&&row.dueAt>=row.openedAt&&object(row.terms),'invalid old obligation');
  const source=eventSource(ctx,row.sourceEvent),debtor=ctx.ref(row.debtor),creditor=ctx.ref(row.creditor);
  requireShape(source.verb==='obligation_opened'&&source.payload.subject===row.id&&source.payload.debtor===debtor&&source.payload.creditor===creditor&&source.payload.amount===row.amount,'obligation source does not match claim');
  requireShape(!obligationRow(state(ctx),row.id)&&!Object.hasOwn(ctx.bindings,row.id),'obligation already exists');
  if(row.kind!=='loan'||row.paid!==0||row.terms.collateral!==undefined){gap(ctx,item,'obligations',`缺少 ${row.kind}${row.terms.collateral?' 质押':''} 旧快照导入接点（须保留原生存款/罚款/交付/维持投影及已付额），不能重做本次交易`);return;}
  requireShape(known(ctx,debtor)&&known(ctx,creditor),'unknown obligation party');
  if(ctx.native(item,d=>{
   const now=d.get('state','minute');d.set(['state','minute'],row.openedAt);
   openObligation(d,ctx.engine,{id:row.id,kind:'loan',category:'debt',legacyRecord:row.id,actor:debtor,debtor,creditor,amount:row.amount,deadline:row.dueAt,terms:structuredClone(row.terms),...(row.name?{name:row.name}:{}),source:ctx.ref(row.sourceEvent)},`${row.id}:setup`);
   d.set(['state','minute'],now);
  }))ctx.bindings[row.id]=row.id;
 });
}

// These consumers have narrower native records than the corpus contract. A
// historical emit is not a substitute for their domain state. Validate first,
// then report the precise missing import writer instead of fabricating records.
function loadDocuments(ctx,setup){rows(ctx,setup,'documents',(row,item)=>{
 requireShape(keys(row,['id','owner','sourceEvent','obligation','case','links','content','reviewed','valid','namedHolder','describes'])&&text(row.id)&&known(ctx,ctx.ref(row.owner))&&[undefined,true,false].includes(row.reviewed)&&[undefined,true,false].includes(row.valid)&&(row.content===undefined||object(row.content))&&(row.links===undefined||Array.isArray(row.links)&&row.links.every(text)),'invalid document');
 eventSource(ctx,row.sourceEvent);for(const id of row.links??[])eventSource(ctx,id);
 const existing=state(ctx).itemInstances?.[ctx.ref(row.id)];
 if(!existing){gap(ctx,item,'documents','缺少同一 itemInstances 纸张的原生凭证/证据来源导入接点（不能另造第二张纸）');return;}
 gap(ctx,item,'documents','缺少既有纸张的 obligation/case/links/content 原生证据写入接点，不能预判采纳');
});}
function loadCases(ctx,setup){rows(ctx,setup,'cases',(row,item)=>{
 requireShape(keys(row,['id','name','court','stage','parties','sourceEvent','judgmentEvent','appealDeadline','handlerOffice','defendant'])&&text(row.id)&&ctx.engine.world.locations.some(l=>l.id===ctx.ref(row.court))&&['judged','pending','execution','prosecution'].includes(row.stage)&&Array.isArray(row.parties)&&row.parties.length>0&&row.parties.every(p=>known(ctx,ctx.ref(p)))&&(row.appealDeadline===undefined||integer(row.appealDeadline)),'invalid case');
 const source=eventSource(ctx,row.sourceEvent);requireShape(source.verb==='case_registered'&&source.payload.subject===row.id&&source.payload.court===ctx.ref(row.court),'case registration source mismatch');
 if(row.judgmentEvent!==undefined){const judgment=eventSource(ctx,row.judgmentEvent);requireShape(judgment.verb==='judged'&&judgment.payload.subject===row.id,'judgment source mismatch');}
 gap(ctx,item,'cases','缺少已登记案件阶段、判决/上诉期限的原生快照导入接点；registerIncident 需要题面未提供的罪名/法典，不能补造');
});}
function loadPermits(ctx,setup){rows(ctx,setup,'permits',(row,item)=>{
 requireShape(keys(row,['id','holder','subject','scope','issuer','fromMinute','toMinute','sourceEvent','source','includedInLessonFee','quantityLiters'])&&text(row.id)&&known(ctx,ctx.ref(row.holder))&&text(row.subject)&&text(row.scope)&&(row.quantityLiters===undefined||integer(row.quantityLiters))&&(row.includedInLessonFee===undefined||typeof row.includedInLessonFee==='boolean'),'invalid permit');
 if(row.source==='setup.facts'&&row.scope==='rent_beds'){
  requireShape(row.sourceEvent===undefined&&row.issuer===undefined,'invalid rental authority snapshot');
  const building=state(ctx).buildings?.[ctx.ref(row.subject)];
  if(building?.owner===ctx.ref(row.holder)&&ctx.engine.byId.get(ctx.ref(row.subject))?.lodging){ctx.note(`${item}: existing native building owner and lodging authority retained`);return;}
  gap(ctx,item,'permits','题述出租资格未被原生建筑所有权与住宿设施共同表示；不生成新租约');return;
 }
 requireShape(integer(row.fromMinute)&&integer(row.toMinute)&&row.fromMinute<row.toMinute,'invalid permit interval');
 const issuer=selector(ctx,row.issuer),event=eventSource(ctx,row.sourceEvent);
 requireShape(known(ctx,issuer)&&event.verb==='permission_granted'&&event.actor===issuer&&event.payload.subject===ctx.ref(row.subject)&&event.payload.to===ctx.ref(row.holder)&&event.payload.scope===row.scope,'permit source/issuer/scope mismatch');
 gap(ctx,item,'permits','缺少 subject/scope/期限/数量完整保留的原生授权导入接点；permit 持有本身不实现该授权消费者');
});}
function loadExaminations(ctx,setup){rows(ctx,setup,'examinations',(row,item)=>{
 requireShape(keys(row,['id','profession','registrar','examiner','minutes','fee','available','passed'])&&text(row.id)&&ctx.engine.world.professions.some(p=>p.id===row.profession)&&known(ctx,ctx.ref(row.registrar))&&integer(row.minutes)&&row.minutes>0&&integer(row.fee)&&typeof row.available==='boolean'&&row.passed===false&&object(row.examiner)&&keys(row.examiner,['role','profession','at'])&&row.examiner.role==='qualified_examiner'&&row.examiner.profession===row.profession&&ctx.engine.world.locations.some(l=>l.id===row.examiner.at),'invalid pending examination');
 const candidates=Object.entries(state(ctx).npcs??{}).filter(([id,n])=>n.location===row.examiner.at&&npcServices(ctx.engine,state(ctx),id).includes(row.profession)).map(([id])=>id);
 if(candidates.length!==1){gap(ctx,item,'examinations','无法唯一解析当地已有合格考官；不能把登记员授为考官');return;}
 gap(ctx,item,'examinations','缺少未考试席位及 minutes/fee/available 的原生登记接点；不能调用认证动作预先通过考试');
});}
function loadAppointments(ctx,setup){rows(ctx,setup,'appointments',(row,item)=>{
 requireShape(keys(row,['id','actor','location','start','end','services','sourceEvent','subject','fee','minutes'])&&text(row.id)&&known(ctx,ctx.ref(row.actor))&&ctx.engine.world.locations.some(l=>l.id===ctx.ref(row.location))&&integer(row.start)&&integer(row.end)&&row.start<row.end&&Array.isArray(row.services)&&row.services.length>0&&row.services.every(text)&&(row.fee===undefined||integer(row.fee))&&(row.minutes===undefined||integer(row.minutes)&&row.minutes>0),'invalid service appointment');
 const source=eventSource(ctx,row.sourceEvent);requireShape(source.verb==='appointment_agreed'&&source.actor===ctx.ref(row.actor)&&row.services.includes(source.payload.service),'appointment source mismatch');
 gap(ctx,item,'appointments','缺少服务预约时段的原生导入接点；createNpcObligation 的会面会占用双方且关闭服务，不能替代柜台服务或新增职业');
});}
function loadQuotes(ctx,setup){rows(ctx,setup,'quotes',(row,item)=>{
 requireShape(keys(row,['id','actor','to','resource','quantity','totalCoins','direction','at','expires','sourceEvent','service','principal','fee','recipient','destination','recipientIdentityVerified','destinationBranch'])&&text(row.id)&&known(ctx,ctx.ref(row.actor))&&known(ctx,ctx.ref(row.to))&&integer(row.at)&&row.at<=state(ctx).minute&&integer(row.expires)&&row.expires>row.at,'invalid quote identity/time');
 if(row.service==='remittance')requireShape(integer(row.principal)&&integer(row.fee)&&known(ctx,ctx.ref(row.recipient))&&ctx.engine.world.locations.some(l=>l.id===row.destination)&&row.recipientIdentityVerified===true&&object(row.destinationBranch)&&keys(row.destinationBranch,['role','at'])&&row.destinationBranch.role==='redeeming_branch'&&row.destinationBranch.at===row.destination,'invalid remittance quote');
 else requireShape(text(row.resource)&&integer(row.quantity)&&row.quantity>0&&integer(row.totalCoins)&&['sell_to_player','buy_from_player'].includes(row.direction),'invalid quote terms');
 const source=eventSource(ctx,row.sourceEvent);requireShape(source.verb==='quoted'&&source.actor===ctx.ref(row.actor)&&(row.service==='remittance'?source.payload.subject==='remittance'&&source.payload.principal===row.principal&&source.payload.fee===row.fee:source.payload.to===ctx.ref(row.to)&&source.payload.resource===row.resource&&source.payload.quantity===row.quantity&&source.payload.totalCoins===row.totalCoins),'quote source mismatch');
 gap(ctx,item,'quotes','缺少限定总量/总价/方向/有效期（汇兑另含费用及真实网点）的原生报价导入接点；tradeQuote 仅计算当日目录单价，不能记作完整报价');
});}
function loadWorkstations(ctx,setup){rows(ctx,setup,'workstationAccess',(row,item)=>{
 requireShape(keys(row,['id','station','holder','fromMinute','toMinute','fee','paid','usable','paymentEvent'])&&text(row.id)&&text(row.station)&&known(ctx,ctx.ref(row.holder))&&integer(row.fromMinute)&&integer(row.toMinute)&&row.fromMinute<row.toMinute&&integer(row.fee)&&typeof row.paid==='boolean'&&typeof row.usable==='boolean','invalid workstation access');
 const place=ctx.engine.world.locations.find(l=>l.workstations?.some(s=>s.id===ctx.ref(row.station))),station=place&&facilityView(ctx.engine,state(ctx),place.id)?.workstations?.find(s=>s.id===ctx.ref(row.station));
 requireShape(station,'unknown or unavailable workstation');
 if(row.paid){const paid=eventSource(ctx,row.paymentEvent);requireShape(paid.verb==='paid'&&paid.actor===ctx.ref(row.holder)&&paid.payload.subject===ctx.ref(row.station),'workstation payment source mismatch');}
 else requireShape(row.paymentEvent===undefined,'unpaid workstation cannot have a paymentEvent');
 // A public, usable, unpaid station with exactly its native fee is already
 // represented. Nothing is purchased, waived or added to the player's purse.
 if(row.usable&&station.access==='public'&&station.fee===row.fee&&!row.paid&&row.fromMinute<=state(ctx).minute&&state(ctx).minute<row.toMinute){ctx.note(`${item}: existing public workstation and unpaid native fee retained`);return;}
 gap(ctx,item,'workstationAccess','缺少有时限工位可用性/旧预付抵扣的原生接点，不能重扣预付费或改写工位目录');
});}

registerSetupLoader({fields:['history'],order:10,load:loadHistory});
registerSetupLoader({fields:['accounts','obligations'],order:20,load(ctx,setup,fields){if(fields.includes('accounts'))loadAccounts(ctx,setup);if(fields.includes('obligations'))loadObligations(ctx,setup);}});
const institutional={documents:loadDocuments,cases:loadCases,permits:loadPermits,examinations:loadExaminations,appointments:loadAppointments,quotes:loadQuotes,workstationAccess:loadWorkstations};
registerSetupLoader({fields:Object.keys(institutional),order:30,load(ctx,setup,fields){for(const field of fields)institutional[field](ctx,setup);}});
