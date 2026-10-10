import { trackTransferUnit, transferItems, changeItems } from './items.mjs';
import {advanceWithNpcParticipants}from'./npc-schedule.mjs';

const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label}不在允许范围`);return value;};
const path=id=>['state','records',id];
const cases=d=>Object.entries(d.get('state','records')??{}).filter(([,row])=>row?.category==='legal_case');
const alive=actor=>actor&&!['死亡','濒死'].includes(actor.status);
const awake=actor=>alive(actor)&&!['睡眠','熟睡'].includes(actor.activity);
const codeFor=(engine,location)=>engine.rules.law?.codes.find(code=>code.locations.includes(location));
function currentCode(d,engine){const code=codeFor(engine,d.get('state','location'));if(!code)throw new Error('当地尚未登记可执行法典');return code;}
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
function caseRow(d,engine,id){const row=d.get(...path(id));if(row?.category!=='legal_case')throw new Error('案件未登记');const code=engine.rules.law?.codes.find(c=>c.id===row.law);if(!code)throw new Error('案件对应法典不可用');return{row,code};}
function safeFund(d,id,category,extra={}){
    const existing=d.get(...path(id));if(existing&&existing.category!==category)throw new Error('法律资金登记键冲突');
    return existing??{category,coins:0,...extra};
}
function evidenceScore(d,row){
    const witnesses=new Set();let score=0;
    for(const evidence of row.evidence){
        if(evidence.kind==='eyewitness'){
            if(witnesses.has(evidence.witness)||!evidence.testified||!evidence.identified)continue;
            witnesses.add(evidence.witness);score++;
        }else if(evidence.kind==='confession')score+=2;
        else if(evidence.kind==='possession')score+=1;
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
    const row={category:'legal_case',id,law:code.id,offender:'player',victim,offense,value,stolen,
        location:d.get('state','location'),minute:now,status:officer?'已报案':'未报案',reported:Boolean(officer),evidence,
        ...(officer?{receiver:officer,reportedAt:now}:{})};
    if(officer)row.evidence=row.evidence.map(entry=>({...entry,testified:entry.witness===officer}));
    d.set(path(id),row);
    for(const witness of witnesses){
        knowledge(d,witness,id,now);
        if(!relationshipApplied&&witness===victim){
            d.set(['state','npcs',witness,'trust'],Math.max(-100,(d.get('state','npcs',witness,'trust')??0)-5));
            d.set(['state','npcs',witness,'developments'],[...d.get('state','npcs',witness,'developments')??[],{type:'发现财物侵犯',source:eventId,minute:now}]);
        }
    }
    return id;
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
    return{target:victim,case:incident,...result,checkSuccess:result.success,success,stolen,witnesses,
        actionScope:{kind:'theft',reported:d.get(...path(incident),'reported'),
            note:'仅已列目击者知情，异地执法人员尚不自动知道。失败无财物转移；还未审判、缴罚款或监禁。'}};
}

export function recordViolence(d,engine,{victim,damage,killed,intent,eventId}){
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

export function advanceLaw(d,after){
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
        if(row?.category==='legal_case'&&lock.reason!=='待审')d.set(path(lock.case),{...row,status:row.compensationPaid?'已结案':'待赔偿',sentenceCompleted:lock.expires,finePaid:0,fineDischarged:true});
        d.say(lock.reason==='待审'?'羁押期限届满，未审先释放':'刑期或劳役已完成');
    }
}

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
    const {row,code}=caseRow(d,this,args.case),now=d.get('state','minute');
    if(!code.locations.includes(d.get('state','location')))throw new Error('当前不在该案件法典辖区');
    if(['report','confess'].includes(operation)){
        if(['已结案','服役中','已裁定','待赔偿'].includes(row.status))throw new Error('案件已进入判罚阶段');
        const receiver=authority(d,this,code,args.authority,'officer'),reporter=operation==='confess'?'player':present(d,this,args.reporter);
        const ownEvidence=row.evidence.find(entry=>entry.kind==='eyewitness'&&entry.witness===reporter);
        if(operation==='report'&&!ownEvidence)throw new Error('报案者没有亲见本案，不能凭全局记录代为作证');
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
        const penalty=code.penalties[row.offense];if(!penalty)throw new Error('本案罪名没有判罚规则');
        const fine=penalty.baseFine+Math.ceil(row.value*penalty.valueMultiplier);
        const judgment={judge,minute:d.get('state','minute'),fine,compensation:row.value,evidenceScore:score,
            communityMinutes:Math.min(code.maximumSentenceMinutes,fine*code.communityMinutesPerCopper),prisonMinutes:Math.min(code.maximumSentenceMinutes,fine*code.prisonMinutesPerCopper)};
        d.set(path(row.id),{...row,status:'已裁定',judgment});
        const lockKey=`legal_custody:${row.id}`,lock=d.get(...path(lockKey));if(lock?.category==='legal_custody'&&lock.status==='生效')d.set(path(lockKey),{...lock,status:'已结束',ended:d.get('state','minute')});
        const victim={id:row.victim,name:this.byId.get(row.victim)?.name??row.victim};
        return{case:row.id,convicted:true,victim,judgment,fineCalculation:{base:penalty.baseFine,value:row.value,multiplier:penalty.valueMultiplier,total:fine},
            factSummary:`受害人为${victim.name}。罚款=${penalty.baseFine}铜+${row.value}铜×${penalty.valueMultiplier}=${fine}铜；赔偿${row.value}铜另付。社区服役${judgment.communityMinutes}分钟，监禁${judgment.prisonMinutes}分钟。当前没有付款，也没有开始服役。`,
            note:'已裁判，尚未支付或开始服役；选择由玩家明确决定'};
    }
    if(operation==='pay'||operation==='compensate'){
        authority(d,this,code,args.authority,'officer');if(d.get('state','location')!==code.court)throw new Error('判罚资金与返还物须在登记法院交存');
        if(operation==='pay'&&row.status!=='已裁定'||operation==='compensate'&&row.status!=='待赔偿')throw new Error('当前案件状态不能重复缴纳或改变判罚');
        const payment=deposit(d,this,row,{fine:operation==='pay'?row.judgment.fine:0});
        this.advance(d,10,eventId);d.set(path(row.id),{...row,status:'已结案',finePaid:operation==='pay'?row.judgment.fine:row.finePaid??0,fineDischarged:true,compensationPaid:true,closed:d.get('state','minute')});
        return{case:row.id,...payment,closed:true,note:'罚款已入公库，赔偿或原物已在法院托管；受害人尚未领取，不自动改变其钱袋或异地知情'};
    }
    if(operation==='labor'||operation==='prison'){
        authority(d,this,code,args.authority,'officer');if(d.get('state','location')!==code.court||row.status!=='已裁定')throw new Error('须在法院对已裁定未履行案件选择服役');
        const key=`legal_sentence:${row.id}`;
        const prior=d.get(...path(key));
        if(prior&&!(prior.category==='legal_custody'&&prior.case===row.id&&prior.status==='已中止'))throw new Error('服役记录已占用，不能重置或覆盖');
        const minutes=row.remainingSentence?.type===operation?row.remainingSentence.minutes:operation==='labor'?row.judgment.communityMinutes:row.judgment.prisonMinutes;
        d.set(path(key),{category:'legal_custody',case:row.id,reason:operation==='labor'?'劳役':'监禁',location:code.court,status:'生效',started:now,expires:now+minutes});
        d.set(path(row.id),{...row,status:'服役中',sentence:{type:operation,minutes},compensationPaid:row.value===0});
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
        d.set(['state','npcs',recipient,'coins'],d.get('state','npcs',recipient,'coins')+escrow.coins);
        d.set(path(key),{...escrow,coins:0,units:[],claimed:true,claimedAt:now});knowledge(d,recipient,row.id,now);
        this.advance(d,10,eventId);return{case:row.id,recipient,coins:escrow.coins,units:escrow.units,claimed:true};
    }
    throw new Error('未登记的法律操作');
}

export function lawView(engine,document){
    const code=codeFor(engine,document.state.location);
    const d={get:(...parts)=>parts.reduce((v,k)=>v?.[k],document)};
    return{law:code?structuredClone(code):null,cases:cases(d).filter(([,row])=>row.offender==='player').map(([id,row])=>({id,law:row.law,victim:row.victim,offense:row.offense,status:row.status,reported:row.reported,confessed:row.evidence.some(entry=>entry.kind==='confession'&&entry.subject==='player'),
        judgment:structuredClone(row.judgment),location:row.location,stolen:structuredClone(row.stolen),
        note:row.reported?'案件已受理，判罚以当前审理结果为准':'执法人员未获报案，不能当作已通缉或定罪'}))};
}
