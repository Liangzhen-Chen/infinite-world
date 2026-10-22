import {preconditionFailure} from './precondition.mjs';
import {bodyLiving} from './lifecycle-state.mjs';
import {openObligation} from './obligation-runtime.mjs';
import {createHash} from 'node:crypto';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('wildlife-awakening',{sinks:['sink:consume']});
import {assertTrainingRitual} from './training.mjs';
import {spiritOperations,spiritAction,advanceSpiritSocieties,validateSpiritRules,activeForm} from './wildlife-society.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {changeLegacyHoldings} from './transition.mjs';
declareHoldingWriter('wildlife-awakening',{kinds:['tamed_by'],entities:['wreck'],locations:true});

// 灵智（听息、立意）与九阶战力分开：只写 actor.mind，不改等级、体力或模板。
// 年岁按需计算，不为每只野兽每日写账；灵地、随人经历、灵物、点化和时钟各自记来源。
const DAY=1440,clone=v=>structuredClone(v);
const alive=a=>bodyLiving(a)&&a.hp>0;
export const sapient=a=>Boolean(a?.mind?.awakened);
const sources=['experience','place','item','mentor','clock'];
export function awakeningEligible(engine,actor){
    return alive(actor)&&!actor.boss&&!actor.lair&&Boolean(engine.byId.get(actor.species)?.wildlife);
}
function agePoints(engine,seed,id,actor,day){
    const a=engine.rules.wildlifeAwakening.age;
    const initial=createHash('sha256').update(`${seed}:${id}:age`).digest().readUInt32LE(0)%(a.initialMaxDays+1);
    const since=Number.isSafeInteger(actor.since)?Math.floor(actor.since/DAY):actor.mind?.firstDay??day;
    return Math.max(0,Math.min(a.maximumPoints,Math.floor((initial+Math.max(0,day-since)-a.thresholdDays)/a.daysPerPoint)));
}
export function awakeningTotal(engine,seed,id,actor,day){
    return agePoints(engine,seed,id,actor,day)+sources.reduce((n,k)=>n+(actor.mind?.points?.[k]??0),0);
}
const stageRule=(engine,id)=>engine.rules.wildlifeAwakening.stages.find(s=>s.id===id);
export function awakeningView(engine,seed,id,actor,minute){
    if(!engine.rules.wildlifeAwakening||!awakeningEligible(engine,actor))return undefined;
    const stage=sapient(actor)?stageRule(engine,'liyi'):awakeningTotal(engine,seed,id,actor,Math.floor(minute/DAY))>=stageRule(engine,'tingxi').points?stageRule(engine,'tingxi'):null;
    if(!stage)return undefined;
    const form=activeForm(actor,minute);
    return{stage:stage.name,sign:stage.sign,communicable:stage.id==='liyi',...(actor.companion?{companion:clone(actor.companion)}:{}),...(form?{form:form.name}:{}),...(actor.society?{society:actor.society.location}:{})};
}
function blankMind(day){return{version:1,firstDay:day,points:{experience:0,place:0,item:0,mentor:0,clock:0},placeDays:{},sources:[]};}
// 立意保留原身体、伤势、生态来源和遭遇记录；旧宠物归属结束，改为有边界的同意关系，不转为任何人的财产。
function awaken(d,engine,id,kind,minute,sourceEvent){
    const actor=d.get('state','creatures',id),rules=engine.rules.wildlifeAwakening;
    const formerOwner=actor.owner??null,mind={...clone(actor.mind),awakened:{stage:'立意',kind,minute,sourceEvent,formerOwner}};
    holdingSet(d,null,['state','creatures',id,'mind'],mind,'wildlife-awakening');
    if(formerOwner==='player'){
        changeLegacyHoldings(d,engine,{holder:formerOwner,subject:id,kinds:['tamed_by'],reason:'vacated',eventId:sourceEvent},()=>{
        const pet=d.get('state','pets',id);
        if(pet)d.set(['state','pets',id],{...pet,status:'已解除',following:false,ended:minute,endedReason:'立意自主'});
        if(d.get('state','player','mount')===id)d.remove(['state','player','mount']);
        holdingSet(d,null,['state','creatures',id,'owner'],null,'wildlife-awakening');
        holdingSet(d,null,['state','creatures',id,'companion'],{with:'player',consent:true,since:minute,sourceEvent,formerPet:true,terms:clone(rules.pactTerms)},'wildlife-awakening');
        });
    }
    d.say(`${actor.name??id}已立意，能以声响和动作表达意愿，可以交流${formerOwner==='player'?'；原宠物归属已解除，改为双方同意的结缘':''}`);
    return mind.awakened;
}
function settle(d,engine,id,kind,minute,sourceEvent){
    const actor=d.get('state','creatures',id);
    if(sapient(actor)||awakeningTotal(engine,d.document.randomSeed,id,actor,Math.floor(minute/DAY))<stageRule(engine,'liyi').points)return null;
    return awaken(d,engine,id,kind,minute,sourceEvent);
}
// 日结只处理灵地停留与随人经历（受照料的宠物与你同处）；野生个体若无这两项来源则不写任何账。
export function advanceWildlifeAwakening(d,engine,day){
    const rules=engine.rules.wildlifeAwakening;if(!rules)return;
    const minute=(day+1)*DAY,here=d.get('state','location');
    for(const [id,actor]of Object.entries(d.get('state','creatures')??{})){
        if(!awakeningEligible(engine,actor)||sapient(actor)||!actor.location)continue;
        const land=rules.spiritLands.find(l=>l.location===actor.location),companion=actor.owner==='player'&&actor.care?.version===1&&actor.location===here;
        if(!land&&!companion&&!actor.mind)continue;
        const mind=clone(actor.mind??blankMind(day));let changed=false;
        if(land){mind.points.place+=land.pointsPerDay;mind.placeDays[land.location]=(mind.placeDays[land.location]??0)+1;changed=true;}
        if(companion&&mind.points.experience<rules.experience.maximumPoints){mind.points.experience=Math.min(rules.experience.maximumPoints,mind.points.experience+rules.experience.pointsPerDay);changed=true;}
        if(changed)holdingSet(d,null,['state','creatures',id,'mind'],mind,'wildlife-awakening');
        settle(d,engine,id,'natural',minute,`wildlife-awakening:${id}:${day}`);
    }
    advanceSpiritSocieties(d,engine,day);
}
function addSource(d,id,day,kind,points,row){
    const actor=d.get('state','creatures',id),mind=clone(actor.mind??blankMind(day));
    mind.points[kind]+=points;mind.sources.push({kind,points,...row});
    if(kind==='item')mind.lastItemDay=day;if(kind==='mentor')mind.lastMentorDay=day;
    holdingSet(d,null,['state','creatures',id,'mind'],mind,'wildlife-awakening');
}
export function validateWildlifeAwakening(world){
    const r=world.rules.wildlifeAwakening,errors=[];if(!r)return errors;
    const ids=new Set(world.locations.map(l=>l.id)),items=new Set(world.items.map(i=>i.id));
    const int=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
    if(r.version!==1)errors.push('开灵规则版本无效');
    const [t,l]=['tingxi','liyi'].map(id=>r.stages?.find(s=>s.id===id));
    if(!t||!l||!int(t.points,1)||!(l.points>t.points)||r.stages.length!==2)errors.push('开灵阶段须为听息、立意两档且阈值递增');
    if(!['thresholdDays','initialMaxDays','daysPerPoint','maximumPoints'].every(k=>int(r.age?.[k],1))||r.age.maximumPoints+r.experience.maximumPoints>=l?.points)errors.push('年岁与经历参数无效，或不靠灵气即可立意');
    for(const s of r.spiritLands??[])if(!ids.has(s.location)||!int(s.pointsPerDay,1))errors.push(`灵地无效：${s.location}`);
    for(const s of r.spiritItems??[])if(!items.has(s.item)||!int(s.points,1))errors.push(`灵物无效：${s.item}`);
    errors.push(...validateSpiritRules(world));
    if(!int(r.mentor?.points,1)||!int(r.mentor?.minutes,1)||!int(r.clockPoints,1)||!int(r.nurtureMinutes,1)||!int(r.pactMinutes,1)||!r.pactTerms?.length)errors.push('点化、时钟或结缘参数无效');
    return errors;
}
// T109 世界/势力时钟的觉醒效果：只作用于已存在的个体，阶段代价由时钟事务负责回滚。
export const wildlifeAwakeningConsumer=Object.freeze({
    validate(engine,effect){
        if(!engine.rules.wildlifeAwakening)throw Error('当前世界未启用开灵规则，不能推进觉醒效果');
        if(effect.points!==undefined&&!(Number.isSafeInteger(effect.points)&&effect.points>=1&&effect.points<=100))throw Error('觉醒效果点数无效');
    },
    apply(d,engine,effect,context){
        const id=effect.target,actor=d.get('state','creatures',id),minute=context.minute,day=Math.floor(minute/DAY);
        if(!awakeningEligible(engine,actor))return{applied:false,reason:'目标不是普通野兽个体'};
        if(sapient(actor))return{applied:false,reason:'目标已经立意'};
        if(actor.owner&&actor.owner!=='player')return{applied:false,reason:'目标归其他所有者'};
        const points=effect.points??engine.rules.wildlifeAwakening.clockPoints;
        addSource(d,id,day,'clock',points,{minute,event:context.sourceEvent,faction:context.faction??null,settlement:context.settlement??null});
        const awakened=settle(d,engine,id,'clock',minute,context.sourceEvent);
        return{applied:true,target:id,points,stage:awakened?'立意':awakeningView(engine,d.document.randomSeed,id,d.get('state','creatures',id),minute)?.stage??null};
    },
});
// world_wildlife 的 nurture / enlighten / pact；立意后的交谈、跟随、结社与借形在 wildlife-society。观察只读，不在此处。
export const awakeningOperations=['nurture','enlighten','pact',...spiritOperations];
export function awakeningAction(d,args,eventId,target){
    const rules=this.rules.wildlifeAwakening;if(!rules)throw preconditionFailure('当前世界未启用开灵规则');
    if(spiritOperations.includes(args.operation))return spiritAction.call(this,d,args,eventId,target);
    const op=args.operation,actor=d.get('state','creatures',target),start=d.get('state','minute'),day=Math.floor(start/DAY);
    if(!awakeningEligible(this,actor))throw preconditionFailure('需要存活的普通野兽个体');
    if(actor.location!==d.get('state','location'))throw preconditionFailure('动物不在场');
    if(d.get('state','player','status')!=='正常')throw preconditionFailure('你此时无法行动');
    if(actor.owner&&actor.owner!=='player')throw preconditionFailure('动物归其他所有者，不能擅自施为');
    const present=()=>{const a=d.get('state','creatures',target);return alive(a)&&a.location===d.get('state','location')&&d.get('state','player','status')==='正常';};
    if(op==='pact'){
        if(!sapient(actor))throw preconditionFailure('尚未立意，不能以同意结缘；驯养仍走宠物照料');
        if(actor.companion?.with==='player')throw preconditionFailure('已与你结缘');
        if(actor.companion)throw preconditionFailure('它已与别人结缘');
        if(!actor.mind.sources.some(s=>s.by==='player'))throw preconditionFailure('它与你没有往来，不同意结缘');
        this.advance(d,rules.pactMinutes,eventId);
        if(!present())return{success:false,note:'结缘完成前一方离开或失去行动能力'};
        const companion={with:'player',consent:true,since:d.get('state','minute'),sourceEvent:eventId,formerPet:false,terms:clone(rules.pactTerms)};
        if(!this.replaying||this.replayResult?.obligationRuntimeVersion===1){
            const id=`spirit-pact:${eventId}`;
            openObligation(d,this,{id,kind:'pact',debtor:'player',creditor:target,actor:'player',amount:0,subject:target,terms:{boundaries:clone(rules.pactTerms)}},eventId);
            companion.obligation=id;
        }
        holdingSet(d,null,['state','creatures',target,'companion'],companion,'wildlife-awakening');
        return{success:true,target,companion,note:'双方同意的有边界关系，不是宠物或财产'};
    }
    if(sapient(actor))throw preconditionFailure('已经立意；修习改用world_learn的student传授，借形用borrow_form');
    if(op==='nurture'){
        const item=args.item?this.resolve(args.item,'item'):null,spec=rules.spiritItems.find(r=>r.item===item);
        if(!spec)throw preconditionFailure('这不是登记的灵物');
        if(actor.mind?.lastItemDay===day)throw preconditionFailure('今天已喂过灵物，灵气不能叠加');
        if(this.quantity(d,'player',item)<1)throw preconditionFailure('身上没有实际的灵物');
        this.itemDelta(d,'player',item,-1,{flow:'sink:consume',purpose:'nurture',writer:'wildlife-awakening',eventId});this.advance(d,rules.nurtureMinutes,eventId);
        if(!present())return{success:false,spent:{item,quantity:1},note:'灵物已耗去，但动物在喂食完成前离开或你失去行动能力'};
        addSource(d,target,day,'item',spec.points,{minute:d.get('state','minute'),event:eventId,item,by:'player'});
    }else if(op==='enlighten'){
        if(!args.permit)throw preconditionFailure('点化需要有效的仪式主持资格');
        const until=start+rules.mentor.minutes,{entry}=assertTrainingRitual(d,this,args.permit,until);
        if(!entry.ritualOperations.includes(rules.mentor.operation))throw preconditionFailure('师承没有登记灵觉一类的主持范围');
        if(actor.mind?.lastMentorDay===day)throw preconditionFailure('今天已点化过，须隔日再行');
        this.advance(d,rules.mentor.minutes,eventId);
        if(!present())return{success:false,spent:{minutes:rules.mentor.minutes},note:'点化未完成'};
        addSource(d,target,day,'mentor',rules.mentor.points,{minute:d.get('state','minute'),event:eventId,permit:args.permit,institution:entry.institution,by:'player'});
    }else throw preconditionFailure('未知野外操作');
    const awakened=settle(d,this,target,op==='nurture'?'item':'mentor',d.get('state','minute'),eventId);
    const after=d.get('state','creatures',target);
    return{success:true,target,source:op==='nurture'?'item':'mentor',mind:awakeningView(this,d.document.randomSeed,target,after,d.get('state','minute'))??{stage:null},
        ...(awakened?{awakened}:{}),note:'灵智与战力分开；只有实际灵物、灵地、经历或有资格的点化才增长'};
}
