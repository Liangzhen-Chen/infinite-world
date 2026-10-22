import {preconditionFailure} from './precondition.mjs';
import {registerWorldEventSubscriber}from'./world-events.mjs';
import {bossCognitionField}from'./npc-state.mjs';
import {readBossNegotiation,breakBossAgreement}from'./boss-negotiation.mjs';
import {societyView}from'./monster-society.mjs';
import {isPhysicallyDead}from'./lifecycle-state.mjs';
const goals=new Set(['defend_territory','avoid_conflict']);
const intelligent=boss=>Number.isInteger(boss?.intelligence)&&boss.intelligence>0;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const living=(engine,d,id,actor)=>actor&&!isPhysicallyDead(engine,d,id)&&actor.hp>0;

// Existing intelligent residents defend their registered lair by default.
// Templates may select another implemented goal without adding authored history.
export function validateBossCognition(boss,locations){
    const c=boss.cognition;if(c===undefined)return[];
    if(!intelligent(boss))return['认知模板只适用于智能首领'];
    if(!plain(c)||Object.keys(c).some(k=>!['goal','territory'].includes(k))||!goals.has(c.goal))return['首领认知目标无效'];
    if(!Array.isArray(c.territory)||!c.territory.length||new Set(c.territory).size!==c.territory.length||
        c.territory.some(id=>typeof id!=='string'||locations&&!locations.has(id))||!c.territory.includes(boss.residence?.location??boss.lair))return['首领认知领地须包含巢穴及实际地点'];
    return[];
}
function template(boss){
    const errors=validateBossCognition(boss);if(errors.length)throw new Error(errors.join('；'));
    return boss.cognition??{goal:'defend_territory',territory:[boss.residence?.location??boss.lair]};
}
export function emptyBossCognition(){return{format:1,encounters:[]};}
export function readBossCognition(actor){
    const c=actor[bossCognitionField(actor)]===undefined?emptyBossCognition():actor[bossCognitionField(actor)],ids=new Set();
    if(!plain(c)||c.format!==1||!Array.isArray(c.encounters))throw preconditionFailure('首领接触记忆格式不支持，拒绝覆盖');
    for(const e of c.encounters){
        if(!plain(e)||typeof e.event!=='string'||!e.event||ids.has(e.event)||e.actor!=='player'||
            !Number.isSafeInteger(e.minute)||e.minute<0||typeof e.location!=='string'||!e.location||
            !['approach','clash'].includes(e.kind)||
            (e.kind==='clash'&&(typeof e.tactic!=='string'||!e.tactic))||
            (e.kind==='approach'&&e.tactic!==undefined))throw preconditionFailure('首领接触记忆数据损坏，拒绝覆盖');
        ids.add(e.event);
    }
    return c;
}
export function rememberBossEncounter(d,engine,target,{kind,tactic,eventId}){
    const actor=engine.actor(d,target),boss=engine.byId.get(actor?.boss);
    if(!intelligent(boss))return;
    template(boss);
    if(!actor||actor.location!==d.get('state','location')||
        kind==='approach'&&(!living(engine,d,target,actor)||actor.owner))throw preconditionFailure('首领接触需要实际在场的自由个体');
    if(!['approach','clash'].includes(kind)||typeof eventId!=='string'||!eventId||
        kind==='clash'&&(typeof tactic!=='string'||!tactic))throw preconditionFailure('首领接触事件无效');
    const c=structuredClone(readBossCognition(actor)),prior=c.encounters.find(e=>e.event===eventId);
    if(prior){
        if(prior.kind!==kind||prior.tactic!==tactic)throw preconditionFailure('首领接触事件编号冲突');
        return;
    }
    c.encounters.push({event:eventId,actor:'player',kind,minute:d.get('state','minute'),location:actor.location,...(kind==='clash'?{tactic}:{})});
    d.set([...engine.actorPath(target),bossCognitionField(actor)],c);
    if(kind==='clash'&&!['flee','defend'].includes(tactic))breakBossAgreement(d,target,eventId,engine);
}

// A public reaction is derived from witnessed encounters, current territory and
// the resident's goal. Peaceful visits never erase a previous attack.
export function bossPublicAttitude(d,engine,target){
    const actor=engine.actor(d,target),boss=engine.byId.get(actor?.boss);
    if(!intelligent(boss)||!living(engine,d,target,actor)||actor.location!==d.get('state','location'))return undefined;
    const c=readBossCognition(actor),t=template(boss),inTerritory=t.territory.includes(actor.location);
    const clashes=c.encounters.filter(e=>e.kind==='clash'),threats=clashes.filter(e=>!['flee','defend'].includes(e.tactic));
    const territorialThreat=threats.some(e=>t.territory.includes(e.location));
    let attitude='警戒',reason='尚未有可辨认的实际接触';
    if(c.encounters.length){attitude='认得来者';reason='记得此前的实际接触';}
    if(t.goal==='defend_territory'&&inTerritory){
        attitude='守界警告';reason='以守住巢穴领地为目标，要求来者保持距离';
        if(territorialThreat){attitude='敌对防备';reason='记得来者曾在领地内发起交锋';}
        else if(clashes.length){reason='记得此前交锋，仍守住领地边界';}
    }else if(t.goal==='avoid_conflict'&&threats.length){
        attitude='回避冲突';reason='记得来者发起交锋，以避免继续冲突为目标';
    }else if(t.goal==='avoid_conflict'&&c.encounters.length){
        attitude='谨慎容忍';reason='接触中未见来者发起进攻，以避免冲突为目标';
    }
    const relation=readBossNegotiation(actor).relation;
    if(relation){attitude=relation.alliance?'盟约有效':'和平约定';reason=relation.pact==='respect_territory'?'记得你已承诺尊重领地边界':'记得双方已议定互不攻击';}
    if(actor.hp<actor.maxHp*.25){attitude='退守';reason='当前重伤，先保全自身';}
    return{attitude,reason,recognized:c.encounters.length>0,contacts:c.encounters.filter(e=>e.kind==='approach').length,
        clashes:clashes.length,territory:boss.territory,inTerritory,lastEncounter:structuredClone(c.encounters.at(-1)??null),...(relation?{relation:structuredClone(relation)}:{}),
        ...(boss.actor&&societyView(d.get('state'),engine,boss)?{society:societyView(d.get('state'),engine,boss)}:{})};
}

// World-event subscriber: blows and spells are already remembered as clashes
// with their tactic. A theft from the resident counts as a hostile clash and a
// gift as a peaceful approach, when the resident is present and intelligent.
export function recordBossEvents(d,engine,events){
    for(const e of events){
        if(e.legacy||e.actor!=='player'||!e.target||!['steal','gift'].includes(e.verb))continue;
        const actor=engine.actor(d,e.target);
        if(!actor?.boss||!intelligent(engine.byId.get(actor.boss))||!living(engine,d,e.target,actor)||actor.location!==d.get('state','location')||actor.owner)continue;
        if(readBossCognition(actor).encounters.some(x=>x.event===e.id))continue;
        rememberBossEncounter(d,engine,e.target,e.verb==='steal'?{kind:'clash',tactic:'theft',eventId:e.id}:{kind:'approach',eventId:e.id});
    }
}
// World-event subscriber; settlement order is the `order` field.
registerWorldEventSubscriber({id:'boss_cognition',order:50,on:(d,engine,events)=>recordBossEvents(d,engine,events)});
