import {createHash} from 'node:crypto';
import {monsterStats,seededRandom} from './combat.mjs';
import {heldUnit,wearItem} from './items.mjs';
import {canonical} from './storage.mjs';
import {speciesInHabitat} from './wildlife-range.mjs';
import {rangeSpec,initialIn,wildlifeHabitats,validateHabitatDerivation} from './wildlife-habitats.mjs';
import {reservedMigrationCapacity,advanceSeasonalMigration} from './seasonal-migration.mjs';
import {crossPredatorFed,advanceFarmPredation} from './farm-pests.mjs';
import {spiritStateFor,manifestArisals} from './creature-nature.mjs';
import {recordLocalContact} from './environment.mjs';
import {recordCreatureResolution} from './quest-wildlife.mjs';
import {sapient,advanceWildlifeAwakening,awakeningAction,awakeningOperations,awakeningView,validateWildlifeAwakening} from './wildlife-awakening.mjs';
const clone=v=>structuredClone(v),path=h=>['state','records',`ecology:${h}`];
const alive=a=>a&&a.status!=='死亡'&&a.hp>0;
// T160 owns identity changes. Clocks pass an existing individual and a stable
// source event; an absent consumer must never masquerade as an awakening.
export function assertWildlifeAwakeningEffect(engine,effect){
    const consumer=engine.wildlifeAwakening;
    if(typeof consumer?.validate!=='function'||typeof consumer?.apply!=='function')throw Error('野兽觉醒效果未实现：需要 T160 wildlifeAwakening 消费者');
    if(typeof effect.target!=='string'||!effect.target)throw Error('野兽觉醒需要具体个体编号');
    consumer.validate(engine,effect);
}
export function applyWildlifeAwakeningEffect(d,engine,effect,context){
    assertWildlifeAwakeningEffect(engine,effect);
    const actor=d.get('state','creatures',effect.target);
    if(!alive(actor)||!actor.species||!actor.ecology)throw Error('野兽觉醒目标不是存活的生态个体');
    const result=engine.wildlifeAwakening.apply(d,engine,effect,context);
    if(!result||typeof result.applied!=='boolean')throw Error('野兽觉醒消费者缺少 applied 回执');
    return result;
}
const random=(engine,seed,label)=>seededRandom(createHash('sha256').update(`${seed}:${canonical(engine.rules.wildlife)}:${label}`).digest().readUInt32LE(0));
const activeAt=(hours,minute)=>hours[0]<=hours[1]?minute>=hours[0]&&minute<hours[1]:minute>=hours[0]||minute<hours[1];
const speciesAt=(engine,habitat)=>speciesInHabitat(engine.rules,engine.world.monsters,habitat.id);
// T104 ritual consumers: a ward keeps new spirits from approaching the warded
// player here; a consecration rite stops one group's weekly manifestation.
const ritualEffects=(d,op)=>Object.values(d.get('state','effects')??{}).filter(e=>e.kind==='ritual'&&e.operation===op);
const warded=(d,location,minute)=>ritualEffects(d,'ward').some(e=>e.target==='player'&&e.location===location&&e.started<=minute&&e.expires>minute);
const consecrated=(d,habitat,s,day)=>ritualEffects(d,'consecrate').some(e=>e.habitat===habitat&&e.group===s.nature?.group&&e.started<(day+1)*1440&&e.expires>day*1440);
const wildPresent=(d,species,location)=>Object.values(d.get('state','creatures')??{}).filter(a=>a.species===species&&a.location===location&&!a.owner&&!sapient(a)&&alive(a)).length;
// K6 wildlife_stir effect: a stirred habitat yields encounters more often until it calms.
export function wildlifeStirFactor(state,habitatId,minute){const r=state.records?.[`wildlife:stir:${habitatId}`];return r?.category==='wildlife_stir'&&r.since<=minute&&r.until>minute?r.factor:1;}
const encounterPath=h=>['state','records',`wildlife:encounter:${h}`];
const WINDOW=360;
const encounterEnabled=engine=>!engine.replaying||engine.replayResult?.wildlifeEncounterVersion===1;
export function nextWildlifeEncounterMinute(d,engine,now){
    if(!encounterEnabled(engine)||engine.npcObligationAction?.tool!=='time')return Infinity;
    const habitat=engine.rules.wildlife?.habitats.find(h=>h.location===d.get('state','location'));
    if(!habitat)return Infinity;
    let window=Math.floor(now/WINDOW);
    let minute=window*WINDOW+1+Math.floor(random(engine,d.document.randomSeed,`encounter-time:${habitat.id}:${window}`)()*(WINDOW-1));
    if(minute<=now){window++;minute=window*WINDOW+1+Math.floor(random(engine,d.document.randomSeed,`encounter-time:${habitat.id}:${window}`)()*(WINDOW-1));}
    return minute;
}
export function wildlifeEncounterAt(d,engine,location,minute){
    if(!encounterEnabled(engine)||d.get('state','player','status')!=='正常')return null;
    const habitat=engine.rules.wildlife?.habitats.find(h=>h.location===location);
    if(!habitat)return null;
    const window=Math.floor(minute/WINDOW),old=d.get(...encounterPath(habitat.id));
    if(old?.checkedWindow>=window)return null;
    const rng=random(engine,d.document.randomSeed,`encounter:${habitat.id}:${window}`),chance=rng();
    const here=Object.entries(d.get('state','creatures')??{}).filter(([,a])=>a.location===location&&!a.owner&&!sapient(a)&&alive(a));
    const populations=d.get(...path(habitat.id),'populations');
    const ward=warded(d,location,minute),eligible=speciesAt(engine,habitat).filter(s=>populations?.[s.id]?.count>0&&activeAt(s.wildlife.activeHours,minute%1440)&&!(ward&&s.nature?.spirit));
    const base={habitat,window,minute};
    if(chance>=0.25*wildlifeStirFactor(d.get('state'),habitat.id,minute))return {...base,kind:null};
    const known=here.filter(([,actor])=>engine.byId.get(actor.species)?.wildlife);
    if(known.length){const [target,actor]=known[Math.floor(rng()*known.length)];return {...base,kind:'present',target,species:engine.byId.get(actor.species)};}
    if(!eligible.length)return {...base,kind:null};
    const species=eligible[Math.floor(rng()*eligible.length)];
    return {...base,kind:rng()<0.5?'trace':'present',species};
}
function createWildlifeInstance(d,engine,habitat,s,eventId,rng){
    const latest=clone(d.get(...path(habitat.id))),p=latest.populations[s.id];
    if(!p.count||!activeAt(s.wildlife.activeHours,d.get('state','minute')%1440))return null;
    const hash=createHash('sha256').update(`${d.document.randomSeed}:${eventId}`).digest('hex').slice(0,16),id=`monster_instance_${hash}`;
    if(d.get('state','created',id)||d.get('state','creatures',id))throw new Error('个体编号已存在，拒绝重复接触');
    const level=s.levelRange[0]+Math.floor(rng()*(s.levelRange[1]-s.levelRange[0]+1)),stats=monsterStats({level,template:s.template},engine.rules),name=`${s.name}·${hash.slice(0,4)}`;
    p.count--;p.withdrawn++;d.set(path(habitat.id),latest);
    d.set(['state','created',id],{id,name,aliases:[],monster:s.id,template:s.template,scope:habitat.location});
    d.set(['state','creatures',id],{name,species:s.id,ecology:habitat.id,location:habitat.location,level,hp:stats.maxHp,maxHp:stats.maxHp,status:'正常',owner:null,...spiritStateFor(s),...(engine.rules.wildlifeAwakening?{since:d.get('state','minute')}:{})});
    return{id,name,species:s.name,level,hp:stats.maxHp};
}
export function settleWildlifeEncounter(d,engine,attempt,eventId){
    if(!attempt)return null;
    const {habitat,window}=attempt,old=d.get(...encounterPath(habitat.id));
    if(old?.checkedWindow>=window)return null;
    let sighting=null;
    if(attempt.kind&&d.get('state','location')===habitat.location&&d.get('state','player','status')==='正常'){
        const s=attempt.species,minute=d.get('state','minute');
        let target=attempt.target;
        if(target&&(!alive(d.get('state','creatures',target))||d.get('state','creatures',target,'location')!==habitat.location))target=null;
        const available=d.get(...path(habitat.id),'populations',s.id,'count')>0&&activeAt(s.wildlife.activeHours,minute%1440);
        if(attempt.kind==='present'&&!target&&available&&engine.npcObligationAction?.tool!=='time'){
            const here=Object.values(d.get('state','creatures')??{}).filter(a=>a.location===habitat.location&&alive(a));
            if(here.length<engine.rules.wildlife.maximumPresent)target=createWildlifeInstance(d,engine,habitat,s,`encounter:${habitat.id}:${window}`,random(engine,d.document.randomSeed,`encounter-instance:${habitat.id}:${window}`))?.id;
        }
        if(target||available)sighting={kind:target?'present':'trace',habitat:habitat.id,location:habitat.location,species:s.id,name:s.name,
            ...(target?{target}:{}),minute,expires:(window+1)*WINDOW,source:eventId,description:target?`看见${s.name}，尚未开战`:`${s.name}的活动踪迹；辨认依据：${s.wildlife.distinction}`};
    }
    d.set(encounterPath(habitat.id),{category:'wildlifeEncounter',checkedWindow:window,sighting});
    return sighting;
}
export function wildlifeEncounterView(document){
    return Object.values(document.state.records??{}).filter(r=>r.category==='wildlifeEncounter').map(r=>r.sighting)
        .filter(r=>r&&r.location===document.state.location&&r.expires>document.state.minute);
}
export function validateWildlife(world){
    const errors=[],rules=world.rules.wildlife;if(!rules)return errors;
    const habitats=new Map(),species=new Map(world.monsters.map(s=>[s.id,s])),items=new Set(world.items.map(i=>i.id));
    for(const h of wildlifeHabitats(world)){if(habitats.has(h.id))errors.push('栖地编号重复');habitats.set(h.id,h);
        if(!world.locations.some(l=>l.id===h.location))errors.push(`栖地位置不存在：${h.id}`);}
    for(const s of world.monsters){if(!s.wildlife)continue;const p=s.wildlife,band=world.rules.monsters.levelRanges[s.template];
        if(!habitats.has(p.habitat))errors.push(`物种栖地不存在：${s.id}`);
        if(!band||s.levelRange[0]<band[0]||s.levelRange[1]>band[1]||s.levelRange[0]>s.levelRange[1])errors.push(`物种等级与模板不符：${s.id}`);
        if(p.population>p.capacity)errors.push(`物种数量超过生态容量：${s.id}`);
        if(p.activeHours[0]===p.activeHours[1])errors.push(`作息时段为空：${s.id}`);
        for(const prey of p.predatorOf)if(!species.has(prey)||prey===s.id||species.get(prey).wildlife?.habitat!==p.habitat)errors.push(`捕食关系不是同栖地有效物种：${s.id}`);
        if(p.gather.tool&&!items.has(p.gather.tool))errors.push(`取材工具不存在：${s.id}`);
        for(const material of p.gather.consumes)if(!items.has(material.item))errors.push(`取材耗材不存在：${s.id}`);
    }
    const ids=new Set(),departures=new Set();
    for(const r of rules.migration?.routes??[]){
        const s=species.get(r.species),from=habitats.get(r.from),to=habitats.get(r.to),key=`${r.species}:${r.from}:${r.departDay}`;
        if(ids.has(r.id)||departures.has(key))errors.push(`迁徙路线或出发日重复：${r.id}`);ids.add(r.id);departures.add(key);
        if(!s?.wildlife||!from||!to||r.from===r.to){errors.push(`迁徙物种或栖地无效：${r.id}`);continue;}
        let cursor=from.location;const visited=new Set([cursor]);
        for(const id of r.path){const edge=world.routes.find(e=>e.id===id);
            if(!edge||!edge.modes.includes('walk')||![edge.from,edge.to].includes(cursor)){errors.push(`迁徙道路不连续或不能步行：${r.id}`);break;}
            cursor=edge.from===cursor?edge.to:edge.from;if(visited.has(cursor))errors.push(`迁徙道路绕回原点：${r.id}`);visited.add(cursor);
        }
        if(cursor!==to.location)errors.push(`迁徙道路未到达目标栖地：${r.id}`);
    }
    return [...errors,...validateHabitatDerivation(world),...validateWildlifeAwakening(world)];
}
export function advanceWildlife(d,engine,day){
    if(!engine.rules.wildlife)return;
    for(const habitat of engine.rules.wildlife.habitats){
        const r=clone(d.get(...path(habitat.id)));if(!r)throw new Error('生态记录未迁移');
        if(r.lastDay!==day-1)throw new Error('生态日结不连续，拒绝重算过往种群');
        const species=speciesAt(engine,habitat);
        if(day%7===6){
            const rng=random(engine,d.document.randomSeed,`${habitat.id}:${day}`),season=engine.calendar(day*1440).season;
            for(const s of species){
                const p=r.populations[s.id],spec=rangeSpec(habitat,s),present=wildPresent(d,s.id,habitat.location),total=p.count+present;
                // T154: undead/elementals arise by their registered condition, not by pairing or prey.
                if(spec.manifest){const arisen=manifestArisals(spec===s.wildlife?s:{...s,wildlife:spec},total,reservedMigrationCapacity(d,habitat.id,s.id),season);if(arisen&&consecrated(d,habitat.id,s,day)){p.suppressed=(p.suppressed??0)+arisen;continue;}if(arisen){p.count+=arisen;p.arisen=(p.arisen??0)+arisen;}continue;}
                const fed=spec.predatorOf.length===0||spec.predatorOf.some(id=>r.populations[id]?.count>0)||crossPredatorFed(d,engine,habitat.id,s.id,season);
                if(!fed){const lost=Math.min(p.count,Math.max(1,Math.floor(total/4)));p.count-=lost;p.starved+=lost;continue;}
                const expected=spec.recoveryPerWeek*engine.rules.wildlife.seasonRecovery[season];
                const born=total>=2?Math.min(Math.max(0,spec.capacity-total-reservedMigrationCapacity(d,habitat.id,s.id)),Math.floor(expected)+(rng()<expected%1?1:0)):0;
                p.count+=born;p.born+=born;
            }
        }
        r.lastDay=day;d.set(path(habitat.id),r);
    }
    if(day%7===6)for(const habitat of engine.rules.wildlife.habitats){
            const r=clone(d.get(...path(habitat.id)));
            for(const s of speciesAt(engine,habitat)){const p=r.populations[s.id],total=p.count+wildPresent(d,s.id,habitat.location);
                let need=total>0?Math.max(1,Math.floor(total/4)):0;
                for(const prey of s.wildlife.predatorOf){const food=r.populations[prey];if(!food)continue;const eaten=Math.min(need,food.count);food.count-=eaten;food.predated+=eaten;need-=eaten;}
            }
        d.set(path(habitat.id),r);
    }
    advanceFarmPredation(d,engine,day);
    advanceSeasonalMigration(d,engine,day);
    advanceWildlifeAwakening(d,engine,day);
}
export function resolveCreature(engine,d,name){
    if(typeof name!=='string'||!name.trim())throw new Error('需要实际动物名称或实例编号');
    const candidates=Object.entries(d.get('state','creatures')??{}).filter(([id,a])=>a.location===d.get('state','location')&&
        [id,a.name,engine.byId.get(a.species)?.name].includes(name));
    if(candidates.length>1)throw new Error('同场景有多个同名动物，请使用实际实例编号');
    return candidates.length===1?candidates[0][0]:engine.resolve(name);
}
export function recordWildlifeDeath(d,engine,target,eventId){
    const actor=d.get('state','creatures',target);if(!actor?.ecology||actor.corpse)return null;
    const bone=engine.byId.get(actor.boss??actor.species);if(!bone)throw new Error('生态个体缺物种定义');
    recordCreatureResolution(d,engine,{target,outcome:'death',eventId,location:actor.location});
    const corpse={status:'未取材',killedBy:'player',source:eventId,expires:d.get('state','minute')+engine.rules.wildlife.corpseMinutes,
        items:clone(bone.drops)};d.set(['state','creatures',target,'corpse'],corpse);
    return{target,expires:corpse.expires,hasMaterials:corpse.items.length>0,note:'仍在尸体中，尚未进入行囊'};
}
export function wildlifePriceFactor(engine,document,item,location){
    if(!engine.rules.wildlife)return 1;
    const habitats=engine.rules.wildlife.habitats.filter(h=>h.location===location||engine.byId.get(h.location)?.parent===location);
    const ranges=habitats.flatMap(h=>speciesAt(engine,h).filter(s=>s.drops.some(drop=>drop.item===item)).map(s=>({s,h})));
    if(!ranges.length)return 1;
    const actors=Object.values(document.state.creatures??{});
    const initial=ranges.reduce((n,{s,h})=>n+initialIn(h,s),0),current=ranges.reduce((n,{s,h})=>{
        const unseen=document.state.records[`ecology:${h.id}`]?.populations[s.id]?.count??initialIn(h,s);
        const present=actors.filter(a=>a.species===s.id&&a.ecology===h.id&&a.location===h.location&&!a.owner&&!sapient(a)&&alive(a)).length;
        return n+unseen+present;
    },0);
    return Math.min(engine.rules.wildlife.scarcityMaximum,Math.max(1,initial/Math.max(1,current)));
}
const mindOf=(engine,d,id,a)=>{const mind=awakeningView(engine,d.document.randomSeed,id,a,d.get('state','minute'));return mind?{mind}:{};};
export function wildlifeAction(d,args,eventId){
    if(!this.rules.wildlife)throw new Error('当前世界没有启用野外生态');
    const operation=args.operation??'observe';
    if(awakeningOperations.includes(operation))return awakeningAction.call(this,d,args,eventId,resolveCreature(this,d,args.target));
    const habitat=this.rules.wildlife.habitats.find(h=>h.location===d.get('state','location'));
    if(!habitat)throw new Error('这里没有登记可接触的野外栖地');
    if(operation==='observe')return{habitat:habitat.name,animals:Object.entries(d.get('state','creatures')??{}).filter(([,a])=>a.location===habitat.location).map(([id,a])=>({id,name:a.name,status:a.status,hp:a.hp,owner:a.owner??null,...mindOf(this,d,id,a),
        ...(a.corpse?{corpse:{status:a.corpse.status,expires:a.corpse.expires,hasMaterials:a.corpse.items.length>0}}:{})})),traces:wildlifeEncounterView(d.document).filter(r=>r.kind==='trace'),actionScope:{kind:'instant',instantaneous:true}};
    if(operation==='track'){
        const r=clone(d.get(...path(habitat.id))),here=Object.values(d.get('state','creatures')??{}).filter(a=>a.location===habitat.location&&alive(a));
        if(here.length>=this.rules.wildlife.maximumPresent)throw new Error('这里已有可接触动物，先处理当前局面');
        const hour=d.get('state','minute')%1440,requested=args.species?this.resolve(args.species,'monster'):null;
        const eligible=speciesAt(this,habitat).filter(s=>(!requested||s.id===requested)&&r.populations[s.id].count>0&&activeAt(s.wildlife.activeHours,hour));
        if(!eligible.length)throw new Error('此时没有该物种的活动线索，不能凭目录召出动物');
        const skill='skill_life_1_core',known=d.get('state','skills',skill),check=this.check(d,{attribute:'敏捷',...(known?{skill}:{}),difficulty:10},eventId);
        this.advance(d,this.rules.wildlife.trackMinutes,eventId);if(!check.success)return{success:false,...check,found:null,note:'已花追踪时间，没有接触动物'};
        if(d.get('state','location')!==habitat.location||d.get('state','player','status')!=='正常')return{success:false,found:null,note:'完成追踪前已失去行动能力或离开栖地'};
        const latest=clone(d.get(...path(habitat.id))),rng=random(this,d.document.randomSeed,eventId),s=eligible[Math.floor(rng()*eligible.length)],p=latest.populations[s.id];
        if(!p.count||!activeAt(s.wildlife.activeHours,d.get('state','minute')%1440))return{success:false,found:null,note:'线索在追踪期间消失或活动时段已结束'};
        const found=createWildlifeInstance(d,this,habitat,s,eventId,rng);
        // Tracking ends at arm's length: the found individual is in sight for the next few minutes.
        if(found)recordLocalContact(d,this,found.id,eventId);
        return{success:true,found,note:'接触一个实际个体，已从未见种群扣除；未打架、驯服或获得材料'};
    }
    if(operation!=='gather')throw new Error('未知野外操作');
    const target=resolveCreature(this,d,args.target),actor=d.get('state','creatures',target),s=this.byId.get(actor?.species),corpse=actor?.corpse;
    if(!actor||actor.location!==habitat.location||actor.status!=='死亡'||!corpse)throw new Error('没有这里已死亡且可验证的尸体');
    if(corpse.status!=='未取材'||corpse.expires<=d.get('state','minute'))throw new Error('尸体已处理或已经腐坏');
    if(actor.owner&&actor.owner!=='player')throw new Error('动物归其他所有者，不能擅自取材');
    const recipe=s.wildlife.gather;if(!corpse.items.length)throw new Error('这个物种没有登记可加工材料');
    if(recipe.tool&&(!this.quantity(d,'player',recipe.tool)||heldUnit(d,this,'player',recipe.tool).durability<=0))throw new Error('需要实际完好的取材刀具');
    for(const m of recipe.consumes)if(this.quantity(d,'player',m.item)<m.amount)throw new Error('取材实际耗材不足');
    for(const m of recipe.consumes)this.itemDelta(d,'player',m.item,-m.amount);
    const known=d.get('state','skills','skill_life_1_core'),check=this.check(d,{attribute:'敏捷',...(known?{skill:'skill_life_1_core'}:{}),difficulty:10},eventId);
    if(recipe.tool)wearItem(d,this,'player',recipe.tool,1);this.advance(d,recipe.minutes,eventId);
    const current=d.get('state','creatures',target,'corpse'),success=check.success&&current.status==='未取材'&&current.expires>d.get('state','minute')&&d.get('state','player','status')==='正常'&&d.get('state','location')===habitat.location;
    d.set(['state','creatures',target,'corpse'],{...current,status:success?'已取材':'已损坏',processedBy:'player',processedAt:d.get('state','minute'),processingEvent:eventId});
    if(success)for(const drop of current.items)this.itemDelta(d,'player',drop.item,drop.amount);
    return{success,obtained:success?current.items:[],spent:{minutes:recipe.minutes,materials:recipe.consumes,tool:recipe.tool,toolWear:recipe.tool?1:0},note:'失败仍耗时耗材；仅obtained实际进入行囊，尸体不可反复刷取'};
}
