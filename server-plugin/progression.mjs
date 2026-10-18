import {isPhysicallyDead} from './lifecycle-state.mjs';
import {derivedStats}from'./combat.mjs';
export const xpRequired=newLevel=>newLevel<10?newLevel*100:Math.ceil(newLevel**4/10);
const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label}不在允许范围`);return value;};

export function refreshPlayerLimits(d,engine){
    const player=d.get('state','player'),stats=derivedStats({level:player.level,attributes:player.attributes},engine.rules);
    d.set(['state','player','maxHp'],stats.maxHp);d.set(['state','player','maxMp'],stats.maxMp);
    // Growth changes capacity. It does not heal wounds or refill spent magic.
    d.set(['state','player','hp'],Math.min(stats.maxHp,player.hp));
    d.set(['state','player','mp'],Math.min(stats.maxMp,player.mp));
}

// This is an internal settlement primitive, never a model-callable reward tool.
export function awardExperience(d,engine,{kind,subject,source,base,repeat=false},eventId){
    integer(base,0,Number.MAX_SAFE_INTEGER,'经验基值');
    const previous=d.get('state','experienceLedger',source);
    if(previous)return{experience:0,duplicateReward:true,source};
    const now=d.get('state','minute'),player=d.get('state','player'),maximum=engine.rules.levels.maximum;
    const key=`${kind}:${subject}`,history=(d.get('state','experienceRepeats',key)??[]).filter(minute=>minute>now-1440);
    const repeatIndex=repeat?history.length:0;
    let gain=player.level>=maximum?0:Math.floor(base*(repeat?engine.rules.levels.experience.repeatDecay**repeatIndex:1));
    const record={kind,subject,source,eventId,minute:now,base,amount:gain,repeatIndex};
    d.set(['state','experienceLedger',source],record);
    if(repeat)d.set(['state','experienceRepeats',key],[...history,now]);
    let level=player.level,xp=player.xp+gain,levels=0;
    if(!Number.isSafeInteger(xp))throw new Error('经验总值超过安全数值范围');
    while(level<maximum&&xp>=xpRequired(level+1)){xp-=xpRequired(level+1);level++;levels++;}
    if(level===maximum)xp=0;
    d.set(['state','player','xp'],xp);
    if(levels){
        d.set(['state','player','level'],level);
        const points=levels*engine.rules.levels.freeAttributePoints;
        d.set(['state','player','freeAttributePoints'],(player.freeAttributePoints??0)+points);
        refreshPlayerLimits(d,engine);d.say(`升至${level}级，获得${points}个自由属性点`);
    }
    if(gain)d.say(`获得${gain}经验${level===maximum?'，已达到等级上限，超额经验不保留':''}`);
    return{experience:gain,source,level,xp,levels,repeatIndex};
}

export function milestone(d,engine,kind,subject,eventId){
    const range=engine.rules.levels.experience.milestones[kind];
    if(!range)throw new Error('里程碑类别未登记');
    return awardExperience(d,engine,{kind,subject,source:`${kind}:${subject}`,base:range[0]},eventId);
}

export function monsterReward(d,engine,target,eventId){
    const actor=d.get('state','creatures',target),definition=engine.byId.get(target);
    if(!actor||!isPhysicallyDead(engine,d,target))throw new Error('没有可验证的怪物战果');
    if(actor.owner)return{experience:0,reason:'驯养动物不计野外战果'};
    const species=definition.monster??target,template=definition.template??engine.byId.get(species)?.template??2;
    const level=actor.level??definition.level??definition.levelRange?.[0]??1,player=d.get('state','player');
    const gap=Math.abs(player.level-level),zero=engine.rules.levels.experience.monsterLevelGapZero;
    const multiplier=engine.rules.levels.experience.monsterTemplateMultipliers[template]??0;
    const base=Math.floor(level*multiplier*Math.max(0,1-gap/zero)*(definition.tier?2:1));
    return awardExperience(d,engine,{kind:'monster',subject:species,source:`defeat:${target}:${actor.incarnation??0}`,base,repeat:true},eventId);
}

export function allocateAttributes(d,args){
    const distribution=args.attributes;
    if(!distribution||typeof distribution!=='object'||Array.isArray(distribution))throw new Error('属性分配必须是公开属性到点数的对象');
    const entries=Object.entries(distribution),player=d.get('state','player');let total=0;
    for(const[key,value]of entries){
        if(!this.rules.attributes.includes(key))throw new Error('只能分配六项公开属性，不能修改幸运或其他字段');
        total+=integer(value,0,this.rules.levels.maximum*this.rules.levels.freeAttributePoints,'分配点数');
    }
    if(!total||total>(player.freeAttributePoints??0))throw new Error('自由属性点不足或没有实际分配');
    const attributes={...player.attributes};for(const[key,value]of entries)attributes[key]+=value;
    d.set(['state','player','attributes'],attributes);d.set(['state','player','freeAttributePoints'],player.freeAttributePoints-total);
    refreshPlayerLimits(d,this);d.say(`分配${total}个自由属性点`);
    const hp=d.get('state','player','hp'),maxHp=d.get('state','player','maxHp'),mp=d.get('state','player','mp'),maxMp=d.get('state','player','maxMp');
    return{attributes,spent:total,remaining:d.get('state','player','freeAttributePoints'),hp,maxHp,mp,maxMp,
        factSummary:`分配后当前生命${hp}/${maxHp}，当前魔力${mp}/${maxMp}；容量增长不补血或魔力，旧上限已失效。`};
}
