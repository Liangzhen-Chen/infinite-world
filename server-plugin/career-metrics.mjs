// U4: long-term career metrics. A world-event subscriber reads each settled
// tool call (events plus before/after state) and keeps observable counters in
// state.careerMetrics. They feed three things:
//   - hidden professions: when a trigger metric is met the player is told once
//     that an opportunity is faintly felt; the profession itself is only taken
//     through its initiation check (acquireHiddenProfession), within capacity;
//   - variant promotions: region battles, element casts, faith acts;
//   - breakthrough evidence: masterpiece crafts, completed research and key
//     battles, each usable once for one skill at the stage it was earned.
// Legacy replays are not counted, so old ledgers settle exactly as before.
import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('career-metrics');
import {spellTraits}from'./traits.mjs';
import {certifiedForSkill}from'./professions.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('career-metrics',{kinds:['certified'],entities:['office']});

const SCHOOL_ELEMENT={火:'fire',水:'water',土:'earth',风:'wind',光:'light',信仰:'light',暗影:'shadow',精神:'mind',冰:'cold',霜:'cold',雷:'lightning'};
const CARE_OPERATIONS=new Set(['stabilize','hemostasis','clean_wound','pain','restore_tendon','ritual_heal']);
const EVIDENCE_KIND={杰作:'masterpiece',masterpiece:'masterpiece',研究:'research',研究完成:'research',research:'research',实战:'battle',关键实战:'battle',battle:'battle'};
const EVIDENCE_LABEL={masterpiece:'杰作',research:'研究完成',battle:'关键实战'};
const empty=minute=>({since:minute,counters:{},visited:{},battles:{},elements:{},students:{},kills:0,lastKill:null,evidence:{},opportunities:{},attempts:{}});
const inc=(map,key,by=1)=>{map[key]=(map[key]??0)+by;};
export const careerOf=(engine,role)=>engine.world.careers?.[role]??{};
const status=(state,id)=>state?.npcs?.[id]?.status??state?.creatures?.[id]?.status;

export function spellElements(spell){
    const elements=new Set(spellTraits(spell).elements);
    const school=SCHOOL_ELEMENT[spell?.school];if(school)elements.add(school);
    return [...elements];
}

function opponentLevel(engine,state,target){
    const row=state.npcs?.[target]??state.creatures?.[target],base=engine.byId.get(row?.boss??target);
    return row?.level??base?.level??base?.levelRange?.[0]??1;
}
const isBoss=(engine,state,target)=>Boolean(state.creatures?.[target]?.boss||state.npcs?.[target]?.boss||target.startsWith('boss_')||engine.byId.get(target)?.tier);

function addEvidence(m,key,kind,skills,state,minute){
    const stages=Object.fromEntries(skills.filter(skill=>state.skills?.[skill]).map(skill=>[skill,Math.floor(state.skills[skill].proficiency/300)]));
    if(Object.keys(stages).length&&!m.evidence[key])m.evidence[key]={kind,skills:stages,minute};
}

export function recordCareerMetrics(d,engine,events,context){
    if(context.legacy||!events.length)return;
    const before=context.before,after=d.get('state'),minute=after.minute,detail=context.detail??{},args=context.args??{},tool=events[0].tool??context.tool;
    const origin=d.scheduler?(d.original.state.scheduler?.lastSettled??d.original.state.minute):before.minute;
    const old=after.careerMetrics,m=structuredClone(old??empty(origin)),c=m.counters,id=context.eventId;
    // Places: every arrival is a visit; boat arrivals are voyages.
    m.visited[before.location]=true;
    if(after.location!==before.location){m.visited[after.location]=true;if(tool==='move'&&args.mode==='boat')inc(c,'voyages');}
    for(const e of events){
        if(e.actor!=='player')continue;
        if(['harm','clash'].includes(e.verb)&&e.target){
            inc(m.battles,e.location??before.location);
            if(status(after,e.target)==='死亡'&&status(before,e.target)!=='死亡'){
                m.kills++;m.lastKill=minute;
                const previous=before.npcs?.[e.target]??before.creatures?.[e.target];
                if(previous?.surrendered||/投降/.test(previous?.activity??''))m.surrenderKills=[...m.surrenderKills??[],{actor:'player',target:e.target,minute,sourceEvent:id}];
                if(isBoss(engine,before,e.target)||opponentLevel(engine,before,e.target)>=before.player.level){
                    const role=after.professions?.combat,skills=Object.keys(after.skills??{}).filter(skill=>role&&engine.byId.get(skill)?.profession===role);
                    addEvidence(m,`battle:${e.id}`,'battle',skills,after,minute);
                }
            }else if(tool==='combat'&&after.npcs?.[e.target]?.activity==='退让并呼救'&&before.npcs?.[e.target]?.activity!=='退让并呼救')inc(c,'nonlethalConflicts');
        }
        if(e.verb==='help'&&e.tags?.includes('heal'))inc(c,'healingSuccesses');
    }
    if(tool==='cast'&&detail.success){
        const spell=engine.byId.get(detail.spell),spec=spell?.effectSpec??{};
        for(const element of spellElements(spell))inc(m.elements,element);
        if(['summon','summon_contract'].includes(spec.kind))inc(c,'summonContracts');
        if(spec.kind==='ritual')inc(c,'consensualRituals');
        if(spec.kind==='care'&&CARE_OPERATIONS.has(spec.operation)&&detail.target&&detail.target!=='player')inc(c,'healingSuccesses');
    }
    if(tool==='craft'&&detail.success){
        inc(c,'craftSuccesses');
        const recipe=engine.byId.get(detail.recipe);
        if(recipe&&engine.byId.get(recipe.output?.item)?.book)inc(c,'booksCopied');
        if(recipe?.skill&&detail.degree==='大成功')addEvidence(m,`masterpiece:${id}`,'masterpiece',[recipe.skill],after,minute);
    }
    // U6 works: a masterpiece work is evidence for the skill it used; copies count as books copied.
    if(detail.workEvent?.masterpiece)addEvidence(m,`masterpiece:${id}`,'masterpiece',[detail.workEvent.skill],after,minute);
    if(detail.workEvent?.tags?.includes('copy'))inc(c,'booksCopied');
    if(tool==='repair'&&detail.success)inc(c,'craftSuccesses');
    if(tool==='farm'&&args.operation==='repair')inc(c,'publicProjects');
    if(tool==='learn'&&detail.student&&detail.gained>0)m.students[detail.student]=true;
    for(const [key,project]of Object.entries(after.projects??{})){
        const previous=before.projects?.[key];
        if(project.type==='研究'&&project.stage==='打磨'&&previous?.stage!=='打磨'){inc(c,'researchCompleted');addEvidence(m,`research:${key}`,'research',project.skills??[],after,minute);}
        if(project.type==='工程'&&project.creator==='player'&&project.status==='已完成'&&previous&&previous.status!=='已完成')inc(c,'publicProjects');
    }
    for(const [key,o]of Object.entries(after.obligations??{})){
        if(o.status!=='已完成'||!before.obligations?.[key]||before.obligations[key].status==='已完成')continue;
        if(o.promisor==='player')inc(c,'promisesKept');
        if([o.promisor,o.promisee].includes('player'))inc(c,'contractsCompleted');
    }
    for(const pet of Object.keys(after.pets??{}))if(!before.pets?.[pet])inc(c,'tamedCreatures');
    // Opportunities: told once per hidden profession, never while full or held.
    for(const row of engine.world.professions){
        if(row.kind!=='hidden'||m.opportunities[row.id]||after.professions?.hidden?.includes(row.id))continue;
        if(after.player.level<row.minimumLevel||metricValue(m,after,d.get('privateState'),row.trigger.metric)<row.trigger.minimum)continue;
        if(hiddenHolders(engine,after,row.id)>=row.capacity)continue;
        m.opportunities[row.id]={minute,source:id};
        d.say(`你隐约感到某种契机——${row.name}：${row.initiation}`);
    }
    if(JSON.stringify(m)!==JSON.stringify(old))d.set(['state','careerMetrics'],m);
}

export function metricValue(m,state,privateState,metric){
    if(!m)m=empty(state.minute);
    if(metric==='peaceDays')return Math.max(0,Math.floor((state.minute-(m.lastKill??m.since))/1440));
    if(metric==='locationsVisited')return Object.keys(m.visited).length;
    if(metric==='npcsTaught')return Object.keys(m.students).length;
    if(metric==='hiddenLuck')return privateState?.luck??0;
    return m.counters[metric]??0;
}

// Places whose own or parent name/terrain carries a region keyword.
function inRegion(engine,location,keywords){
    for(let id=location,depth=0;id&&depth<8;depth++){
        const row=engine.byId.get(id);if(!row)return false;
        if(keywords.some(word=>`${row.name??''}${row.terrain??''}`.includes(word)))return true;
        id=row.parent;
    }
    return false;
}
export function variantProgress(engine,state,variant){
    const m=state.careerMetrics??empty(state.minute);
    if(variant.kind==='region')return Object.entries(m.battles).reduce((sum,[location,count])=>sum+(inRegion(engine,location,variant.keywords??[])?count:0),0);
    if(variant.kind==='element')return m.elements[variant.key]??0;
    if(variant.kind==='faith')return variant.key==='light'?(m.elements.light??0)+(m.counters.healingSuccesses??0):(m.elements.shadow??0)+(m.elements.mind??0);
    return 0;
}

export function hiddenHolders(engine,state,role){
    const npcs=Object.entries(state.npcs??{}).filter(([id,row])=>row.status!=='死亡'&&[...row.hiddenProfessions??[],...engine.byId.get(id)?.hiddenProfessions??[]].includes(role)).length;
    return npcs+(state.professions?.hidden?.includes(role)?1:0);
}

function grantUltimate(d,engine,skill,source){
    if(!skill||d.get('state','skills',skill))return null;
    d.set(['state','skills',skill],{proficiency:0,grade:'初级1等',breakthroughs:[],daily:{},source,learnedAt:d.get('state','minute')});
    d.say(`领悟终极技能：${engine.byId.get(skill)?.name??skill}`);
    return skill;
}

// Hidden profession: opportunity first, then the initiation experience (a real
// check that costs time); success fills one of the limited places in the world.
export function acquireHiddenProfession(d,engine,role,id){
    const catalog=engine.byId.get(role),state=d.get('state'),m=state.careerMetrics;
    if(state.professions.hidden.includes(role))throw new Error('已经取得这个隐藏身份');
    if(state.player.level<catalog.minimumLevel)throw new Error(`隐藏身份需要至少${catalog.minimumLevel}级`);
    const met=metricValue(m,state,d.get('privateState'),catalog.trigger.metric)>=catalog.trigger.minimum;
    if(!m?.opportunities?.[role]&&!met)throw new Error('隐藏职业必须满足独立触发条件，尚未出现契机');
    if(hiddenHolders(engine,state,role)>=catalog.capacity)throw new Error(`${catalog.uniqueness}，已无空缺`);
    if((m?.attempts?.[role]??0)>state.minute)throw new Error('上次经历未竟，契机尚需时日再次成熟');
    const career=careerOf(engine,role),rule=career.initiationCheck??{attribute:'精神',difficulty:20,minutes:240,retryMinutes:1440};
    const outcome=engine.check(d,{attribute:rule.attribute,difficulty:rule.difficulty},id);engine.advance(d,rule.minutes,id);
    const now=d.get('state','minute');
    if(!outcome.success){
        d.set(['state','careerMetrics','attempts',role],now+rule.retryMinutes);
        d.say(`经历「${catalog.initiation}」未能完成`);
        return{profession:role,acquired:false,initiation:catalog.initiation,...outcome};
    }
    holdingSet(d,null,['state','professions','hidden'],[...d.get('state','professions','hidden'),role],'career-metrics');
    d.set(['state','careers',role,'certification'],{experience:catalog.initiation,minute:now,source:id});
    const ultimate=grantUltimate(d,engine,career.ultimate?.skill,{type:'hidden_profession',id:role});
    d.say(`完成经历「${catalog.initiation}」，取得隐藏身份：${catalog.name}`);
    return{profession:role,acquired:true,initiation:catalog.initiation,...(ultimate?{ultimate}:{}),...outcome};
}

// Combat ultimate through the profession task: three promotions, the core skill
// at 900, a qualified examiner, the fee and a hard trial check.
export function professionUltimate(d,engine,role,teacher,mentor,id){
    const rule=careerOf(engine,role).ultimate,player=d.get('state','player');
    if(!rule)throw new Error('这个职业没有登记终极技能任务');
    if(d.get('state','professions','combat')!==role)throw new Error('需要当前正式战斗职业才能接受终极技能任务');
    if(d.get('state','skills',rule.skill))throw new Error('已经掌握这项终极技能');
    const history=d.get('state','careers',role,'promotions')??[];
    if(history.length<rule.minimumPromotions)throw new Error(`终极技能任务需要完成${rule.minimumPromotions}次升职`);
    if((mentor.promotionRanks?.[role]??0)<rule.minimumPromotions)throw new Error('导师不具备主持终极技能任务的资格');
    const proficiency=d.get('state','skills',rule.requiredSkill,'proficiency')??0;
    if(proficiency<rule.minimumProficiency||!certifiedForSkill(d,engine,rule.requiredSkill))throw new Error('终极技能任务所需技能不足');
    if(player.coins<rule.fee)throw new Error('终极技能任务费用不足');
    return{rule,history};
}
export function completeProfessionUltimate(d,engine,role,teacher,rule,outcome,id){
    if(!outcome.success){d.say(`职业任务「${rule.task.name}」未能完成`);return null;}
    moveCoins(d,{from:purse(engine,'player'),to:purse(engine,teacher),amount:rule.fee,writer:'career-metrics',eventId:id});d.set(['state','player','coins'],d.get('state','player','coins')-rule.fee);d.set(['state','npcs',teacher,'coins'],d.get('state','npcs',teacher,'coins')+rule.fee);
    d.set(['state','careers',role,'ultimate'],{skill:rule.skill,task:rule.task.name,teacher,minute:d.get('state','minute'),source:id});
    d.say(`完成职业任务「${rule.task.name}」`);
    return grantUltimate(d,engine,rule.skill,{type:'profession_task',id:role,teacher});
}

// Breakthrough through recorded evidence instead of a mentor's exam.
export function evidenceBreakthrough(d,engine,skill,source,old){
    const m=d.get('state','careerMetrics'),kind=EVIDENCE_KIND[source],direct=typeof source==='string'&&m?.evidence?.[source];
    if(!kind&&!direct)return null;
    if(old.proficiency%300!==299)throw new Error('尚未达到当前阶段上限');
    if(!certifiedForSkill(d,engine,skill))throw new Error('未认证职业不能跨越初级阶段');
    const stage=Math.floor(old.proficiency/300);
    const found=Object.entries(m?.evidence??{}).find(([key,row])=>!row.usedFor&&(direct?key===source:row.kind===kind)&&row.skills[skill]===stage);
    if(!found)throw new Error(`没有本阶段这项技能可用的${EVIDENCE_LABEL[kind??direct.kind]}记录`);
    const [key,row]=found;
    d.set(['state','careerMetrics','evidence',key,'usedFor'],{skill,stage:stage+1,minute:d.get('state','minute')});
    d.set(['state','skills',skill,'breakthroughs'],[...new Set([...old.breakthroughs??[],stage+1])]);
    d.say(`凭${EVIDENCE_LABEL[row.kind]}完成${engine.byId.get(skill)?.name??skill}突破`);
    return{skill,breakthrough:true,success:true,path:row.kind,evidence:key};
}
export function breakthroughPaths(state,skill,proficiency){
    const stage=Math.floor(proficiency/300);
    return [...new Set(Object.values(state.careerMetrics?.evidence??{}).filter(row=>!row.usedFor&&row.skills[skill]===stage).map(row=>EVIDENCE_LABEL[row.kind]))];
}
