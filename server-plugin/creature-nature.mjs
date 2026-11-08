// T154: species-level nature shared by wildlife instancing, lair occupants and
// combat. Spirits enter the same `spirit` actor state that magic-ritual reads;
// non-breeding species (undead, elementals, object spirits) recover only by
// their registered manifestation rule, never by pairing.
import {TACTICS,creatureTraits}from'./traits.mjs';
import {creatureCounter}from'./interactions.mjs';
// Single vocabulary lives in traits.mjs; this name stays for older importers.
export const affinityTactics=TACTICS;
export const affinityMultipliers=Object.freeze({weak:1.5,resist:0.5});
const groups=['妖怪','灵兽','亡灵','异族','元素体','魔物'];

export function spiritStateFor(species){
    const s=species?.nature?.spirit;
    return s?{spirit:{divine:false,rank:s.rank,nature:s.nature,realm:'local'}}:{};
}
// Compatibility view: the decision now lives in the interaction table.
export function natureCounter(species,tactic){
    if(!species)return null;
    const n=creatureCounter(creatureTraits(species),tactic);
    return n?.nature?{damageMultiplier:n.damageMultiplier,nature:n.nature}:n?{damageMultiplier:n.damageMultiplier,interaction:n.interaction}:null;
}
// Weekly manifestation: no pair needed, bounded by season and capacity.
export function manifestArisals(species,total,reserved,season){
    const m=species.wildlife.manifest;
    if(!m.seasons.includes(season))return 0;
    return Math.min(m.perWeek,Math.max(0,species.wildlife.capacity-total-reserved));
}
export function validateCreatureNature(world){
    const errors=[],items=new Set(world.items.map(i=>i.id));
    for(const s of world.monsters??[]){
        const n=s.nature;if(n===undefined)continue;
        const bad=message=>errors.push(`${s.id}: ${message}`);
        if(!n||typeof n!=='object'){bad('生物属性格式无效');continue;}
        if(!['中式','西式'].includes(n.lineage)||!groups.includes(n.group)||typeof n.kind!=='string'||!n.kind)bad('生物谱系、门类或种类无效');
        if(typeof n.civilized!=='boolean')bad('须注明是否文明族群');
        if(n.civilized&&(s.drops.length||s.taming?.possible||s.tamingRule))bad('文明族群不能进入猎物掉落或驯服');
        if(n.civilized&&(!Array.isArray(n.exchange)||!n.exchange.length||n.exchange.some(id=>!items.has(id))))bad('文明族群须以已登记物品表达交换产物');
        if(!n.civilized&&n.exchange!==undefined)bad('非文明物种不登记交换产物');
        if(n.metabolism!==undefined&&(!n.metabolism||typeof n.metabolism!=='object'||Array.isArray(n.metabolism)||!Object.keys(n.metabolism).length||Object.entries(n.metabolism).some(([k,v])=>!['satiety','hydration'].includes(k)||typeof v!=='number'||!Number.isFinite(v)||v!==0&&v<0.01||v>4)))bad('代谢系数只能含饱食与水分两项，取值为 0 或 0.01 到 4');
        const a=n.affinity;
        if(!a||!Array.isArray(a.weak)||!Array.isArray(a.resist)||[...a.weak,...a.resist].some(t=>!affinityTactics.includes(t))||new Set([...a.weak,...a.resist]).size!==a.weak.length+a.resist.length)bad('弱点或抗性战术无效');
        if(n.spirit!==undefined&&(!['malevolent','benign'].includes(n.spirit.nature)||!Number.isInteger(n.spirit.rank)||n.spirit.rank<0||n.spirit.rank>3))bad('灵体属性无效');
        const m=s.wildlife?.manifest;
        if(n.reproduction==='manifest'){
            if(!m||!Number.isInteger(m.perWeek)||m.perWeek<1||!Array.isArray(m.seasons)||!m.seasons.length||m.seasons.some(x=>![0,1,2,3].includes(x))||new Set(m.seasons).size!==m.seasons.length||typeof m.cause!=='string'||!m.cause)bad('非繁殖物种须登记生成条件');
            if(s.wildlife?.recoveryPerWeek!==0)bad('非繁殖物种不能按繁殖速度恢复');
        }else if(n.reproduction!=='breeding'||m!==undefined)bad('繁殖方式无效');
    }
    return errors;
}
