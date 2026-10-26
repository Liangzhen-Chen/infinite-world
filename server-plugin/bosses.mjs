import {moveFishPopulation} from './stock.mjs';
import {takePopulation} from './population-health.mjs';
import {preconditionFailure} from './precondition.mjs';
import {isLiving} from './lifecycle-state.mjs';
import {createHash} from 'node:crypto';
import {monsterStats,tacticDefense} from './combat.mjs';
import {validateBossMechanics,templateBossCounter}from'./boss-abilities.mjs';
import {emptyBossCognition,rememberBossEncounter,bossPublicAttitude}from'./boss-cognition.mjs';
import {initialBossNegotiation,negotiateBoss}from'./boss-negotiation.mjs';
import {spiritStateFor}from'./creature-nature.mjs';
import {creatureCounter}from'./interactions.mjs';
import {traitsOf}from'./traits.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {changeLegacyHoldings,transition} from './transition.mjs';
declareHoldingWriter('bosses',{kinds:['controls','tamed_by'],entities:['wreck'],locations:true});
const clone=v=>structuredClone(v),key=b=>['state','records',`lair:${b.residence.id}`];
const living=(d,id)=>{
    const source=typeof d?.get==='function'&&!d.document?{state:d.get('state'),holdings:d.get('holdings')}:d;
    return isLiving(null,source,id)&&d.get('state',id?.startsWith('npc_')?'npcs':'creatures',id)?.hp>0;
};
function writeLair(d,engine,boss,row){
    const previous=d.get(...key(boss)),holder=previous?.occupant?.actor??previous?.occupant?.definition;
    const write=()=>holdingSet(d,engine,key(boss),row,'bosses');
    if(holder&&(holder!==(row.occupant?.actor??row.occupant?.definition)||!['驻守','易主'].includes(row.status)))
        return changeLegacyHoldings(d,engine,{holder,subject:boss.residence.id,kinds:['controls'],eventId:`lair:${boss.residence.id}:${row.lastDay}:${holder}`},write);
    return write();
}
export function validateBossEcology(world){
    const errors=[],rules=world.rules.bossEcology;if(!rules)return errors;
    if(!world.rules.wildlife)errors.push('首领生态需要实际野外种群');
    const lairs=new Set(),locations=new Set(world.locations.map(l=>l.id)),monsters=new Map(world.monsters.map(s=>[s.id,s]));
    for(const boss of world.bosses??[]){
        errors.push(...validateBossMechanics(boss).map(error=>`${boss.id}:${error}`));
        if(!boss.residence){errors.push(`首领缺巢穴规则：${boss.id}`);continue;}
        const r=boss.residence,s=monsters.get(boss.monster);
        if(lairs.has(r.id))errors.push(`巢穴编号重复：${r.id}`);lairs.add(r.id);
        const band=world.rules.monsters.levelRanges[s?.template];
        if(!s||!band||boss.level<band[0]||boss.level>band[1])errors.push(`首领等级与原物种模板不符：${boss.id}`);
        if(boss.actor){
            const npc=world.npcs.find(n=>n.id===boss.actor);
            if(!npc||npc.tier!=='full'||npc.species!==boss.monster||!npc.society||!(boss.intelligence>0))errors.push(`社会首领须引用同物种的完整居民：${boss.id}`);
            if(world.bosses.some(b=>b.id!==boss.id&&b.actor===boss.actor))errors.push(`同一居民重复登记首领身体：${boss.actor}`);
            if(!locations.has(r.location)||r.location!==boss.lair)errors.push(`巢穴位置不符：${boss.id}`);
            let location=world.locations.find(l=>l.id===r.location),seen=new Set();
            while(location&&location.id!==npc?.society&&!seen.has(location.id)){seen.add(location.id);location=world.locations.find(l=>l.id===location.parent);}
            if(!location||location.id!==npc?.society)errors.push(`社会首领巢穴不在所属聚居地：${boss.id}`);
            if((r.replacementSpecies?.length??0)||(r.minionCount??0)||(boss.minions?.length??0))errors.push(`社会首领不能补刷野生部下或迁入者：${boss.id}`);
            continue;
        }
        if(!locations.has(r.location)||r.location!==boss.lair)errors.push(`巢穴位置不符：${boss.id}`);
        const habitat=world.rules.wildlife?.habitats.find(h=>h.id===r.habitat);
        if(!habitat||habitat.location!==r.location)errors.push(`巢穴栖地不符：${boss.id}`);
        if(s?.wildlife?.habitat!==r.habitat)errors.push(`原首领物种与巢穴栖地不符：${boss.id}`);
        if(r.minionCount>0&&!boss.minions?.length)errors.push(`首领部下数量有值却未登记物种：${boss.id}`);
        for(const id of [...r.replacementSpecies,...boss.minions??[]])if(!monsters.has(id)||monsters.get(id).wildlife?.habitat!==r.habitat)errors.push(`迁入者或部下不是当地物种：${boss.id}`);
        if(r.replacementSpecies.includes(boss.monster))errors.push(`迁入者不能是原首领同种刷新：${boss.id}`);
    }return errors;
}
export function bossCounter(d,engine,target,tactic){
    const actor=engine.actor(d,target),r=engine.rules.bossEcology;
    // Species nature and body tags go through the interaction table (K2).
    const n=living(d,target)?creatureCounter(traitsOf(engine,d.get('state'),target),tactic):null;
    const element=n?{damageMultiplier:n.damageMultiplier,interaction:n.interaction,...(n.nature?{nature:n.nature}:{})}:null;
    if(!r||!actor?.boss||!living(d,target))return{tactic,seen:0,damageMultiplier:actor?.boss?1:element?.damageMultiplier??1,adapted:false,...(element&&!actor.boss?{...element}:{})};
    const seen=actor.battleMemory?.tactics?.[tactic]??0;
    if(!Number.isSafeInteger(seen)||seen<0)throw Error('首领战术记忆数据损坏，拒绝伪造防备或覆盖原记录');
    const counter=templateBossCounter(d,engine.byId.get(actor.boss),actor,tactic,engine.magicStatusContext?.(d,target))??{tactic,seen,...tacticDefense(seen,engine.rules),
        ...(tactic==='flee'&&seen>=r.learningThreshold?{escapeDifficulty:r.escapeDifficulty}:{})};
    return element?{...counter,...element,damageMultiplier:counter.damageMultiplier*element.damageMultiplier}:counter;
}
export function rememberBossTactic(d,engine,target,tactic,eventId){
    const actor=engine.actor(d,target);if(!engine.rules.bossEcology||!actor?.boss)return;
    rememberBossEncounter(d,engine,target,{kind:'clash',tactic,eventId});
    const memory=clone(actor.battleMemory??{tactics:{},lastEvent:null});if(memory.lastEvent===eventId)return;
    if(!memory.tactics||typeof memory.tactics!=='object'||Array.isArray(memory.tactics))throw Error('首领战术记忆格式不支持，拒绝覆盖原记录');
    memory.tactics[tactic]=(memory.tactics[tactic]??0)+1;memory.lastEvent=eventId;memory.lastMinute=d.get('state','minute');
    d.set([...engine.actorPath(target),'battleMemory'],memory);
    const publicAttitude=bossPublicAttitude(d,engine,target);
    if(publicAttitude)d.say(`${actor.name}：${publicAttitude.attitude}。${publicAttitude.reason}`);
}
export function defeatBoss(d,engine,target,eventId){
    const actor=engine.actor(d,target),boss=engine.byId.get(actor?.boss);if(!boss?.residence||living(d,target))return null;
    const r=clone(d.get(...key(boss)));if(r.occupant?.actor!==target)return null;
    if(!d.get('holdings','protocol','entities',target)?.gone)
        transition(d,engine,{entity:target,basis:'death',origin:'vital',eventId});
    const day=Math.floor(d.get('state','minute')/1440);r.history.push({event:eventId,day,occupant:target,definition:boss.id,type:'败亡'});
    r.status='空置';r.occupant=null;r.vacantSince=day;r.reoccupyAfter=boss.actor?null:day+boss.residence.vacancyDays;writeLair(d,engine,boss,r);
    if(boss.actor)return{lair:boss.residence.name,vacant:true,note:'社会首领已死，居民与聚居地保留；不会从野生种群补刷'};
    return{lair:boss.residence.name,vacant:true,note:'原首领已死，巢穴空置；不会复活原个体，未来迁入者须来自实际种群'};
}
function instantiate(d,engine,{id,species,location,lair,boss=null,eventId}){
    const definition=engine.byId.get(boss??species),s=engine.byId.get(species),level=boss?definition.level:s.levelRange[0];
    const stats=monsterStats({level,template:s.template,bossTier:boss?definition.tier:0},engine.rules),name=boss?definition.name:`${s.name}·${id.slice(-4)}`;
    if(!boss)holdingSet(d,null,['state','created',id],{id,name,aliases:[],monster:species,template:s.template,scope:location},'bosses');
    holdingSet(d,null,['state','creatures',id],{name,species,ecology:s.wildlife.habitat,lair,location,level,hp:stats.maxHp,maxHp:stats.maxHp,status:'正常',owner:null,...spiritStateFor(s),
        ...(boss?{boss,battleMemory:{tactics:{},lastEvent:null},...(definition.intelligence>0?{cognition:emptyBossCognition(),negotiation:initialBossNegotiation(definition,engine)}:{})}:{}),source:eventId},'bosses');
    return{id,name,level,hp:stats.maxHp};
}
function drawSpecies(d,engine,species,lair,eventId){
    const s=engine.byId.get(species),habitat=engine.rules.wildlife.habitats.find(h=>h.id===s.wildlife.habitat),path=['state','records',`ecology:${habitat.id}`];
    const record=clone(d.get(...path)),p=record.populations[species];if(!p?.count)return null;
    const id=`monster_instance_${createHash('sha256').update(`${d.document.randomSeed}:${eventId}:${species}`).digest('hex').slice(0,16)}`;
    if(d.get('state','creatures',id)||d.get('state','created',id))throw Error('巢穴迁入个体编号重复');
    moveFishPopulation(d,engine,species,habitat.location,id,1,eventId);
    const health=takePopulation(p,1);p.withdrawn++;d.set(path,record);
    const actor=instantiate(d,engine,{id,species,location:habitat.location,lair,eventId});
    const compartment=health.I?'I':health.R?'R':null;
    if(compartment)holdingSet(d,engine,['state','creatures',id,'populationHealth'],compartment,'bosses');
    return actor;
}
export function advanceBosses(d,engine,day){
    if(!engine.rules.bossEcology)return;
    for(const boss of engine.world.bosses.filter(b=>b.residence)){
        const r=clone(d.get(...key(boss)));if(r.lastDay!==day-1)throw Error('巢穴日结不连续');
        if(boss.actor){
            const actor=engine.actor(d,boss.actor),present=living(d,boss.actor)&&actor.location===boss.residence.location;
            r.occupant=present?{kind:'boss',definition:boss.id,actor:boss.actor}:null;
            r.status=present?'驻守':'空置';r.reoccupyAfter=null;
            r.lastDay=day;writeLair(d,engine,boss,r);continue;
        }
        if(r.occupant?.actor){
            const actor=engine.actor(d,r.occupant.actor);
            if(actor&&(actor.owner||actor.location!==boss.residence.location)){
                r.history.push({type:'占据者离开或归属改变',day:day+1,occupant:r.occupant.actor});r.occupant=null;r.status='空置';r.vacantSince=day+1;r.reoccupyAfter=day+1+boss.residence.vacancyDays;
            }
        }
        if(r.status==='空置'&&day+1>=r.reoccupyAfter){
            for(const species of boss.residence.replacementSpecies){
                const actor=drawSpecies(d,engine,species,boss.residence.id,`lair_${boss.residence.id}_${day}`);if(!actor)continue;
                r.occupant={kind:'monster',definition:species,actor:actor.id};r.status='易主';
                r.history.push({type:'迁入',day:day+1,occupant:actor.id,definition:species});break;
            }
        }
        if(r.occupant?.kind==='monster'&&!living(d,r.occupant.actor)){
            r.history.push({type:'迁入者离去或死亡',day,occupant:r.occupant.actor});r.occupant=null;r.status='空置';r.vacantSince=day;r.reoccupyAfter=day+boss.residence.vacancyDays;
        }
        r.lastDay=day;writeLair(d,engine,boss,r);
    }
}
export function lairAction(d,args,eventId){
    if(!this.rules.bossEcology)throw preconditionFailure('当前世界没有启用首领巢穴');
    const here=this.world.bosses.filter(b=>b.residence?.location===d.get('state','location'));
    const boss=args.lair?here.find(b=>[b.residence.id,b.residence.name].includes(args.lair)):here.length===1?here[0]:null;
    if(!boss)throw new Error(!args.lair&&here.length?'需要明确所在地巢穴名称或编号':'这里没有可接触的巢穴');
    const r=clone(d.get(...key(boss))),operation=args.operation??'observe';
    if(operation==='observe'){
        const target=boss.actor??r.occupant?.actor,actor=target?this.actor(d,target):null;
        return{lair:boss.residence.name,occupant:actor&&actor.location===d.get('state','location')?{id:target,name:actor.name,status:actor.status,hp:actor.hp,
            ...publicContact(d,this,target)}:null,
            note:actor?'仅观察已接触个体':'尚未接触活体，入口观察不能知道未见占据者或其战斗记忆',actionScope:{kind:'instant',instantaneous:true}};
    }
    if(operation==='negotiate')return negotiateBoss(d,this,boss,r,args,eventId);
    if(operation!=='approach')throw preconditionFailure('巢穴操作需为observe、approach或negotiate');
    this.advance(d,this.rules.bossEcology.approachMinutes,eventId);
    if(d.get('state','location')!==boss.residence.location||d.get('state','player','status')!=='正常')return{contact:null,note:'进入前失去行动能力或离开此地'};
    const latest=clone(d.get(...key(boss)));
    if(boss.actor){
        const actor=this.actor(d,boss.actor);
        latest.occupant=living(d,boss.actor)&&actor.location===boss.residence.location?{kind:'boss',definition:boss.id,actor:boss.actor}:null;
        latest.status=latest.occupant?'驻守':'空置';holdingSet(d,null,key(boss),latest,'bosses');
    }
    if(!latest.occupant)return{contact:null,note:'巢穴实际空置，进入不会触发原首领重生'};
    if(latest.occupant.actor){const actor=this.actor(d,latest.occupant.actor);
        if(!living(d,latest.occupant.actor)||actor.owner||actor.location!==boss.residence.location)return{contact:null,note:'原占据者已不在此处活动，不能隔空接触或重造同一首领'};
        rememberBossEncounter(d,this,latest.occupant.actor,{kind:'approach',eventId});
        return{contact:{id:latest.occupant.actor,name:actor.name,status:actor.status,hp:actor.hp,...publicContact(d,this,latest.occupant.actor)},alreadyPresent:true};}
    if(latest.occupant.kind!=='boss'||latest.occupant.definition!==boss.id)throw Error('巢穴占据者记录无效');
    const contact=instantiate(d,this,{id:boss.id,species:boss.monster,boss:boss.id,location:boss.residence.location,lair:boss.residence.id,eventId});
    latest.occupant.actor=boss.id;holdingSet(d,null,key(boss),latest,'bosses');
    rememberBossEncounter(d,this,boss.id,{kind:'approach',eventId});
    Object.assign(contact,publicContact(d,this,boss.id));
    const minions=[];for(let i=0;i<boss.residence.minionCount;i++){
        const species=boss.minions[i%boss.minions.length];if(!species)break;
        const drawn=drawSpecies(d,this,species,boss.residence.id,`${eventId}_minion_${i}`);if(drawn)minions.push(drawn);
    }
    return{contact,minions,note:'接触巢穴既有首领与实际部下，没有自动攻击、驯服或获得材料'};
}
function publicContact(d,engine,target){const cognition=bossPublicAttitude(d,engine,target);return cognition?{cognition}:{};}
