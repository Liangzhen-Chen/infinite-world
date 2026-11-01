import { createHash } from 'node:crypto';
import { seededRandom } from './combat.mjs';
import { canonical } from './storage.mjs';
import { hazardRouteClosed } from './hazard-calendar.mjs';
import {obligationCalendar,obligationDate,DAY} from './obligation-calendar.mjs';
import {sin,acos,tan} from './det-math.mjs';

// Old campaigns retain their published 30-day display calendar. Explicit
// campaign dates name a native calendar; no season/daylight override is stored.
export function calendarDateAt(engine,minute,calendar='legacy:30-day'){
    validMinute(minute);
    const day=Math.floor(minute/DAY),date=calendar==='legacy:30-day'?{year:Math.floor(day/360)+1,month:String(Math.floor(day/30)%12+1),day:day%30+1,offset:minute%DAY,leap:false}:obligationDate(minute,calendar),month=Number(String(date.month).replace('leap:',''));
    const hour=Math.floor(date.offset/60),clockMinute=date.offset%60;
    return {year:date.year,month,day:date.day,hour,minute:clockMinute,leap:date.leap,calendar,
        season:Math.floor((month-1)/3),...(engine.rules.calendar.tens?.[Math.floor((date.day-1)/10)]?{ten:engine.rules.calendar.tens[Math.floor((date.day-1)/10)]}:{}),
        market:engine.rules.calendar.marketDays?.includes(date.day)??false,
        text:`${engine.rules.calendar.epoch}${date.year===1?'元':date.year}年 ${date.leap?'闰':''}${engine.rules.calendar.months[month-1]} ${date.day}日 ${String(hour).padStart(2,'0')}:${String(clockMinute).padStart(2,'0')}`};
}
export function minuteForCalendarDate(engine,date){
    if(!date||Object.keys(date).some(k=>!['calendar','year','month','day','hour','minute','leap'].includes(k))||
        !['core:calendar_default','legacy:30-day'].includes(date.calendar)||
        !Number.isSafeInteger(date.year)||date.year<1||date.year>10000||!Number.isSafeInteger(date.month)||date.month<1||date.month>12||
        !Number.isSafeInteger(date.day)||date.day<1||date.day>30||!Number.isSafeInteger(date.hour)||date.hour<0||date.hour>23||
        !Number.isSafeInteger(date.minute)||date.minute<0||date.minute>59||date.leap!==undefined&&typeof date.leap!=='boolean')throw Error('Invalid native calendar date');
    const c=obligationCalendar(date.calendar),rank=r=>[r.year,r.month+(r.leap ? 0.5 : 0),r.day];
    const target=rank(date),compare=r=>{const a=rank(r);for(let i=0;i<3;i++)if(a[i]!==target[i])return a[i]-target[i];return 0;};
    let lo=0,hi=date.year*400;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(compare(calendarDateAt(engine,c.epochMinute+mid*DAY,date.calendar))<0)lo=mid+1;else hi=mid;}
    const minute=c.epochMinute+lo*DAY+date.hour*60+date.minute;
    if(compare(calendarDateAt(engine,minute,date.calendar))!==0)throw Error('Date does not exist on the native calendar');
    return minute;
}
export function historicalMinute(document,{at,daysAgo}={}){
    const now=document.state.minute;
    if(!Number.isSafeInteger(daysAgo)||daysAgo<0||!Number.isSafeInteger(at)||at<0||at>now||Math.floor(now/DAY)-Math.floor(at/DAY)!==daysAgo)throw Error('Historical daysAgo requires a consistent nonnegative absolute date');
    return at;
}

const cache = new Map();
const kinds = ['clear','cloudy','rain','storm','snow','fog'];
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const validMinute = minute => { if (!Number.isSafeInteger(minute) || minute < 0) throw Error('天气分钟必须是非负整数'); };
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
// Pure in (latitude, dayOfYear): the fixed-point trigonometry is computed once per pair, callers get a fresh copy.
const daylightMemo = new Map();
export function daylightAt(latitude, dayOfYear) {
    const key = `${latitude}:${dayOfYear}`;
    let row = daylightMemo.get(key);
    if (!row) { row = daylightCompute(latitude, dayOfYear); if (daylightMemo.size > 4096) daylightMemo.clear(); daylightMemo.set(key, row); }
    return { ...row };
}
function daylightCompute(latitude, dayOfYear) {
    const radians = Math.PI / 180, declination = 23.44 * radians * sin(2*Math.PI*(dayOfYear-0)/360);
    const angle = acos(clamp(-tan(latitude*radians)*tan(declination),-1,1));
    const durationMinutes = Math.round(angle*1440/Math.PI);
    return { sunriseMinute: Math.round(720-durationMinutes/2), sunsetMinute: Math.round(720+durationMinutes/2), durationMinutes };
}
// P2: within one elapsed-time event (engine.weatherSequences) or one caller's
// travel cache, each region's yearly sequence is looked up once instead of
// re-hashing the whole weather rule set for every edge. Keyed by the rules
// object, seed, region and year, so it returns exactly what dailySequence does.
export const WEATHER_SEQUENCES = Symbol('weather sequences');
const WEATHER_LOCATIONS = Symbol('weather locations');
const WEATHER_CACHE_CHECK = process.env.FIELDS_INDEX_CHECK === '1';
const nested = (map, key) => { let next = map.get(key); if (!next) { next = new Map(); map.set(key, next); } return next; };
function cachedSequence(memo, rules, seed, region, year) {
    if (!memo) return dailySequence(rules,seed,region,year);
    const byYear = nested(nested(nested(memo, rules), seed), region);
    if (!byYear.has(year)) byYear.set(year, dailySequence(rules,seed,region,year));
    return byYear.get(year);
}
export function weatherAt(engine, seed, location, minute, sequenceCache = null, calendar=engine.calendarId??'legacy:30-day') {
    validMinute(minute);
    const rules = engine.rules.weather;
    const memo = sequenceCache ? nested(sequenceCache, WEATHER_SEQUENCES) : engine.weatherSequences ?? null;
    // The same rules are fixed for the existing sequence-cache lifetime.
    // First region wins, just like find, including overlapping legacy regions.
    let locations = rules && memo ? nested(memo, WEATHER_LOCATIONS).get(rules) : null;
    if (rules && memo && !locations) {
        locations = new Map();
        for (const row of rules.regions) for (const id of row.locations) if (!locations.has(id)) locations.set(id, row);
        nested(memo, WEATHER_LOCATIONS).set(rules, locations);
    }
    const region = locations ? locations.get(location) : rules?.regions.find(row => row.locations.includes(location));
    if (locations && WEATHER_CACHE_CHECK && region !== rules.regions.find(row => row.locations.includes(location))) throw Error('weather location cache mismatch');
    if (!region) return null;
    const day = Math.floor(minute/1440);
    // The legacy display date is exactly a 360-day year; weather only needs
    // these two integers, not the formatted date/market/clock projection.
    const date=calendar==='legacy:30-day'?null:calendarDateAt(engine,minute,calendar);
    const year=date?date.year-1:Math.floor(day/360),dayOfYear=date?(date.month-1)*30+date.day-1:day%360;
    const row = cachedSequence(memo,rules,seed,region,year)[dayOfYear], light = daylightAt(region.latitude,dayOfYear);
    const indoors = region.indoor.includes(location), effect = rules.states[row.kind];
    const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
    return { ...row, location, region: region.id, day, indoors, ...light,sunrise:clock(light.sunriseMinute),sunset:clock(light.sunsetMinute),
        daylight: minute%1440 >= light.sunriseMinute && minute%1440 < light.sunsetMinute,
        travelFactors: { walk: effect.walk, horse: effect.horse, cart: effect.cart, boat: effect.boat },
        boatClosed: effect.boatClosed === true, hitModifier: indoors ? 0 : effect.hit,
        moodModifier: indoors ? 0 : effect.mood, cropMultiplier: effect.crop };
}
export function localWeather(engine, document, location=document.state.location, minute=document.state.minute) {
    return weatherAt(engine,document.randomSeed,location,minute,null,document.state.records?.['calendar:active']?.calendar??engine.calendarId??'legacy:30-day');
}
// Precipitation as an interaction agent: 'rain' (rain/storm) or 'snow', only
// outdoors in a registered climate region; null otherwise.
export function precipitationAt(engine, seed, location, minute) {
    const row = engine.rules?.weather ? weatherAt(engine,seed,location,minute) : null;
    if (!row || row.indoors) return null;
    return row.kind === 'rain' || row.kind === 'storm' ? 'rain' : row.kind === 'snow' ? 'snow' : null;
}
export function humidityAt(engine, document, location) {
    const explicit = document.state.weather?.[location]?.humidityPercent;
    if (explicit !== undefined) return explicit;
    const current = localWeather(engine,document,location);
    // Interior microclimates remain separately registered environmental facts.
    if (!current || current.indoors) return engine.byId.get(location)?.microclimate?.humidityPercent;
    return current.humidityPercent;
}
// P2: travel conditions depend only on rules, seed, edge start, mode and day.
// Inside one elapsed-time event they are shared by every caller (read-only
// rows); otherwise a caller's own cache keeps them, as before.
const TRAVEL = Symbol('weather travel'), travelScope = {shared:null,rules:null,seed:null,byFrom:null};
export function weatherTravel(engine, seed, edge, mode, minute,cache=null) {
    if(!edge.lengthKm)return {multiplier:1,closed:false};
    const shared=engine.weatherSequences??(cache?nested(cache,WEATHER_SEQUENCES):null),rules=engine.rules.weather;
    let byFrom=null;
    if(shared){
        if(travelScope.shared===shared&&travelScope.rules===rules&&travelScope.seed===seed)byFrom=travelScope.byFrom;
        else{byFrom=nested(nested(nested(shared,TRAVEL),rules),seed);Object.assign(travelScope,{shared,rules,seed,byFrom});}
    }
    const modeDays=byFrom?nested(nested(byFrom,edge.from),mode):null,day=Math.floor(minute/1440);
    if(modeDays?.has(day))return modeDays.get(day);
    const row = weatherAt(engine,seed,edge.from,minute,cache);
    if (!row || !edge.lengthKm) return { multiplier: 1, closed: false };
    const result={ multiplier: row.travelFactors[mode], closed: mode === 'boat' && row.boatClosed,
        region: row.region, weather: row.name, day: row.day };
    modeDays?.set(day,result);return result;
}
export function weatherEdge(engine, seed, edge, mode, departure, elapsedBefore, movingBefore, speed,weatherCache=null) {
    // U3: a seeded flood stage closes the route for its stated span.
    if (hazardRouteClosed(engine,seed,edge.id,departure+elapsedBefore)) return null;
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
        if(edge.closedSeasons.length&&edge.closedSeasons.includes(engine.calendar(now).season))return null;
        if(conditions.closed||hazardRouteClosed(engine,seed,edge.id,now))return null;
        const rate=speed/conditions.multiplier/60;
        const remainingBudget=mode==='boat'?1440:budget-moving%budget;
        const toMidnight=1440-now%1440;
        const chunk=Math.min(remainingBudget,toMidnight,Math.max(1,Math.ceil(distance/rate)));
        distance=Math.max(0,distance-chunk*rate);moving+=chunk;elapsed+=chunk;
    }
    throw Error('天气路线超过规划步数限制');
}
export function cropProduction(engine, seed, settlement, minute, nominal) {
    const row = weatherAt(engine,seed,settlement,minute);
    return row ? Math.max(0,nominal*engine.rules.weather.cropSeasonFactors[row.season]*row.cropMultiplier) : nominal;
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
