// RG-A: one renewable-stock law for every renewable natural stock (pure functions; not yet wired into sites/forest-water).
// Everything is derived from material properties (props), the harvest method table and the gatherer's skill; no resource or site id
// appears here. State lives in the caller's row, exactly like stock.mjs logisticStock:
//   row.visible        integer harvestable stock (the ledger reserve)
//   row.persistence    integer ppm of the breeding population still alive (default 1e6); capacity scales with it
//   row.growthAnchors  continuous anchors kept by logisticStock
// A world day is the only step: events of day d apply at the start of d, then day d grows. Cutting [from,to) into smaller
// intervals therefore gives the identical state. Growth is logistic (stock.mjs), r = ratePerDay (or LOGISTIC_SPAN / maturityDays,
// where maturityDays is the time from 5% to 95% of capacity: N/K = 1/(1+A·e^(−r·t)) is 5% at A·e^(−r·t)=19 and 95% at 1/19, so
// that span is ln361/r = 2·ln19/r) × the season's density (required: a missing density fails loudly). Seasons come from the world
// calendar passed in (engine.calendar(minute).season); seedSeason and seasonDensity use that same index.
// The gatherer's skill enters only through `spare(method, event)`, supplied by the caller (RG-B: through the repo's derived-slot
// path); the module has no skill formula of its own, and a harvest without `spare` fails loudly.
// Restart: while any breeding population survives it stands for `restartUnits` stock units of growth base (species data; pending
// for every real species until a basis exists), so a stripped patch regrows from that base; with no survivor it cannot regrow
// (as in logisticStock). Not modelled here (RG-B decisions): individual variation, immigration from neighbouring patches.
import {logisticStock} from './stock.mjs';

export const LOGISTIC_SPAN=Math.log(361);   // 2·ln19: logistic 5%→95% duration is LOGISTIC_SPAN / r
const PPM=1e6,MINUTES=1440;
const fail=message=>{throw Error(`renewable: ${message}`);};
const num=(v,label)=>{if(!Number.isFinite(v))fail(`${label} is missing or pending`);return v;};

// Base growth rate per day from the species record.
export function baseRate(props){
    if(Number.isFinite(props?.ratePerDay)&&props.ratePerDay>0)return props.ratePerDay;
    if(Number.isFinite(props?.maturityDays)&&props.maturityDays>0)return LOGISTIC_SPAN/props.maturityDays;
    return fail('species needs ratePerDay or maturityDays');
}
// Capacity in stock units = area × standing stock per km².
export const capacityOf=(props,areaKm2)=>Math.floor(num(areaKm2,'areaKm2')*num(props?.standingPerKm2,'standingPerKm2'));
const restartOf=props=>{
    if(!Number.isSafeInteger(props?.restartUnits)||props.restartUnits<1)fail('restartUnits is missing or pending');
    return props.restartUnits;
};

// Share of the taken plants' breeding units destroyed (botany, no coefficients): a root-pulled plant is gone; a shoot-cut plant
// is gone unless it resprouts from the root; seed-regenerated plants lose their offspring when taken before the species sheds
// seed; picking fruit takes the seed. After the seed season an annual's seed is already in the ground.
export function breedingLoss(props,method,season){
    if(!['root','seed'].includes(props.regrowFrom))fail('species regrowFrom must be root or seed');
    if(!['root','shoot','none'].includes(method?.kills))fail(`unknown harvest effect ${method?.kills}`);
    const seeds=props.regrowFrom==='seed',before=seeds&&season<num(props.seedSeason,'seedSeason');
    if(method.kills==='root')return seeds&&!before?0:1;
    if(method.kills==='shoot')return props.regrowFrom==='root'?0:before?1:0;
    return method.takesSeed&&before?1:0;
}

function applyHarvest(row,ev,ctx){
    const {props,methods,calendar,spareOf}=ctx,method=methods[ev.method];
    if(!method)fail(`unknown harvest method ${ev.method}`);
    if(!Number.isSafeInteger(ev.quantity)||ev.quantity<0)fail('harvest quantity must be a non-negative integer');
    const before=row.visible,taken=Math.min(ev.quantity,before);
    if(!taken)return 0;
    if(typeof spareOf!=='function')fail('a spare(method, event) function is required (skill to spared share is pending)');
    const spare=spareOf(method,ev);   // share of the patch the gatherer spares
    if(!Number.isFinite(spare)||spare<0||spare>1)fail('spare must be within [0,1]');
    // The share of the breeding population destroyed is the taken amount over that population (the plants that can seed or
    // resprout = capacity × persistence), not over the visible stock: a patch cut to nothing still has its roots.
    const population=ctx.capacity*(row.persistence??PPM)/PPM,share=population>0?Math.min(1,taken/population):1;
    const damage=share*breedingLoss(props,method,calendar(ev.day*MINUTES).season)*(1-spare);
    row.persistence=Math.floor((row.persistence??PPM)*(1-damage));
    row.visible=before-taken;
    return taken;
}

// settle(row, {props, methods, capacity, calendar, fromDay, toDay, harvests, spare})
// calendar(minute) must return {season} (the world calendar, e.g. minute=>engine.calendar(minute)).
// harvests: [{day, method, quantity, actor, ...}] with every day inside [fromDay,toDay).
// Returns {visible, regrown, taken, days:[{day,visible,regrown,taken}], ledger}; the ledger lists the postings that reproduce
// visible_end = visible_start + regrown − taken (src:regrowth → reserve, reserve → gatherer).
export function settle(row,{props,methods={},capacity,calendar,fromDay,toDay,harvests=[],spare}){
    if(typeof calendar!=='function')fail('a world calendar function is required');
    if(!Number.isSafeInteger(fromDay)||!Number.isSafeInteger(toDay)||toDay<fromDay)fail('fromDay/toDay must be integer world days');
    if(!Number.isSafeInteger(row.visible)||row.visible<0)fail('row.visible must be a non-negative integer');
    num(capacity,'capacity');
    const rate0=baseRate(props),restart=restartOf(props),density=props.seasonDensity,ctx={props,methods,calendar,spareOf:spare,capacity};
    if(!Array.isArray(density))fail('seasonDensity is missing or pending');
    for(const ev of harvests)if(!Number.isSafeInteger(ev.day)||ev.day<fromDay||ev.day>=toDay)fail(`harvest day ${ev.day} is outside [${fromDay},${toDay})`);
    row.persistence??=PPM;
    const events=harvests.map((ev,i)=>({ev,i})).sort((a,b)=>a.ev.day-b.ev.day||a.i-b.i);
    const days=[],ledger=[];let regrownTotal=0,takenTotal=0,next=0;
    for(let day=fromDay;day<toDay;day++){
        let taken=0;
        for(;next<events.length&&events[next].ev.day===day;next++){
            const t=applyHarvest(row,events[next].ev,ctx);taken+=t;
            if(t)ledger.push({day,from:'reserve',to:'gatherer',actor:events[next].ev.actor,amount:t});
        }
        const from=day*MINUTES,to=from+MINUTES,season=calendar(from).season,factor=density[season];
        if(!Number.isFinite(factor)||factor<0)fail(`seasonDensity has no valid entry for season ${season}`);
        const rate=rate0*factor;
        // breeding population: logistic recovery from what survived (zero cannot regrow)
        row.persistence=logisticStock(row,'persistence',{reserve:row.persistence,capacity:PPM,rate,from,to});
        const base=row.persistence>0?restart:0,limit=capacity*row.persistence/PPM+base;
        const grown=Math.max(row.visible,logisticStock(row,'stock',{reserve:row.visible+base,capacity:limit,rate,from,to})-base);
        const regrown=grown-row.visible;row.visible=grown;
        if(regrown)ledger.push({day,from:'src:regrowth',to:'reserve',amount:regrown});
        regrownTotal+=regrown;takenTotal+=taken;days.push({day,visible:row.visible,regrown,taken});
    }
    return {visible:row.visible,regrown:regrownTotal,taken:takenTotal,days,ledger};
}
