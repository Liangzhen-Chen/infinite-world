// T105/T106: shared builder for the second and third boss batches. Numbers,
// lairs, tags and negotiation terms are authored in the batch files; the prose
// for behaviour is composed from those numbers so text and mechanics agree.
// DeepSeek is used only for factual review.
import fs from 'node:fs';
import {bossTraits} from '../../server-plugin/traits.mjs';
import {creatureCounter} from '../../server-plugin/interactions.mjs';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const monsters=read('../meta/monsters.json'),items=read('../meta/items.json'),rules=read('../meta/rules.json');
const people=(p=>Array.isArray(p)?p:p.npcs)(read('../people/baseline.json'));
const geo=(p=>Array.isArray(p)?p:p.locations)(read('../geo/locations.json'));
export const TACTIC_NAMES={armed:'持械',unarmed:'徒手',magic_fire:'火焰法术',magic_cold:'寒冷法术',magic_wind:'风法术',magic_earth:'土石法术',magic_light:'光法术',magic_shadow:'暗影法术',magic_mind:'心神法术',magic_physical:'无属性法术'};
const STATUS={fear:'恐惧',dazzle:'眩光'},CN='零一两三四五六七八九十';
// Only tactics a player can actually bring: blows and the eight spell damage types.
export const COMBAT_TACTICS=Object.keys(TACTIC_NAMES);
const amount=m=>m===1.5?'多五成':m===.5?'减半':m===.75?'少两成半':`为原伤害的${m}倍`;
const itemName=id=>items.find(i=>i.id===id)?.name??id;
const list=xs=>xs.length<3?xs.join('与'):`${xs.slice(0,-1).join('、')}与${xs.at(-1)}`;
const rows=r=>list(r.map(x=>`${CN[x.quantity]??x.quantity}份${itemName(x.item)}`));

export function elementProfile(boss){
    const species=monsters.find(m=>m.id===boss.monster),traits=bossTraits(species,boss),out={};
    for(const tactic of COMBAT_TACTICS){const c=creatureCounter(traits,tactic);if(c)out[tactic]=c.damageMultiplier;}
    return out;
}
function elementSentence(profile,p='它'){
    const parts=Object.entries(profile).map(([t,m])=>`${TACTIC_NAMES[t]}${t.startsWith('magic_')?'伤害':'攻击的伤害'}${amount(m)}`);
    return parts.length?`${p}的体表与材质使${parts.join('，')}。`:'';
}
function negotiationSentence(r,boss){
    const n=boss.negotiation,goal=boss.cognition.goal,p=r.pronoun??'它',take=n.accepts.map(itemName),narrow=r.narrow===2;
    const give=n.stock.length?(narrow?`换出的东西以手头的${rows(n.stock)}为限`:`换出的${rows(n.stock)}以手头库存为限，用尽便不能再交付`):'手头没有能换出的东西，只收不换';
    if(boss.actor){
        const place=geo.find(l=>l.id===people.find(x=>x.id===boss.actor).society).name;
        const terms=goal==='defend_territory'?`只接受尊重${r.lairName}一带边界的条件，记得在这里受过进攻便说明原因，拒绝交换或结盟`:narrow?'可议守界或互不攻击的和平约定':'可议守界或互不攻击；来者若曾进攻，仍可议和，却拒绝结盟';
        return `${p}记住来者的实际接触，${terms}。${p}只能替自己议和、交换，不能代表${place}立贸易、朝贡或通行的约定。${p}收${list(take)}，${give}。约定不附带自动援战，进攻会破坏约定；对${place}成员发起交锋，会让整个${place}对来者转为敌对。`;
    }
    if(goal==='defend_territory')return `${p}记住来者实际到访和发起的交锋，只接受尊重领地边界的条件；记得领地内曾受来者进攻时，会说明原因并拒绝交换或结盟。${p}收${list(take)}，按双方物资的目录价值和实际库存交换，${give}。和平约定可含结盟，进攻会破坏约定，盟约不附带自动援战或驯服。`;
    return `${p}记住来者的实际接触，接受守界或互不攻击的约定；若来者曾进攻，仍可议定和平，却拒绝结盟。${p}收${list(take)}，按目录价值和实际库存交换，${give}。约定不附带自动援战或驯服，进攻会破坏约定。`;
}
function mechanicsSentence(r,boss){
    const m=boss.mechanics,a=m.abilities[0],w=m.weaknesses[0],p=r.pronoun??'它';
    // r.narrow: wording narrowed after a contradictory review. 1: no per-tactic
    // claim; 2: no counting claims either, actual hits and unexpired glare named.
    const adapt=r.narrow===2?`反复用同一类打法，${p}的防备会逐步加深，同类打法的伤害最多少三成；会被防备的是${list(m.adaptation.tactics.map(t=>TACTIC_NAMES[t]))}。`
        :r.narrow?`同一类打法用过两次后${p}开始防备，每多用一次伤害再少一成，最多少三成；会被防备的打法是${list(m.adaptation.tactics.map(t=>TACTIC_NAMES[t]))}。`
        :`${list(m.adaptation.tactics.map(t=>TACTIC_NAMES[t]))}各自计数，同一类打法用过两次后${p}开始防备，每多用一次伤害再少一成，最多少三成。`;
    const ability=`生命不高于${a.belowHpPercent===50?'一半':`${CN[a.belowHpPercent/10]}成`}时，${r.narrow===2?`${p}每第${CN[a.every]}次实际命中的反击`:`每第${CN[a.every]}次命中的反击`}附加${CN[a.effectSpec.power]}点${STATUS[a.effectSpec.status]}，最多${CN[a.duration]}分钟。`;
    const weak=r.narrow===2&&w.requiresStatus==='dazzle'?`${p}睁着眼、身上的眩光既未耗去也未过期时，${TACTIC_NAMES[w.tactic]}攻击绕过适应防备。`
        :w.requiresStatus==='dazzle'?`${p}睁眼受尚未耗去的眩光干扰时，${TACTIC_NAMES[w.tactic]}攻击绕过适应防备。`:`${p}受尚未过去的恐惧影响时，${TACTIC_NAMES[w.tactic]}攻击绕过适应防备。`;
    return adapt+ability+weak;
}
// r: authored row. kind 'wild' needs habitat/replacement/minions; 'social' needs actor.
export function buildBoss(prefix,r){
    const species=monsters.find(m=>m.id===r.monster),social=Boolean(r.actor);
    if(!species)throw Error(`${r.suffix}: 物种不存在`);
    const habitat=social?null:rules.wildlife.habitats.find(h=>h.id===r.habitat);
    const lair=social?r.lair:habitat.location;
    const mechanics={adaptation:{tactics:r.adapt,threshold:2,perStep:.1,maximum:.3},weaknesses:[{tactic:r.weak[0],requiresStatus:r.weak[1],ignoreAdaptation:true}],
        abilities:[{id:`ability_${prefix}_${r.suffix}`,every:r.ability[0],belowHpPercent:r.ability[1],effectSpec:{kind:'status',status:r.ability[2],power:r.ability[3]},duration:r.ability[4]}]};
    const boss={id:`boss_${prefix}_${r.suffix}`,name:r.name,aliases:r.aliases??[],monster:r.monster,tier:r.tier,level:r.level,lair,territory:r.territory,
        tactics:[`适应${list(r.adapt.map(t=>TACTIC_NAMES[t]))}；生命不高于${r.ability[1]}%时，每第${r.ability[0]}次命中反击附加${r.ability[3]}点${STATUS[r.ability[2]]}，最多${r.ability[4]}分钟`],
        weakness:'',drops:r.drops??[],taming:r.taming,intelligence:r.intelligence??0,minions:r.minionCount?[r.monster]:[],
        ...(social?{actor:r.actor}:{}),
        residence:social?{id:`lair_${prefix}_${r.suffix}`,name:r.lairName,location:lair,replacementSpecies:[],vacancyDays:30,minionCount:0}
            :{id:`lair_${prefix}_${r.suffix}`,name:r.lairName,location:lair,habitat:r.habitat,replacementSpecies:[r.replacement],vacancyDays:r.vacancyDays,minionCount:r.minionCount??0},
        mechanics,tags:r.tags,originSeed:r.originSeed,
        ...(r.cognition?{cognition:r.cognition,negotiation:r.negotiation}:{}),
    };
    const profile=elementProfile(boss),w=mechanics.weaknesses[0];
    boss.weakness=`${w.requiresStatus==='dazzle'?'睁眼受尚未消耗的眩光干扰时':'受尚未过去的恐惧影响时'}，${TACTIC_NAMES[w.tactic]}攻击绕过适应防备。${elementSentence(profile).replace(/^它的/,'')}`;
    const p=r.pronoun??'它';
    const behavior=`${r.habit}${mechanicsSentence(r,boss)}${elementSentence(profile,p)}${boss.cognition?negotiationSentence(r,boss):''}`;
    return {boss,prose:{origin:r.origin,lairDescription:r.lairDescription,behavior},lineage:r.lineage,elements:profile};
}
export function buildBatch(prefix,authored){
    const built=authored.map(r=>buildBoss(prefix,r));
    return {
        bosses:built.map(b=>b.boss),
        lineage:Object.fromEntries(built.map(b=>[b.boss.id,b.lineage])),
        elements:Object.fromEntries(built.map(b=>[b.boss.id,b.elements])),
        bossDraft:e=>{const b=built.find(x=>x.boss.id===e.id);return{id:e.id,prose:structuredClone(b.prose)};},
    };
}
