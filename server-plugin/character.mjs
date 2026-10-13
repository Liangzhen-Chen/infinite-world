import {createHash}from'node:crypto';
import {derivedStats}from'./combat.mjs';
import {initialNpcState}from'./npc-state.mjs';
import {planBossMigration}from'./boss-migration.mjs';
import {applyPatches}from'./storage.mjs';
const text=(value,fallback,max)=>{const result=value??fallback;if(typeof result!=='string'||!result.trim()||result.length>max)throw new Error('角色文本为空或过长');return result.trim();};
export function createCharacter(legacy,options={},seed){
    if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('角色创建参数必须是对象');
    if(Object.keys(options).some(key=>!['name','gender','appearance','attributes','birthplace'].includes(key)))throw new Error('角色创建不能指定等级、财物、幸运或其他系统字段');
    if(this.compat)throw new Error('旧规则只用于读取与迁移，不能创建新角色');
    const config=this.rules.levels.initial,attributes=options.attributes??Object.fromEntries(this.rules.attributes.map(name=>[name,10]));
    if(!attributes||typeof attributes!=='object'||Array.isArray(attributes)||Object.keys(attributes).length!==this.rules.attributes.length)throw new Error('创建需要六项公开属性');
    let total=0;
    for(const name of this.rules.attributes){
        const value=attributes[name];if(!Number.isSafeInteger(value)||value<config.attributeMinimum||value>config.attributeMaximum)throw new Error('初始属性超出分配范围');total+=value;
    }
    if(total!==config.attributeTotal)throw new Error(`初始属性总值必须为${config.attributeTotal}`);
    const birthplace=this.resolve(options.birthplace??'loc_hw','loc');
    if(!(config.openBirthplaces??['loc_hw']).includes(birthplace))throw new Error('该出生地尚未开放');
    const document=this.initialFromLegacy(legacy,seed,{prepare:false}),state=document.state,stats=derivedStats({level:0,attributes},this.rules);
    state.player={name:text(options.name,'冒险者',60),gender:text(options.gender,'未指定',40),appearance:text(options.appearance,'一位初到河谷的冒险者。',1000),
        level:0,xp:0,coins:legacy.state.player.coins,attributes:{...attributes},hp:stats.maxHp,maxHp:stats.maxHp,mp:stats.maxMp,maxMp:stats.maxMp,
        freeAttributePoints:0,status:'正常',companions:[],revivalAnchor:birthplace,dyingSince:null};
    state.location=birthplace;state.professions={combat:'',life:[],hidden:[]};state.skills={};state.spells={};state.records={};
    state.discoveries={[birthplace]:{minute:state.minute,source:'出生地'}};
    for(const npc of this.world.npcs)if(!state.npcs[npc.id])state.npcs[npc.id]=initialNpcState(npc,{newCharacter:true});
    for(const npc of Object.values(state.npcs)){npc.trust=0;npc.affection=0;npc.developments=[];npc.relationships={};}
    document.memories={};document.manualPins={};
    document.privateState={luck:createHash('sha256').update(`${document.randomSeed}:hidden-luck`).digest().readUInt32LE(0)%100+1};
    return applyPatches(document,planBossMigration(document,this.rules,this.world.bosses??[],this.world));
}
