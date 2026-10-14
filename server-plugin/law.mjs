import { trackTransferUnit, transferItems, changeItems } from './items.mjs';
import {advanceWithNpcParticipants,assertNpcService}from'./npc-schedule.mjs';
import {shareNpcMemory}from'./npc-cognition.mjs';
import {recordLegalNotification,reputationView}from'./reputation.mjs';
import {recordDisciplineBreach}from'./training.mjs';

const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label}不在允许范围`);return value;};
const path=id=>['state','records',id];
const cases=d=>Object.entries(d.get('state','records')??{}).filter(([,row])=>row?.category==='legal_case');
const alive=actor=>actor&&!['死亡','濒死'].includes(actor.status);
const awake=actor=>alive(actor)&&!['睡眠','熟睡'].includes(actor.activity);
const codeFor=(engine,location)=>engine.rules.law?.codes?.find(code=>code.locations.includes(location));
function currentCode(d,engine){const code=codeFor(engine,d.get('state','location'));if(!code)throw new Error('当地尚未登记可执行法典，无执行权限');return code;}
function unique(d,id){if(d.get(...path(id)))throw new Error('法律登记编号已占用，拒绝覆盖');}
function present(d,engine,name,allowSleeping=false){const id=engine.resolve(name,'npc'),actor=d.get('state','npcs',id);if(!(allowSleeping?alive(actor):awake(actor))||actor.location!==d.get('state','location'))throw new Error('当事人不在场或不能清醒行动');return id;}
function authority(d,engine,code,name,kind){
    const eligible=kind==='judge'?code.judges:[...code.officers,...code.judges];
    if(!name){
        const candidates=eligible.filter(id=>awake(d.get('state','npcs',id))&&d.get('state','npcs',id).location===d.get('state','location'));
        throw new Error(`需要 authority 指定在场${kind==='judge'?'审判者':'执法者'}；候选：${candidates.map(id=>`${engine.byId.get(id)?.name}（${id}）`).join('、')||'无'}`);
    }
    const id=present(d,engine,name);if(!eligible.includes(id))throw new Error('此人没有该法典的执法或审判资格');return id;
}
function caseRow(d,engine,id){const row=d.get(...path(id));if(row?.category!=='legal_case')throw new Error('案件未登记');const code=engine.rules.law?.codes?.find(c=>c.id===row.law);if(!code)throw new Error('案件对应法典不可用，无执行权限');return{row,code};}
function safeFund(d,id,category,extra={}){
    const existing=d.get(...path(id));if(existing&&existing.category!==category)throw new Error('法律资金登记键冲突');
    return existing??{category,coins:0,...extra};
}
function evidenceScore(d,row){
    const witnesses=new Set();let score=0;
    let confessed=false,possessed=false,contracted=false;
    for(const evidence of row.evidence??[]){
        if(evidence.disproven||evidence.falseStatement||evidence.invalidatedAt!==undefined)continue;
        if(evidence.kind==='eyewitness'){
            if(witnesses.has(evidence.witness)||!evidence.testified||!evidence.identified)continue;
            if(row.witnesses&&!row.witnesses.includes(evidence.witness))continue;
            if(!d.get('state','npcs',evidence.witness,'legalKnowledge')?.some(known=>known.case===row.id&&known.source==='亲见或在场受理'&&known.minute<=evidence.minute))continue;
            witnesses.add(evidence.witness);score++;
        }else if(evidence.kind==='confession'&&evidence.subject===row.offender&&!confessed){score+=2;confessed=true;}
        else if(evidence.kind==='possession'&&evidence.unit===row.stolen?.unit&&!possessed&&d.get('state','itemInstances',evidence.unit,'legalClaims')?.some(claim=>claim.case===row.id)){score++;possessed=true;}
        // A signed loan the debtor left unpaid is documentary proof while the debt stands.
        else if(evidence.kind==='contract'&&!contracted){const debt=d.get(...path(evidence.debt));if(debt?.category==='debt'&&debt.defaulted&&debt.status!=='已还清'){score+=2;contracted=true;}}
    }
    return score;
}
function knowledge(d,npc,id,minute){
    const prior=d.get('state','npcs',npc,'legalKnowledge')??[];
    if(!prior.some(row=>row.case===id))d.set(['state','npcs',npc,'legalKnowledge'],[...prior,{case:id,minute,source:'亲见或在场受理'}]);
}
function registerIncident(d,engine,{victim,offense,value=0,stolen=null,witnesses,eventId,relationshipApplied=false}){
    const code=currentCode(d,engine),id=`legal_case:${eventId}`;unique(d,id);
    const now=d.get('state','minute'),evidence=witnesses.map(witness=>({kind:'eyewitness',witness,identified:true,testified:false,minute:now}));
    const officer=witnesses.find(witness=>code.officers.includes(witness));
    const legacyReplay=engine.replaying&&engine.replayResult?.legalProcedureVersion!==1;
    const row={category:'legal_case',id,law:code.id,
        ...(!legacyReplay?{procedureVersion:1,settlement:code.settlement??null,faction:code.faction??null,sourceEvent:eventId,witnesses:[...witnesses]}:{}),offender:'player',victim,offense,value,stolen,
        location:d.get('state','location'),minute:now,status:officer?'已报案':'未报案',reported:Boolean(officer),evidence,
        ...(officer?{receiver:officer,reportedAt:now}:{})};
    if(officer)row.evidence=row.evidence.map(entry=>({...entry,testified:entry.witness===officer}));
    d.set(path(id),row);
    for(const witness of witnesses){
        knowledge(d,witness,id,now);
        if(!relationshipApplied&&witness===victim){
            if(engine.byId.get(witness)?.tier!=='full')d.set(['state','npcs',witness,'trust'],Math.max(-100,(d.get('state','npcs',witness,'trust')??0)-5));
            d.set(['state','npcs',witness,'developments'],[...d.get('state','npcs',witness,'developments')??[],{type:'发现财物侵犯',source:eventId,minute:now}]);
        }
    }
    return id;
}

// A credit default (credit.mjs) is filed by the creditor under the code where the
// contract was signed; the contract is the evidence. No code there, no case.
export function registerCreditDefault(d,engine,{debt,row,value,minute}){
    const code=codeFor(engine,row.location);if(!code)return null;
    const id=`legal_case:default:${debt}`;if(d.get(...path(id)))return id;
    const receiver=code.officers[0];
    d.set(path(id),{category:'legal_case',id,law:code.id,procedureVersion:1,settlement:code.settlement??null,faction:code.faction??null,sourceEvent:row.source,witnesses:[],
        offender:'player',victim:row.keeper??row.creditor,...(row.bank?{bank:row.bank}:{}),debt,offense:'debt_default',value,stolen:null,location:row.location,minute,
        status:'已报案',reported:true,receiver,reportedAt:minute,evidence:[{kind:'contract',debt,minute}]});
    if(d.get('state','npcs',receiver))knowledge(d,receiver,id,minute);
    return id;
}
// Paying the debt itself settles the creditor's claim; a fine already judged stays.
export function settleCreditCase(d,engine,id,eventId){
    const row=d.get(...path(id));if(row?.category!=='legal_case'||!row.debt)return null;
    const now=d.get('state','minute');
    const next=['已报案','证据不足','待赔偿'].includes(row.status)?{...row,status:'已结案',compensationPaid:true,fineDischarged:row.status==='待赔偿'?row.fineDischarged:true,finePaid:row.finePaid??0,closed:now,settledBy:eventId}
        :{...row,compensationPaid:true,compensationSettledBy:eventId};
    d.set(path(id),next);return next;
}

export function crimeAction(d,args,eventId){
    if(args.operation!=='steal')throw new Error('该犯罪方式尚未接入，不能将对话当实际获利');
    const code=currentCode(d,this),victim=present(d,this,args.target,true),actor=d.get('state','npcs',victim);
    const key=`legal_case:${eventId}`;unique(d,key);
    if((args.item===undefined)===(args.coins===undefined))throw new Error('偷窃必须指定一件物品或一笔钱，不能同时指定');
    let item=null,amount=0,value=0;
    if(args.item){
        item=this.resolve(args.item,'item');if(this.quantity(d,victim,item)<1)throw new Error('目标没有这件物品');
        if(args.instance){
            const held=d.get(...this.bagPath(victim),item),unit=d.get('state','itemInstances',args.instance);
            if(!held?.instances?.includes(args.instance)||unit?.owner!==victim||unit.item!==item||unit.status!=='持有')throw new Error('此单件不属于目标实际库存');
        }
        if((this.byId.get(item).weight??0)>this.rules.law.maximumTheftWeightKg)throw new Error('物品过重，不能用这一扒取动作');
        value=this.byId.get(item).basePrice;
    }else{if(args.instance)throw new Error('钱币不能指定物品单件编号');amount=integer(args.coins,1,this.rules.law.maximumTheftCoins,'偷取铜币');if(actor.coins<amount)throw new Error('目标没有这么多钱');value=amount;}
    const result=this.check(d,{attribute:'敏捷',difficulty:15},eventId),witnesses=[];
    for(const[npc,observer]of Object.entries(d.get('state','npcs'))){
        if(!awake(observer)||observer.location!==d.get('state','location')||['睡眠','熟睡'].includes(observer.activity))continue;
        const observed=this.check(d,{attribute:'敏捷',opponent:{npc,attribute:'精神'}},`${eventId}_observation_${npc}`);
        if(!observed.success)witnesses.push(npc);
    }
    this.advance(d,this.rules.law.actionMinutes,eventId);
    const latest=d.get('state','npcs',victim);let stolen=null,success=result.success;
    if(!awake(d.get('state','player'))||!alive(latest)||latest.location!==d.get('state','location')||item&&this.quantity(d,victim,item)<1||!item&&latest.coins<amount)success=false;
    if(success){
        if(item){
            const unit=trackTransferUnit(d,this,victim,item,eventId,args.instance??null);
            transferItems(d,this,victim,'player',item,1,[unit]);
            const record=d.get('state','itemInstances',unit);
            d.set(['state','itemInstances',unit,'legalClaims'],[...record.legalClaims??[],{case:key,victim,minute:d.get('state','minute')}]);
            stolen={item,quantity:1,unit};
        }else{
            d.set(['state','npcs',victim,'coins'],latest.coins-amount);d.set(['state','player','coins'],d.get('state','player','coins')+amount);stolen={coins:amount};
        }
    }
    const incident=registerIncident(d,this,{victim,offense:success?'theft':'theft_attempt',value:success?value:0,stolen,witnesses,eventId});
    if(success)recordDisciplineBreach(d,this,'theft',eventId);
    return{target:victim,case:incident,...result,checkSuccess:result.success,success,stolen,witnesses,
        actionScope:{kind:'theft',reported:d.get(...path(incident),'reported'),
            note:'仅已列目击者知情，异地执法人员尚不自动知道。失败无财物转移；还未审判、缴罚款或监禁。'}};
}

export function recordViolence(d,engine,{victim,damage,killed,intent,eventId}){
    if(damage>0&&['attack','shove'].includes(intent))recordDisciplineBreach(d,engine,'violence',eventId);
    if(!codeFor(engine,d.get('state','location'))||!['attack','shove'].includes(intent))return null;
    const witnesses=Object.entries(d.get('state','npcs')).filter(([,actor])=>awake(actor)&&actor.location===d.get('state','location')).map(([id])=>id);
    return registerIncident(d,engine,{victim,offense:killed?'homicide':damage?'assault':'assault_attempt',witnesses,eventId,relationshipApplied:true});
}

export function enforceLegalRestriction(d,tool,args){
    const lock=Object.values(d.get('state','records')??{}).find(row=>row?.category==='legal_custody'&&row.status==='生效');
    if(!lock)return;
    if(['time','turn','health','revive'].includes(tool)||tool==='law'&&(args.operation??'inspect')==='inspect')return;
    if(tool==='law'&&args.operation==='hear'&&lock.reason==='待审')return;
    throw new Error('当前正在依法羁押或服役，不能自由移动交易或行动；可推进时间或在待审时申请审理');
}

export function advanceLaw(d,after,engine){
    for(const[id,r]of Object.entries(d.get('state','records')??{}))if(r.category==='authorization'&&r.sourceType==='magic_permit'&&!r.revoked&&r.expires<=after)d.set(path(id),{...r,revoked:true,status:'已到期',ended:r.expires});
    for(const[id,lock]of Object.entries(d.get('state','records')??{}))if(lock?.category==='legal_custody'&&lock.status==='生效'&&
        (d.get('state','player','status')==='死亡'||d.get('state','location')!==lock.location)){
        d.set(path(id),{...lock,status:'已中止',ended:after,remaining:Math.max(0,lock.expires-after)});
        const row=d.get(...path(lock.case));
        if(row?.category==='legal_case'&&lock.reason!=='待审')d.set(path(lock.case),{...row,status:'已裁定',
            remainingSentence:{type:lock.reason==='劳役'?'labor':'prison',minutes:Math.max(0,lock.expires-after)}});
        d.say('羁押或服役因死亡/离开登记地点中止；未完成判罚仍保留');
    }
    for(const[id,lock]of Object.entries(d.get('state','records')??{}))if(lock?.category==='legal_custody'&&lock.status==='生效'&&lock.expires<=after){
        d.set(path(id),{...lock,status:'已结束',ended:lock.expires});
        const row=d.get(...path(lock.case));
        if(row?.category==='legal_case'&&lock.reason!=='待审'){
            d.set(path(lock.case),{...row,status:row.compensationPaid?'已结案':'待赔偿',sentenceCompleted:lock.expires,finePaid:0,fineDischarged:true});
            if(engine&&row.compensationPaid)recordLegalNotification(d,engine,d.get(...path(lock.case)),'fulfilled',`${row.id}:sentence:${lock.expires}`,localObservers(d));
        }
        d.say(lock.reason==='待审'?'羁押期限届满，未审先释放':'刑期或劳役已完成');
    }
}

function localObservers(d){return Object.entries(d.get('state','npcs')??{}).filter(([,npc])=>awake(npc)&&npc.location===d.get('state','location')).map(([id])=>id);}

function deposit(d,engine,row,{fine=0,compensate=true}={}){
    const unit=row.stolen?.unit,record=unit?d.get('state','itemInstances',unit):null;
    const returnUnit=Boolean(compensate&&record?.owner==='player'&&record.status==='持有'&&d.get('state','inventory',record.item,'instances')?.includes(unit));
    const compensation=compensate?returnUnit?0:row.value:0,total=fine+compensation;
    if(d.get('state','player','coins')<total)throw new Error('余额不足支付罚款和赔偿；可以选择劳役或服刑处理罚款，赔偿债务仍保留');
    const treasuryKey=`legal_treasury:${row.law}`,escrowKey=`legal_deposit:${row.id}`;
    const treasury=safeFund(d,treasuryKey,'legal_treasury',{law:row.law}),escrow=safeFund(d,escrowKey,'legal_deposit',{case:row.id,beneficiary:row.victim,units:[]});
    d.set(['state','player','coins'],d.get('state','player','coins')-total);
    if(fine)d.set(path(treasuryKey),{...treasury,coins:treasury.coins+fine});
    if(compensate){
        const units=[...escrow.units];
        if(returnUnit){
            changeItems(d,engine,'player',record.item,-1,{preserve:true,selection:[unit]});
            d.set(['state','itemInstances',unit],{...record,owner:escrowKey,status:'保管'});units.push(unit);
        }
        d.set(path(escrowKey),{...escrow,coins:escrow.coins+compensation,units});
    }
    return{cost:total,fine,compensation,returnedUnit:returnUnit?unit:null,deposit:compensate?escrowKey:null};
}

export function lawAction(d,args,eventId){
    const operation=args.operation??'inspect';
    if(operation==='inspect')return lawView(this,d.document);
    if(operation==='grant_magic_permit'){
        unique(d,`magic_permission:${eventId}`);
        const code=currentCode(d,this),location=this.resolve(args.location),issuer=present(d,this,args.authority);
        if(location!==d.get('state','location')||!code.locations.includes(location)||args.subject!=='player'||args.action!=='mental_magic')throw Error('施法许可只限当前法域、在场申请人与登记用途');
        const delegation=code.magicAuthorities?.find(a=>a.npc===issuer&&a.locations.includes(location)&&a.actions.includes(args.action));
        if(!delegation&&!code.officers.includes(issuer)&&!code.judges.includes(issuer))throw Error('机构或当事人没有颁发此施法许可的权限');
        const duration=integer(args.minutes,1,delegation?.maximumMinutes??1440,'施法许可期限'),fee=integer(delegation?.fee??2,0,1e9,'施法许可费用');
        if(delegation)assertNpcService(d,this,issuer,'teach',5);
        if(d.get('state','player','coins')<fee)throw Error('施法许可费用不足');
        if(['昏迷','患病'].includes(d.get('state','npcs',issuer,'status')))throw Error('许可颁发者不能清醒办理');
        advanceWithNpcParticipants(d,this,5,eventId,[issuer]);
        if(d.get('state','player','coins')<fee)throw Error('办理期间余额不足支付施法许可费用');
        d.set(['state','player','coins'],d.get('state','player','coins')-fee);
        d.set(['state','npcs',issuer,'coins'],d.get('state','npcs',issuer,'coins')+fee);
        const key=`magic_permission:${eventId}`,now=d.get('state','minute'),permission={category:'authorization',action:args.action,subject:'player',grantee:'player',grantor:issuer,location,law:code.id,createdAt:now,expires:now+duration,revoked:false,sourceType:'magic_permit',sourceEvent:eventId};
        d.set(path(key),permission);d.set(path(`magic_permission_source:${eventId}`),{permission:structuredClone(permission)});
        return{permit:key,permission,cost:fee,minutes:5};
    }
    const {row,code}=caseRow(d,this,args.case),now=d.get('state','minute');
    if(operation==='notify'){
        const from=this.resolve(args.from,'npc'),to=this.resolve(args.to,'npc');
        if(d.get('state','npcs',from,'location')!==d.get('state','location'))throw new Error('须向在场传话者提出携信或转述请求');
        const memory=d.get('state','npcs',from,'memoryStream')?.find(m=>m.id===args.memory&&m.legalCase===row.id);
        if(!memory)throw new Error('传话者没有本案的个人法律消息');
        return shareNpcMemory(d,this,{from,to,memoryId:memory.id,channel:args.channel??'carry',eventId});
    }
    if(!code.locations.includes(d.get('state','location')))throw new Error('当前不在该案件法典辖区');
    if(operation==='publish'){
        authority(d,this,code,args.authority,'officer');
        if(d.get('state','location')!==code.court)throw new Error('公示须在登记法院');
        const stage=row.status==='已结案'?'fulfilled':row.judgment?'conviction':row.appeal?.outcome==='overturned'?'overturned':null;
        if(!stage)throw new Error('没有可公示的裁判或履行记录');
        const notification=recordLegalNotification(d,this,row,stage,eventId,localObservers(d));
        return{case:row.id,published:true,sourceEvent:notification.sourceEvent,note:'仅在场人物获知公示，异地须沿实际渠道传播'};
    }
    if(operation==='appeal'){
        if(!code.appeal)throw new Error('该法典未配置复核权限');
        const judge=authority(d,this,{...code,judges:code.appeal.judges},args.authority,'judge');
        if(d.get('state','location')!==code.court||row.status!=='已裁定'||row.fineDischarged||row.sentenceCompleted!==undefined||row.appeal)throw new Error('案件已履行、已上诉或不在可复核阶段，不能重复判罚');
        advanceWithNpcParticipants(d,this,code.appeal.minutes,eventId,[judge]);
        if(!awake(d.get('state','npcs',judge)))return{success:false,effectFailed:'复核完成前审判者无法履约'};
        const score=evidenceScore(d,row),upheld=score>=code.evidenceRequired;
        const appeal={judge,minute:d.get('state','minute'),evidenceScore:score,outcome:upheld?'upheld':'overturned',originalJudgment:structuredClone(row.judgment)};
        if(upheld)d.set(path(row.id),{...row,appeal});
        else{
            const next={...row,status:'证据不足',appeal};delete next.judgment;d.set(path(row.id),next);
            const custody=d.get(...path(`legal_custody:${row.id}`));
            if(custody?.status==='生效')d.set(path(`legal_custody:${row.id}`),{...custody,status:'已结束',ended:d.get('state','minute')});
            recordLegalNotification(d,this,next,'overturned',eventId,localObservers(d));
        }
        return{case:row.id,upheld,appeal,note:'复核不重新收费或重新计算刑期'};
    }
    if(['report','confess'].includes(operation)){
        if(['已结案','服役中','已裁定','待赔偿'].includes(row.status))throw new Error('案件已进入判罚阶段');
        const receiver=authority(d,this,code,args.authority,'officer'),reporter=operation==='confess'?'player':present(d,this,args.reporter);
        const ownEvidence=row.evidence.find(entry=>entry.kind==='eyewitness'&&entry.witness===reporter);
        if(operation==='report'&&!ownEvidence)throw new Error('报案者没有亲见本案，不能凭全局记录代为作证');
        if(operation==='report'&&(ownEvidence.disproven||ownEvidence.falseStatement||ownEvidence.invalidatedAt!==undefined||row.witnesses&&!row.witnesses.includes(reporter)||!d.get('state','npcs',reporter,'legalKnowledge')?.some(known=>known.case===row.id&&known.minute<=ownEvidence.minute)))throw new Error('证词无亲见出处或已经证伪，不能作为证据');
        if(operation==='confess'&&row.evidence.some(entry=>entry.kind==='confession'))throw new Error('已自认，不重复增加证据');
        if(ownEvidence?.testified)throw new Error('同一见证不能重复报案增加权重');
        this.advance(d,code.reportMinutes,eventId);
        if(!awake(d.get('state','npcs',receiver)))return{success:false,effectFailed:'受理完成前执法人员无法履约'};
        const evidence=operation==='confess'?[...row.evidence,{kind:'confession',subject:'player',minute:d.get('state','minute')}]
            :row.evidence.map(entry=>entry===ownEvidence?{...entry,testified:true,statementAt:d.get('state','minute')}:entry);
        d.set(path(row.id),{...row,evidence,status:'已报案',reported:true,receiver,reportedAt:d.get('state','minute')});knowledge(d,receiver,row.id,d.get('state','minute'));
        return{case:row.id,reported:true,evidenceScore:evidenceScore(d,{...row,evidence}),scope:code.locations,convicted:false};
    }
    if(operation==='search'){
        const officer=authority(d,this,code,args.authority,'officer');if(!row.reported)throw new Error('未报案，不能依据内部记录搜查');
        this.advance(d,code.searchMinutes,eventId);
        const unit=row.stolen?.unit,record=unit?d.get('state','itemInstances',unit):null;
        const found=Boolean(record?.owner==='player'&&record.status==='持有'&&d.get('state','inventory',record.item,'instances')?.includes(unit));
        if(found&&!row.evidence.some(entry=>entry.kind==='possession'))d.set(path(row.id),{...row,evidence:[...row.evidence,{kind:'possession',unit,officer,minute:d.get('state','minute')}]});
        return{case:row.id,found,unit:found?unit:null,note:'持有相符物只是线索，独立不足以定罪；没有凭空扣押或搬走物品'};
    }
    if(operation==='arrest'){
        const officer=authority(d,this,code,args.authority,'officer');
        if(!row.reported||evidenceScore(d,row)<code.evidenceRequired||!['已报案','证据不足'].includes(row.status))throw new Error('没有已报案且足够的证据，不能逮捕');
        const custodyKey=`legal_custody:${row.id}`;unique(d,custodyKey);
        const route=this.route(d.get('state','location'),code.court,'walk',now,d.document.randomSeed);
        advanceWithNpcParticipants(d,this,route.minutes,eventId,[officer]);d.set(['state','location'],code.court);d.set(['state','npcs',officer,'location'],code.court);
        if(d.get('state','player','mount'))d.remove(['state','player','mount']);
        d.set(path(custodyKey),{category:'legal_custody',case:row.id,reason:'待审',location:code.court,status:'生效',started:d.get('state','minute'),expires:d.get('state','minute')+code.maximumDetentionMinutes});
        return{case:row.id,arrested:true,destination:code.court,route,custody:code.maximumDetentionMinutes};
    }
    if(operation==='hear'){
        const judge=authority(d,this,code,args.authority,'judge');if(d.get('state','location')!==code.court)throw new Error('必须在登记审理地点开庭');
        if(!row.reported||!['已报案','证据不足'].includes(row.status))throw new Error('案件未报案或已经裁判');
        const score=evidenceScore(d,row);this.advance(d,code.hearingMinutes,eventId);
        if(!awake(d.get('state','npcs',judge)))return{success:false,effectFailed:'审理完成前审判者无法履约'};
        if(score<code.evidenceRequired){d.set(path(row.id),{...row,status:'证据不足'});return{case:row.id,convicted:false,evidenceScore:score};}
        const penalty=code.penalties[row.offense]??(row.offense==='debt_default'?this.rules.economy?.credit?.loan?.defaultPenalty:undefined);if(!penalty)throw new Error('本案罪名没有判罚规则');
        const fine=penalty.baseFine+Math.ceil(row.value*penalty.valueMultiplier);
        const judgment={judge,minute:d.get('state','minute'),fine,compensation:row.value,evidenceScore:score,
            communityMinutes:Math.min(code.maximumSentenceMinutes,fine*code.communityMinutesPerCopper),prisonMinutes:Math.min(code.maximumSentenceMinutes,fine*code.prisonMinutesPerCopper)};
        d.set(path(row.id),{...row,status:'已裁定',judgment});
        recordLegalNotification(d,this,d.get(...path(row.id)),'conviction',eventId,localObservers(d),{fresh:true});
        const lockKey=`legal_custody:${row.id}`,lock=d.get(...path(lockKey));if(lock?.category==='legal_custody'&&lock.status==='生效')d.set(path(lockKey),{...lock,status:'已结束',ended:d.get('state','minute')});
        const victim={id:row.victim,name:this.byId.get(row.victim)?.name??row.victim};
        return{case:row.id,convicted:true,victim,judgment,fineCalculation:{base:penalty.baseFine,value:row.value,multiplier:penalty.valueMultiplier,total:fine},
            factSummary:`受害人为${victim.name}。罚款=${penalty.baseFine}铜+${row.value}铜×${penalty.valueMultiplier}=${fine}铜；赔偿${row.value}铜另付。社区服役${judgment.communityMinutes}分钟，监禁${judgment.prisonMinutes}分钟。当前没有付款，也没有开始服役。`,
            note:'已裁判，尚未支付或开始服役；选择由玩家明确决定'};
    }
    if(operation==='pay'||operation==='compensate'){
        authority(d,this,code,args.authority,'officer');if(d.get('state','location')!==code.court)throw new Error('判罚资金与返还物须在登记法院交存');
        if(operation==='pay'&&row.status!=='已裁定'||operation==='compensate'&&row.status!=='待赔偿')throw new Error('当前案件状态不能重复缴纳或改变判罚');
        const payment=deposit(d,this,row,{fine:operation==='pay'?row.judgment.fine:0,compensate:!(row.debt&&row.compensationPaid)});
        const owed=row.debt&&payment.compensation?d.get(...path(row.debt)):null;
        if(owed?.category==='debt'&&owed.status!=='已还清')d.set(path(row.debt),{...owed,paid:owed.amount,status:'已还清',paidAt:d.get('state','minute'),settledBy:row.id});
        this.advance(d,10,eventId);d.set(path(row.id),{...row,status:'已结案',finePaid:operation==='pay'?row.judgment.fine:row.finePaid??0,fineDischarged:true,compensationPaid:true,closed:d.get('state','minute')});
        recordLegalNotification(d,this,d.get(...path(row.id)),'fulfilled',eventId,localObservers(d));
        return{case:row.id,...payment,closed:true,note:'罚款已入公库，赔偿或原物已在法院托管；受害人尚未领取，不自动改变其钱袋或异地知情'};
    }
    if(operation==='labor'||operation==='prison'){
        authority(d,this,code,args.authority,'officer');if(d.get('state','location')!==code.court||row.status!=='已裁定')throw new Error('须在法院对已裁定未履行案件选择服役');
        const key=`legal_sentence:${row.id}`;
        const prior=d.get(...path(key));
        if(prior&&!(prior.category==='legal_custody'&&prior.case===row.id&&prior.status==='已中止'))throw new Error('服役记录已占用，不能重置或覆盖');
        const minutes=row.remainingSentence?.type===operation?row.remainingSentence.minutes:operation==='labor'?row.judgment.communityMinutes:row.judgment.prisonMinutes;
        d.set(path(key),{category:'legal_custody',case:row.id,reason:operation==='labor'?'劳役':'监禁',location:code.court,status:'生效',started:now,expires:now+minutes});
        d.set(path(row.id),{...row,status:'服役中',sentence:{type:operation,minutes},compensationPaid:row.value===0||Boolean(row.debt&&row.compensationPaid)});
        return{case:row.id,sentenceMinutes:minutes,compensationDebt:row.value,note:'刑期由真实世界时间推进，罚款折役；赔偿债务仍保留，不自动造钱或已经完成服役'};
    }
    if(operation==='claim'){
        authority(d,this,code,args.authority,'officer');if(d.get('state','location')!==code.court)throw new Error('领取须亲自在法院');
        const recipient=present(d,this,args.claimant);if(recipient!==row.victim)throw new Error('只有本案受害人可领取，不能擅改受益人');
        const key=`legal_deposit:${row.id}`,escrow=d.get(...path(key));
        if(escrow?.category!=='legal_deposit'||escrow.claimed)throw new Error('赔偿没有交存或已经领取');
        for(const unit of escrow.units){
            const record=d.get('state','itemInstances',unit);if(record?.owner!==key||record.status!=='保管')throw new Error('返还物单件不在法院保管，拒绝复制');
            this.itemDelta(d,recipient,record.item,1);const bag=[...this.bagPath(recipient),record.item,'instances'];
            d.set(bag,[...d.get(...bag)??[],unit]);d.set(['state','itemInstances',unit],{...record,owner:recipient,status:'持有',legalClaims:(record.legalClaims??[]).filter(claim=>claim.case!==row.id)});
        }
        const bank=row.bank&&d.get(...path(row.bank));
        if(bank?.category==='bank')d.set(path(row.bank),{...bank,coins:bank.coins+escrow.coins});
        else d.set(['state','npcs',recipient,'coins'],d.get('state','npcs',recipient,'coins')+escrow.coins);
        d.set(path(key),{...escrow,coins:0,units:[],claimed:true,claimedAt:now});knowledge(d,recipient,row.id,now);
        this.advance(d,10,eventId);return{case:row.id,recipient,coins:escrow.coins,units:escrow.units,claimed:true};
    }
    throw new Error('未登记的法律操作');
}

export function lawView(engine,document){
    const code=codeFor(engine,document.state.location);
    const d={get:(...parts)=>parts.reduce((v,k)=>v?.[k],document)};
    const notifications=localObservers(d).flatMap(from=>(d.get('state','npcs',from,'memoryStream')??[]).filter(memory=>memory.kind==='law'&&memory.visibility==='public'&&!memory.private&&memory.minute<=document.state.minute&&memory.legalCase).map(memory=>({from,memory:memory.id,case:memory.legalCase,stage:memory.legalStage,sourceType:memory.sourceType,sourceEvent:memory.sourceEvent})));
    return{law:code?structuredClone(code):null,executionAuthority:Boolean(code),reputation:reputationView(document),notifications,cases:cases(d).filter(([,row])=>row.offender==='player').map(([id,row])=>({id,law:row.law,victim:row.victim,offense:row.offense,status:row.status,reported:row.reported,confessed:row.evidence.some(entry=>entry.kind==='confession'&&entry.subject==='player'),
        settlement:row.settlement??null,faction:row.faction??null,appeal:structuredClone(row.appeal),
        judgment:structuredClone(row.judgment),location:row.location,stolen:structuredClone(row.stolen),
        note:row.reported?'案件已受理，判罚以当前审理结果为准':'执法人员未获报案，不能当作已通缉或定罪'}))};
}
