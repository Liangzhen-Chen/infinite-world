import {createHash}from'node:crypto';
import {declareHoldingWriter,holdingSet,isPhysicallyDead} from './holdings.mjs';
import {recordsWhere} from './storage.mjs';
import {worldEvent} from './world-events.mjs';
import {combatActor,combatLocation,activeEncounters} from './combat-state.mjs';
export {activeEncounters} from './combat-state.mjs';
declareHoldingWriter('combat-state');
export function initializeEncounter(d,e,row,context){
 const s=d.get('state');
 if(context?.origin!=='initial'||!context.eventId||typeof row.id!=='string'||!row.id||s.records?.[`combat_encounter:${row.id}`]||row.active!==true||typeof row.playerActedThisRound!=='boolean'||!Array.isArray(row.participants)||row.participants.length<2||new Set(row.participants).size!==row.participants.length||!row.participants.includes('player')||row.participants.some(id=>!combatActor(s,id)||isPhysicallyDead(e,s,id)||combatLocation(s,id)!==s.location)||activeEncounters(e,s).some(r=>r.participants.some(id=>row.participants.includes(id))))throw Error('Invalid initial encounter or participants');
 // Importing an encounter never attacks or creates hostility.
 const sources=row.participants.filter(id=>id!=='player').map(id=>recordsWhere(s.records,'category','world_event').find(r=>r.verb==='hostile_encounter'&&r.minute<=s.minute&&((r.actor===id&&(r.target??r.payload?.target)==='player')||(r.actor==='player'&&(r.target??r.payload?.target)===id))));
 if(sources.some(r=>!r||!worldEvent(s,r.id)))throw Error('Encounter requires a native hostile event for every opponent');
 holdingSet(d,e,['state','records',`combat_encounter:${row.id}`],{...row,category:'combat_encounter',round:1,location:s.location,sourceEvent:context.eventId,hostileEvents:sources.map(r=>r.id)},'combat-state');
}
export function encounterForExchange(d,e,actor,target){
 const rows=activeEncounters(e,d.get('state'),actor).filter(r=>r.participants.includes(target));
 if(rows.length>1)throw Error('Ambiguous active encounter');
 const row=rows[0];
 if(actor==='player'&&row?.playerActedThisRound)throw Error('Player already acted this round');
 return row??null;
}
export function settleEncounterExchange(d,e,encounter,{actor,target,intent,escaped,eventId,ended=false,exchange={}}){
 const s=d.get('state'),id=encounter?.id??`exchange:${eventId}`,participants=encounter?.participants??[actor,target];
 const active=!ended&&!escaped&&participants.every(id=>!isPhysicallyDead(e,s,id)&&combatLocation(s,id)===s.location);
 // A legacy exchange includes the opponent's response. Preserve the spent
 // round and open the next one, rather than locking out every later exchange.
 const round=encounter?.round??1;
 const row={...encounter,id,category:'combat_encounter',participants,location:encounter?.location??exchange.origin??s.location,active,round:active?round+1:round,playerActedThisRound:!active&&actor==='player',lastRound:{round,actor,intent,playerActed:actor==='player',sourceEvent:eventId,...exchange},sourceEvent:encounter?.sourceEvent??eventId};
 holdingSet(d,e,['state','records',`combat_encounter:${id}`],row,'combat-state');
 return {id,active,round:row.round,playerActedThisRound:row.playerActedThisRound};
}
// A descriptive retreat names a known path, never an arbitrary map node.
// Every edge (including a multi-edge known path) is traversed by normal travel.
export function combatEscapeDestination(d,e,requested){
 const s=d.get('state'),visible=row=>row&&(row.minute??row.updated??0)<=s.minute&&(!row.private||(row.permittedRecipients??row.knownBy??[]).includes('player'))&&(!row.permittedRecipients||row.permittedRecipients.includes('player'));
 const known=new Set(Object.keys(s.discoveries??{}).filter(id=>visible(s.discoveries[id])));
 const paths=new Set();
 for(const memory of Object.values(d.document.memories??{}))if(memory.source==='known_path'&&visible(memory))paths.add(memory.subject);
 const adjacent=[...new Set(e.world.routes.filter(r=>r.from===s.location||r.to===s.location).map(r=>r.from===s.location?r.to:r.from))];
 let exact;try{exact=e.resolve(requested);}catch{}
 const destinations=paths.size?[...paths]:adjacent.filter(id=>known.has(id));
 const candidates=destinations.filter(id=>(!exact||id===exact)).filter(id=>{
  try{return e.route(s.location,id,'walk',s.minute,d.document.randomSeed).edges.length>0;}catch{return false;}
 });
 if(!exact&&!/(?:旁|附近|身边|小路|path|nearby|adjacent)/i.test(requested))throw Error('Unknown escape destination');
 if(candidates.length!==1)throw Error('Escape requires one known passable path destination');
 return candidates[0];
}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const combatRandom=(document,eventId)=>seededRandom(createHash('sha256').update(`${document.randomSeed}:${eventId}:combat`).digest().readUInt32LE(0));
export function derivedStats({level,attributes,profession=false,equipment={}},rules){
    const c=rules.combat.character;
    const a=attributes??Object.fromEntries(rules.attributes.map(name=>[name,10]));
    return {level,maxHp:Math.max(1,Math.round(c.hpBase+level*c.hpPerLevel+(a.体质-10)*c.hpPerConstitution)),
        maxMp:Math.max(0,Math.round(c.mpBase+level*c.mpPerLevel+(a.精神-10)*c.mpPerSpirit)),
        carryKg:Math.max(1,c.carryBase+a.力量*c.carryPerStrength),
        attack:(c.attackBase+level*c.attackPerLevel+(a.力量-10)*c.attackPerStrength+(equipment.attack??0))*(profession?c.professionAttackMultiplier:1),
        defense:Math.max(0,c.defenseBase+level*c.defensePerLevel+(a.体质-10)*c.defensePerConstitution+(equipment.defense??0)),
        hit:clamp(c.hitBase+(a.敏捷-10)*c.hitPerDexterity+(equipment.hit??0),0.1,0.98),
        evasion:clamp((a.敏捷-10)*c.evasionPerDexterity+(equipment.evasion??0),0,0.45),
        castSeconds:Math.max(1,c.castBaseSeconds-(a.精神-10)*c.castPerSpirit),critical:c.critical};
}
export function monsterStats({level,template=2,bossTier=0},rules){
    const row=rules.combat.monster,beast=template<=1,scale=beast?row.beast:row.standard;
    const ordinary={level,maxHp:scale.hpBase+level*scale.hpPerLevel,attack:scale.attackBase+level*scale.attackPerLevel,
        defense:scale.defensePerLevel*level,hit:row.hit,evasion:0,critical:row.critical,attacks:1,divine:template>=10};
    if(bossTier){ordinary.maxHp*=rules.bossEcology?.hpMultiplier??row.bossHpMultiplier;ordinary.attack*=row.bossAttackMultiplier;
        ordinary.attacks=row.bossAttacks;ordinary.defense*=row.bossDefenseMultiplier;ordinary.bossTier=bossTier;}
    ordinary.maxHp=Math.max(1,Math.round(ordinary.maxHp));
    if(template===0){ordinary.attack=0;ordinary.attacks=0;}
    return ordinary;
}
export function strike(attacker,defender,rng,rules,{damageMultiplier=1,hitModifier=0}={}){
    const hitChance=clamp(attacker.hit-(defender.evasion??0)+hitModifier,rules.combat.minimumHit,rules.combat.maximumHit);
    if(rng()>=hitChance)return {hit:false,damage:0,critical:false};
    const critical=rng()<attacker.critical;
    const spread=rules.combat.damageSpread;
    const raw=(attacker.attack*(1-spread+2*spread*rng())-defender.defense)*damageMultiplier;
    return {hit:true,critical,damage:Math.max(1,Math.round(raw*(critical?rules.combat.criticalMultiplier:1)))};
}
export function seededRandom(seed){
    let state=seed>>>0||1;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
}
export function tacticDefense(seen,rules){
    const r=rules.bossEcology;if(!r)return{damageMultiplier:1,adapted:false};
    return{damageMultiplier:1-Math.min(r.maximumDamageReduction,Math.floor(seen/r.learningThreshold)*r.damageReductionPerStep),adapted:seen>=r.learningThreshold};
}
export function simulateFight(team,opponent,rules,rng){
    const party=team.map(stats=>({...stats,hp:stats.maxHp})),enemy={...opponent,hp:opponent.maxHp};
    if(enemy.divine&&!party.some(member=>member.divinePermission))return {won:false,rounds:0,reason:'神性屏障'};
    const first=rng()<0.5;
    const tactics={};
    const partyTurn=()=>{for(const member of party)if(member.hp>0&&enemy.hp>0){
        const tactic=member.combatTactic??'unarmed',seen=tactics[tactic]??0,counter=enemy.bossTier?tacticDefense(seen,rules):{damageMultiplier:1};
        enemy.hp=Math.max(0,enemy.hp-strike(member,enemy,rng,rules,{damageMultiplier:counter.damageMultiplier}).damage);tactics[tactic]=seen+1;
    }};
    const enemyTurn=()=>{
        for(let i=0;i<enemy.attacks&&enemy.hp>0;i++){
            const live=party.filter(member=>member.hp>0);if(!live.length)break;
            const target=live[Math.floor(rng()*live.length)];target.hp=Math.max(0,target.hp-strike(enemy,target,rng,rules).damage);
        }
    };
    for(let round=1;round<=rules.combat.simulationRoundLimit;round++){
        if(first){partyTurn();enemyTurn();}else{enemyTurn();partyTurn();}
        if(enemy.hp<=0)return {won:true,rounds:round};
        if(party.every(member=>member.hp<=0))return {won:false,rounds:round};
    }
    return {won:false,rounds:rules.combat.simulationRoundLimit,reason:'超过交锋上限'};
}
