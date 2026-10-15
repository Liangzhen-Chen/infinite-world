import {createHash}from'node:crypto';
import {effectiveProficiency}from'./professions.mjs';
import {heldUnit}from'./items.mjs';
import {trickKey,adaptationBonus,noteTrick,intelligenceFresh}from'./npc-intelligence.mjs';
import {hiddenCheckBonus,passiveDomain,observationTime}from'./hidden-passives.mjs';
const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label}不在允许范围`);return value;};
const die=(document,eventId,label)=>createHash('sha256').update(`${document.randomSeed}:${eventId}:${label}`).digest().readUInt32LE(0)%20+1;
const attributeOf=(engine,value)=>{if(!engine.rules.attributes.includes(value))throw new Error('属性不在规则表');return value;};
export function npcProficiency(d,engine,npc,skill){
    const actor=d.get('state','npcs',npc),definition=engine.byId.get(npc);
    const raw=actor?.skills?.[skill]??definition?.skills?.[skill];
    return integer(raw&&typeof raw==='object'?raw.proficiency:raw??0,0,2699,'人物技能熟练度');
}
function presentNpc(d,engine,name){
    const npc=engine.resolve(name,'npc'),actor=d.get('state','npcs',npc);
    if(!actor||actor.location!==d.get('state','location'))throw new Error('检定当事人不在场');
    if(['死亡','濒死'].includes(actor.status))throw new Error('检定当事人无法清醒行动');
    return npc;
}
function modifierForNpc(d,engine,npc,attribute,skill,domain=null){
    const score=d.get('state','npcs',npc,'attributes',attribute)??engine.byId.get(npc)?.attributes?.[attribute]??10;
    return Math.floor((integer(score,1,1000,'人物属性')-10)/2)+Math.floor((skill?npcProficiency(d,engine,npc,skill):0)/engine.rules.check.skillDivisor)+hiddenCheckBonus(engine,d.get('state'),npc,domain).bonus;
}
export function npcEntryCheck(d,engine,npc,{attribute,skill,difficulty},eventId){
    const score=d.get('state','npcs',npc,'attributes',attribute)??engine.byId.get(npc)?.attributes?.[attribute]??10;
    const raw=d.get('state','npcs',npc,'skills',skill)??engine.byId.get(npc)?.proficiencies?.[skill]??engine.byId.get(npc)?.skills?.[skill]??0;
    const proficiency=typeof raw==='number'?raw:raw.proficiency??0;
    const roll=die(d.document,eventId,`exam:${npc}`),modifier=Math.floor((score-10)/2)+Math.floor(proficiency/engine.rules.check.skillDivisor),total=roll+modifier;
    const result={die:roll,modifier,total,difficulty,success:roll!==1&&(roll===20||total>=difficulty)};
    d.set(['state','checks',eventId],{...result,npc,attribute,skill});return result;
}
export function toolBonuses(d,engine,tools,attribute,skill){
    if(!Array.isArray(tools)||tools.length>8)throw new Error('工具列表无效');
    const ids=tools.map(name=>engine.resolve(name,'item'));if(new Set(ids).size!==ids.length)throw new Error('同一工具不能重复计加值');
    const details=ids.map(item=>{
        if(engine.quantity(d,'player',item)<1)throw new Error('没有所需工具');
        const held=heldUnit(d,engine,'player',item),definition=engine.byId.get(item);
        if((held.durability??definition.durability)<=0)throw new Error('工具已经损坏');
        const grade=engine.rules.equipment.qualities.indexOf(held.quality??definition.quality);
        if(grade<0)throw new Error('工具品质不在规则表');
        if(d.get('state','player','level')<engine.rules.equipment.requiredLevels[grade])throw new Error('等级不足以使用工具');
        const spec=definition.checkBonus;
        const matches=spec&&(!spec.attributes?.length||spec.attributes.includes(attribute))&&(!spec.skills?.length||spec.skills.includes(skill));
        return{item,bonus:matches?integer(spec.bonus,0,5,'工具加值'):0};
    });
    return{bonus:Math.min(engine.rules.check.maximumToolBonus??5,details.reduce((sum,row)=>sum+row.bonus,0)),details};
}
export function check(d,args,eventId){
    if(args.modifier!==undefined)throw new Error('修正由属性和技能计算，不能直接指定');
    const attribute=attributeOf(this,args.attribute??'精神'),skill=args.skill?this.resolve(args.skill,'skill'):null;
    const domain=passiveDomain(this,d.get('state'),{...args,skill});
    const context=integer(args.context??0,-this.rules.check.contextLimit,this.rules.check.contextLimit,'情境修正');
    if(context&&(typeof args.contextReason!=='string'||!args.contextReason.trim()))throw new Error('情境修正缺少理由');
    let difficulty,opponent,trick;
    if(args.opponent){
        if(args.difficulty!==undefined)throw new Error('对抗使用对手检定，不同时指定固定难度');
        const npc=presentNpc(d,this,args.opponent.npc),otherAttribute=attributeOf(this,args.opponent.attribute??attribute);
        if(Object.keys(args.opponent).some(key=>!['npc','attribute','skill'].includes(key)))throw new Error('不能指定对手的修正或骰点');
        const otherSkill=args.opponent.skill?this.resolve(args.opponent.skill,'skill'):null;
        // 灵智：玩家同一手法屡次得手后，对手起防备（只看玩家所用属性与技能）。
        trick=trickKey(attribute,skill);const wary=intelligenceFresh(this)?adaptationBonus(this,d.get('state'),npc,trick):0;
        const roll=die(d.document,eventId,'opponent:d20'),modifier=modifierForNpc(d,this,npc,otherAttribute,otherSkill,domain)+wary;
        opponent={npc,attribute:otherAttribute,skill:otherSkill,die:roll,modifier,total:roll+modifier,...(wary?{wary}:{})};difficulty=opponent.total;
    }else{
        difficulty=typeof args.difficulty==='string'?this.rules.check.difficulties[args.difficulty]:args.difficulty;
        if(!Object.values(this.rules.check.difficulties).includes(difficulty))throw new Error('难度不在规则档位');
    }
    const helperKeys=args.helpers??[];
    if(!Array.isArray(helperKeys)||helperKeys.length>(this.rules.check.maximumHelpers??2)||new Set(helperKeys).size!==helperKeys.length)throw new Error('协助人数超限或记录重复');
    const helpers=[],people=new Set();
    for(const key of helperKeys){
        const obligation=d.get('state','obligations',key);
        if(!obligation||obligation.type!=='协助'||obligation.promisee!=='player'||!['待履行','进行中'].includes(obligation.status)||obligation.deadline<=d.get('state','minute'))throw new Error('协助需要尚有效且未履行的承诺');
        const npc=presentNpc(d,this,obligation.promisor);
        if(people.has(npc)||opponent?.npc===npc)throw new Error('同一人物不能重复协助或同时作为对手');people.add(npc);
        if(obligation.skill!==skill||obligation.attribute!==attribute)throw new Error('协助承诺与本次技能或属性不符');
        if(skill&&npcProficiency(d,this,npc,skill)<(this.rules.check.helperMinimumProficiency??100))throw new Error('协助者技能不足');
        const roll=die(d.document,eventId,`helper:${npc}`),modifier=modifierForNpc(d,this,npc,attribute,skill,domain);
        const success=roll!==1&&(roll===20||roll+modifier>=10);
        helpers.push({obligation:key,npc,die:roll,modifier,total:roll+modifier,success,bonus:success?this.rules.check.helperBonus??2:0});
    }
    const tools=toolBonuses(d,this,args.tools??[],attribute,skill);
    const baseModifier=Math.floor((d.get('state','player','attributes',attribute)-10)/2)+Math.floor((skill?effectiveProficiency(d,this,skill):0)/this.rules.check.skillDivisor);
    const hidden=hiddenCheckBonus(this,d.get('state'),'player',domain);
    const modifier=baseModifier+context+tools.bonus+helpers.reduce((sum,row)=>sum+row.bonus,0)+hidden.bonus;
    const rolls=[die(d.document,eventId,'d20')];if(args.advantage||args.disadvantage)rolls.push(die(d.document,eventId,'second'));
    const roll=args.advantage===args.disadvantage?rolls[0]:args.advantage?Math.max(...rolls):Math.min(...rolls),total=roll+modifier;
    let degree,success;
    if(opponent){
        const rank=value=>value===20?1:value===1?-1:0;
        success=rank(roll)===rank(opponent.die)?total>opponent.total:rank(roll)>rank(opponent.die);
        degree=success?(roll===20||total-difficulty>=10?'大成功':total-difficulty>=5?'成功':'勉强成功'):(roll===1||total-difficulty<=-10?'大失败':'失败');
    }else{
        degree=roll===1||total<=difficulty-10?'大失败':roll===20||total>=difficulty+10?'大成功':total<difficulty?'失败':total<difficulty+5?'勉强成功':'成功';
        success=['勉强成功','成功','大成功'].includes(degree);
    }
    const result={die:roll,rolls,modifier,total,difficulty,degree,success,...(hidden.bonus?{hiddenPassive:{domain,...hidden}}:{}),
        ...(opponent?{opponent}:{}),...(helpers.length?{helpers}:{}),...(tools.details.length?{tools:tools.details,toolBonus:tools.bonus}:{})};
    const minutes=this.npcObligationAction?.tool==='check'?observationTime(this,d.get('state'),'player',domain):0;
    if(minutes){this.advance(d,minutes,eventId);result.observationMinutes=minutes;}
    d.set(['state','checks',eventId],result);
    if(opponent&&success)noteTrick(d,this,opponent.npc,trick,eventId);
    for(const row of helpers){
        d.set(['state','obligations',row.obligation,'status'],'已完成');d.set(['state','obligations',row.obligation,'completion'],{source:eventId,success:row.success,minute:d.get('state','minute')});
        d.set(['state','npcs',row.npc,'developments'],[...d.get('state','npcs',row.npc,'developments')??[],{type:'协助行动',source:eventId,skill,attribute,success:row.success,minute:d.get('state','minute')}]);
    }
    return result;
}
