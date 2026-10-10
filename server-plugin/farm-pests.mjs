import {createHash} from 'node:crypto';
import {seededRandom} from './combat.mjs';
import {speciesInHabitat} from './wildlife-range.mjs';
const path=h=>['state','records',`ecology:${h}`],alive=a=>a&&a.status!=='死亡'&&a.hp>0;
const profiles=e=>e.rules.wildlife?.farmPests?.fields??[];
export function farmPestProfile(engine,settlement){return profiles(engine).find(p=>p.settlement===settlement);}
function count(d,e,species,habitat){
    const record=d.get(...path(habitat),'populations',species),h=e.rules.wildlife.habitats.find(h=>h.id===habitat);
    if(!record||!Number.isSafeInteger(record.count)||record.count<0)throw new Error('害兽关联种群缺失或损坏');
    return record.count+Object.values(d.get('state','creatures')??{}).filter(a=>a.species===species&&a.location===h.location&&a.ecology===habitat&&!a.owner&&alive(a)).length;
}
function open(e,rule,season){return rule.path.every(id=>!e.world.routes.find(r=>r.id===id).closedSeasons.includes(season));}
export function crossPredatorFed(d,e,habitat,species,season){
    return profiles(e).some(p=>p.predators.some(r=>r.habitat===habitat&&r.species===species&&open(e,r,season)&&d.get(...path(p.habitat),'populations',r.prey)?.count>r.refugeCount));
}
export function advanceFarmPredation(d,e,day){
    if(day%7!==6)return;const season=e.calendar(day*1440).season;
    for(const p of profiles(e))for(const rule of p.predators){
        if(!open(e,rule,season))continue;
        const hunters=count(d,e,rule.species,rule.habitat);if(!hunters)continue;
        const r=structuredClone(d.get(...path(p.habitat))),prey=r.populations[rule.prey],definition=e.byId.get(rule.prey);
        const expected=hunters*rule.killsPerWeek*prey.count/definition.wildlife.capacity;
        const rng=seededRandom(createHash('sha256').update(`${d.document.randomSeed}:${p.fieldId}:${rule.species}:${rule.prey}:${day}`).digest().readUInt32LE(0));
        const eaten=Math.min(Math.max(0,prey.count-rule.refugeCount),Math.floor(expected)+(rng()<expected%1?1:0));
        prey.count-=eaten;prey.predated+=eaten;d.set(path(p.habitat),r);
    }
}
function exposureFractions(intervals,hours,day,notBefore){
    const start=day*1440,periods=hours[0]<hours[1]?[[start+hours[0],start+hours[1]]]:[[start,start+hours[1]],[start+hours[0],start+1440]];
    let total=0,protectedMinutes=0,activeMinutes=0;
    for(const[originalA,b]of periods){total+=b-originalA;const a=Math.max(originalA,notBefore);if(a>=b)continue;activeMinutes+=b-a;let cursor=a;
        for(const i of [...intervals].sort((x,y)=>x.start-y.start)){const left=Math.max(cursor,i.start),right=Math.min(b,i.until);if(right>left){protectedMinutes+=right-left;cursor=right;}}
    }
    return{protected:protectedMinutes/total,active:activeMinutes/total};
}
export function damageFarmCrops(d,e,r,settlement,day){
    const p=farmPestProfile(e,settlement);if(!p)return null;
    const intervals=r.field.pestProtection??[];let daily=0;
    for(const pest of p.pests){
        const pressure=Math.min(1,Math.max(0,(count(d,e,pest.species,p.habitat)-pest.toleranceCount)/(pest.fullDamageCount-pest.toleranceCount)));
        const coverage=exposureFractions(intervals,e.byId.get(pest.species).wildlife.activeHours,day,r.field.pestInitializedMinute);
        daily+=pest.dailyDamageBps*pressure*(coverage.active-coverage.protected*p.guardReductionBps/10000);
    }
    // Damage is cumulative and freezes at ripeness, so partial harvest cannot
    // retroactively lose grain already stored. Post-ripening losses need a later rule.
    const increment=Math.round(daily);
    let maxAdded=0;
    for(const row of r.field.cohorts)if(!row.ready){const before=row.pestDamageBps??0;
        row.pestDamageBps=Math.max(before,Math.min(p.maximumDamageBps,before+increment));maxAdded=Math.max(maxAdded,row.pestDamageBps-before);}
    r.field.pestProtection=intervals.filter(i=>i.until>(day+1)*1440);
    return{maximumAddedPercent:maxAdded/100};
}
export function validateFarmPests(world){
    const errors=[],fields=world.rules.wildlife?.farmPests?.fields;if(!fields)return errors;
    const habitats=new Map(world.rules.wildlife.habitats.map(h=>[h.id,h])),species=new Map(world.monsters.map(s=>[s.id,s])),seen=new Set();
    for(const p of fields){
        const farm=world.rules.agriculture?.settlements.find(f=>f.settlement===p.settlement),h=habitats.get(p.habitat);
        if(!farm||p.fieldId!==farm.fieldId||h?.location!==farm.fieldLocation)errors.push(`害兽农田引用不符：${p.fieldId}`);
        if(seen.has(p.settlement))errors.push('害兽农田配置重复');seen.add(p.settlement);
        const pestIds=new Set();
        for(const r of p.pests){
            if(pestIds.has(r.species)||!speciesInHabitat(world.rules,world.monsters,p.habitat).some(s=>s.id===r.species))errors.push(`害兽物种引用无效：${r.species}`);pestIds.add(r.species);
            if(r.fullDamageCount<=r.toleranceCount||r.fullDamageCount>(species.get(r.species)?.wildlife.capacity??0))errors.push(`害兽密度门槛无效：${r.species}`);
        }
        const predators=new Set();
        for(const r of p.predators){
            if(predators.has(r.species)||!speciesInHabitat(world.rules,world.monsters,r.habitat).some(s=>s.id===r.species)||!pestIds.has(r.prey)||r.species===r.prey||species.get(r.species)?.diet!=='肉食')errors.push(`捕食者引用无效：${r.species}`);predators.add(r.species);
            if(r.refugeCount>=(species.get(r.prey)?.wildlife.capacity??0))errors.push('藏穴数量不能超过猎物容量');
            let cursor=habitats.get(r.habitat)?.location;const visited=new Set([cursor]);
            for(const id of r.path){const edge=world.routes.find(e=>e.id===id);
                if(!edge||!edge.modes.includes('walk')||![edge.from,edge.to].includes(cursor)){errors.push('捕食巡游道路不连续');break;}
                cursor=edge.from===cursor?edge.to:edge.from;if(visited.has(cursor))errors.push('捕食巡游道路回环');visited.add(cursor);
            }
            if(cursor!==h?.location)errors.push('捕食巡游道路未到农田');
        }
    }
    return errors;
}
