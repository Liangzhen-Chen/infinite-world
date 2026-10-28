import {preconditionFailure} from './precondition.mjs';
import {goodsWorth,valuation} from './valuation.mjs';
import {recordStandingEvidence} from './npc-state.mjs';
import {vocabulary} from './domain-rules.mjs';
import {assertVocationAction} from './employment-state.mjs';
import {reject} from './action-rejection.mjs';
import {entityTransition,businessSnapshot,businessTransitions} from './entity-transitions.mjs';
import {lawAuthorities,personName,institutionOffices,officeOnDuty} from './entity-view.mjs';
import {legalCodeAt,legalCodeById,legalCodes,courtHierarchy,legalCooperation,codePenalty} from './law-codes.mjs';
import {normStack,normSnapshot,casePenalty} from './norm-stack.mjs';
import {hireAdvocate,representationEffect,advocateService} from './legal-representation.mjs';
import {adjudicateFamilyDispute,recoverFamilyCompensation} from './family-law.mjs';
import { trackTransferUnit, transferItems, changeItems } from './items.mjs';
import {advanceWithNpcParticipants,assertNpcService}from'./npc-schedule.mjs';
import {shareNpcMemory}from'./npc-cognition.mjs';
import {recordLegalNotification,reputationView}from'./reputation.mjs';
import {recordDisciplineBreach}from'./training.mjs';
import {advanceWanted,activeWanted,activeHold,wantedOfCase,wantedReachedAt,holdPlayer,issueWanted,enforcersOf,dismissed,bribePrice,bribeStake,closeWanted,WANTED_REASONS}from'./bounty.mjs';
import {declareHoldingWriter,aliveHoldings} from './holdings.mjs';
import {holdingSet as writeHoldingProjection} from './holding-sources.mjs';
import {changeLegacyHoldings} from './transition.mjs';
import {isGone,isEffective} from './lifecycle-state.mjs';
import {installFacilityRuntime} from './facility-state.mjs';
import {claimLimitation,recordClaimProcedure,registerLoss,lossView,recoverLoss,settleClaim,wagePriorityClaims} from './obligation-claims.mjs';
import {obligationView,obligationRow} from './obligation-state.mjs';
import {settlementPresent} from './obligation-presence.mjs';
import {legacyCanAct,canAct} from './action-capacity.mjs';
import {consent} from './action-consent.mjs';
import {worldEvent} from './world-events.mjs';
import {eventPerception} from './perception.mjs';
import {FILING_VERSION,filingOfficer,filingKnowledge} from './legal-reactions.mjs';
import {LEDGER_COIN} from './ledger.mjs';
import {npcDecision} from './npc-decision.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {trialAction,trialTestimony,trialEvidenceScore} from './legal-appeal.mjs';
export {trialEvidenceScore};
import {documentAccessible} from './documents.mjs';
declareHoldingWriter('law',{kinds:['guest_of','wanted','companion','permit','owns'],entities:['case'],locations:true});

const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw preconditionFailure(`${label}不在允许范围`);return value;};
const path=id=>['state','records',id];
function holdingSet(d,engine,p,value,writer){
 const old=d.get(...p);
 if((engine||d.engine)&&p[0]==='state'&&p[1]==='records'&&['legal_custody','legal_detention'].includes(old?.category)&&old.status==='生效'&&value.status!=='生效'){
  const reason=value.endReason??(value.expires<=value.ended?'expired':'released');
  return changeLegacyHoldings(d,engine??d.engine,{source:`custody:${p[2]}`,kinds:['guest_of'],reason,eventId:`${p[2]}:${value.ended}:${reason}`},()=>writeHoldingProjection(d,engine,p,value,writer));
 }
 return writeHoldingProjection(d,engine,p,value,writer);
}
const holdingReader=document=>({document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)});
const identifies=(d,reference,id)=>typeof reference==='string'&&typeof id==='string'&&(reference===id||d.get('holdings','entities',id,'facts','aliases')?.includes(reference)||d.get('state','itemInstances',id,'source')?.endsWith(`:${reference}`));
export function currentCaseHandler(engine,document,caseId,actor){
    const row=document.state.records?.[caseId],entity=row?.handlerOffice&&document.holdings?.entities?.[row.handlerOffice];
    const office=institutionOffices(engine,document.state).find(o=>o.id===row?.handlerOffice);
    return Boolean(row?.category==='legal_case'&&entity&&entity.goneAt===undefined&&office&&
        (!entity.facts.authority?.case||entity.facts.authority.case===caseId)&&
        (!office.authority?.case||office.authority.case===caseId)&&office.authority?.operations?.includes(vocabulary(engine,'law','caseHandlerOperation'))&&
        aliveHoldings(holdingReader(document),{kind:'holds_office',holder:actor,subject:office.id}).length&&
        officeOnDuty(engine,document.state,office,actor)&&canAct({engine,document},actor,'talk').allowed);
}
export function caseProcedureView(engine,document,id,actor='player'){
    const row=document.state.records?.[id];if(row?.category!=='legal_case')return null;
    const party=row.parties?.includes(actor)||row.offender===actor||row.victim===actor;
    return {id,stage:row.stage??(row.judgment?'judged':'pending'),court:row.court,party,
        appealDeadline:row.appealDeadline??null,canRequestAppeal:Boolean(party&&row.judgment&&(row.appealDeadline??Infinity)>=document.state.minute&&!row.appeal),
        handler:row.handlerOffice?aliveHoldings(holdingReader(document),{kind:'holds_office',subject:row.handlerOffice}).map(h=>h.holder).filter(p=>currentCaseHandler(engine,document,id,p)):[],
        judgmentSource:row.judgment?.sourceEvent??null};
}
export function caseDocumentEvidence(d,caseId,id,actor){
    const s=d.get('state'),paper=s.itemInstances?.[id],doc=paper?.document;
    if(!doc||doc.valid===false||paper.owner!==actor||paper.durability<=0||paper.destroyedAt!==undefined||d.get('holdings','entities',id,'goneAt')!==undefined||doc.case&&doc.case!==caseId||s.records?.[doc.sourceEvent]?.category!=='world_event')return null;
    return {kind:'document',document:id,source:doc.sourceEvent,minute:s.minute,submittedBy:actor};
}
export function submitCaseDocument(d,engine,{case:caseId,document:id,actor='player'},eventId){
    const row=d.get(...path(caseId)),view=caseProcedureView(engine,d.document,caseId,actor),evidence=caseDocumentEvidence(d,caseId,id,actor),paper=d.get('state','itemInstances',id);
    const location=actor==='player'?d.get('state','location'):d.get('state','npcs',actor,'location');
    if(!view?.party||!evidence||location!==row.court||!documentAccessible(engine,d.document,id,actor)||paper.carriedBy&&paper.carriedBy!==actor||paper.owner!==actor&&paper.location!==location)throw preconditionFailure('Case document requires its party, original paper and court');
    if(row.evidence.some(e=>e.document===id))throw preconditionFailure('Document already submitted');
    holdingSet(d,engine,path(caseId),{...row,evidence:[...row.evidence,{...evidence,eventId}]},'law');return evidence;
}
const alive=(actor,d,id)=>actor&&isEffective(null,d,id)&&actor.status!=='濒死';
const awake=(actor,d,id)=>alive(actor,d,id)&&!['睡眠','熟睡'].includes(actor.activity);
const codeFor=legalCodeAt;
function offensePenalty(engine,code,offense){
 if(code?.penalties?.[offense]===null)return null;
 return codePenalty(engine,code,offense)??engine.rules.law.spellConsent?.penalties?.[offense]??engine.rules.law.bribery?.penalties?.[offense]??engine.rules.law.activityPenalties?.[offense]??(offense==='debt_default'?engine.rules.economy?.credit?.loan?.defaultPenalty:undefined)??engine.rules.magicEconomy?.penalties?.[offense];
}
function incidentNorms(d,engine,{offender='player',location,minute,offense,code}){
 if(engine.rules.law?.normStackVersion!==1)return {};
 const snapshot=normSnapshot(normStack(engine,d.get('state'),offender,location,minute,{codes:legalCodes(engine.world,d.get('state'))}),offense);
 // Older domain-specific statutes are still published inputs. Pin those too;
 // never turn a missing offense into a fabricated default penalty.
 if(snapshot.source===null){snapshot.penalty=structuredClone(offensePenalty(engine,code,offense)??null);if(snapshot.penalty)snapshot.source=`legacy-statute:${offense}`;}
 snapshot.minute=minute;
 snapshot.sentencing=Object.fromEntries(['maximumSentenceMinutes','communityMinutesPerCopper','prisonMinutesPerCopper'].filter(k=>code[k]!==undefined).map(k=>[k,code[k]]));
 return {normSnapshot:snapshot};
}
function currentCode(d,engine){const code=codeFor(engine,d.get('state','location'),d.get('state'));if(!code)reject('E-ACTION-LAW','当地尚未登记可执行法典，无执行权限',{missing:['当地需要已登记的可执行法典与执行权限'],repair:['前往有适用法典的法域，取得执行权限后办理']});return code;}
function unique(d,id){if(d.get(...path(id)))throw preconditionFailure('法律登记编号已占用，拒绝覆盖');}
function present(d,engine,name,allowSleeping=false,failureCode='E-ACTION-PRECONDITION'){const id=engine.resolve(name,'npc'),actor=d.get('state','npcs',id);if(!(allowSleeping?alive(actor,d,id):awake(actor,d,id))||actor.location!==d.get('state','location'))throw preconditionFailure('当事人不在场或不能清醒行动',{code:failureCode});return id;}
function authority(d,engine,code,name,kind){
    const eligible=lawAuthorities(engine,d.get('state'),code,kind);
    if(!name){
        const candidates=eligible.filter(id=>awake(d.get('state','npcs',id),d,id)&&d.get('state','npcs',id).location===d.get('state','location'));
        throw preconditionFailure(`请指明在场${kind==='judge'?'审判者':'执法者'}；候选：${candidates.map(id=>engine.byId.get(id)?.name??'尚未记名的执法者').join('、')||'无'}`);
    }
    const id=present(d,engine,name);
    if(dismissed(d.get('state'),id))throw preconditionFailure('此人已因受贿事发被撤职，不再有执法或审判资格');
    if(!eligible.includes(id))throw preconditionFailure('此人没有该法典的执法或审判资格');return id;
}
function caseRow(d,engine,id){const row=d.get(...path(id));if(row?.category!=='legal_case')reject('E-ACTION-CASE','案件未登记：嫌疑尚未受理，不能当作已提交的证据',{missing:['需要已登记的案件编号'],repair:['先依法报案登记案件，再以返回的案件编号办理']});const current=legalCodeAt(engine,row.location,d.get('state')),code=current?.id===row.law?current:legalCodeById(engine,row.law,d.get('state'));if(!code)throw preconditionFailure('案件对应法典不可用，无执行权限');return{row,code};}
function safeFund(d,id,category,extra={}){
    const existing=d.get(...path(id));if(existing&&existing.category!==category)throw Error('法律资金登记键冲突');
    return existing??{category,coins:0,...extra};
}
export function evidenceScore(d,row){
    const witnesses=new Set();let score=0;
    let confessed=false,possessed=false,contracted=false,ledgered=false;
    for(const evidence of row.evidence??[]){
        if(evidence.disproven||evidence.falseStatement||evidence.invalidatedAt!==undefined)continue;
        if(evidence.kind==='eyewitness'){
            if(witnesses.has(evidence.witness)||!evidence.testified||!evidence.identified)continue;
            if(row.witnesses&&!row.witnesses.includes(evidence.witness))continue;
            if(row.filingVersion===FILING_VERSION){
                const event=worldEvent(d.get('state'),evidence.source);
                if(!event?.witnesses?.includes(evidence.witness)&&event?.observer!==evidence.witness)continue;
            }else if(!d.get('state','npcs',evidence.witness,'legalKnowledge')?.some(known=>known.case===row.id&&known.source==='亲见或在场受理'&&known.minute<=evidence.minute))continue;
            witnesses.add(evidence.witness);score++;
        }else if(evidence.kind==='confession'&&evidence.subject===row.offender&&!confessed){score+=2;confessed=true;}
        else if(evidence.kind==='possession'&&evidence.unit===row.stolen?.unit&&!possessed&&d.get('state','itemInstances',evidence.unit,'legalClaims')?.some(claim=>claim.case===row.id)){score++;possessed=true;}
        // A signed loan the debtor left unpaid is documentary proof while the debt stands.
        else if(evidence.kind==='contract'&&!contracted){const debt=d.get(...path(evidence.debt));if(debt?.category==='debt'&&debt.defaulted&&debt.status!=='已还清'){score+=2;contracted=true;}}
        // U10: the village's magic ledger records the uncovered casts.
        else if(evidence.kind==='fire_fact'&&!ledgered){const fact=d.get('state','records',evidence.record),damage=d.get('state','records',evidence.damage);if(fact?.category==='unattended_furnace'&&fact.responsible===row.offender&&fact.burning&&!fact.attendants?.length&&damage?.category==='facility_damage'&&damage.building===row.building){score++;ledgered=true;}}
        else if(evidence.kind==='ledger'&&!ledgered&&d.get(...path(evidence.record))?.category==='magic_economy'){score+=2;ledgered=true;}
    }
    return score;
}
function knowledge(d,npc,id,minute){
    const prior=d.get('state','npcs',npc,'legalKnowledge')??[];
    if(!prior.some(row=>row.case===id))d.set(['state','npcs',npc,'legalKnowledge'],[...prior,{case:id,minute,source:'亲见或在场受理'}]);
}
export function registerIncident(d,engine,{victim,offender='player',offense,value=0,stolen=null,witnesses,eventId,relationshipApplied=false,location=d.get('state','location'),optional=false,minute=d.get('state','minute'),code:given=null,perception=null}){
    const code=given??codeFor(engine,location,d.get('state'));if(!code&&optional)return null;if(!code)reject('E-ACTION-LAW','当地尚未登记可执行法典，无执行权限',{missing:['当地需要已登记的可执行法典与执行权限'],repair:['前往有适用法典的法域，取得执行权限后办理']});
    const id=`legal_case:${eventId}`;unique(d,id);
    if(location===d.get('state','location')&&minute===d.get('state','minute')){
        const snapshot=perception??eventPerception(engine,d.document,{actor:offender,target:victim,location,volume:0});
        if(snapshot.sourceZone)witnesses=witnesses.filter(id=>snapshot.versions[id]?.identified);
    }
    const now=minute,evidence=witnesses.map(witness=>({kind:'eyewitness',witness,identified:true,testified:false,minute:now}));
    const suspicion=['theft','theft_attempt'].includes(offense);
    if(suspicion&&!offensePenalty(engine,code,offense))return null;
    const officer=suspicion?null:witnesses.find(witness=>code.officers.includes(witness));

    const row={category:suspicion?'legal_suspicion':'legal_case',...(suspicion?{private:true,visibility:'private',filingVersion:FILING_VERSION}:{}),id,law:code.id,...incidentNorms(d,engine,{offender,location,minute:now,offense,code}),
        procedureVersion:1,settlement:code.settlement??null,faction:code.faction??null,sourceEvent:eventId,witnesses:[...witnesses],offender,victim,offense,value,stolen,
        ...(value===null?{unvaluable:'无法核定案值',valuationNote:'无从估价：无法核定案值，仅适用基础罚则，不加案值倍数；赔偿待核定。'}:{}),
        location,minute:now,status:officer?'已报案':'未报案',reported:Boolean(officer),evidence,
        ...(officer?{receiver:officer,reportedAt:now}:{})};
    if(officer)row.evidence=row.evidence.map(entry=>({...entry,testified:entry.witness===officer}));
    holdingSet(d,null,path(id),row,'law');
    if(value===null)d.say?.(row.valuationNote);
    for(const witness of witnesses){
        if(!suspicion)knowledge(d,witness,id,now);
        if(!relationshipApplied&&witness===victim){
            if(engine.byId.get(witness)?.tier!=='full'){
                recordStandingEvidence(d,engine,{key:`crime:${eventId}:${witness}`,sourceEvent:eventId,eventType:'欺骗',from:witness,to:offender,minute:now,delta:{trust:-5}});
            }
            d.set(['state','npcs',witness,'developments'],[...d.get('state','npcs',witness,'developments')??[],{type:'发现财物侵犯',source:eventId,minute:now}]);
        }
    }
    return id;
}
// A request has a recipient and verifiable premises, but does not decide a case.
function submitFiling(d,engine,args,eventId){
 const recorded=engine.replaying?engine.replayResult?.filingSubmission:null;
 if(recorded?.filingVersion===FILING_VERSION){
  if(recorded.sourceEvent!==eventId)throw Error('Filing submission replay source mismatch');
  unique(d,recorded.id);holdingSet(d,engine,path(recorded.id),structuredClone(recorded),'law');
  return filingSubmissionResult(recorded);
 }
 const s=d.get('state'),confess=args.operation==='confess',reporter=confess?'player':args.reporter??'player';
 if(args.request!==undefined&&(!args.request||typeof args.request!=='object'||Array.isArray(args.request)||args.request.kind!==(confess?'confession':'theft')))rejectLegalRequest('递交的事由与当前报案或供述不符');
 const requestFields=['kind','target','incident','accused','stolen','evidence','source','content','visibility','offense','subject'];
 if(Object.keys(args.request??{}).some(k=>!requestFields.includes(k)))rejectLegalRequest('报案不能附带未经知情来源核对的事实字段');
 if(reporter!=='player')present(d,engine,reporter);
 const permission=vocabulary(engine,'law','receiveOperations',confess?'confess':'report');
 const candidates=institutionOffices(engine,s).filter(o=>o.seat===s.location&&o.authority?.operations?.includes(permission)&&officeOnDuty(engine,s,o,o.holder));
 const target=args.request?.target;
 const receiver=args.authority??(s.npcs[target]?target:null)??(candidates.length===1?candidates[0].holder:null);
 if(!receiver){const code=codeFor(engine,s.location,s),ids=[...new Set([...candidates.map(o=>o.holder),...(code?lawAuthorities(engine,s,code):[])])].filter(id=>s.npcs[id]?.location===s.location&&awake(s.npcs[id],d,id));rejectLegalRequest('请指明在场执法者；候选：'+(ids.map(id=>engine.byId.get(id)?.name??'尚未记名的执法者').join('、')||'无'));}
 // Existing law-code police can receive a statement; only a formal case
 // handling office can make the separate filing decision below.
 const codeHere=codeFor(engine,s.location,s);
 if((!args.request||confess)&&codeHere&&lawAuthorities(engine,s,codeHere).includes(receiver))authority(d,engine,codeHere,receiver,'officer');
 else filingOfficer(engine,d,receiver,permission);
 const old=args.case?s.records[args.case]:null;
 let reference=args.incident??args.request?.incident??old?.sourceEvent;
 if(reference&&!worldEvent(s,reference)){
  const match=Object.values(s.records).filter(r=>r.category==='world_event'&&(r.summary===reference||r.payload?.name===reference));
  if(match.length===1)reference=match[0].id;
 }
 if(!reference){const known=Object.values(s.records).filter(r=>r.category==='world_event'&&['theft','steal'].includes(r.verb)&&(confess?r.actor===reporter:r.witnesses?.includes(reporter)||r.observer===reporter));if(known.length===1)reference=known[0].id;}
 const known=filingKnowledge(engine,d,reporter,reference),v=known.version;
 if(!['steal','theft'].includes(v.verb))rejectLegalRequest('报案者所知事件不是失窃事实');
 if(confess&&v.actor!=='player')rejectLegalRequest('不能认领他人的行为为自己的供述');
 const accused=args.accused??args.request?.accused??v.actor,offense=args.offense??args.request?.offense??(v.tags?.includes('attempt')?'theft_attempt':'theft');
 if(!['theft','theft_attempt'].includes(offense))rejectLegalRequest('所提交事件不支持这一罪名');
 if(!accused)rejectLegalRequest('需要说明所指控的身份；现有消息没有指认行为人');
 const knownItem=v.stolen?.item??v.payload?.item??v.payload?.resource??v.item??(v.value>0?LEDGER_COIN:null);
 if(args.request?.stolen!==undefined&&args.request.stolen!==knownItem)rejectLegalRequest('不能提交报案者所知版本中没有的失窃物品');
 // Separate defendants' allegations even when they cite one occurrence.
 // This uses only the submitted identity and the speaker's event version.
 const caseId=`legal_case:${known.sourceEvent}${accused!==v.actor?`:accused:${accused}`:''}`;
 if(Object.values(s.records).some(r=>r.category==='legal_request'&&r.case===caseId&&r.actor===reporter&&r.accepted!==false&&r.request.kind===(confess?'confession':'theft')))rejectLegalRequest(confess?'已自认，不重复增加证据':'重复作证不能增加证据');
 const code=v.location?codeFor(engine,v.location,s):null;
 const evidence=confess?[{kind:'confession',subject:'player',minute:s.minute,source:known.sourceEvent}]:[trialTestimony(d,engine,{offender:accused},reporter,known.sourceEvent)];
 const documents=args.request?.evidence??args.evidence??[];
 if(!Array.isArray(documents))rejectLegalRequest('证据须为本人持有的原件编号清单');
 for(const id of documents){const paper=s.itemInstances[id],bag=reporter==='player'?s.inventory:s.npcs[reporter]?.inventory,held=bag?.[paper?.item]?.instances?.includes(id);if(!paper?.document||paper.owner!==reporter||paper.carriedBy&&paper.carriedBy!==reporter||!held&&paper.location!==s.location||paper.document.valid===false||paper.durability<=0||paper.destroyedAt!==undefined||isGone(engine,d,id)||!worldEvent(s,paper.document.sourceEvent))rejectLegalRequest('报案须持有有效证据原件');evidence.push({kind:'document',document:id,source:paper.document.sourceEvent,submittedBy:reporter,minute:s.minute});}
 const request={kind:confess?'confession':'theft',...structuredClone(args.request??{}),accused,offense};
 const payload={...request,sourceEvents:[known.sourceEvent],evidence:documents,receiver};
 const row={category:'legal_request',id:`legal_request:${eventId}`,filingVersion:FILING_VERSION,actor:reporter,receiver,verb:'claim',target:target??(confess?receiver:s.location),case:caseId,request,payload,
  minute:s.minute,location:s.location,sourceEvent:eventId,incident:known.sourceEvent,knownVersion:v,submittedEvidence:evidence,
  allegation:{offender:accused,victim:v.payload?.owner??v.owner??v.target??null,offense,value:v.value??null,stolen:v.stolen??null,location:v.location??null,minute:v.minute},law:code?.id??null,accepted:null};
 unique(d,row.id);holdingSet(d,engine,path(row.id),row,'law');
 return filingSubmissionResult(row);
}
function filingSubmissionResult(row){return {request:row.id,case:row.case,submitted:true,reported:true,accepted:null,convicted:false,filingSubmission:structuredClone(row),worldEvent:{verb:'claim',actor:row.actor,target:row.receiver,payload:row.payload,tags:['legal_request'],visibility:'private',participants:[row.actor,row.receiver]}};}
function recordedFilingDecision(d,result,request,{fee=0,law=null,witnesses=[]}={}){
 if(result.accepted&&d.get(...path(result.case),'value')===null){result={...result,unvaluable:'无法核定案值',valuationNote:'无从估价：无法核定案值，仅适用基础罚则，不加案值倍数；赔偿待核定。'};d.say(result.valuationNote);}
 return {...result,filingDecision:{version:FILING_VERSION,request:structuredClone(d.get(...path(request.id))),
  case:result.accepted?structuredClone(d.get(...path(result.case))):null,fee,law,witnesses,minute:d.get('state','minute'),result:structuredClone(result)}};
}

function decideFiling(d,engine,args,eventId){
 const s=d.get('state'),id=typeof args.request==='string'?args.request:args.filing,request=s.records[id];
 if(request?.category!=='legal_request'||request.filingVersion!==FILING_VERSION)throw preconditionFailure('需要已递交的报案编号');
 if(request.accepted!==null)throw preconditionFailure('该报案已经决定，不重复受理');
 const recorded=engine.replaying?engine.replayResult?.filingDecision:null;
 if(recorded?.version===FILING_VERSION){
  if(recorded.request.id!==id||recorded.request.decision?.sourceEvent!==eventId)throw Error('Filing decision replay source mismatch');
  if(recorded.fee){const account=request.actor==='player'?['state','player','coins']:['state','npcs',request.actor,'coins'],key=`legal_treasury:${recorded.law}`,fund=safeFund(d,key,'legal_treasury',{law:recorded.law});
   books(d,purse(engine,request.actor),fundAccount(key),recorded.fee,eventId);d.set(account,d.get(...account)-recorded.fee);holdingSet(d,engine,path(key),{...fund,coins:fund.coins+recorded.fee},'law');}
  if(recorded.case){const prior=d.get(...path(recorded.case.id));if(prior?.category==='legal_suspicion')holdingSet(d,engine,path(`legal_suspicion:${request.incident}`),{...prior,id:`legal_suspicion:${request.incident}`},'law');holdingSet(d,engine,path(recorded.case.id),structuredClone(recorded.case),'law');}
  for(const witness of recorded.witnesses)if(witness!=='player')knowledge(d,witness,recorded.case.id,recorded.minute);
  holdingSet(d,engine,path(id),structuredClone(recorded.request),'law');return {...structuredClone(recorded.result),filingDecision:structuredClone(recorded)};
 }
 const office=filingOfficer(engine,d,args.authority,vocabulary(engine,'law','caseHandlerOperation'),request.case);
 const player=args.authority==='player';
 if(!player&&(args.operation!=='request_decision'||['accept','reject','reason','decision'].some(k=>args[k]!==undefined)))
  throw preconditionFailure('你不能替经办人决定受理或拒绝，也不能替他填写理由',{repair:['把报案交给经办人，请他本人决定是否受理']});
 if(player&&args.operation==='request_decision')throw preconditionFailure('你本人正在经办席位当值，请自行选择受理或说明拒绝理由');
 const refusal=(reason,repair,source,{outcome='refuse',accepted=false,due}={})=>{
  const decision={sourceEvent:eventId,authority:args.authority,office:office.id,minute:s.minute,reason,repair,source,outcome,...(due!==undefined?{due}:{})};
  holdingSet(d,engine,path(id),{...request,accepted,decision},'law');
  return recordedFilingDecision(d,{request:id,accepted,reason,repair,decision,worldEvent:{verb:'claim',actor:args.authority,target:request.actor,payload:{request:id,accepted,reason,repair},tags:['legal_decision'],visibility:'private'}},request);
 };
 if(player&&args.operation==='reject'){
  if(typeof args.reason!=='string'||!args.reason.trim())throw preconditionFailure('拒绝受理须说明世界内原因');
  return refusal(args.reason,['可补充所缺材料，再向当值经办人递件'],{kind:'player',actor:'player',choice:'reject'});
 }
 const ruleSource={kind:'filing_rules',actor:args.authority,request:id};
 const failRule=(reason,repair)=>{
  if(player)throw preconditionFailure(reason,{repair});
  return refusal(reason,repair,ruleSource);
 };
 const submitted=worldEvent(s,request.sourceEvent);
 if(!submitted||submitted.actor!==request.actor||!submitted.payload?.sourceEvents?.includes(request.incident)||!request.knownVersion||!request.submittedEvidence?.some(e=>e.source===request.incident))
  return failRule('报案缺少可核对的递件与知情出处，暂不能受理',['请报案人带本人知晓的事由和原件重新递件']);
 if(!request.allegation.location)return failRule('报案尚未说明事发地点，不能选择适用法典',['请报案人补充其确实知晓的事发地点后再递件']);
 const code=codeFor(engine,request.allegation.location,s);
 if(!code)return failRule('事发地尚无登记可执行的法典，本席不能据此立案',['请向有管辖依据的官署递件，或先由官署核对法典']);
 // Explicit office case limits are checked by filingOfficer. Territorial
 // coverage comes from the selected code; never infer it from a title's text.
 if(!code.locations?.includes(request.allegation.location))return failRule('这件事不在本次所选法典的登记辖区内',['请携事发地点与凭据，向该地有管辖依据的官署递件']);
 // These checks read submitted allegations and statutes, never suspicion truth.
 if(!offensePenalty(engine,code,request.allegation.offense))return failRule('本法典未登记所指控罪名，不能据此立案',['请核对当地法典，按已经登记的事由重新递件']);
 const fee=code.procedure?.costs?.filingFee??code.procedureCosts?.filingFee??0;
 if(!Number.isSafeInteger(fee)||fee<0||fee>1e9)return failRule('法典的讼费条目尚不完整，暂不能收费立案',['请官署核对讼费条目后再递件']);
 const prior=s.records[request.case],existing=prior?.category==='legal_case';
 const account=request.actor==='player'?['state','player','coins']:['state','npcs',request.actor,'coins'];
 if(!existing&&d.get(...account)<fee)return failRule('报案人的钱不足支付讼费，未立案',['请报案人备足法典规定的讼费后重新递件']);
 let source={kind:'player',actor:'player',choice:'accept'},reason='我决定受理这件报案';
 if(!player){
  const view=subjectiveView(engine,d.document,args.authority);
  // Only the official's own remembered, actually paid bribes may contribute;
  // a claimed offer in the caller's arguments supplies no reward or consent.
  const paid=Object.entries(s.records).filter(([key,r])=>r.category==='legal_bribe'&&r.recipient===args.authority&&r.briber===request.actor&&r.case===request.case&&r.minute<=s.minute&&view.knowledge.memories.some(m=>m.sourceEvent&&`legal_bribe:${m.sourceEvent}`===key));
  const offer={kind:'legal_filing',from:request.actor,cost:{minutes:0},tags:['law',request.allegation.offense],...(paid.length?{prepaid:true,reward:paid.reduce((sum,[,r])=>sum+r.coins,0)}:{})};
  const decision=npcDecision(view,offer);
  source={kind:'npc_decision',actor:args.authority,request:id,from:request.actor,paidSources:paid.map(([key])=>key),decision:structuredClone(decision)};
  reason=decision.reason;
  if(decision.outcome!=='agree')return refusal(reason,['可补充真实凭据、请人作保，或待经办人有空后再请求'],source,{outcome:decision.outcome,...(decision.outcome==='defer'?{accepted:null,due:decision.due}:{})});
 }
 if(prior&&!['legal_suspicion','legal_case'].includes(prior.category))throw preconditionFailure('案件编号已占用');
 if(!existing&&fee){const key=`legal_treasury:${code.id}`,fund=safeFund(d,key,'legal_treasury',{law:code.id});books(d,purse(engine,request.actor),fundAccount(key),fee,eventId);d.set(account,d.get(...account)-fee);holdingSet(d,engine,path(key),{...fund,coins:fund.coins+fee},'law');}
 const a=request.allegation,witnesses=request.submittedEvidence.filter(e=>e.kind==='eyewitness').map(e=>e.witness);
  // The incident already pinned its substantive law when the behavior occurred.
  // Filing supplies proof and current procedure, not a new date for punishment.
  const norms=prior?.sourceEvent===request.incident&&prior.offender===a.offender&&prior.offense===a.offense&&prior.location===a.location&&prior.minute===a.minute&&prior.normSnapshot
   ?{normSnapshot:structuredClone(prior.normSnapshot)}:incidentNorms(d,engine,{...a,code});
 const row=existing?{...prior,evidence:[...prior.evidence,...request.submittedEvidence],witnesses:[...new Set([...prior.witnesses??[],...witnesses])]}:
   {category:'legal_case',id:request.case,procedureVersion:1,filingVersion:FILING_VERSION,law:code.id,...a,...norms,
   ...(a.value===null?{unvaluable:'无法核定案值',valuationNote:'无从估价：无法核定案值，仅适用基础罚则，不加案值倍数；赔偿待核定。'}:{}),
   settlement:code.settlement??null,faction:code.faction??null,sourceEvent:request.incident,reported:true,status:'已报案',stage:'pending',court:code.court,parties:[a.offender,a.victim].filter(Boolean),evidence:request.submittedEvidence,witnesses,receiver:args.authority,handlerOffice:office.id,reportedAt:s.minute,filingFee:fee,
   ...(prior?.npcCrime?{npcCrime:{...prior.npcCrime,statementsReceived:true},nextHearing:s.minute+code.hearingMinutes}:{})};
 if(prior?.category==='legal_suspicion')holdingSet(d,engine,path(`legal_suspicion:${request.incident}`),{...prior,id:`legal_suspicion:${request.incident}`},'law');
 holdingSet(d,engine,path(request.case),{...row,acceptedAt:s.minute,acceptanceEvent:eventId,requestSources:[...row.requestSources??[],id]},'law');
 for(const witness of witnesses)if(witness!=='player')knowledge(d,witness,request.case,s.minute);
 const decision={sourceEvent:eventId,authority:args.authority,office:office.id,minute:s.minute,reason,repair:[],source,outcome:'agree'};
 holdingSet(d,engine,path(id),{...request,accepted:true,decision},'law');
 return recordedFilingDecision(d,{request:id,case:request.case,target:request.actor,accepted:true,convicted:false,fee:existing?0:fee,reason,repair:[],decision,worldEvent:{verb:'claim',actor:args.authority,target:request.actor,payload:{request:id,case:request.case,accepted:true,reason},tags:['legal_decision'],visibility:'private'}},request,{fee:existing?0:fee,law:code.id,witnesses});
}

const rejectLegalRequest=reason=>reject('E-ACTION-LEGAL-REQUEST',reason,{missing:[reason],repair:[`先满足当前条件：${reason}；再向有权且在场的人提出原请求`]});
function receiveLegalRequest(d,engine,args,eventId){
    const request=args.request,operation=args.operation,s=d.get('state'),caseId=request?.terms?.case??args.case,row=s.records?.[caseId];
    const kinds={report:'theft',confess:'confession',appeal:'appeal',hire_advocate:'defense',bribe:'bribe'};
    if(!Object.hasOwn(kinds,operation)||!request||typeof request!=='object'||Array.isArray(request)||request.kind!==kinds[operation])rejectLegalRequest('递交的事由与当前办理事项不符');
    const key=`legal_request:${eventId}`,old=s.records?.[key];
    if(old){if(JSON.stringify(old.request)!==JSON.stringify(request))throw Error('Legal request event reused');return {request:key,case:old.case,submitted:true};}
    const papers=Object.entries(s.itemInstances??{}).filter(([id,p])=>p.owner==='player'&&p.document?.valid!==false&&documentAccessible(engine,d.document,id));
    const sourceEvents=[],evidence=[];let receiver,target=request.target,verb=['report','confess'].includes(operation)?'claim':'request';
    const canReceive=id=>awake(s.npcs?.[id],d,id)&&canAct({engine,document:d.document},id,'talk').allowed;
    const receive=(permission)=>{
        const offices=new Map(institutionOffices(engine,s).map(o=>[o.id,o]));
        const candidates=aliveHoldings(d,{kind:'holds_office'}).filter(h=>{
            const entity=d.get('holdings','entities',h.subject),office=offices.get(h.subject);
            return entity&&entity.goneAt===undefined&&office?.seat===s.location&&office.authority?.operations?.includes(permission)&&
                (!entity.facts.authority?.case||entity.facts.authority.case===caseId)&&
                (!office.authority.case||office.authority.case===caseId)&&officeOnDuty(engine,s,office,h.holder)&&canReceive(h.holder)&&
                (!args.authority||args.authority===h.holder)&&(!target||target===s.location||target===h.holder);
        });
        if(candidates.length!==1)rejectLegalRequest('此处没有唯一在岗且有权收件的人，请等经办人到岗后再递件');
        receiver=candidates[0].holder;
    };
    if(operation==='report'||operation==='confess'){
        receive(vocabulary(engine,'law','receiveOperations',operation==='report'?'report':'confess'));
        const known=Object.entries(s.records??{}).filter(([,r])=>r.category==='world_event'&&r.verb==='theft'&&r.minute<=s.minute&&
            (operation==='confess'?r.actor==='player':r.payload?.owner==='player'&&(r.witnesses?.includes('player')||r.observer==='player'))&&
            (!request.incident||request.incident===r.id||request.incident===r.payload?.name||request.incident===r.summary)&&
            (!request.accused||request.accused===r.actor));
        if(known.length!==1)rejectLegalRequest('报案者没有可以核对的本人知情事由，请先取得本人确实知晓的经过');
        const [source,event]=known[0];sourceEvents.push(source);
        if(operation==='report'){
            const originals=papers.filter(([,p])=>p.document.describes&&identifies(d,event.payload?.subject,p.document.describes));
            if(!originals.length)rejectLegalRequest('报案须带有能指认失物的凭据原件，请先取得原件');
            evidence.push(...originals.map(([id])=>id));
        }
        target=operation==='confess'?receiver:s.location;
    }else{
        if(!caseProcedureView(engine,d.document,caseId)?.party)rejectLegalRequest('须由本案当事人携已经登记的案件来办理');
        if(row.sourceEvent)sourceEvents.push(row.sourceEvent);
        if(operation==='appeal'){
            if(!caseProcedureView(engine,d.document,caseId).canRequestAppeal)rejectLegalRequest('须由有资格的当事人在上诉期内，携已经作出的判决提出上诉');
            receive(vocabulary(engine,'law','receiveOperations','appeal'));
            const originals=papers.filter(([id,p])=>(p.document.case===caseId||row.evidence.some(e=>e.document===id))&&p.document.reviewed===false);
            if(!originals.length)rejectLegalRequest('上诉须带本案新证据的原件，请先取得原件');
            for(const [id]of originals){if(!row.evidence.some(e=>e.document===id))submitCaseDocument(d,engine,{case:caseId,document:id},eventId);evidence.push(id);}
            target=s.location;
        }else if(operation==='hire_advocate'){
            receiver=present(d,engine,args.authority??target);target=receiver;
            if(!canReceive(receiver))rejectLegalRequest('收件人眼下不能办理，请等其清醒在场后再递件');
            const vocation=s.npcs[receiver]?.vocation;
            if(vocation?.id!=='vocation_advocate'||vocation.conflictOfInterest||[...row.parties??[],row.offender,row.victim,...row.witnesses??[],row.judgment?.judge].includes(receiver)||!consent({engine,document:d.document},receiver,'player',vocabulary(engine,'law','defenceConsentScope'),{subject:caseId,purpose:caseId}).allowed)rejectLegalRequest('须先找到有资格、无利害冲突且本人愿意洽谈的讼师');
            if(request.terms?.quoteOnly!==true)rejectLegalRequest('须先谈妥辩护费用和服务范围，再签订约定');
        }else{
            receiver=present(d,engine,args.authority??target);target=receiver;
            if(!canReceive(receiver))rejectLegalRequest('收件人眼下不能办理，请等其清醒在场后再递件');
            const amount=integer(request.terms?.amount,1,1e6,'所提钱数');
            if(!currentCaseHandler(engine,d.document,caseId,receiver)||s.player.coins<amount)rejectLegalRequest('须向本案当前经办人当面提议，并确实持有这笔钱');
        }
    }
    const payload={...structuredClone(request),...(row?.category==='legal_case'?{case:caseId}:{}),sourceEvents,evidence,receiver};
    holdingSet(d,engine,path(key),{category:'legal_request',actor:'player',minute:s.minute,location:s.location,sourceEvent:eventId,request:structuredClone(request),verb,target,receiver,payload,...(row?.category==='legal_case'?{case:caseId}:{})},'law');
    return {request:key,...(row?.category==='legal_case'?{case:caseId}:{}),submitted:true,accepted:null,worldEvent:{verb,actor:'player',target,payload,tags:['legal_request'],visibility:request.visibility==='private'?'private':'public'}};
}

// A transfer is a fact, not a conviction. Provenance survives resale; witnesses
// must still report and the court must still examine evidence in the usual way.
export function registerStolenPurchase(d,engine,{buyer,seller,item,instances,eventId,location=d.get('state','location')}){
 const units=instances.filter(unit=>{
  const origin=d.get('state','itemInstances',unit,'stolenOrigin');
  if(!origin||origin.recoveredAt!==undefined)return false;
  if(origin.victim===seller){holdingSet(d,null,['state','itemInstances',unit,'stolenOrigin'],{...origin,recoveredAt:d.get('state','minute'),recoveryEvent:eventId},'law');return false;}
  return true;
 });
 if(!units.length)return [];
 const code=legalCodeAt(engine,location,d.get('state'));
 if(!code||!codePenalty(engine,code,'receiving_stolen'))return [];
 const witnesses=Object.entries(d.get('state','npcs')??{}).filter(([id,n])=>id!==buyer&&id!==seller&&n.location===location&&awake(n,d,id)).map(([id])=>id);
 return units.map((unit,index)=>{
  const origin=d.get('state','itemInstances',unit,'stolenOrigin');
  const incident=registerIncident(d,engine,{offender:buyer,victim:origin.victim,offense:'receiving_stolen',value:goodsWorth(d,engine,{item,quantity:1,location,holder:buyer}),
   stolen:{item,quantity:1,unit},witnesses,eventId:`${eventId}:receiving:${index}`,location,code});
  holdingSet(d,null,['state','itemInstances',unit,'legalClaims'],[...d.get('state','itemInstances',unit,'legalClaims')??[],{case:incident,victim:origin.victim,minute:d.get('state','minute')}],'law');
  return incident;
 });
}

export function registerFireDamage(d,engine,{building,damage,grain,origin,eventId,minute}){
 const fact=d.get('state','records',origin);
 if(fact?.category!=='unattended_furnace'||!fact.responsible||!fact.burning||fact.attendants?.length)return null;
 const base=d.get('state','created',building)??engine.byId.get(building),victim=d.get('state','buildings',building,'owner')??base?.owner;
 if(!victim||victim===fact.responsible)return null;
 const code=legalCodeAt(engine,building,d.get('state'))??legalCodeAt(engine,base?.parent,d.get('state'));
 if(!code||!codePenalty(engine,code,'negligent_fire'))return null;
 const id=`legal_case:${eventId}`;if(d.get(...path(id)))return id;
 // 案值：烧毁的粮按当地市场估值；建筑损伤按“受损前完整价值（租金资本化）× 损伤百分比”，不读目录基价。
 const grainItem=engine.rules.agriculture?.grainItem??'item_oats',intact=damage?valuation(d,engine,{role:'property',subject:building,condition:100}).value:0;
 const grainValue=grain?goodsWorth(d,engine,{item:grainItem,quantity:grain,location:building,holder:null}):0;
 const value=intact===null||grainValue===null?null:grainValue+Math.floor(intact*damage/100);
 if(value===0)return null;
 registerIncident(d,engine,{victim,offender:fact.responsible,offense:'negligent_fire',value,witnesses:fact.witnesses??[],eventId,minute,location:building,code,relationshipApplied:true});
 const row=d.get(...path(id));holdingSet(d,null,path(id),{...row,fireOrigin:origin,building,evidence:[...row.evidence,{kind:'fire_fact',record:origin,damage:`facility_damage:${eventId.replace(/^facility_damage:/,'')}`} ]},'law');
 return id;
}

export function releasePrimitiveCustody(d,engine,holding,reason,eventId){
 if(!holding.source?.startsWith('custody:'))return;
 const id=holding.source.slice(8),old=d.get('state','records',id),now=d.get('state','minute');
 if(!['legal_custody','legal_detention'].includes(old?.category)||old.status!=='生效')throw Error('Custody source is not active');
 const escaped=reason==='escaped';
 endCustody(d,engine,id,{...old,status:escaped?'已中断':'已释放',ended:now,...(escaped?{remaining:Math.max(0,(old.expires??now)-now)}:{})},reason,eventId);
 if(escaped){
  const row=d.get(...path(old.case));
  if(row?.category==='legal_case'&&old.reason!=='待审')holdingSet(d,null,path(old.case),{...row,status:'已裁决',remainingSentence:{type:old.reason==='劳役'?'labor':'prison',minutes:Math.max(0,(old.expires??now)-now)}},'law');
 }
}
function endCustody(d,engine,id,next,reason,eventId){
 return changeLegacyHoldings(d,engine,{source:`custody:${id}`,kinds:['guest_of'],reason,eventId},()=>writeHoldingProjection(d,null,path(id),{...next,endReason:reason},'law'));
}

// A credit default (credit.mjs) is filed by the creditor under the code where the
// contract was signed; the contract is the evidence. No code there, no case.
import {financeBalance,financeChange,financeTransfer} from './finance-bank.mjs';
import {purse,fund as fundAccount,vault,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {placed as placedStock} from './stock.mjs';
declareLedgerWriter('law');
const books=(d,from,to,amount,eventId)=>moveCoins(d,{from,to,amount,writer:'law',eventId});
export function registerCreditDefault(d,engine,{debt,row,value,minute}){
    if(!claimLimitation(d.get('state'),debt,minute).enforceable)return null;
    const code=codeFor(engine,row.location,d.get('state'));if(!code)return null;
    const id=`legal_case:default:${debt}`;if(d.get(...path(id)))return id;
    const receiver=code.officers[0];
    holdingSet(d,null,path(id),{category:'legal_case',id,law:code.id,...incidentNorms(d,engine,{offender:row.debtor??'player',location:row.location,minute,offense:'debt_default',code}),procedureVersion:1,settlement:code.settlement??null,faction:code.faction??null,sourceEvent:row.source,witnesses:[],
        offender:row.debtor??'player',victim:row.keeper??row.creditor,...(row.bank?{bank:row.bank}:{}),debt,offense:'debt_default',value,stolen:null,location:row.location,minute,
        status:'已报案',reported:true,receiver,reportedAt:minute,evidence:[{kind:'contract',debt,minute}]},'law');
    if(d.get('state','npcs',receiver))knowledge(d,receiver,id,minute);
    if(obligationRow(d.get('state'),debt)?.terms?.limitation)recordClaimProcedure(d,engine,{claim:debt,action:'suspend',minute,evidence:id},`${id}:filed`);
    return id;
}
// U10: a cast past the village's fee, licence or limit (magic-economy.mjs) is
// filed by the code's officer; the village ledger is the evidence.
export function registerMagicViolation(d,engine,{location,settlement,offense,value,minute,sourceEvent}){
    const code=codeFor(engine,location,d.get('state'));if(!code)return null;
    const id=`legal_case:magic:${sourceEvent}`;if(d.get(...path(id)))return id;
    const receiver=lawAuthorities(engine,d.get('state'),code)[0];if(!receiver)return null;
    holdingSet(d,null,path(id),{category:'legal_case',id,law:code.id,...incidentNorms(d,engine,{location,minute,offense,code}),procedureVersion:1,settlement:code.settlement??settlement,faction:code.faction??null,sourceEvent,witnesses:[],
        offender:'player',victim:settlement,offense,value,stolen:null,location,minute,status:'已报案',reported:true,receiver,reportedAt:minute,
        evidence:[{kind:'ledger',record:`magic-economy:${settlement}`,minute}]},'law');
    if(d.get('state','npcs',receiver))knowledge(d,receiver,id,minute);
    return id;
}
// Paying the debt itself settles the creditor's claim; a fine already judged stays.
export function settleCreditCase(d,engine,id,eventId,{badDebt=0}={}){
    const row=d.get(...path(id));if(row?.category!=='legal_case'||!row.debt)return null;
    const now=d.get('state','minute');
    const next=['已报案','证据不足','待赔偿'].includes(row.status)?{...row,status:'已结案',compensationPaid:true,fineDischarged:row.status==='待赔偿'?row.fineDischarged:true,finePaid:row.finePaid??0,closed:now,settledBy:eventId}
        :{...row,compensationPaid:true,compensationSettledBy:eventId};
    if(badDebt){next.compensationPaid=false;next.compensationDischarged=true;next.badDebt=badDebt;next.value=0;next.fineDischarged=row.fineDischarged??false;if(row.judgment)next.judgment={...row.judgment,compensation:0,dischargedCompensation:badDebt};}
    holdingSet(d,null,path(id),next,'law');return next;
}

export function crimeAction(d,args,eventId){
    if(args.operation!=='steal')throw preconditionFailure('该犯罪方式尚未接入，不能将对话当实际获利');
    const code=codeFor(this,d.get('state','location'),d.get('state')),victim=present(d,this,args.target,true,'E-ACTION-CRIME'),actor=d.get('state','npcs',victim);
    const key=`legal_case:${eventId}`;unique(d,key);
    if((args.item===undefined)===(args.coins===undefined))throw preconditionFailure('偷窃必须指定一件物品或一笔钱，不能同时指定');
    let item=null,amount=0,value=0;
    if(args.item){
        item=this.resolve(args.item,'item');if(this.quantity(d,victim,item)<1)throw preconditionFailure('目标没有这件物品');
        if(args.instance){
            const held=d.get(...this.bagPath(victim),item),unit=d.get('state','itemInstances',args.instance);
            if(!held?.instances?.includes(args.instance)||unit?.owner!==victim||unit.item!==item||unit.status!=='持有')throw preconditionFailure('此单件不属于目标实际库存');
        }
        if((this.byId.get(item).weight??0)>this.rules.law.maximumTheftWeightKg)throw preconditionFailure('物品过重，不能用这一扒取动作');
        value=goodsWorth(d,this,{item,quantity:1,holder:victim});
    }else{if(args.instance)throw preconditionFailure('钱币不能指定物品单件编号');amount=integer(args.coins,1,this.rules.law.maximumTheftCoins,'偷取铜币');if(actor.coins<amount)throw preconditionFailure('目标没有这么多钱');value=amount;}
    const result=this.check(d,{attribute:'敏捷',difficulty:15},eventId),witnesses=[];

    let perception=null;
    const observe=()=>{
        perception=eventPerception(this,d.document,{verb:'steal',actor:'player',target:victim,location:d.get('state','location')},{exclude:['player']});
        for(const[npc,observer]of Object.entries(d.get('state','npcs'))){
            if(!awake(observer,d,npc)||observer.location!==d.get('state','location')||['睡眠','熟睡'].includes(observer.activity))continue;
            if(!perception.versions[npc])continue;
            const observed=this.check(d,{attribute:'敏捷',opponent:{npc,attribute:'精神'}},`${eventId}_observation_${npc}`);
            if(!observed.success){if(perception.versions[npc].identified)witnesses.push(npc);}
            else delete perception.versions[npc];
        }
    };

    this.advance(d,this.rules.law.actionMinutes,eventId);
    observe();
    const latest=d.get('state','npcs',victim);let stolen=null,success=result.success;
    if(!awake(d.get('state','player'),d,'player')||!alive(latest,d,victim)||latest.location!==d.get('state','location')||item&&this.quantity(d,victim,item)<1||!item&&latest.coins<amount)success=false;
    if(success){
        if(item){
            const unit=trackTransferUnit(d,this,victim,item,eventId,args.instance??null);
            transferItems(d,this,victim,'player',item,1,[unit]);
            const record=d.get('state','itemInstances',unit);
            holdingSet(d,null,['state','itemInstances',unit,'legalClaims'],[...record.legalClaims??[],{case:key,victim,minute:d.get('state','minute')}],'law');
            stolen={item,quantity:1,unit};
        }else{
            books(d,purse(this,victim),purse(this,'player'),amount,eventId);d.set(['state','npcs',victim,'coins'],latest.coins-amount);d.set(['state','player','coins'],d.get('state','player','coins')+amount);stolen={coins:amount};
        }
    }
    const incident=registerIncident(d,this,{victim,offense:success?'theft':'theft_attempt',value:success?value:0,stolen,witnesses,eventId,perception,optional:true});
    if(success)recordDisciplineBreach(d,this,'theft',eventId);
    return{target:victim,case:incident,suspicion:incident,...result,checkSuccess:result.success,success,stolen,witnesses,...(success&&value===null?{value:null,unvaluable:'无法核定案值',valuationNote:'无从估价：无法核定案值'}:{}),...(perception?{perception}:{}),
        actionScope:{kind:'theft',reported:d.get(...path(incident),'reported'),
            note:'仅已列目击者知情，异地执法人员尚不自动知道。失败无财物转移；还未审判、缴罚款或监禁。'}};
}

export function recordViolence(d,engine,{attacker='player',victim,damage,killed,intent,eventId,duel=null}){
    const code=codeFor(engine,d.get('state','location'));
    if(duel&&(code?.duels??engine.rules.law?.duels?.[code?.id])?.[duel.rule]===true)return null;
    if(attacker==='player'&&damage>0&&['attack','shove'].includes(intent))recordDisciplineBreach(d,engine,'violence',eventId);
    if(!codeFor(engine,d.get('state','location'))||!['attack','shove'].includes(intent))return null;
    const witnesses=Object.entries(d.get('state','npcs')).filter(([id,actor])=>awake(actor,d,id)&&actor.location===d.get('state','location')).map(([id])=>id);
    return registerIncident(d,engine,{offender:attacker,victim,offense:killed?'homicide':damage?'assault':'assault_attempt',witnesses,eventId,relationshipApplied:true});
}

export function enforceLegalRestriction(d,tool,args,engine=null){
    const permission=legacyCanAct(engine,d.document,tool,args);
    if(permission){if(!permission.allowed)throw Error(permission.reason);return;}
    const lock=Object.values(d.get('state','records')??{}).find(row=>row?.category==='legal_custody'&&row.status==='生效'&&(row.subject??d.get('state','records',row.case,'offender')??'player')==='player');
    if(!lock)return;
    if(['time','turn','health','revive'].includes(tool)||tool==='law'&&(args.operation??'inspect')==='inspect')return;
    if(tool==='law'&&lock.reason==='到案'&&['confess','bribe'].includes(args.operation))return;
    if(tool==='law'&&['hear','hire_advocate'].includes(args.operation)&&lock.reason==='待审')return;
    throw preconditionFailure('当前正在依法羁押或服役，不能自由移动交易或行动；可推进时间或在待审时申请审理');
}

function custodyInterrupted(d,engine,lock){
    const subject=lock.subject??d.get(...path(lock.case),'offender')??'player';
    return isGone(engine,d,subject)?'death':(subject==='player'?d.get('state','location'):d.get('state','npcs',subject,'location'))!==lock.location?'escaped':null;
}
export function advanceLaw(d,after,engine,recordIds){
    const rows=()=>recordIds?recordIds.map(id=>[id,d.get('state','records',id)]).filter(([,row])=>row):Object.entries(d.get('state','records')??{});
    for(const [id,hold] of rows())if(hold.category==='legal_detention'&&(!hold.status||hold.status==='生效')){
        const dead=isGone(engine,d,hold.subject);
        if(dead||(hold.expires??Infinity)<=after){
            const shops=engine&&!dead?businessSnapshot(engine,{...d.get('state'),minute:hold.expires-1}):null;
            endCustody(d,engine,id,{...hold,status:dead?'已中止':'已释放',ended:dead?after:hold.expires},dead?'death':'expired',`${id}:end`);
            if(engine&&!dead)entityTransition(d,engine,{id:`${id}:release`,verb:'release',actor:hold.deliveredBy??hold.location,target:hold.subject,minute:hold.expires,location:hold.location,visibility:hold.private?'private':hold.visibility??'public',summary:`${personName(engine,d.get('state'),hold.subject).value??hold.subject}拘留期满释放`});
            if(shops)businessTransitions(d,engine,shops,`${id}:release`,hold.expires);
        }
    }
    for(const[id,r]of rows())if(r.category==='authorization'&&r.sourceType==='magic_permit'&&!r.revoked&&r.expires<=after)holdingSet(d,null,path(id),{...r,revoked:true,status:'已到期',ended:r.expires},'law');
    for(const[id,lock]of rows())if(lock?.category==='legal_custody'&&lock.status==='生效'&&lock.reason!=='到案'&&
        custodyInterrupted(d,engine,lock)){
        endCustody(d,engine,id,{...lock,status:'已中止',ended:after,remaining:Math.max(0,lock.expires-after)},custodyInterrupted(d,engine,lock),`${id}:interrupted`);
        const row=d.get(...path(lock.case));
        if(row?.category==='legal_case'&&lock.reason!=='待审')holdingSet(d,null,path(lock.case),{...row,status:'已裁定',
            remainingSentence:{type:lock.reason==='劳役'?'labor':'prison',minutes:Math.max(0,lock.expires-after)}},'law');
        d.say('羁押或服役因死亡/离开登记地点中止；未完成判罚仍保留');
    }
    for(const[id,lock]of rows())if(lock?.category==='legal_custody'&&lock.status==='生效'&&lock.reason!=='到案'&&lock.expires<=after){
        const subject=lock.subject??d.get(...path(lock.case),'offender')??'player';
        const shops=engine&&subject!=='player'?businessSnapshot(engine,{...d.get('state'),minute:lock.expires-1}):null;
        endCustody(d,engine,id,{...lock,status:'已结束',ended:lock.expires},'expired',`${id}:expired`);
        const row=d.get(...path(lock.case));
        if(engine)entityTransition(d,engine,{id:`${id}:release`,verb:'release',actor:lock.location,target:subject,minute:lock.expires,location:lock.location,visibility:row?.private?'private':row?.visibility??lock.visibility??'public',summary:`${personName(engine,d.get('state'),subject).value??subject}羁押或服役期满释放`});
        if(shops)businessTransitions(d,engine,shops,`${id}:release`,lock.expires);
        if(row?.category==='legal_case'&&lock.reason!=='待审'){
            holdingSet(d,null,path(lock.case),{...row,status:row.compensationPaid||row.compensationDischarged?'已结案':'待赔偿',sentenceCompleted:lock.expires,finePaid:0,fineDischarged:true},'law');
            if(engine&&(row.compensationPaid||row.compensationDischarged))recordLegalNotification(d,engine,d.get(...path(lock.case)),'fulfilled',`${row.id}:sentence:${lock.expires}`,localObservers(d));
        }
        d.say(lock.reason==='待审'?'羁押期限届满，未审先释放':'刑期或劳役已完成');
    }
    if(engine&&!recordIds)advanceWanted(d,engine,after);
}

function localObservers(d){return Object.entries(d.get('state','npcs')??{}).filter(([id,npc])=>awake(npc,d,id)&&npc.location===d.get('state','location')).map(([id])=>id);}

export function caseLoss(d,engine,row){
    if(!row.victim||row.value===null&&row.lossAmount==null)return null;
    const source=row.lossSource??row.sourceEvent??row.id,id=row.loss??`loss:${source}`;
    return registerLoss(d,engine,{id,victim:row.victim,amount:row.lossAmount??row.value,source});
}
function deposit(d,engine,row,{fine=0,compensate=true}={}){
    const unit=row.stolen?.unit,record=unit?d.get('state','itemInstances',unit):null;
    const returnUnit=Boolean(compensate&&record?.owner==='player'&&record.status==='持有'&&d.get('state','inventory',record.item,'instances')?.includes(unit));
    if(compensate&&row.value===null&&!returnUnit)throw preconditionFailure('无从估价：无法核定案值，赔偿待核定；不能按零元结清，可先处理罚则或返还原物。');
    const loss=compensate?caseLoss(d,engine,row):null;
    const compensation=compensate?returnUnit?0:loss?.remaining??row.value:0,total=fine+compensation;
    if(d.get('state','player','coins')<total)throw preconditionFailure('余额不足支付罚款和赔偿；可以选择劳役或服刑处理罚款，赔偿债务仍保留');
    const treasuryKey=`legal_treasury:${row.law}`,escrowKey=`legal_deposit:${row.id}`;
    const treasury=safeFund(d,treasuryKey,'legal_treasury',{law:row.law}),escrow=safeFund(d,escrowKey,'legal_deposit',{case:row.id,beneficiary:row.victim,units:[]});
    books(d,purse(engine,'player'),fundAccount(treasuryKey),fine,row.id);if(compensate)books(d,purse(engine,'player'),fundAccount(escrowKey),compensation,row.id);
    d.set(['state','player','coins'],d.get('state','player','coins')-total);
    if(fine)holdingSet(d,null,path(treasuryKey),{...treasury,coins:treasury.coins+fine},'law');
    if(compensate){
        const units=[...escrow.units];
        if(returnUnit){
            changeItems(d,engine,'player',record.item,-1,{preserve:true,selection:[unit],books:{account:placedStock(engine,escrowKey,record.item),writer:'law',eventId:row.id}});
            holdingSet(d,null,['state','itemInstances',unit],{...record,owner:escrowKey,status:'保管'},'law');units.push(unit);
        }
        holdingSet(d,null,path(escrowKey),{...escrow,coins:escrow.coins+compensation,units},'law');
    }
    if(loss)recoverLoss(d,engine,{id:loss.id,amount:returnUnit?loss.remaining:compensation,payer:row.offender,kind:returnUnit?'restitution':'deposit'},`${row.id}:deposit`);
    return{cost:total,fine,compensation,returnedUnit:returnUnit?unit:null,deposit:compensate?escrowKey:null};
}

export function recordExposedCorruption(d,engine,{target,law,offer,witnesses,eventId,location=d.get('state','location')}){
    const code=legalCodeById(engine,law,d.get('state')),now=d.get('state','minute');
    let corruption=null,wanted=null;
    corruption=`legal_case:corruption:${eventId}`;
    holdingSet(d,null,path(corruption),{category:'legal_case',id:corruption,law,procedureVersion:1,settlement:code.settlement??null,faction:code.faction??null,sourceEvent:eventId,witnesses:[...witnesses],
        offender:target,victim:null,offense:'corruption',value:offer,stolen:null,location,minute:now,status:'已报案',reported:true,reportedAt:now,
        evidence:witnesses.map(witness=>({kind:'eyewitness',witness,identified:true,testified:true,minute:now}))},'law');
    for(const witness of witnesses)knowledge(d,witness,corruption,now);
    // The bribe is seized for the public purse; the exposed taker is dismissed and flees.
    const fund=safeFund(d,`legal_treasury:${law}`,'legal_treasury',{law}),seized=Math.min(offer,d.get('state','npcs',target,'coins'));
    books(d,purse(engine,target),fundAccount(`legal_treasury:${law}`),seized,null);d.set(['state','npcs',target,'coins'],d.get('state','npcs',target,'coins')-seized);holdingSet(d,null,path(`legal_treasury:${law}`),{...fund,coins:fund.coins+seized},'law');
    holdingSet(d,null,path(`legal_dismissal:${target}`),{category:'legal_dismissal',npc:target,law,case:corruption,minute:now,sourceEvent:eventId},'law');
    entityTransition(d,engine,{id:`${corruption}:dismiss`,verb:'dismiss',actor:law,target,minute:now,location,witnesses,summary:`${personName(engine,d.get('state'),target).value??target}因受贿被撤职`});
    wanted=issueWanted(d,engine,d.get(...path(corruption)),WANTED_REASONS.flight,now);
    if(wanted)d.set(['state','npcs',target,'fugitive'],wanted.id);
    return {corruption,wanted};
}

// Bribery space: the offer meets the taker's price (integrity and regard) or is refused;
// anyone present who sees it through turns it into a case and exposes the taker.
function bribe(d,engine,args,eventId,row){
    const target=present(d,engine,args.authority),state=d.get('state'),location=state.location;
    if(dismissed(state,target))throw preconditionFailure('此人已被撤职，收钱也压不下案件');
    const offer=integer(args.coins,1,1e6,'贿金');if(state.player.coins<offer)throw preconditionFailure('钱不够这笔贿金');
    const w=wantedOfCase(state,row.id),hold=activeHold(state),npc=state.npcs[target];
    const enforcer=[row.law,...w?.scope??[]].some(law=>enforcersOf(engine,law,d.get('state')).includes(target));
    const captor=hold?.case===row.id&&hold.captor===target;
    const eyewitness=row.evidence.find(e=>e.kind==='eyewitness'&&e.witness===target&&!e.invalidatedAt);
    const knower=currentCaseHandler(engine,d.document,row.id,target)||eyewitness||(npc.memoryStream??[]).some(m=>m.legalCase===row.id)||(npc.legalKnowledge??[]).some(k=>k.case===row.id);
    if(!enforcer&&!captor&&!knower)throw preconditionFailure('此人无权也不知情，收钱也影响不了本案');
    const price=bribePrice(engine,state,target,bribeStake(engine,row,w)),accepted=offer>=price;
    advanceWithNpcParticipants(d,engine,engine.rules.law.actionMinutes,eventId,[target]);
    if(!awake(d.get('state','npcs',target),d,target)||d.get('state','npcs',target,'location')!==location)return{success:false,effectFailed:'对方已经离开，贿赂没有谈成'};
    const witnesses=[],companions=d.get('state','player','companions')??[];
    for(const[other,observer]of Object.entries(d.get('state','npcs')).sort(([a],[b])=>a.localeCompare(b))){
        if(other===target||companions.includes(other)||!awake(observer,d,other)||observer.location!==location)continue;
        if(!engine.check(d,{attribute:'魅力',opponent:{npc:other,attribute:'精神'}},`${eventId}_bribe_${other}`).success)witnesses.push(other);
    }
    const local=codeFor(engine,location),now=d.get('state','minute');
    if(!accepted){
        const incident=enforcer&&local?registerIncident(d,engine,{victim:target,offense:'bribery_attempt',witnesses:[target,...witnesses],eventId,relationshipApplied:true}):null;
        return{case:row.id,accepted:false,offer,witnesses,...(incident?{bribeCase:incident}:{}),
            note:enforcer?'对方拒收并记下行贿未遂，钱仍在你手里':'对方不肯收这笔钱，钱仍在你手里'};
    }
    books(d,purse(engine,'player'),purse(engine,target),offer,eventId);d.set(['state','player','coins'],d.get('state','player','coins')-offer);d.set(['state','npcs',target,'coins'],d.get('state','npcs',target,'coins')+offer);
    if(witnesses.length){
        const incident=local?registerIncident(d,engine,{victim:target,offense:'bribery',witnesses,eventId,relationshipApplied:true}):null;
        let corruption=null,wanted=null;
        if(enforcer){
            const law=[row.law,...w?.scope??[]].find(id=>enforcersOf(engine,id,d.get('state')).includes(target));
            ({corruption,wanted}=recordExposedCorruption(d,engine,{target,law,offer,witnesses,eventId,location}));
        }
        return{case:row.id,accepted:true,exposed:true,offer,witnesses,bribeCase:incident,corruptionCase:corruption,wanted:wanted?.id??null,
            worldEvent:{verb:'breach',actor:target,target:'player',value:offer,witnesses,tags:['crime','bribery','corruption','discovered'],case:corruption??incident},
            note:'行贿当场被人看破：案件照旧，行贿另成罪名；受贿者被撤职并被通缉'};
    }
    const effects=[];
    if(captor){const key=Object.entries(d.get('state','records')).find(([,r])=>r===hold||r?.category==='legal_custody'&&r.reason==='到案'&&r.status==='生效')?.[0];
        if(key){holdingSet(d,null,path(key),{...d.get(...path(key)),status:'已放行',ended:now,releasedBy:target},'law');
            entityTransition(d,engine,{id:`${key}:release`,verb:'release',actor:target,target:'player',minute:now,location:d.get('state','location'),visibility:'private',summary:`${personName(engine,d.get('state'),'player').value}获准离开羁押`});effects.push('放行');}}
    const latest=d.get(...path(row.id));
    if(enforcer&&['未报案','已报案','证据不足'].includes(latest.status)){holdingSet(d,null,path(row.id),{...latest,status:'已撤案',suppressedBy:target,closed:now},'law');effects.push('撤案');}
    else if(w&&legalCodeById(engine,w.law,d.get('state'))?.judges.includes(target)){closeWanted(d,engine,d.get(...path(w.id)),'已销案','审判者收钱销案',now);effects.push('销案');}
    else if(w){const cur=d.get(...path(w.id));holdingSet(d,null,path(w.id),{...cur,silenced:[...new Set([...cur.silenced,target])]},'law');effects.push('装作不认得');}
    if(eyewitness&&!enforcer){const cur=d.get(...path(row.id));holdingSet(d,null,path(row.id),{...cur,evidence:cur.evidence.map(e=>e===eyewitness||e.kind==='eyewitness'&&e.witness===target&&!e.invalidatedAt?{...e,invalidatedAt:now,invalidReason:'收钱改口'}:e)},'law');effects.push('改口');}
    holdingSet(d,null,path(`legal_bribe:${eventId}`),{category:'legal_bribe',briber:'player',recipient:target,coins:offer,case:row.id,minute:now,location,effects,discovered:false},'law');
    d.set(['state','npcs',target,'memoryStream'],[...d.get('state','npcs',target,'memoryStream')??[],{id:`bribe_${eventId}`,sourceEvent:eventId,kind:'law',private:true,minute:now,location,participants:['player',target],
        sourceType:'亲历',salience:4,emotion:'心虚',content:`收了${offer}铜，答应对${row.id}${effects.join('、')||'高抬贵手'}。`}]);
    return{case:row.id,accepted:true,exposed:false,offer,effects,note:'对方收下钱；只此人照应，别处的执法者和文书不受影响'};
}
// Surrender: held where you stand, escorted to the issuing court; no bounty is paid.
function surrender(d,engine,args,eventId,row){
    const state=d.get('state'),w=wantedOfCase(state,row.id),now=state.minute,hold=activeHold(state);
    if(hold&&hold.case===row.id){advanceWithNpcParticipants(d,engine,Math.max(0,hold.expires-now),eventId,[hold.captor].filter(id=>state.npcs[id]));
        return{case:row.id,surrendered:true,location:d.get('state','location'),note:'跟着押解的人到案，通缉解除，原判罚或审理照常进行'};}
    const local=codeFor(engine,state.location,state),issuer=legalCodeById(engine,row.law,state);if(!local||!issuer||!w.scope.includes(local.id)||!legalCooperation(engine,state,issuer,local).extradition)throw preconditionFailure('须在通缉范围内向执法者自首');
    const officer=authority(d,engine,local,args.authority,'officer');
    const key=holdPlayer(d,engine,w,{captor:officer,location:state.location,minute:now,surrendered:true});
    advanceWithNpcParticipants(d,engine,d.get(...path(key)).expires-now,eventId,[officer]);
    return{case:row.id,surrendered:true,location:d.get('state','location'),note:'自首到案，通缉解除；判罚或审理照常进行'};
}
// A bounty-holder seizes a wanted person in reach of the notice; then escorts them (as a companion) to the court.
function captureFugitive(d,engine,row,eventId){
    const state=d.get('state'),w=wantedOfCase(state,row.id);if(!w)throw preconditionFailure('此人没有生效的通缉，不能擅自拘人');
    const quest=state.quests?.[w.quest];if(quest?.taker!=='player'||quest.status!=='进行中')throw preconditionFailure('须先在告示处接下这份赏金（world_quest accept）');
    if(w.captive)throw preconditionFailure('此人已在押解中');
    if(!wantedReachedAt(engine,w,state.location,state.minute,state))throw preconditionFailure('此地不在通缉范围或文书未到，不能擅自拘人');
    const target=present(d,engine,row.offender,true);
    if(w.evadedAt!==undefined&&state.minute-w.evadedAt<60)throw preconditionFailure('逃犯刚甩脱你，需过一阵再找机会');
    const result=engine.check(d,{attribute:'力量',opponent:{npc:target,attribute:'敏捷'}},eventId);
    engine.advance(d,engine.rules.law.actionMinutes,eventId);
    const actor=d.get('state','npcs',target),cur=d.get(...path(w.id)),captured=result.success&&alive(actor,d,target)&&actor.location===d.get('state','location');
    if(captured){holdingSet(d,null,['state','player','companions'],[...new Set([...d.get('state','player','companions')??[],target])],'law');holdingSet(d,null,path(w.id),{...cur,captive:{by:'player',minute:d.get('state','minute')}},'law');}
    else holdingSet(d,null,path(w.id),{...cur,evadedAt:d.get('state','minute')},'law');
    return{case:row.id,target,captured,check:result,note:captured?'已拿下，随你同行押解；到发布法院用world_quest complete交付':'对方挣脱了，一小时后才有机会再试'};
}

// Player and NPC defendants share evidence and sentencing; the caller supplies the court witnesses.
export function adjudicateLegalCase(d,engine,row,code,judge,eventId,observers=[]){
    if(row.familyCivil)return adjudicateFamilyDispute(d,engine,row,code,judge,eventId);
    if(!Number.isFinite(code.evidenceRequired))throw preconditionFailure('适用法典未规定证据阈值');
    const modern=row.filingVersion===FILING_VERSION;
    const scored=modern?(engine.replaying?engine.replayResult?.judgment?.evidence??engine.replayResult?.evidenceEvaluation:trialEvidenceScore(row,code,{advocate:representationEffect(d,engine,row),legacy:true})):null;
    const score=scored?.score??evidenceScore(d,row);
    const threshold=scored?.threshold??code.evidenceRequired;
        if(score<threshold){holdingSet(d,null,path(row.id),{...row,status:'证据不足'},'law');return{case:row.id,convicted:false,evidenceScore:score,...(modern?{evidenceEvaluation:scored}:{})};}
        if(['declared','declaration_revoked','insolvency','inheritance_distribution'].includes(row.civilMatter)){
            const judgment={judge,minute:d.get('state','minute'),evidenceScore:score,effect:row.civilMatter,eventId:`${eventId}:judgment`,procedure:row.procedure??{},law:code.civil??{}};
            holdingSet(d,engine,path(row.id),{...row,status:'已裁定',judgment},'law');
            entityTransition(d,engine,{id:judgment.eventId,verb:'judgment',actor:judge,target:row.subject??row.offender,case:row.id,location:code.court,visibility:row.private?'private':'public',tags:['law']});
            return {case:row.id,convicted:true,judgment};
        }
        const penalty=modern&&row.normSnapshot?row.normSnapshot.penalty:casePenalty(row.normSnapshot,offensePenalty(engine,code,row.offense),row.value);if(!penalty)throw preconditionFailure('本案罪名没有判罚规则');
        if(!['maximumSentenceMinutes','communityMinutesPerCopper','prisonMinutesPerCopper'].every(k=>Number.isFinite(code[k])))throw preconditionFailure('适用法典未规定完整刑罚换算');
        const unvaluable=row.value===null;
        const baseFine=penalty.baseFine+(unvaluable?0:Math.ceil(row.value*penalty.valueMultiplier)),advocate=representationEffect(d,engine,row),fine=baseFine-Math.floor(baseFine*(advocate?.discount??0));
        const loss=row.victim&&!row.debt?caseLoss(d,engine,row):null;
        let judgment={...(modern?{sourceEvent:eventId,authoritySource:judge==='player'?'player_office':'npc_judicial_rules',evidence:scored}:{}),...(advocate?{advocate}:{}),judge,minute:d.get('state','minute'),fine,compensation:row.debt?obligationView(d.get('state'),row.debt)?.owed??row.value:loss?.remaining??0,evidenceScore:score,
            communityMinutes:Math.min(code.maximumSentenceMinutes,fine*code.communityMinutesPerCopper),prisonMinutes:Math.min(code.maximumSentenceMinutes,penalty.detentionMinutes??fine*code.prisonMinutesPerCopper)};
        if(unvaluable)judgment={...judgment,compensation:null,unvaluable:'无法核定案值',valuationNote:'无从估价：无法核定案值，仅适用基础罚则，不加案值倍数；赔偿待核定。'};
        if(row.normSnapshot?.sentencing){const old=row.normSnapshot.sentencing;
            if(old.maximumSentenceMinutes!==undefined){judgment.communityMinutes=Math.min(judgment.communityMinutes,old.maximumSentenceMinutes);judgment.prisonMinutes=Math.min(judgment.prisonMinutes,old.maximumSentenceMinutes);}
            if(old.communityMinutesPerCopper!==undefined)judgment.communityMinutes=Math.min(judgment.communityMinutes,fine*old.communityMinutesPerCopper);
            if(old.prisonMinutesPerCopper!==undefined)judgment.prisonMinutes=Math.min(judgment.prisonMinutes,penalty.detentionMinutes??fine*old.prisonMinutesPerCopper);
        }
        if(modern&&engine.replaying&&engine.replayResult?.judgment)judgment=structuredClone(engine.replayResult.judgment);
        holdingSet(d,null,path(row.id),{...row,status:'已裁定',judgment},'law');
        recordLegalNotification(d,engine,d.get(...path(row.id)),'conviction',eventId,observers,{fresh:true,location:code.court});
        for(const[lockKey,lock]of Object.entries(d.get('state','records')))if(lock?.category==='legal_custody'&&lock.case===row.id&&lock.reason==='待审'&&lock.status==='生效'){
            holdingSet(d,null,path(lockKey),{...lock,status:'已结束',ended:d.get('state','minute')},'law');
            const subject=lock.subject??row.offender;
            entityTransition(d,engine,{id:`${lockKey}:release`,verb:'release',actor:judge,target:subject,location:code.court,visibility:row.private?'private':row.visibility??'public',summary:`${personName(engine,d.get('state'),subject).value??subject}审结后解除待审羁押`});
        }
        const victim={id:row.victim,name:engine.byId.get(row.victim)?.name??row.victim};
        if(unvaluable)return {case:row.id,convicted:true,victim,judgment,unvaluable:judgment.unvaluable,fineCalculation:{base:penalty.baseFine,value:null,multiplier:null,total:fine},factSummary:`无从估价：无法核定案值，仅按基础罚则${penalty.baseFine}铜，不加案值倍数；实罚${fine}铜，赔偿待核定。当前没有付款，也没有开始服役。`};
        return{case:row.id,convicted:true,victim,judgment,fineCalculation:{base:penalty.baseFine,value:row.value,multiplier:penalty.valueMultiplier,total:fine},
            factSummary:`受害人为${victim.name??'公共法益'}。罚款基额=${penalty.baseFine}铜+${row.value}铜×${penalty.valueMultiplier}=${baseFine}铜${advocate?`，代理量罚减免${baseFine-fine}铜`:' ' }；实罚${fine}铜，赔偿${judgment.compensation}铜另付。社区服役${judgment.communityMinutes}分钟，监禁${judgment.prisonMinutes}分钟。当前没有付款，也没有开始服役。`,
            note:'已裁判，尚未支付或开始服役；选择由玩家明确决定'};
}
export function lawAction(d,args,eventId){
 assertVocationAction(this,d.get('state'),'law',args);
    const operation=args.operation??'inspect';
    if(operation==='inspect')return lawView(this,d.document);
    if(args.actor!==undefined&&args.actor!=='player')throw Error('Law action caller must be the player');
    if(['accept','reject','request_decision'].includes(operation))return decideFiling(d,this,args,eventId);
    if(['report','confess'].includes(operation)&&(!args.case||d.get(...path(args.case))?.category==='legal_suspicion'||d.get(...path(args.case))?.filingVersion===FILING_VERSION))return submitFiling(d,this,args,eventId);
    if(args.request!==undefined&&operation==='hire_advocate'){
        const row=d.get(...path(args.case??args.request?.terms?.case));
        if(row?.category==='legal_case'&&(row.parties?.includes('player')||row.offender==='player'||row.victim==='player'))return hireAdvocate(d,this,row,args,eventId);
    }
    if(args.request!==undefined)return receiveLegalRequest(d,this,args,eventId);
    if(operation==='submit_document')return submitCaseDocument(d,this,args,eventId);
    if(operation==='grant_magic_permit'){
        unique(d,`magic_permission:${eventId}`);
        const code=currentCode(d,this),location=this.resolve(args.location),issuer=present(d,this,args.authority);
        if(location!==d.get('state','location')||!code.locations.includes(location)||args.subject!=='player'||args.action!=='mental_magic')throw preconditionFailure('施法许可只限当前法域、在场申请人与登记用途');
        const delegation=code.magicAuthorities?.find(a=>a.npc===issuer&&a.locations.includes(location)&&a.actions.includes(args.action));
        if(!delegation&&!lawAuthorities(this,d.get('state'),code).includes(issuer))throw preconditionFailure('机构或当事人没有颁发此施法许可的权限');
        const duration=integer(args.minutes,1,delegation?.maximumMinutes??1440,'施法许可期限'),fee=integer(delegation?.fee??2,0,1e9,'施法许可费用');
        if(delegation)assertNpcService(d,this,issuer,'teach',5);
        if(d.get('state','player','coins')<fee)throw preconditionFailure('施法许可费用不足');
        if(['昏迷','患病'].includes(d.get('state','npcs',issuer,'status')))throw preconditionFailure('许可颁发者不能清醒办理');
        advanceWithNpcParticipants(d,this,5,eventId,[issuer]);
        if(d.get('state','player','coins')<fee)throw preconditionFailure('办理期间余额不足支付施法许可费用');
        books(d,purse(this,'player'),purse(this,issuer),fee,eventId);
        d.set(['state','player','coins'],d.get('state','player','coins')-fee);
        d.set(['state','npcs',issuer,'coins'],d.get('state','npcs',issuer,'coins')+fee);
        const key=`magic_permission:${eventId}`,now=d.get('state','minute'),permission={category:'authorization',action:args.action,subject:'player',grantee:'player',grantor:issuer,location,law:code.id,createdAt:now,expires:now+duration,revoked:false,sourceType:'magic_permit',sourceEvent:eventId};
        holdingSet(d,null,path(key),permission,'law');
        holdingSet(d,null,path(`magic_permission_source:${eventId}`),{permission:structuredClone(d.get('state','records',key))},'law');
        return{permit:key,permission,cost:fee,minutes:5};
    }
    const {row,code}=caseRow(d,this,args.case),now=d.get('state','minute');
    if(row.trialVersion===1||row.filingVersion===FILING_VERSION&&operation==='appeal'||['request_hearing','submit_evidence','verify_evidence','request_review','review','decide_case','execute_fine'].includes(operation)){
        const result=trialAction(d,this,{...row,trialVersion:1},code,args,eventId,{penalty:offensePenalty(this,code,row.offense),submitDocument:submitCaseDocument,advance:advanceWithNpcParticipants,
            notify:(next,stage)=>recordLegalNotification(d,this,next,stage,eventId,localObservers(d),{fresh:stage==='conviction',location:row.court})});
        if(result)return result;
    }
    if(row.familyCivil){
        if(operation==='hear'){
            if(d.get('state','location')!==code.court)throw preconditionFailure('须到案件所属法院审理');
            const judge=authority(d,this,code,args.authority,'judge');return adjudicateFamilyDispute(d,this,row,code,judge,eventId);
        }
        if(operation==='compensate'||operation==='claim'){
            if(d.get('state','location')!==code.court)throw preconditionFailure('须到案件所属法院执行');
            authority(d,this,code,args.authority,'judge');return recoverFamilyCompensation(d,this,row,eventId);
        }
        if(operation==='appeal'){
            if(!row.judgment)throw preconditionFailure('尚未初审');
            const level=(row.appealLevel??0)+1,court=courtHierarchy(this,d.get('state'),code)?.[level];
            if(!court||d.get('state','location')!==court.court||!court.judges.includes(args.authority))throw preconditionFailure('须由上一级有权法院在场复审');
            present(d,this,args.authority);holdingSet(d,null,path(row.id),{...row,appealLevel:level,appeals:[...row.appeals??[],{judge:args.authority,minute:now,upheld:true}]},'law');return {case:row.id,upheld:true,final:level===2};
        }
        throw preconditionFailure('家族民事案可 hear、appeal、compensate 或 claim');
    }
    if(operation==='notify'){
        const from=this.resolve(args.from,'npc'),to=this.resolve(args.to,'npc');
        if(d.get('state','npcs',from,'location')!==d.get('state','location'))throw preconditionFailure('须向在场传话者提出携信或转述请求');
        const memory=d.get('state','npcs',from,'memoryStream')?.find(m=>m.id===args.memory&&m.legalCase===row.id);
        if(!memory)throw preconditionFailure('传话者没有本案的个人法律消息');
        return shareNpcMemory(d,this,{from,to,memoryId:memory.id,channel:args.channel??'carry',eventId});
    }
    if(row.offense==='negligent_fire'&&row.offender!=='player'){
        if(d.get('state','location')!==code.court)throw preconditionFailure('失火案须在所属法院办理');
        if(operation==='hear'){const judge=authority(d,this,code,args.authority,'judge');return adjudicateLegalCase(d,this,row,code,judge,eventId,localObservers(d));}
        if(operation==='pay'||operation==='compensate'){
            authority(d,this,code,args.authority,'officer');
            if(!row.judgment||row.status!=='已裁定')throw preconditionFailure('须持有效裁判执行，不能重复追讨');
            const due=Math.max(0,row.judgment.compensation-(row.recovered??0)),amount=Math.min(due,financeBalance(d,this,row.offender));
            if(amount)financeTransfer(d,this,row.offender,row.victim,amount,eventId);
            const recovered=(row.recovered??0)+amount;
            holdingSet(d,null,path(row.id),{...row,recovered,compensationPaid:recovered===row.judgment.compensation},'law');
            return {case:row.id,recovered:amount,remaining:due-amount};
        }
    }
    const creditorClaim=row.debt&&(d.get(...path(row.debt),'creditor')==='player'||d.get(...path(row.debt),'kind')==='wage');
    if(row.offender!=='player'&&creditorClaim&&operation!=='claim'){
        if(!['hear','pay'].includes(operation))throw preconditionFailure('债权追讨须由法院审理后执行');
        if(operation==='pay'){
            const officer=authority(d,this,code,args.authority,'officer');
            if(d.get('state','location')!==code.court||row.status!=='已裁定')throw preconditionFailure('须在法院持有效裁判执行，不能重复追讨');
            const debt=d.get(...path(row.debt));
            if(!claimLimitation(d.get('state'),row.debt,now).enforceable)throw preconditionFailure('债权已过诉讼时效，余额保留');
            // Earned wage claims are executed before an ordinary creditor or
            // a fine. Unreachable senior creditors retain the reserved assets.
            const initialOwed=obligationView(d.get('state'),row.debt).owed;let executed=0;
            const shareholderExecutions=[];
            const fundLiability=needed=>{
                let shortfall=Math.max(0,needed-financeBalance(d,this,debt.debtor));
                for(const equity of Object.values(d.get('state','records')??{})){
                    const terms=equity.clauses?.liability;
                    if(!shortfall)break;
                    if(equity.kind!=='equity'||equity.status!=='有效'||equity.share<=0||equity.issuer!==debt.debtor||
                        terms?.form!=='unlimited'||terms.issuer!==debt.debtor||terms.holder!==equity.holder||!terms.consentEvent)continue;
                    const holder=equity.holder,at=holder==='player'?d.get('state','location'):d.get('state','npcs',holder,'location');
                    if(at!==code.court||holder===debt.debtor||isGone(this,d.get('state'),holder))continue;
                    const seized=Math.min(shortfall,financeBalance(d,this,holder));
                    if(!seized)continue;
                    financeTransfer(d,this,holder,debt.debtor,seized,`${eventId}:shareholder:${equity.id}`);
                    shareholderExecutions.push({contract:equity.id,holder,form:terms.form,amount:seized,consentEvent:terms.consentEvent});
                    shortfall-=seized;
                }
            };
            for(const senior of wagePriorityClaims(d.get('state'),debt.debtor)){
                if([senior.id,senior.legacyRecord].includes(row.debt)){
                    fundLiability(obligationView(d.get('state'),senior).owed);
                    const payment=Math.min(obligationView(d.get('state'),senior).owed,financeBalance(d,this,debt.debtor));
                    if(payment){settleClaim(d,this,{id:senior.id,amount:payment,judicial:{case:row.id,authority:officer}},`${eventId}:wage:${senior.id}`);executed+=payment;}
                    if(obligationView(d.get('state'),senior.id).owed)break;
                    continue;
                }
                if(!settlementPresent(this,d.get('state'),debt.debtor,senior.creditor))throw preconditionFailure('优先工资债权人须到场领取或安排法庭托存');
                const payment=Math.min(obligationView(d.get('state'),senior).owed,financeBalance(d,this,debt.debtor));
                if(payment){settleClaim(d,this,{id:senior.id,amount:payment},`${eventId}:wage:${senior.id}`);executed+=payment;}
                if(obligationView(d.get('state'),senior.id).owed)break;
            }
            const reserved=wagePriorityClaims(d.get('state'),debt.debtor).filter(r=>![r.id,r.legacyRecord].includes(row.debt)).reduce((n,r)=>n+obligationView(d.get('state'),r).owed,0);
            if(!reserved)fundLiability(obligationView(d.get('state'),row.debt).owed);
            const balance=financeBalance(d,this,debt.debtor),amount=Math.min(obligationView(d.get('state'),row.debt).owed,Math.max(0,balance-reserved));
            const fine=Math.min(Math.max(0,balance-amount-reserved),Math.max(0,row.judgment.fine-(row.finePaid??0)));
            if(amount+fine+executed<=0&&obligationView(d.get('state'),row.debt).owed)throw preconditionFailure('债务人没有可执行资金，欠款保留');
            if(amount)settleClaim(d,this,{id:row.debt,amount,judicial:{case:row.id,authority:officer}},`${eventId}:claim`);
            if(fine){financeChange(d,this,debt.debtor,-fine,eventId,{account:fundAccount(`legal_treasury:${row.law}`),writer:'law',eventId});const key=`legal_treasury:${row.law}`,fund=safeFund(d,key,'legal_treasury',{law:row.law});holdingSet(d,null,path(key),{...fund,coins:fund.coins+fine},'law');}
            const remaining=obligationView(d.get('state'),row.debt).owed;
            const recovered=initialOwed-remaining;
            const finePaid=(row.finePaid??0)+fine,closed=!remaining&&finePaid===row.judgment.fine;
            holdingSet(d,null,path(row.id),{...row,value:remaining,status:closed?'已结案':'已裁定',finePaid,fineDischarged:finePaid===row.judgment.fine,compensationPaid:!remaining,judgment:{...row.judgment,compensation:remaining},recovered:(row.recovered??0)+recovered},'law');
            if(shareholderExecutions.length)holdingSet(d,null,path(row.id),{...d.get(...path(row.id)),shareholderExecutions:[...row.shareholderExecutions??[],...shareholderExecutions]},'law');
            return {case:row.id,recovered,fine,remaining,closed,shareholderExecutions};
        }
    }
    if(row.offender!=='player'&&!creditorClaim){
        if(operation!=='arrest')throw preconditionFailure('此案被告是他人；你只能接下赏金后缉拿交付');
        return captureFugitive(d,this,row,eventId);
    }
    if(operation==='hire_advocate')return hireAdvocate(d,this,row,args,eventId);
    if(operation==='bribe')return bribe(d,this,args,eventId,row);
    if(operation==='confess'&&wantedOfCase(d.get('state'),row.id))return surrender(d,this,args,eventId,row);
    if(operation!=='appeal'&&!code.locations.includes(d.get('state','location')))throw preconditionFailure('当前不在该案件法典辖区');
    if(operation==='publish'){
        authority(d,this,code,args.authority,'officer');
        if(d.get('state','location')!==code.court)throw preconditionFailure('公示须在登记法院');
        const stage=row.status==='已结案'?'fulfilled':row.appeal?.outcome==='overturned'&&row.judgment?.convicted!==true?'overturned':row.judgment?'conviction':null;
        if(!stage)throw preconditionFailure('没有可公示的裁判或履行记录');
        const notification=recordLegalNotification(d,this,row,stage,eventId,localObservers(d));
        return{case:row.id,published:true,sourceEvent:notification.sourceEvent,note:'仅在场人物获知公示，异地须沿实际渠道传播'};
    }
    if(operation==='appeal'){
        const hierarchy=courtHierarchy(this,d.get('state'),code);
        if(hierarchy&&(code.derived||d.get('state','location')!==code.court)){
            const level=(row.appeals?.length??0)+1,target=hierarchy[level];
            if(!target||row.status!=='已裁定'||row.fineDischarged||row.sentenceCompleted!==undefined)throw preconditionFailure('案件已履行或已终审，不能再次上诉');
            if(d.get('state','location')!==target.court)throw preconditionFailure(`上诉须到${target.name}：${target.court}`);
            const appellate=legalCodeById(this,target.code,d.get('state'));
            const judge=authority(d,this,{...appellate,judges:target.judges},args.authority,'judge');
            if(judge===row.judgment?.judge||row.appeals?.some(a=>a.judge===judge))throw preconditionFailure('原审判者须回避复审');
            advanceWithNpcParticipants(d,this,code.hearingMinutes,eventId,[judge]);
            if(!awake(d.get('state','npcs',judge),d,judge))return{success:false,effectFailed:'复核完成前审判者无法履约'};
            const score=evidenceScore(d,row),upheld=score>=code.evidenceRequired,appeal={level,judge,court:target.court,minute:d.get('state','minute'),evidenceScore:score,outcome:upheld?'upheld':'overturned',originalJudgment:structuredClone(row.judgment)};
            const next={...row,appeal,appeals:[...row.appeals??[],appeal]};
            if(!upheld){
                next.status='证据不足';delete next.judgment;
                for(const[key,lock]of Object.entries(d.get('state','records')))if(lock.category==='legal_custody'&&lock.case===row.id&&lock.status==='生效'){
                    holdingSet(d,null,path(key),{...lock,status:'已结束',ended:d.get('state','minute')},'law');
                    const subject=lock.subject??row.offender;
                    entityTransition(d,this,{id:`${key}:release`,verb:'release',actor:judge,target:subject,location:lock.location,visibility:row.private?'private':row.visibility??'public',summary:`${personName(this,d.get('state'),subject).value??subject}复核后解除羁押`});
                }
            }
            holdingSet(d,null,path(row.id),next,'law');if(!upheld)recordLegalNotification(d,this,next,'overturned',eventId,localObservers(d));
            return{case:row.id,upheld,appeal,final:level===2};
        }
        if(!code.appeal)throw preconditionFailure('该法典未配置复核权限');
        const judge=authority(d,this,{...code,judges:code.appeal.judges},args.authority,'judge');
        if(d.get('state','location')!==code.court||row.status!=='已裁定'||row.fineDischarged||row.sentenceCompleted!==undefined||row.appeal)throw preconditionFailure('案件已履行、已上诉或不在可复核阶段，不能重复判罚');
        advanceWithNpcParticipants(d,this,code.appeal.minutes,eventId,[judge]);
        if(!awake(d.get('state','npcs',judge),d,judge))return{success:false,effectFailed:'复核完成前审判者无法履约'};
        const score=evidenceScore(d,row),upheld=score>=code.evidenceRequired;
        const appeal={judge,minute:d.get('state','minute'),evidenceScore:score,outcome:upheld?'upheld':'overturned',originalJudgment:structuredClone(row.judgment)};
        if(upheld)holdingSet(d,null,path(row.id),{...row,appeal},'law');
        else{
            const next={...row,status:'证据不足',appeal};delete next.judgment;holdingSet(d,null,path(row.id),next,'law');
            const custody=d.get(...path(`legal_custody:${row.id}`));
            if(custody?.status==='生效'){
                holdingSet(d,null,path(`legal_custody:${row.id}`),{...custody,status:'已结束',ended:d.get('state','minute')},'law');
                entityTransition(d,this,{id:`legal_custody:${row.id}:release`,verb:'release',actor:judge,target:'player',location:code.court,visibility:row.private?'private':row.visibility??'public',summary:`${personName(this,d.get('state'),'player').value}复核后解除羁押`});
            }
            recordLegalNotification(d,this,next,'overturned',eventId,localObservers(d));
        }
        return{case:row.id,upheld,appeal,note:'复核不重新收费或重新计算刑期'};
    }
    if(['report','confess'].includes(operation)){
        if(['已结案','服役中','已裁定','待赔偿'].includes(row.status))throw preconditionFailure('案件已进入判罚阶段');
        const receiver=authority(d,this,code,args.authority,'officer'),reporter=operation==='confess'?'player':present(d,this,args.reporter);
        const ownEvidence=row.evidence.find(entry=>entry.kind==='eyewitness'&&entry.witness===reporter);
        if(operation==='report'&&!ownEvidence)throw preconditionFailure('报案者没有亲见本案，不能凭全局记录代为作证');
        if(operation==='report'&&(ownEvidence.disproven||ownEvidence.falseStatement||ownEvidence.invalidatedAt!==undefined||row.witnesses&&!row.witnesses.includes(reporter)||!d.get('state','npcs',reporter,'legalKnowledge')?.some(known=>known.case===row.id&&known.minute<=ownEvidence.minute)))throw preconditionFailure('证词无亲见出处或已经证伪，不能作为证据');
        if(operation==='confess'&&row.evidence.some(entry=>entry.kind==='confession'))throw preconditionFailure('已自认，不重复增加证据');
        if(ownEvidence?.testified)throw preconditionFailure('同一见证不能重复报案增加权重');
        this.advance(d,code.reportMinutes,eventId);
        if(!awake(d.get('state','npcs',receiver),d,receiver))return{success:false,effectFailed:'受理完成前执法人员无法履约'};
        const evidence=operation==='confess'?[...row.evidence,{kind:'confession',subject:'player',minute:d.get('state','minute')}]
            :row.evidence.map(entry=>entry===ownEvidence?{...entry,testified:true,statementAt:d.get('state','minute')}:entry);
        holdingSet(d,null,path(row.id),{...row,evidence,status:'已报案',reported:true,receiver,reportedAt:d.get('state','minute')},'law');knowledge(d,receiver,row.id,d.get('state','minute'));
        return{case:row.id,reported:true,evidenceScore:evidenceScore(d,{...row,evidence}),scope:code.locations,convicted:false};
    }
    if(operation==='search'){
        const officer=authority(d,this,code,args.authority,'officer');if(!row.reported)throw preconditionFailure('未报案，不能依据内部记录搜查');
        this.advance(d,code.searchMinutes,eventId);
        const unit=row.stolen?.unit,record=unit?d.get('state','itemInstances',unit):null;
        const found=Boolean(record?.owner==='player'&&record.status==='持有'&&d.get('state','inventory',record.item,'instances')?.includes(unit));
        if(found&&!row.evidence.some(entry=>entry.kind==='possession'))holdingSet(d,null,path(row.id),{...row,evidence:[...row.evidence,{kind:'possession',unit,officer,minute:d.get('state','minute')}]},'law');
        return{case:row.id,found,unit:found?unit:null,note:'持有相符物只是线索，独立不足以定罪；没有凭空扣押或搬走物品'};
    }
    if(operation==='arrest'){
        const officer=authority(d,this,code,args.authority,'officer');
        if(!row.reported||evidenceScore(d,row)<code.evidenceRequired||!['已报案','证据不足'].includes(row.status))throw preconditionFailure('没有已报案且足够的证据，不能逮捕');
        const custodyKey=`legal_custody:${row.id}`;unique(d,custodyKey);
        const route=this.route(d.get('state','location'),code.court,'walk',now,d.document.randomSeed);
        advanceWithNpcParticipants(d,this,route.minutes,eventId,[officer]);d.set(['state','location'],code.court);d.set(['state','npcs',officer,'location'],code.court);
        if(d.get('state','player','mount'))d.remove(['state','player','mount']);
        holdingSet(d,null,path(custodyKey),{category:'legal_custody',case:row.id,reason:'待审',location:code.court,status:'生效',started:d.get('state','minute'),expires:d.get('state','minute')+code.maximumDetentionMinutes},'law');
        entityTransition(d,this,{id:`${custodyKey}:detain`,verb:'detain',actor:officer,target:'player',location:code.court,visibility:row.private?'private':row.visibility??'public',summary:`${d.get('state','player','name')}已依法羁押待审`});
        return{case:row.id,arrested:true,destination:code.court,route,custody:code.maximumDetentionMinutes};
    }
    if(operation==='hear'){
        if(row.filingVersion===FILING_VERSION&&['convicted','fine','outcome','decision'].some(k=>args[k]!==undefined))throw preconditionFailure('不能替审理人填写裁判');
        const judge=authority(d,this,code,args.authority,'judge');if(d.get('state','location')!==code.court)throw preconditionFailure('必须在登记审理地点开庭');
        if(!row.reported||!['已报案','证据不足'].includes(row.status))throw preconditionFailure('案件未报案或已经裁判');
        this.advance(d,code.hearingMinutes,eventId);
        if(!awake(d.get('state','npcs',judge),d,judge))return{success:false,effectFailed:'审理完成前审判者无法履约'};
        return adjudicateLegalCase(d,this,row,code,judge,eventId,localObservers(d));
    }
    if(operation==='pay'||operation==='compensate'){
        authority(d,this,code,args.authority,'officer');if(d.get('state','location')!==code.court)throw preconditionFailure('判罚资金与返还物须在登记法院交存');
        if(operation==='pay'&&row.status!=='已裁定'||operation==='compensate'&&row.status!=='待赔偿')throw preconditionFailure('当前案件状态不能重复缴纳或改变判罚');
        const payment=deposit(d,this,row,{fine:operation==='pay'?row.judgment.fine:0,compensate:!(row.debt&&(row.compensationPaid||row.compensationDischarged))});
        const owed=row.debt&&payment.compensation?d.get(...path(row.debt)):null;
        if(owed?.category==='debt'&&owed.status!=='已还清')holdingSet(d,null,path(row.debt),{...owed,paid:owed.amount,status:'已还清',paidAt:d.get('state','minute'),settledBy:row.id},'law');
        this.advance(d,10,eventId);holdingSet(d,null,path(row.id),{...row,status:'已结案',finePaid:operation==='pay'?row.judgment.fine:row.finePaid??0,fineDischarged:true,compensationPaid:true,closed:d.get('state','minute')},'law');
        recordLegalNotification(d,this,d.get(...path(row.id)),'fulfilled',eventId,localObservers(d));
        return{case:row.id,...payment,closed:true,note:'罚款已入公库，赔偿或原物已在法院托管；受害人尚未领取，不自动改变其钱袋或异地知情'};
    }
    if(operation==='labor'||operation==='prison'){
        authority(d,this,code,args.authority,'officer');if(d.get('state','location')!==code.court||row.status!=='已裁定')throw preconditionFailure('须在法院对已裁定未履行案件选择服役');
        const key=`legal_sentence:${row.id}`;
        const prior=d.get(...path(key));
        if(prior&&!(prior.category==='legal_custody'&&prior.case===row.id&&prior.status==='已中止'))throw preconditionFailure('服役记录已占用，不能重置或覆盖');
        const minutes=row.remainingSentence?.type===operation?row.remainingSentence.minutes:operation==='labor'?row.judgment.communityMinutes:row.judgment.prisonMinutes;
        holdingSet(d,null,path(key),{category:'legal_custody',case:row.id,reason:operation==='labor'?'劳役':'监禁',location:code.court,status:'生效',started:now,expires:now+minutes},'law');
        entityTransition(d,this,{id:`${eventId}:detain`,verb:'detain',actor:code.id,target:'player',location:code.court,visibility:row.private?'private':row.visibility??'public',summary:`${personName(this,d.get('state'),'player').value}开始${operation==='labor'?'劳役':'监禁'}`});
        holdingSet(d,null,path(row.id),{...row,status:'服役中',sentence:{type:operation,minutes},compensationPaid:row.value===0||Boolean(row.debt&&(row.compensationPaid||row.compensationDischarged))},'law');
        return{case:row.id,sentenceMinutes:minutes,compensationDebt:row.value,note:'刑期由真实世界时间推进，罚款折役；赔偿债务仍保留，不自动造钱或已经完成服役'};
    }
    if(operation==='claim'){
        authority(d,this,code,args.authority,'officer');if(d.get('state','location')!==code.court)throw preconditionFailure('领取须亲自在法院');
        const recipient=args.claimant==='player'?'player':present(d,this,args.claimant);if(recipient!==row.victim)throw preconditionFailure('只有本案受害人可领取，不能擅改受益人');
        const key=`legal_deposit:${row.id}`,escrow=d.get(...path(key));
        if(escrow?.category!=='legal_deposit'||escrow.claimed||escrow.beneficiary!==recipient)throw preconditionFailure('赔偿没有交存或已经领取');
        for(const unit of escrow.units){
            const record=d.get('state','itemInstances',unit);if(record?.owner!==key||record.status!=='保管')throw preconditionFailure('返还物单件不在法院保管，拒绝复制');
            this.itemDelta(d,recipient,record.item,1,{account:placedStock(this,key,record.item),writer:'law',eventId});const bag=[...this.bagPath(recipient),record.item,'instances'];
            d.set(bag,[...d.get(...bag)??[],unit]);holdingSet(d,null,['state','itemInstances',unit],{...record,owner:recipient,status:'持有',legalClaims:(record.legalClaims??[]).filter(claim=>claim.case!==row.id),
                ...(record.stolenOrigin?.victim===recipient?{stolenOrigin:{...record.stolenOrigin,recoveredAt:now,recoveryEvent:eventId}}:{})},'law');
        }
        const bank=row.bank&&d.get(...path(row.bank));
        books(d,fundAccount(key),bank?.category==='bank'?vault(row.bank):purse(this,recipient),escrow.coins,eventId);
        if(bank?.category==='bank')holdingSet(d,null,path(row.bank),{...bank,coins:bank.coins+escrow.coins},'law');
        else {const target=recipient==='player'?['state','player','coins']:['state','npcs',recipient,'coins'];d.set(target,(d.get(...target)??0)+escrow.coins);}
        holdingSet(d,null,path(key),{...escrow,coins:0,units:[],claimed:true,claimedAt:now},'law');knowledge(d,recipient,row.id,now);
        this.advance(d,10,eventId);return{case:row.id,recipient,coins:escrow.coins,units:escrow.units,claimed:true};
    }
    throw preconditionFailure('未登记的法律操作');
}

export function lawView(engine,document){
    const requests=Object.entries(document.state.records??{}).filter(([,r])=>r.category==='legal_request'&&r.actor==='player').map(([id,r])=>({id,kind:r.request.kind,case:r.case,receiver:r.receiver,evidence:r.payload.evidence,sourceEvents:r.payload.sourceEvents,minute:r.minute,accepted:r.accepted??null,...(r.decision?{decision:r.decision}:{})}));
    const code=codeFor(engine,document.state.location,document.state);
    const d={document,get:(...parts)=>parts.reduce((v,k)=>v?.[k],document)};
    const cases=Object.entries(document.state.records??{}).filter(([,row])=>row?.category==='legal_case');
    const notifications=localObservers(d).flatMap(from=>(d.get('state','npcs',from,'memoryStream')??[]).filter(memory=>memory.kind==='law'&&memory.visibility==='public'&&!memory.private&&memory.minute<=document.state.minute&&memory.legalCase).map(memory=>({from,memory:memory.id,case:memory.legalCase,stage:memory.legalStage,sourceType:memory.sourceType,sourceEvent:memory.sourceEvent})));
    const wanted=activeWanted(document.state).filter(w=>w.subject==='player').map(w=>({id:w.id,case:w.case,law:w.law,reason:w.reason,scope:[...w.scope],bounty:w.bounty,reachedHere:wantedReachedAt(engine,w,document.state.location,document.state.minute,document.state)}));
    const bounties=Object.values(document.state.quests??{}).filter(q=>q.bounty&&['公开','进行中'].includes(q.status)&&(q.taker==='player'||q.location===document.state.location))
        .map(q=>({quest:q.id,content:q.content,reward:q.reward,status:q.status,takenBy:q.taker==='player'?'player':q.taker?'他人':null}));
    return{requests,advocates:Object.keys(document.state.npcs??{}).filter(id=>document.state.npcs[id].location===document.state.location).map(id=>advocateService(engine,document.state,id)).filter(Boolean),law:code?structuredClone(code):null,courts:code?courtHierarchy(engine,document.state,code):null,executionAuthority:Boolean(code),reputation:reputationView(document),notifications,wanted,bounties,cases:cases.filter(([,row])=>row.offender==='player'||row.parties?.includes('player')).map(([id,row])=>({id,law:row.law,victim:row.victim,offense:row.offense,status:row.status,reported:row.reported,confessed:row.evidence.some(entry=>entry.kind==='confession'&&entry.subject==='player'),
        settlement:row.settlement??null,faction:row.faction??null,appeal:structuredClone(row.appeal),
        judgment:structuredClone(row.judgment),location:row.location,stolen:structuredClone(row.stolen),documents:row.evidence.filter(e=>e.kind==='document').map(e=>({id:e.document,source:e.source,submittedBy:e.submittedBy,verification:structuredClone(e.verification??null)})),
        wanted:wanted.find(w=>w.case===id)?.id??null,
        note:wanted.some(w=>w.case===id)?'已发通缉：范围内的执法者与知情人会认出你，可自首(confess)或到法院履行':row.reported?'案件已受理，判罚以当前审理结果为准':'执法人员未获报案，不能当作已通缉或定罪'}))};
}
installFacilityRuntime({registerFireDamage});
