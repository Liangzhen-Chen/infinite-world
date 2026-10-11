import { createHash } from 'node:crypto';
import { seededRandom } from './combat.mjs';
import { canonical } from './storage.mjs';

const cache = new Map();
const kinds = ['clear','cloudy','rain','storm','snow','fog'];
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const validMinute = minute => { if (!Number.isSafeInteger(minute) || minute < 0) throw new Error('天气分钟必须是非负整数'); };
function dailySequence(rules, seed, region, year) {
    // New local regions must not reshuffle the weather history of existing regions.
    const sequenceRules={...rules,regions:rules.regions.filter(row=>row.sequenceScope!=='local')};
    const regionKey=region.sequenceScope==='local'?region:region.id;
    const fingerprint = createHash('sha256').update(canonical([sequenceRules,seed,regionKey,year])).digest('hex');
    if (cache.has(fingerprint)) { const rows = cache.get(fingerprint); cache.delete(fingerprint); cache.set(fingerprint, rows); return rows; }
    const names = kinds, rows = []; let previous = null;
    for (let day = 0; day < 360; day++) {
        const season = Math.floor(day / 90), weights = rules.seasonalWeights[season], sum = weights.reduce((a,b) => a+b,0);
        const rng = seededRandom(createHash('sha256').update(`${fingerprint}:${day}`).digest().readUInt32LE(0));
        // At each year's start all rows have the same initial distribution.
        // Other days have P = persistence * I + (1 - persistence) * seasonal weights.
        const probabilities = weights.map((weight,i) => weight / sum * (previous === null ? 1 : 1-rules.persistence)
            + (previous === i ? rules.persistence : 0));
        let roll = rng(), choice = names.length - 1;
        for (let i = 0; i < probabilities.length; i++) { roll -= probabilities[i]; if (roll < 0) { choice = i; break; } }
        previous = choice;
        const kind = names[choice], effect = rules.states[kind];
        rows.push({ kind, name: effect.name, humidityPercent: clamp(effect.humidity + Math.round(rng()*10-5),0,100),
            temperatureC: region.temperatures[season] + effect.temperatureOffset + Math.round(rng()*6-3), season });
    }
    cache.set(fingerprint, rows); if (cache.size > 64) cache.delete(cache.keys().next().value);
    return rows;
}
export function daylightAt(latitude, dayOfYear) {
    const radians = Math.PI / 180, declination = 23.44 * radians * Math.sin(2*Math.PI*(dayOfYear-0)/360);
    const angle = Math.acos(clamp(-Math.tan(latitude*radians)*Math.tan(declination),-1,1));
    const durationMinutes = Math.round(angle*1440/Math.PI);
    return { sunriseMinute: Math.round(720-durationMinutes/2), sunsetMinute: Math.round(720+durationMinutes/2), durationMinutes };
}
export function weatherAt(engine, seed, location, minute) {
    validMinute(minute);
    const rules = engine.rules.weather, region = rules?.regions.find(row => row.locations.includes(location));
    if (!region) return null;
    const day = Math.floor(minute/1440), year = Math.floor(day/360), dayOfYear = day%360;
    const row = dailySequence(rules,seed,region,year)[dayOfYear], light = daylightAt(region.latitude,dayOfYear);
    const indoors = region.indoor.includes(location), effect = rules.states[row.kind];
    const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
    return { ...row, location, region: region.id, day, indoors, ...light,sunrise:clock(light.sunriseMinute),sunset:clock(light.sunsetMinute),
        daylight: minute%1440 >= light.sunriseMinute && minute%1440 < light.sunsetMinute,
        travelFactors: { walk: effect.walk, horse: effect.horse, cart: effect.cart, boat: effect.boat },
        boatClosed: effect.boatClosed === true, hitModifier: indoors ? 0 : effect.hit,
        moodModifier: indoors ? 0 : effect.mood, cropMultiplier: effect.crop };
}
export function localWeather(engine, document, location=document.state.location, minute=document.state.minute) {
    return weatherAt(engine,document.randomSeed,location,minute);
}
export function humidityAt(engine, document, location) {
    const explicit = document.state.weather?.[location]?.humidityPercent;
    if (explicit !== undefined) return explicit;
    const current = localWeather(engine,document,location);
    // Interior microclimates remain separately registered environmental facts.
    if (!current || current.indoors) return engine.byId.get(location)?.microclimate?.humidityPercent;
    return current.humidityPercent;
}
export function weatherTravel(engine, seed, edge, mode, minute,cache=null) {
    if(!edge.lengthKm)return {multiplier:1,closed:false};
    const key=`${edge.from}:${mode}:${Math.floor(minute/1440)}`;
    if(cache?.has(key))return cache.get(key);
    const row = weatherAt(engine,seed,edge.from,minute);
    if (!row || !edge.lengthKm) return { multiplier: 1, closed: false };
    const result={ multiplier: row.travelFactors[mode], closed: mode === 'boat' && row.boatClosed,
        region: row.region, weather: row.name, day: row.day };
    cache?.set(key,result);return result;
}
export function weatherEdge(engine, seed, edge, mode, departure, elapsedBefore, movingBefore, speed,weatherCache=null) {
    if (!edge.lengthKm) {
        const budget=engine.rules.travel.dailyTravelMinutes,rest=mode!=='boat'&&movingBefore>0&&movingBefore%budget===0?1440-budget:0;
        return { elapsed: elapsedBefore+rest+1, moving: movingBefore+1 };
    }
    let distance=edge.lengthKm, elapsed=elapsedBefore, moving=movingBefore;
    for(let step=0;step<1000;step++){
        if(distance<=1e-9)return{elapsed,moving};
        const budget=mode==='boat'?1440:engine.rules.travel.dailyTravelMinutes;
        if(mode!=='boat'&&moving>0&&moving%budget===0)elapsed+=1440-budget;
        const now=departure+elapsed,conditions=weatherTravel(engine,seed,edge,mode,now,weatherCache);
        if(edge.closedSeasons.includes(engine.calendar(now).season))return null;
        if(conditions.closed)return null;
        const rate=speed/conditions.multiplier/60;
        const remainingBudget=mode==='boat'?1440:budget-moving%budget;
        const toMidnight=1440-now%1440;
        const chunk=Math.min(remainingBudget,toMidnight,Math.max(1,Math.ceil(distance/rate)));
        distance=Math.max(0,distance-chunk*rate);moving+=chunk;elapsed+=chunk;
    }
    throw new Error('天气路线超过规划步数限制');
}
export function cropProduction(engine, seed, settlement, minute, nominal) {
    const row = weatherAt(engine,seed,settlement,minute);
    return row ? Math.max(0,Math.floor(nominal*engine.rules.weather.cropSeasonFactors[row.season]*row.cropMultiplier)) : nominal;
}
export function validateWeatherRules(world) {
    const errors = [], r = world.rules.weather; if (!r) return errors;
    const names = kinds, registered = new Set(world.locations.map(row => row.id)), seen = new Set(), regionIds = new Set();
    if (Object.keys(r.states).some(key=>!names.includes(key))) errors.push('天气状态必须保持已实现六类');
    if (!r.annualReset) errors.push('当前气候实现按年重置初始分布，不能声明连续跨年链');
    for (const weights of r.seasonalWeights) if (weights.length !== names.length || weights.reduce((a,b) => a+b,0) <= 0) errors.push('天气季节概率表不完整或总权重为零');
    for (const region of r.regions) {
        if (regionIds.has(region.id)) errors.push('气候区编号重复'); regionIds.add(region.id);
        for (const location of region.locations) { if (!registered.has(location)) errors.push(`气候地点不存在：${location}`); if (seen.has(location)) errors.push(`气候地点重复：${location}`); seen.add(location); }
        if (region.indoor.some(id => !region.locations.includes(id))) errors.push(`室内地点不在气候区：${region.id}`);
    }
    return errors;
}
