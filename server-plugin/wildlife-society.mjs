import {preconditionFailure} from './precondition.mjs';
import {purse,workshopFund,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {craftInput,craftOutput} from './stock.mjs';
import {recordCraft} from './craft-record.mjs';
import {placeSettlement} from './entity-view.mjs';
// S1b: 灵物制作是 src:craft 制造守恒对；借形取用与施用的物品进 sink:consume。
declareLedgerWriter('wildlife-society',{sources:{'src:craft':{'*':100000}},sinks:['sink:consume']});
import {registerWorldEventSubscriber}from'./world-events.mjs';
import {createHash} from 'node:crypto';
import {assertTrainingRitual} from './training.mjs';
import {effectiveProficiency} from './professions.mjs';
import {heldUnit,wearItem,produceItems} from './items.mjs';
import {metabolismFactor} from './primitives-body.mjs';
import {speciesInHabitat} from './wildlife-range.mjs';
import {initialIn} from './wildlife-habitats.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings} from './holdings.mjs';
import {changeHolding,changeLegacyHoldings,transition} from './transition.mjs';
import {isEffective} from './lifecycle-state.mjs';
declareHoldingWriter('wildlife-society',{kinds:['tamed_by','member_of'],entities:['wreck'],locations:true});
const societyEntity=(key,row)=>row?.entity??`society_${key.replaceAll(':','_')}`;

// T161 成精后的修习与结社。只作用于已立意的同一身体：修习、借形、结社都写在
// creatures[id] 上，不改等级、体力、物种或生态来源，不生成新人口，也不凭空造物。
const DAY=1440,clone=v=>structuredClone(v);
const alive=(a,source,id)=>a&&isEffective(null,source,id)&&a.hp>0;
const sapient=a=>Boolean(a?.mind?.awakened);
const rulesOf=engine=>{const r=engine.rules.wildlifeAwakening;if(!r)throw preconditionFailure('当前世界未启用开灵规则');return r;};
const partner=a=>a?.companion?.with==='player';
const knowsPlayer=a=>partner(a)||Boolean(a?.mind?.sources?.some(s=>s.by==='player'));
const nameOf=(engine,id,a)=>a?.name??engine.byId.get(a?.species)?.name??id;
export const spiritOperations=['talk','follow','stay','settle','leave','borrow_form'];

function logEvent(d,id,row){
    const events=[...d.get('state','creatures',id,'mind','events')??[],row].slice(-40);
    holdingSet(d,null,['state','creatures',id,'mind','events'],events,'wildlife-society');
}
function presentSpirit(d,engine,id,{label='它'}={}){
    const actor=d.get('state','creatures',id);
    if(!actor||!sapient(actor))throw preconditionFailure(`${label}尚未立意，不能以精怪身份修习、交谈或结社`);
    if(!alive(actor,d,id))throw preconditionFailure(`${label}已经死亡或失去行动资格`);
    if(actor.location!==d.get('state','location'))throw preconditionFailure(`${label}不在场`);
    if(d.get('state','player','status')!=='正常')throw preconditionFailure('你此时无法行动');
    return actor;
}
const stillHere=(d,id)=>{const a=d.get('state','creatures',id);return alive(a,d,id)&&a.location===d.get('state','location')&&d.get('state','player','status')==='正常';};
function spend(d,engine,rows,eventId){
    for(const row of rows)if(engine.quantity(d,'player',row.item)<row.amount)throw preconditionFailure(`缺少${engine.byId.get(row.item)?.name??row.item}${row.amount}份`);
    for(const row of rows)engine.itemDelta(d,'player',row.item,-row.amount,{flow:'sink:consume',purpose:'form',writer:'wildlife-society',eventId});
    return clone(rows);
}
export function activeForm(actor,minute){return actor?.form&&actor.form.until>minute?actor.form:null;}

// 精怪的自我叙述：交谈入口与场景卡共用。恩、仇、点化与结缘都指向具体当事人和事件。
export function spiritProfile(engine,document,id){
    const s=document.state,a=s.creatures?.[id];if(!sapient(a))return null;
    const minute=s.minute,c=a.cultivation??{},events=a.mind.events??[],gratitude={};
    for(const row of [...a.mind.sources??[],...(c.sessions??[])])if(row.by){
        const g=gratitude[row.by]??={party:row.by,acts:[],firstEvent:row.event};g.acts.push(row.kind==='item'?'喂灵物':row.kind==='mentor'?'点化':'传授');
    }
    const form=activeForm(a,minute),place=id=>engine.byId.get(id)?.name??id;
    return{id,name:nameOf(engine,id,a),species:engine.byId.get(a.species)?.name??a.species,stage:'立意',location:a.location,
        ...(form?{form:{as:form.name,until:form.until}}:{}),
        companion:a.companion?{with:a.companion.with,following:Boolean(a.companion.following),terms:clone(a.companion.terms)}:null,
        society:a.society?{id:a.society.id,location:place(a.society.location),joined:a.society.joined}:null,
        intent:a.mind.settle?{settleAt:place(a.mind.settle.location)}:null,
        skills:clone(c.skills??{}),recipes:Object.keys(c.recipes??{}),borrowForm:Boolean(c.borrowForm),
        enlightened:(a.mind.sources??[]).filter(r=>r.kind==='mentor').map(r=>({party:r.by,institution:place(r.institution),event:r.event})),
        gratitude:Object.values(gratitude).map(g=>({party:g.party,acts:[...new Set(g.acts)],firstEvent:g.firstEvent})),
        grudges:events.filter(e=>e.kind==='寻仇').map(e=>({party:e.party,event:e.event,minute:e.minute})),
        recent:events.slice(-5).map(e=>({kind:e.kind,party:e.party??null,minute:e.minute,event:e.event}))};
}
export function spiritScene(engine,document){
    const s=document.state,rows=Object.entries(s.creatures??{}).filter(([id,a])=>sapient(a)&&alive(a,document,id)&&a.location===s.location);
    if(!rows.length)return null;
    return `【在场精怪】${rows.slice(0,3).map(([id,a])=>{const f=activeForm(a,s.minute);
        return `${nameOf(engine,id,a)}（${id}）立意${partner(a)?`，与你结缘${a.companion.following?'且同行':''}`:''}${f?`，借形为${f.name}`:''}${a.society?`，属${engine.byId.get(a.society.location)?.name??a.society.location}`:''}`;}).join('；')}。可用wildlife_talk交谈，其恩怨只认具体当事人。`;
}

// world_learn 带 student：玩家把技能或配方传授给在场已立意的精怪。沿用人物成长的每日一次与上限。
export function spiritStudent(d,name){
    const here=d.get('state','location');
    const rows=Object.entries(d.get('state','creatures')??{}).filter(([id,a])=>sapient(a)&&a.location===here&&[id,a.name].includes(name));
    return rows.length===1?rows[0][0]:null;
}
export function teachSpirit(d,engine,args,eventId,id){
    const growth=engine.rules.npcGrowth;if(!growth)throw preconditionFailure('世界规则没有登记传授参数');
    const r=growth.teach,actor=presentSpirit(d,engine,id,{label:'学生'});
    if(args.source!==undefined&&!['player','玩家'].includes(args.source))throw preconditionFailure('传授精怪时source须为player');
    if(!knowsPlayer(actor))throw preconditionFailure('它与你没有往来，不愿受教');
    const entity=engine.resolve(args.entity,args.kind),kind=entity.split('_')[0],catalog=engine.byId.get(entity);
    if(!['skill','recipe'].includes(kind))throw preconditionFailure('只能向精怪传授技能或配方');
    const minute=d.get('state','minute'),day=Math.floor(minute/DAY),c=clone(actor.cultivation??{skills:{},recipes:{},sessions:[]});
    const today=c.today?.day===day?c.today:{day,teach:0};
    if(today.teach>=r.dailySessions)throw preconditionFailure('今天已经教过它，需隔日再教');
    let gain=0,skill;
    if(kind==='skill'){
        skill=entity;if(!d.get('state','skills',skill))throw preconditionFailure('你没有掌握这项技能');
        const current=c.skills[skill]??0;
        gain=Math.min(r.gain,effectiveProficiency(d,engine,skill)-r.teacherMargin-current,growth.maximumProficiency-current);
        if(gain<=0)throw preconditionFailure('它已接近你的水平或达到成长上限，再教也不会进步');
    }else{
        if(!d.get('state','recipes',entity))throw preconditionFailure('你没有学会这个配方');
        if(c.recipes[entity])throw preconditionFailure('它已经会这个配方');
        if(c.skills[catalog.skill]===undefined)throw preconditionFailure('它还没修习过这个配方所需的技能');
        if(c.skills[catalog.skill]<(catalog.minimumProficiency??0))throw preconditionFailure('它的相关技能不足以学这个配方');
    }
    const minutes=kind==='recipe'?catalog.learnMinutes??r.minutes:r.minutes;
    engine.advance(d,minutes,eventId);
    if(!stillHere(d,id))return{student:id,entity,kind,minutes,success:false,gained:0,note:'教学完成前一方离开或失去行动能力'};
    const at=d.get('state','minute');
    if(kind==='skill')c.skills[skill]=(c.skills[skill]??0)+gain;
    else c.recipes[entity]={source:{type:'player'},learnedAt:at,sourceEvent:eventId};
    c.sessions.push({kind:'teach',entity,gained:gain,by:'player',event:eventId,minute:at});c.today={day,teach:today.teach+1};
    holdingSet(d,null,['state','creatures',id,'cultivation'],c,'wildlife-society');
    logEvent(d,id,{kind:'修习',party:'player',event:eventId,minute:at,entity});
    const summary=kind==='skill'?`跟你修习${minutes}分钟${catalog.name}，熟练度提高${gain}`:`跟你学会配方${catalog.name}`;
    d.say(`${nameOf(engine,id,actor)}${summary}`);
    return{student:id,entity,kind,minutes,success:true,gained:gain,...(skill?{proficiency:c.skills[skill]}:{}),sessions:c.sessions.length};
}

// world_craft 带 maker：结缘精怪按自己学会的配方和熟练度代工；材料、工具与工坊费由你出，成品归你，制作者记为精怪。
// 卡 Q：落档、失败分档与品质链用 manufacturing 传入的同一组函数（与玩家、NPC 共用）。
export function spiritManufacture(d,args,eventId,{workstation,kilnWorkResult,craftStanding,craftOutcome,materialFloor,toolFactor,materialFloors,returnMaterials}){
    if((args.operation??'manufacture')!=='manufacture')throw preconditionFailure('精怪只能代工制造，不能代做维修');
    const here=d.get('state','location'),id=spiritStudent(d,args.maker)??args.maker,actor=presentSpirit(d,this,id,{label:'代工者'});
    if(!partner(actor))throw preconditionFailure('只有与你结缘的精怪会替你动手');
    const recipe=this.byId.get(this.resolve(args.recipe,'recipe')),c=actor.cultivation??{};
    // 卡 Q：没修习该技能、熟练度不到门槛或没学过配方都不拒绝，照做落低档。
    const known=c.skills?.[recipe.skill]!==undefined,proficiency=c.skills?.[recipe.skill]??0,standing=craftStanding(known,proficiency,recipe.minimumProficiency,!recipe.learningRequired||Boolean(c.recipes?.[recipe.id]));
    if(recipe.location&&recipe.location!==here)throw preconditionFailure('不在所需工坊');
    const station=workstation(d,this,recipe,args);
    for(const item of recipe.tools??[])if(this.quantity(d,'player',item)<1||(heldUnit(d,this,'player',item)?.durability??this.byId.get(item).durability)<=0)throw preconditionFailure(`缺少完好的${this.byId.get(item).name}`);
    const materials=new Map();for(const row of recipe.materials)materials.set(row.item,(materials.get(row.item)??0)+row.amount);
    for(const[item,amount]of materials)if(this.quantity(d,'player',item)<amount)throw preconditionFailure(`缺少${this.byId.get(item).name}`);
    const die=createHash('sha256').update(`${d.get('randomSeed')}:${eventId}:spirit-craft`).digest().readUInt32LE(0)%20+1;
    const modifier=Math.floor(proficiency/(this.rules.check.skillDivisor??150)),total=die+modifier,diff=recipe.difficulty;
    const degree=die===1||total<=diff-10?'大失败':die===20||total>=diff+10?'大成功':total<diff?'失败':total<diff+5?'勉强成功':'成功';
    const outcome={die,modifier,total,degree,difficulty:diff,success:['勉强成功','成功','大成功'].includes(degree)};
    const floor=materialFloor(d,this,'player',materials),floors=materialFloors(d,this,'player',materials),tools=toolFactor(d,this,'player',recipe.tools);
    for(const[item,amount]of materials)this.itemDelta(d,'player',item,-amount,craftInput('wildlife-society',eventId));
    if(station?.fee){
        moveCoins(d,{from:purse(null,'player'),to:station.owner?.startsWith('npc_')?purse(null,station.owner):workshopFund(station.id),amount:station.fee,writer:'wildlife-society',eventId:eventId});
        d.set(['state','player','coins'],d.get('state','player','coins')-station.fee);
        if(station.owner?.startsWith('npc_'))d.set(['state','npcs',station.owner,'coins'],d.get('state','npcs',station.owner,'coins')+station.fee);
        else d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+station.fee);
    }
    this.advance(d,recipe.minutes,eventId);
    const products=[{item:recipe.output.item,amount:recipe.output.quantity},...recipe.byproducts??[]];
    const thermal=kilnWorkResult(d,station?.thermalPlan,outcome,recipe.output.quantity,eventId);
    if(thermal)products[0].amount-=thermal.crackedQuantity;
    for(const item of recipe.tools??[])wearItem(d,this,'player',item,recipe.toolWear??1);
    const ids=[],salvage=[],name=nameOf(this,id,actor);let workmanship=null;
    const result=craftOutcome(this,{standing,degree,success:outcome.success,proficiency,floor,tools,station:station?.factor??1,recoverFraction:recipe.failure?.recoverFraction??0,seed:d.get('randomSeed'),key:eventId});
    const made=outcome.success?products:result.failure==='partial'?[{item:recipe.output.item,amount:recipe.output.quantity}]:[];
    if(made.length){
        workmanship=result.tier;
        for(const row of made)if(row.amount)ids.push(...produceItems(d,this,row.item,row.amount,{eventId,recipe:recipe.id,workmanship,grade:result.grade,inputs:[...new Map(materials).keys()],books:craftOutput('wildlife-society',eventId)}));
        for(const unit of ids)holdingSet(d,null,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),maker:id,makerName:name},'wildlife-society');
    }else salvage.push(...returnMaterials(d,this,'player',materials,result,{floors,eventId,cracked:Boolean(thermal?.crackedQuantity),give:(item,n)=>this.itemDelta(d,'player',item,n,craftOutput('wildlife-society',eventId))}));
    // 行为人 = 制作的社会成员 id（料取自玩家行囊、在玩家所在地制作），发生地 = 玩家所在地的聚落（野外无聚落则为空，不计入聚落耗料）。
    recordCraft(d,{engine:this,actor:id,place:placeSettlement(this,d.get('state'),d.get('state','location')).value,recipe:recipe.id,batches:1,inputs:Object.fromEntries(materials),outputs:Object.fromEntries((made.length?made.filter(row=>row.amount):salvage).map(row=>[row.item,row.amount])),...(!outcome.success?{failure:result.failure??'ruin'}:{}),writer:'wildlife-society',eventId});
    const at=d.get('state','minute'),receipt={id:`crafted_${eventId}`,recipe:recipe.id,item:recipe.output.item,quantity:made[0]?.amount??0,
        maker:id,name,minute:at,station:station?.id??null,fee:station?.fee??0,degree,workmanship,...(result.grade!==undefined?{grade:result.grade}:{}),...(result.failure?{failure:result.failure}:{}),...(standing!=='skilled'?{standing}:{}),instances:ids,salvage,...(thermal?{thermal}:{})};
    d.set(['state','crafted',receipt.id],receipt);
    logEvent(d,id,{kind:'制作',party:'player',event:eventId,minute:at,recipe:recipe.id});
    d.say(outcome.success?`${name}制成${this.byId.get(recipe.output.item).name}${products[0].amount}件，做工${workmanship}`:`${name}制造${degree}，耗时${recipe.minutes}分钟`);
    return{recipe:recipe.id,maker:id,...outcome,receipt:receipt.id,instances:ids,workmanship,...(result.grade!==undefined?{grade:result.grade}:{}),...(result.failure?{failure:result.failure}:{}),...(standing!=='skilled'?{standing}:{}),salvage,
        spent:{feePaid:station?.fee??0,minutes:recipe.minutes,materials:[...materials].map(([item,quantity])=>({item,quantity}))},
        note:'材料、工具和工坊费出自你，成品归你；精怪只凭自己学到的配方与熟练度动手'};
}

// world_wildlife 的精怪操作：交谈、跟随/留守、定居意愿、离群、借形。
export function spiritAction(d,args,eventId,target){
    const rules=rulesOf(this),op=args.operation,actor=presentSpirit(d,this,target),name=nameOf(this,target,actor),minute=d.get('state','minute');
    if(op==='talk'){
        this.advance(d,rules.talkMinutes,eventId);
        if(!stillHere(d,target))return{success:false,note:'交谈完成前一方离开或失去行动能力'};
        logEvent(d,target,{kind:'交谈',party:'player',event:eventId,minute:d.get('state','minute')});
        return{success:true,spirit:spiritProfile(this,d.document,target),
            note:'它以固定声响和动作表意，只说自己亲历与所知；恩仇只认具体当事人，不受命令驱使'};
    }
    if(op==='follow'||op==='stay'){
        if(!partner(actor))throw preconditionFailure('它未与你结缘，不会跟随你');
        if(op==='follow'&&actor.status==='濒死')throw preconditionFailure('它伤重，无法同行');
        holdingSet(d,null,['state','creatures',target,'companion'],{...actor.companion,following:op==='follow'},'wildlife-society');
        if(op==='follow'&&actor.mind.settle){const mind=clone(actor.mind);delete mind.settle;holdingSet(d,null,['state','creatures',target,'mind'],mind,'wildlife-society');}
        return{target,following:op==='follow',note:'结缘同行出于它自己的同意，可随时留下'};
    }
    if(op==='settle'){
        if(!partner(actor))throw preconditionFailure('只有与你结缘的精怪会和你商量去留；野居的精怪自行决定');
        if(actor.society)throw preconditionFailure('它已属于一处精怪聚落，须先离群');
        const r=rules.society;
        holdingSet(d,null,['state','creatures',target,'mind','settle'],{location:actor.location,minute,event:eventId,by:'player'},'wildlife-society');
        holdingSet(d,null,['state','creatures',target,'companion'],{...actor.companion,following:false},'wildlife-society');
        logEvent(d,target,{kind:'愿定居',party:'player',event:eventId,minute,location:actor.location});
        const next=(Math.floor(minute/DAY/r.periodDays)+1)*r.periodDays*DAY;
        return{target,intent:{location:actor.location},nextCheck:next,note:'它愿在此定居；结社检查按季度看自愿成员、可居住地点和口粮，满足才成社或并入，不足则仍游居'};
    }
    if(op==='leave'){
        if(!actor.society)throw preconditionFailure('它没有加入任何精怪聚落');
        if(!partner(actor))throw preconditionFailure('它未与你结缘，去留不由你商量');
        const key=actor.society.id,row=clone(d.get('state','records',key));
        delete row.members[target];row.history=[...row.history,{minute,event:eventId,left:[target]}];
        const dissolved=!Object.keys(row.members).length&&row.kind==='formed';
        if(dissolved)row.status='已散';
        const entity=societyEntity(key,row);
        changeLegacyHoldings(d,this,{holder:target,subject:entity,kinds:['member_of'],reason:'vacated',eventId},()=>{
            holdingSet(d,null,['state','records',key],row,'wildlife-society');d.remove(['state','creatures',target,'society']);
        });
        if(dissolved)transition(d,this,{entity,basis:'dissolution',origin:'dissolution',eventId:`${eventId}:dissolution`});
        logEvent(d,target,{kind:'离群',party:'player',event:eventId,minute,society:key});
        return{target,left:key,remaining:Object.keys(row.members).length};
    }
    if(op!=='borrow_form')throw preconditionFailure('未知精怪操作');
    const bf=rules.borrowForm,c=actor.cultivation??{};
    if(!c.borrowForm){
        if(!partner(actor))throw preconditionFailure('借形之术须由结缘者陪同求取');
        const sessions=(c.sessions??[]).length;
        if(sessions<bf.sessions)throw preconditionFailure(`修习经历不足：已修习${sessions}次，借形至少需${bf.sessions}次`);
        if(!args.permit)throw preconditionFailure('求取借形需要有效的仪式主持资格');
        const {entry}=assertTrainingRitual(d,this,args.permit,minute+bf.acquireMinutes);
        if(!entry.ritualOperations.includes(rules.mentor.operation))throw preconditionFailure('师承没有登记灵觉一类的主持范围');
        const spent=spend(d,this,bf.acquireItems,eventId);this.advance(d,bf.acquireMinutes,eventId);
        if(!stillHere(d,target))return{success:false,spent:{items:spent,minutes:bf.acquireMinutes},note:'仪式未完成，灵物已耗'};
        const at=d.get('state','minute');
        holdingSet(d,null,['state','creatures',target,'cultivation'],{...clone(c),borrowForm:{acquired:at,event:eventId,permit:args.permit,institution:entry.institution,by:'player'}},'wildlife-society');
        logEvent(d,target,{kind:'得借形',party:'player',event:eventId,minute:at,institution:entry.institution});
        d.say(`${name}取得借形之能；身体、伤势与战力不变`);
        return{success:true,target,acquired:true,spent:{items:spent,minutes:bf.acquireMinutes},note:'只得能力，并未变形；每次借形须明说借何形并付代价'};
    }
    const current=activeForm(actor,minute);
    if(args.species===undefined){
        if(!current)throw preconditionFailure('借形须明说借何形，没有默认形貌');
        d.remove(['state','creatures',target,'form']);
        logEvent(d,target,{kind:'散形',event:eventId,minute});
        return{success:true,target,form:null,note:'恢复本相'};
    }
    let form=bf.forms.includes(args.species)?{id:args.species,name:args.species}:null;
    if(!form){const s=this.resolve(args.species,'monster'),def=this.byId.get(s);if(!def?.wildlife)throw preconditionFailure('只能借登记的形貌或已登记的野生物种之形');form={id:s,name:def.name};}
    if(form.id===actor.species)throw preconditionFailure('那是它的本相；散形请不带species');
    const spent=spend(d,this,bf.useItems,eventId);this.advance(d,bf.useMinutes,eventId);
    if(!stillHere(d,target))return{success:false,spent:{items:spent,minutes:bf.useMinutes},note:'施术未成，灵物已耗'};
    const at=d.get('state','minute'),row={as:form.id,name:form.name,since:at,until:at+bf.durationMinutes,event:eventId};
    holdingSet(d,null,['state','creatures',target,'form'],row,'wildlife-society');
    logEvent(d,target,{kind:'借形',event:eventId,minute:at,as:form.id});
    return{success:true,target,form:row,spent:{items:spent,minutes:bf.useMinutes},
        note:'只改外貌，仍是同一身体：生命、等级、物种与战力不变，到期自然散形'};
}

// 攻击已立意者会留下具体的寻仇记忆；伤及结缘者则断缘。
export function recordSpiritGrudge(d,target,party,eventId,damage){
    const a=d.get('state','creatures',target);if(!sapient(a)||!alive(a,d,target)||!(damage>0))return;
    logEvent(d,target,{kind:'寻仇',party,event:eventId,minute:d.get('state','minute'),damage});
    if(a.companion?.with===party){
        const obligation=a.companion.obligation&&d.get('state','obligations',a.companion.obligation);
        if(obligation)d.set(['state','obligations',obligation.id],{...obligation,status:'breached',endedAt:d.get('state','minute'),breachEvent:eventId});
        d.remove(['state','creatures',target,'companion']);logEvent(d,target,{kind:'断缘',party,event:eventId,minute:d.get('state','minute')});
    }
}

// World-event subscriber: any wound the player dealt to a creature, by blade or spell.
export function recordSpiritGrudges(d,engine,events){
    for(const e of events)if(['harm','clash'].includes(e.verb)&&e.actor==='player'&&e.target&&!e.target.startsWith('npc_'))recordSpiritGrudge(d,e.target,'player',e.id,e.harm);
}

export function moveSpiritCompanions(d,origin,destination){
    for(const[id,a]of Object.entries(d.get('state','creatures')??{}))
        if(sapient(a)&&alive(a,d,id)&&partner(a)&&a.companion.following&&a.location===origin)holdingSet(d,null,['state','creatures',id,'location'],destination,'wildlife-society');
}

// 结社检查：自愿成员、可居住地点、口粮来源。重复检查只认已有成员，不重复登记人口或物资。
function forage(d,engine,location){
    const habitat=engine.rules.wildlife?.habitats.find(h=>h.location===location);if(!habitat)return null;
    const record=d.get('state','records',`ecology:${habitat.id}`);
    const total=record?Object.values(record.populations).reduce((n,p)=>n+p.count,0)
        :speciesInHabitat(engine.rules,engine.world.monsters,habitat.id).reduce((n,s)=>n+initialIn(habitat,s),0);
    return{habitat:habitat.id,total};
}
// 觅食需求按成员的饱食代谢加权：不进食的物种不占口粮（同 primitives-body.metabolismFactor 的唯一入口）。
export const societyForageNeed=(d,engine,ids)=>rulesOf(engine).society.foragePerMember*ids.reduce((n,id)=>n+metabolismFactor(engine,d.get('state'),id,'satiety'),0);
const voluntary=(a,d,id)=>sapient(a)&&alive(a,d,id)&&!a.owner&&!a.society&&a.location&&!a.companion?.following&&(!partner(a)||a.mind.settle?.location===a.location);
export function checkSpiritSocieties(d,engine,minute,sourceEvent,only=null){
    const r=rulesOf(engine).society,result={formed:[],joined:[],wandering:[]},groups=new Map();
    for(const[id,a]of Object.entries(d.get('state','creatures')??{}).sort(([x],[y])=>x.localeCompare(y)))
        if(voluntary(a,d,id)&&(!only||a.location===only))groups.set(a.location,[...groups.get(a.location)??[],id]);
    for(const[location,ids]of[...groups].sort(([x],[y])=>x.localeCompare(y))){
        const key=`spirit_society:${location}`,prior=d.get('state','records',key),home=r.homes.includes(location);
        const members=Object.keys(prior?.members??{}).filter(id=>alive(d.get('state','creatures',id),d,id)),food=home?{kind:'home'}:forage(d,engine,location);
        let reason=null;
        if(!home&&!food)reason='此地不可居住：不是登记的栖地或精怪之乡';
        else if(!prior&&!home&&ids.length<r.minimumMembers)reason=`自愿成员不足${r.minimumMembers}`;
        else if(food.kind!=='home'&&food.total<societyForageNeed(d,engine,[...members,...ids]))reason='口粮来源不足以养活全部成员';
        if(reason){for(const id of ids)result.wandering.push({id,location,reason});continue;}
        const row=prior&&prior.status!=='已散'?clone(prior):{category:'spirit_society',id:key,location,kind:home?'home':'formed',founded:minute,sourceEvent,members:{},history:[]};
        if(prior?.status==='已散')Object.assign(row,{history:prior.history,refounded:minute});
        row.food=home?{kind:'home'}:{kind:'habitat',habitat:food.habitat,checkedTotal:food.total,minute};
        // Refounding uses a new collective; the old dissolved entity remains gone.
        const baseEntity=`society_${key.replaceAll(':','_')}`;
        row.entity=prior?.status==='已散'?`${baseEntity}_${minute}`:prior?.entity??baseEntity;
        for(const id of ids){
            if(!isEffective(engine,d,id))continue;
            if(!aliveHoldings(d,{kind:'member_of',holder:id,subject:row.entity}).length)
                changeHolding(d,engine,{op:'open',kind:'member_of',holder:id,subject:row.entity,source:`spirit-society:${key}`,eventId:`${sourceEvent}:member:${id}`});
            row.members[id]={joined:minute,sourceEvent};
            const mind=clone(d.get('state','creatures',id,'mind'));delete mind.settle;holdingSet(d,null,['state','creatures',id,'mind'],mind,'wildlife-society');
            holdingSet(d,null,['state','creatures',id,'society'],{id:key,location,joined:minute,sourceEvent},'wildlife-society');
            logEvent(d,id,{kind:'定居',event:sourceEvent,minute,society:key});
        }
        row.history=[...row.history,{minute,event:sourceEvent,joined:ids}];
        holdingSet(d,null,['state','records',key],row,'wildlife-society');
        (prior&&prior.status!=='已散'||home?result.joined:result.formed).push({society:key,location,members:ids});
    }
    if(groups.size)holdingSet(d,null,['state','records','spirit_society_check'],{category:'spirit_society_check',minute,sourceEvent,...clone(result)},'wildlife-society');
    return result;
}
export function advanceSpiritSocieties(d,engine,day){
    const r=engine.rules.wildlifeAwakening?.society;if(!r||(day+1)%r.periodDays)return;
    checkSpiritSocieties(d,engine,(day+1)*DAY,`spirit-society:${day+1}`);
}
// T109 势力时钟的结社效果：立即对某地或全境做一次检查；无人成社或并入则拒绝，阶段不推进。
export const spiritSocietyConsumer=Object.freeze({
    validate(engine,effect){
        if(!engine.rules.wildlifeAwakening?.society)throw preconditionFailure('当前世界未启用精怪结社规则');
        if(effect.location!==undefined&&!engine.world.locations.some(l=>l.id===effect.location))throw preconditionFailure('结社效果地点未登记');
    },
    apply(d,engine,effect,context){
        const result=checkSpiritSocieties(d,engine,context.minute,context.sourceEvent,effect.location??null);
        return result.formed.length||result.joined.length?{applied:true,...result}:{applied:false,reason:'没有满足自愿成员、可居住地点与口粮的精怪，仍保持游居'};
    },
});
export function validateSpiritRules(world){
    const r=world.rules.wildlifeAwakening,errors=[];if(!r)return errors;
    const int=(v,min=1)=>Number.isSafeInteger(v)&&v>=min,items=new Set(world.items.map(i=>i.id)),ids=new Set(world.locations.map(l=>l.id));
    const rows=list=>Array.isArray(list)&&list.length&&list.every(x=>items.has(x.item)&&int(x.amount));
    const b=r.borrowForm,s=r.society;
    if(!int(r.talkMinutes))errors.push('精怪交谈时长无效');
    if(!b||!int(b.sessions)||!int(b.acquireMinutes)||!int(b.useMinutes)||!int(b.durationMinutes)||!rows(b.acquireItems)||!rows(b.useItems)||!Array.isArray(b.forms)||b.forms.some(f=>typeof f!=='string'||!f))errors.push('借形参数无效：须有修习次数、实际灵物代价与时限');
    if(!s||![90,360].includes(s.periodDays)||!int(s.minimumMembers,2)||!int(s.foragePerMember)||!Array.isArray(s.homes)||s.homes.some(h=>!ids.has(h)))errors.push('结社参数无效：须按季或年检查，至少两名成员，口粮与精怪之乡须登记');
    return errors;
}
// World-event subscriber; settlement order is the `order` field.
registerWorldEventSubscriber({id:'spirit_grudges',order:40,on:(d,engine,events)=>recordSpiritGrudges(d,engine,events)});
