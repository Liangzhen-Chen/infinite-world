import {preconditionFailure} from './precondition.mjs';
import {learnWithInitialKnowledge} from './primitives-learning.mjs';
export {activityTeachingConsent} from './primitives-learning.mjs';
import {reject} from './action-rejection.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('learning');
import {educationAction} from './education.mjs';
import {personTeaching} from './entity-view.mjs';
import {effectiveProficiency,certifiedForSkill}from'./professions.mjs';
import {assertNpcService}from'./npc-schedule.mjs';
import {teachNpc}from'./npc-growth.mjs';
import {spiritStudent,teachSpirit}from'./wildlife-society.mjs';
import {growIntelligence,GROWTH_POINTS}from'./npc-intelligence.mjs';
import {heldBookGrade}from'./works.mjs';
import {consent} from './action-consent.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {obligationClosed} from './obligation-state.mjs';
import {openObligation,closeObligation} from './obligation-runtime.mjs';
const integer=(value,label,maximum=1e9)=>{if(!Number.isSafeInteger(value)||value<0||value>maximum)throw preconditionFailure(`${label}不在允许范围`);return value;};
const grades=['初级','中级','高级','特级','专家级','大师级','宗师级','圣级','神级'];
const grade=value=>`${grades[Math.min(8,Math.floor(value/300))]}${Math.floor(value%300/100)+1}等`;

// Native callers supply the actual teacher, subject, price and duration after
// qualification checks. A caller's consent flag is never a teaching source.
export function teachingConsent(d,engine,{teacher,student='player',subject,minutes,fee=0,eventId}){
    const state=d.get('state'),until=state.minute+minutes;
    const permission=consent({engine,document:d.document},teacher,student,'teach',{purpose:subject,until,onRefusal:'abort'});
    if(permission.allowed)return permission;
    const service=Object.values(state.obligations??{}).find(o=>(o.kind??o.obligationKind)==='service'&&o.debtor===teacher&&o.creditor===student&&!obligationClosed(o)&&o.endedAt===undefined&&!o.revoked&&(o.start??o.createdAt??0)<=state.minute&&(o.deadline??o.until??Infinity)>=until&&(o.subject===subject||o.terms?.subject===subject));
    if(service)return {allowed:true,kind:'service',source:service.id,check:null,tags:[]};
    const decision=npcDecision(subjectiveView(engine,d.document,teacher),{kind:'teach',from:student,tags:[subject],cost:{minutes},reward:fee});
    return {allowed:decision.outcome==='agree',kind:'decision',source:eventId,decision,reason:decision.reason,check:decision.outcome==='agree'?null:'abort',tags:[]};
}

export function learn(d,args,id){
 return learnWithInitialKnowledge(d,this,args,id,()=>learnNative.call(this,d,args,id));
}
function learnNative(d,args,id){
    if(args.operation)return educationAction.call(this,d,args,id);
    if(args.student!==undefined){
        const spirit=spiritStudent(d,args.student);if(!spirit)return teachNpc(d,this,args,id);
        // 已立意的精怪与人物共用灵智等级：教导同样使其成长。
        const result=teachSpirit(d,this,args,id,spirit);
        if(result.success)growIntelligence(d,this,spirit,result.kind==='recipe'?GROWTH_POINTS.teachRecipe:GROWTH_POINTS.teachSkill,'教导',id);
        return result;
    }
    let entity;
    try{entity=this.resolve(args.entity,args.kind);}catch(error){
        // Old calls used a spell's display name; its associated skill can
        // carry the same name. Explicit kind remains authoritative.
        if(args.kind||!error.message.includes('歧义'))throw error;
        entity=this.resolve(args.entity,'spell');
    }
    const catalog=this.byId.get(entity);
    const kind=entity.split('_')[0];
    if(!['spell','skill','recipe'].includes(kind)||args.kind&&args.kind!==kind)throw preconditionFailure('学习类型必须与目录一致');
    const partition={spell:'spells',skill:'skills',recipe:'recipes'}[kind];
    const skill=kind==='skill'?catalog:this.byId.get(catalog.skill);
    if(!skill)throw preconditionFailure('学习内容缺少关联技能');
    const requirements=[...catalog.prerequisites??[],...skill.prerequisites??[]];
    for(const requirement of requirements){
        const requirementId=typeof requirement==='string'?requirement:requirement.skill;
        const minimum=typeof requirement==='string'?1:requirement.minimum;
        if(effectiveProficiency(d,this,requirementId)<minimum)throw preconditionFailure(`前置技能不足：${this.byId.get(requirementId)?.name??requirementId}`);
    }
    const stage=integer(catalog.stage??(kind==='recipe'?Math.floor((catalog.minimumProficiency??0)/300):skill.stage??0),'内容阶段');
    if(stage>8)throw preconditionFailure('内容阶段超过技能上限');
    if(kind==='spell'){
        const band=this.rules.magic.stageMpRanges[stage];
        if(!band||catalog.mp<band[0]||catalog.mp>band[1])throw preconditionFailure('法术消耗不符合阶段目录');
    }
    const roles=d.get('state','professions'),certified=[roles.combat,...roles.life,...roles.hidden];
    if(stage>0&&!certifiedForSkill(d,this,skill.id))throw preconditionFailure('高阶职业内容需要相关职业认证');
    // Shared traditions retain the existing mage path. Alternative routes must
    // demonstrate their own foundation before studying an advanced formula.
    if(stage>0&&skill.learningProfessions&&!certified.includes(skill.profession)){
        const route=skill.learningProfessions.find(role=>certified.includes(role));
        const foundation=this.byId.get(route)?.entry?.skill;
        if(!foundation||effectiveProficiency(d,this,foundation)<stage*300)throw preconditionFailure('共享术式所需路线基础熟练度不足');
    }
    const project=d.get('state','projects',args.source);
    const sourceInstance=d.get('state','itemInstances',args.source);
    const source=project?args.source:sourceInstance?.item??this.resolve(args.source),sourceDefinition=this.byId.get(source);
    let sourceRecord,fee=0,minutes,course,courseKey;
    if(project){
        if(project.type!=='研究'||project.stage!=='打磨'||catalog.source!==source||!d.get('state','created',entity)
            ||project.result!==entity)throw preconditionFailure('研究项目不是这项已登记成果的完成来源');
        minutes=integer(catalog.learnMinutes??120,'研习时间',43200);
        sourceRecord={type:'research',id:source};
    }else if(source.startsWith('npc_')){
        if(kind==='spell'&&stage>=4)throw preconditionFailure('专家级以上法术只能通过研究或稀有典籍获得');
        const npc=d.get('state','npcs',source);
        if(!npc||npc.location!==d.get('state','location'))throw preconditionFailure('导师不在场');
        if(isPhysicallyDead(this,d,source))throw preconditionFailure('导师已经死亡');
        if(!personTeaching(this,d.get('state'),source,entity,{stage}))reject('E-ACTION-TEACHER','导师没有教授这项内容的资格',{missing:['需要具备教授该内容资格的导师'],repair:['寻找能教授该内容且在场的导师']});
        fee=integer(catalog.learnFee??12,'教学费');minutes=integer(catalog.learnMinutes??120,'教学时间',43200);
        if(catalog.learnDays){
            const days=integer(catalog.learnDays,'授课天数',30);if(days<2)throw preconditionFailure('分段课程至少两天');
            courseKey=`teaching-course:${source}:${entity}`;course=d.get('state','records',courseKey);
            // A completed course may fail its final acquisition check, just
            // like a native lesson. A new paid course remains possible;
            // previous lesson facts and the closed service stay in the log.
            if(course?.completedAt!==undefined&&course.completedAt!==null&&!d.get('state',partition,entity))course=null;
            minutes=Math.ceil(minutes/days);
            if(course){
                const service=d.get('state','obligations',course.service);
                if(!service||obligationClosed(service)||service.endedAt!==undefined||service.revoked)throw preconditionFailure('授课服务已终止');
                if((service.deadline??Infinity)<d.get('state','minute')+minutes)throw preconditionFailure('授课服务已到期');
                if(Math.floor(d.get('state','minute')/1440)<course.nextDay)throw preconditionFailure('下一课须到下一授课日');
                fee=0;
            }
        }
        assertNpcService(d,this,source,'teach',minutes);
        if(d.get('state','player','coins')<fee)throw preconditionFailure('教学费不足');
        const permission=teachingConsent(d,this,{teacher:source,subject:entity,minutes,fee,eventId:id});
        if(!permission.allowed)throw preconditionFailure(`导师未同意授课：${permission.reason}`);
        sourceRecord={type:'teacher',id:source,consent:permission};
    }else if(source.startsWith('item_')){
        if(this.quantity(d,'player',source)<1)throw preconditionFailure('没有这本书');
        if(d.get('state','inventory',source,'durability')===0)throw preconditionFailure('书页已损坏，不能作为完整学习来源');
        const held=sourceInstance?{unit:sourceInstance,index:this.rules.books.grades.indexOf(sourceInstance.book?.grade)}:heldBookGrade(d,this,source);
        if(sourceInstance&&(sourceInstance.owner!=='player'||sourceInstance.status!=='持有'||sourceInstance.durability===0))throw preconditionFailure('没有完好的这册书');
        const book=held?.unit?.book?.teaches?{...sourceDefinition.book,...held.unit.book}:sourceDefinition.book;
        if(!book||!(book.teaches??[]).includes(entity))throw preconditionFailure('这本书没有所需学习内容');
        // A copy carries its own grade, never above its original (works.mjs).
        const copied=held?.unit?.book,bookStage=copied?held.index:this.rules.books.grades.indexOf(book.grade);
        if(bookStage<0||bookStage<Math.min(stage,4))throw preconditionFailure('书籍品级不足或未登记');
        if(kind==='spell'&&stage>=4&&book.rare!==true)throw preconditionFailure('专家级以上法术需要稀有典籍');
        if((d.get('state','skills','skill_literacy','proficiency')??0)<this.rules.books.minimumLiteracy)throw preconditionFailure('识字熟练度不足以阅读技能书');
        for(const requirement of book.prerequisites??[]){
            const requirementId=typeof requirement==='string'?requirement:requirement.skill,minimum=typeof requirement==='string'?1:requirement.minimum;
            if(effectiveProficiency(d,this,requirementId)<minimum)throw preconditionFailure('未满足书籍前置技能');
        }
        minutes=integer(Math.max(book.readingMinutes??0,this.rules.books.readingMinutes[bookStage]),'阅读时间',43200);
        sourceRecord={type:'book',id:source,author:book.author,edition:book.edition,...(copied?{copy:{instance:held.unit.id,grade:copied.grade,edition:copied.edition,chain:copied.chain}}:{})};
    }else throw preconditionFailure('学习需要合格导师、实际持有的技能书或对应的已登记研究成果');
    if(d.get('state',partition,entity))reject('E-ACTION-ALREADY-KNOWN',`已经学会${catalog.name}`,{missing:[`已经掌握${catalog.name}，无需重复学习`],repair:['选择尚未学会的内容，或练习已掌握的技能']});
    if(minutes<1)throw preconditionFailure('学习必须花费实际时间');
    const start=d.get('state','minute');
    if(courseKey&&!course){
        const service=openObligation(d,this,{obligationKind:'service',debtor:source,creditor:'player',actor:source,subject:entity,deadline:start+catalog.learnDays*1440+minutes,terms:{service:'teach',subject:entity,days:catalog.learnDays,minutesPerDay:minutes,fee}},`${id}:course`);
        course={category:'teaching_course',service:service.id,teacher:source,student:'player',subject:entity,startedAt:start,lessons:[],minutes:0,fee};
    }
    if(fee){
        moveCoins(d,{from:purse(null,'player'),to:purse(null,source),amount:fee,writer:'learning',eventId:id});
        d.set(['state','player','coins'],d.get('state','player','coins')-fee);
        d.set(['state','npcs',source,'coins'],d.get('state','npcs',source,'coins')+fee);
    }
    this.advance(d,minutes,id);
    const outcome=this.check(d,{attribute:'智力',difficulty:catalog.learnDifficulty??10},id);
    d.set(['state','learning',id],{entity,source:sourceRecord,start,end:d.get('state','minute'),cost:fee,success:outcome.success});
    let complete=true;
    if(courseKey){
        const lessons=[...course.lessons,{start,end:d.get('state','minute'),eventId:id,success:outcome.success}],studied=course.minutes+minutes;
        complete=studied>=catalog.learnMinutes;
        course={...course,lessons,minutes:studied,nextDay:Math.floor(start/1440)+1,completedAt:complete?d.get('state','minute'):null};
        d.set(['state','records',courseKey],course);
        if(complete)closeObligation(d,this,{id:course.service,actor:source,reason:'fulfilled'},`${id}:course-complete`);
    }
    if(outcome.success&&complete){
        const learnedAt=d.get('state','minute');
        if(kind==='skill')d.set(['state','skills',entity],{proficiency:0,grade:grade(0),breakthroughs:[],daily:{},source:sourceRecord,learnedAt});
        else{
            d.set(['state',partition,entity],{source:sourceRecord,learnedAt});
            if(!d.get('state','skills',catalog.skill))d.set(['state','skills',catalog.skill],{proficiency:0,grade:grade(0),breakthroughs:[],daily:{},source:sourceRecord,learnedAt});
        }
        d.say(`学会${catalog.name}`);
    }else d.say(`${catalog.name}学习尚未成功，已花费${minutes}分钟${fee?`及${fee}铜`:''}`);
    return {entity,source:sourceRecord,teacher:sourceRecord.type==='teacher'?source:undefined,cost:fee,minutes,...outcome,...(courseKey?{course:courseKey,service:course.service,complete}: {})};
}
