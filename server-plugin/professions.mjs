import {registerAdvanceHook} from './advance-hooks.mjs';
import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead,isEffective} from './lifecycle-state.mjs';
import {purse,sink,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('professions',{sinks:['sink:export']});
import {examineNpc} from './education.mjs';
import {localExamination} from './local-exams.mjs';
import {checkPetCareer}from'./pets.mjs';
import {assertNpcService}from'./npc-schedule.mjs';
import {initiation,ritualOfficiate}from'./training.mjs';
import {npcServices}from'./npc-state.mjs';
import {personCertified}from'./entity-view.mjs';
import {compensateHidden}from'./hidden-passives.mjs';
import {acquireHiddenProfession,variantProgress,professionUltimate,completeProfessionUltimate,careerOf}from'./career-metrics.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {organizationOffices} from './organization-state.mjs';
import {presentWitnesses,publishTransitionEvent,SOCIAL_VERBS} from './world-events.mjs';
declareHoldingWriter('professions',{kinds:['certified','mentor_of','permit'],entities:['office']});
const int=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw preconditionFailure(`${label}不在允许范围`);return value;};
export function effectiveProficiency(d,engine,skill){
    const value=d.get('state','skills',skill,'proficiency')??0;
    if(!certifiedForSkill(d,engine,skill))return Math.min(value,299);
    return value;
}
export function certifiedForSkill(d,engine,skill){
    return personCertified(engine,d.get('state'),'player',skill);
}
export function careerEquipment(state){
    const role=state.professions.combat,history=role?state.careers?.[role]?.promotions??[]:[];
    const attack=history.filter(row=>row.orientation==='attack').length,defense=history.filter(row=>row.orientation==='defense').length;
    return{attack:attack*0.6,defense:defense*0.5,hit:attack*0.002};
}
function validMentor(d,engine,teacher,profession){
    const actor=d.get('state','npcs',teacher),definition=engine.byId.get(teacher);
    if(!actor||isPhysicallyDead(engine,d,teacher)||actor.location!==d.get('state','location')||!npcServices(engine,d.get('state'),teacher).includes(profession))throw preconditionFailure('认证导师不在场或无资格');
    return definition;
}
// advance() may settle rent or other dues before the fee is taken: charge against the balance now, never the entry snapshot.
const spendable=(d,fee)=>{const now=d.get('state','player','coins');if(now<fee)throw preconditionFailure('等待期间钱袋已变化，费用不足');return now-fee;};
export function profession(d,args,id){
    if(args.operation==='examine')return localExamination.call(this,d,args,id);
    if(args.student)return examineNpc(d,this,args,id);
    const role=this.resolve(args.profession,'profession'),catalog=this.byId.get(role),current=d.get('state','professions');
    const operation=args.operation??'certify';
    if(operation==='initiate')return initiation(d,this,args,id);
    if(operation==='ritual_officiate')return ritualOfficiate(d,this,args,id);
    if(operation==='certify'&&catalog.kind==='hidden')return args.choice?compensateHidden(d,this,role,args.choice,id):acquireHiddenProfession(d,this,role,id);
    if(operation==='abandon'){
        if(catalog.kind==='hidden')throw preconditionFailure('隐藏身份的代价按其经历规则处理，不能以普通退职清除');
        if(!(current.combat===role||current.life.includes(role)))throw preconditionFailure('没有这个正式职业');
        if(catalog.kind==='combat')checkPetCareer(d,this,'');
        const fee=int(catalog.abandonFee??catalog.fee*2,0,1e9,'退职费');
        if(d.get('state','player','coins')<fee)throw preconditionFailure('退职费用不足');
        moveCoins(d,{from:purse(this,'player'),to:sink('export','guild'),amount:fee,writer:'professions',eventId:id});
        d.set(['state','player','coins'],d.get('state','player','coins')-fee);
        holdingSet(d,null,['state','professions',catalog.kind],catalog.kind==='combat'?'':current.life.filter(value=>value!==role),'professions');
        d.set(['state','careerFunds',`abandon_${id}`],{role,amount:fee,destination:'职业行会退职账'});
        d.set(['state','careerCooldowns',role],d.get('state','minute')+(catalog.abandonCooldownMinutes??1440));
        d.say(`放弃${catalog.name}，支付${fee}铜；技能熟练度保留，职业核心有效熟练度上限299`);
        return{profession:role,abandoned:true,cost:fee};
    }
    if(!['certify','promote'].includes(operation))throw preconditionFailure('职业操作需为certify、promote或abandon；隐藏身份须完成独立经历');
    if(operation==='certify'&&catalog.kind==='combat')checkPetCareer(d,this,role);
    const teacher=this.resolve(args.teacher,'npc'),mentor=validMentor(d,this,teacher,role),player=d.get('state','player');
    if(player.level<catalog.minimumLevel)throw preconditionFailure(`认证需要至少${catalog.minimumLevel}级`);
    if(catalog.kind!=='combat'&&catalog.kind!=='life')throw preconditionFailure('隐藏职业必须满足独立触发条件');
    if(operation==='promote'){
        if(catalog.kind!=='combat'||current.combat!==role)throw preconditionFailure('需要当前正式战斗职业才能升职');
        const career=careerOf(this,role);
        if(career.ultimate&&[career.ultimate.skill,career.ultimate.name,'ultimate','终极技能'].includes(args.choice)){
            const{rule}=professionUltimate(d,this,role,teacher,mentor,id);
            assertNpcService(d,this,teacher,'teach',rule.minutes);
            const outcome=this.check(d,{attribute:catalog.attribute,skill:rule.requiredSkill,difficulty:rule.difficulty},id);this.advance(d,rule.minutes,id);
            const ultimate=completeProfessionUltimate(d,this,role,teacher,rule,outcome,id);
            return{profession:role,task:rule.task.name,ultimate:ultimate??null,...outcome};
        }
        const history=d.get('state','careers',role,'promotions')??[],step=catalog.promotions?.[history.length];
        if(!step||player.level<step.level)throw preconditionFailure('尚未达到下一次30级升职机会');
        let choice=step.choices.find(row=>row.id===args.choice);
        const variant=choice?null:career.variants?.[history.length]?.find(row=>row.id===args.choice);
        if(variant){
            const progress=variantProgress(this,d.get('state'),variant.variant);
            if(progress<variant.variant.minimum)throw preconditionFailure(`变异路线条件未满足：${variant.variant.description}（当前${progress}/${variant.variant.minimum}）`);
            choice=variant;
        }
        if(!choice)throw preconditionFailure('升职方向不在当前机会目录');
        if((mentor.promotionRanks?.[role]??0)<history.length+1)throw preconditionFailure('导师不具备这一阶升职考核资格');
        if(effectiveProficiency(d,this,choice.requiredSkill)<choice.minimumProficiency)throw preconditionFailure('升职所需技能不足');
        if(player.coins<choice.fee)throw preconditionFailure('升职费用不足');
        assertNpcService(d,this,teacher,'teach',180);
        const outcome=this.check(d,{attribute:catalog.attribute,skill:choice.requiredSkill,difficulty:20},id);this.advance(d,180,id);
        if(outcome.success){
            moveCoins(d,{from:purse(this,'player'),to:purse(this,teacher),amount:choice.fee,writer:'professions',eventId:id});d.set(['state','player','coins'],spendable(d,choice.fee));d.set(['state','npcs',teacher,'coins'],d.get('state','npcs',teacher,'coins')+choice.fee);
            d.set(['state','careers',role,'promotions'],[...history,{...choice,level:step.level,teacher,minute:d.get('state','minute'),source:id}]);
            d.say(`完成${catalog.name}升职：${choice.name}`);
        }
        return{profession:role,promoted:outcome.success,choice:choice.id,...outcome};
    }
    if((d.get('state','careerCooldowns',role)??0)>d.get('state','minute'))throw preconditionFailure('退职后的重新认证等待期尚未结束');
    if(current.combat===role||current.life.includes(role))throw preconditionFailure('已经认证这个职业');
    if(catalog.kind==='combat'&&current.combat)throw preconditionFailure('已有正式战斗职业，需先按规则放弃');
    if(catalog.kind==='life'&&current.life.length>=2)throw preconditionFailure('生活职业名额已满');
    if(player.coins<catalog.fee)throw preconditionFailure('认证费用不足');
    const entry=catalog.entry,task=careerOf(this,role).entryTask;
    if(entry){
        if(catalog.attribute&&player.attributes[catalog.attribute]<(entry.minimumAttribute??0))throw preconditionFailure('入职主属性不足');
        if(effectiveProficiency(d,this,entry.skill)<entry.minimumProficiency)throw preconditionFailure('尚未达到入职手艺或基础技能要求');
    }
    assertNpcService(d,this,teacher,'teach',entry?.minutes??120);
    let application=null;
    // Old event logs must replay without acquiring a new application or fee
    // receipt. New receipts carry the native request reference themselves.
    if(!this.replaying||this.replayResult?.request){
        const state=d.get('state'),office=(this.world.factions??[]).filter(f=>isEffective(this,state,f.id))
            .flatMap(f=>organizationOffices(this,state,f.id,f)).find(o=>o.holder===teacher&&o.seat===state.location&&o.authority?.profession===role&&o.authority.operations?.includes('certify'));
        // The current examining office owns the application, not the reception
        // building or a registrar. Independent masters retain their own requests.
        const institution=office?.organization??mentor.faction??teacher,request=`${id}:certification_request`;
        publishTransitionEvent(d,this,{id:request,sourceEvent:id,tool:'profession',verb:'request',actor:'player',target:institution,
            minute:state.minute,location:state.location,visibility:'witnessed',witnesses:presentWitnesses(state,state.location,['player']),tags:['certification'],
            payload:{kind:'certification',receiver:teacher,...(office?{office:office.id}:{}),terms:{profession:role,...(entry?.skill?{skill:entry.skill}:{})}}});
        application={teacher,institution,request};
    }
    const outcome=this.check(d,{attribute:catalog.attribute??'智力',skill:entry?.skill,difficulty:entry?.difficulty??15},id);this.advance(d,entry?.minutes??120,id);
    if(outcome.success){
        moveCoins(d,{from:purse(this,'player'),to:purse(this,teacher),amount:catalog.fee,writer:'professions',eventId:id});d.set(['state','player','coins'],spendable(d,catalog.fee));d.set(['state','npcs',teacher,'coins'],d.get('state','npcs',teacher,'coins')+catalog.fee);
        holdingSet(d,null,['state','professions',catalog.kind],catalog.kind==='combat'?role:[...current.life,role],'professions');
        d.set(['state','careers',role,'certification'],{teacher,minute:d.get('state','minute'),source:id,...(task?{task:task.name}:{})});
        d.say(`通过${catalog.name}职业认证`);
    }
    return{profession:role,...(application?{...application,cost:outcome.success?catalog.fee:0}:{}),certified:outcome.success,...(task?{entryTask:task.name}:{}),...outcome};
}
// Called through the advance-hook registry by lower layers (dependency inversion).
registerAdvanceHook('effectiveProficiency',effectiveProficiency);
