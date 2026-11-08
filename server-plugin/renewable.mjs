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
// Unit assumption: one stock unit stands for one breeding unit (mass and plant count scale together), so the share of the breeding
// population destroyed by a take is taken / (capacity × persistence); species whose unit weight differs from their breeding unit
// would need a per-species conversion (not in the data yet).
// Atomic: settle works on a copy of the row and writes it back only when every day succeeded, so a throw leaves the row untouched.
// Additivity of the damage: for one method and one spare the loss from takes that stay below the breeding population is strictly additive
// (floor of the exact rational total, however the takes are grouped). That holds only while no single take reaches the whole breeding
// population; a take that does is the capped branch, computed on the persistence itself, and is not grouping-independent. The double
// keep=1−spare can be off by at most one unit in the last place: the total taken off is the floor of the total of the doubles' decimal values,
// which can be 1 ppm below the mathematical total, and is the same for every grouping of the same takes.
// The quantity given to accrueStock is the product PPM·loss·keep; the product itself can also be one ulp off, equally for every grouping.
// RG-B: when wiring this in, validate on entry that the row is self-consistent (visible not above capacity × persistence / 1e6 + restartUnits);
// from an inconsistent state different groupings of one day's takes can end differently.
// Seasons are read at the start of each world day (calendar(day start).season) and apply to that whole day, for growth and for the
// seed-season test of a harvest on that day.
// Write-back replaces the row's keys with the copy's, including nested objects (growthAnchors, accruals): callers must not cache references
// to the row's sub-objects across a settle call (re-read them from the row). A field-by-field deep write-back would keep references but
// copies every nested object a second time on every call and has to track which fields exist; the row is always fetched from the state
// store by key, so the simpler rule is enough.
// The ledger postings use abstract names ('reserve', 'gatherer'); RG-B must map them to accountKey accounts (src:regrowth → the site's
// reserve → the gatherer's bag) and add site, resource, method and actor checks (the actor is only a label here).
import {logisticStock,accrueStock} from './stock.mjs';
import {ln} from './det-math.mjs';   // the platform's Math.log/exp may differ in the last bit between builds; det-math is bit-exact

export const LOGISTIC_SPAN=ln(361);   // 2·ln19: logistic 5%→95% duration is LOGISTIC_SPAN / r
const PPM=1e6,MINUTES=1440;
const fail=message=>{throw Error(`renewable: ${message}`);};
const num=(v,label)=>{if(!Number.isFinite(v))fail(`${label} is missing or pending`);return v;};

// Base growth rate per day from the species record.
export function baseRate(props){
    const hasRate=props?.ratePerDay!==null&&props?.ratePerDay!==undefined,hasSpan=props?.maturityDays!==null&&props?.maturityDays!==undefined;
    if(hasRate&&hasSpan)fail('ratePerDay and maturityDays are alternatives: give only one');
    if(hasRate&&Number.isFinite(props.ratePerDay)&&props.ratePerDay>0)return props.ratePerDay;
    if(hasSpan&&Number.isFinite(props.maturityDays)&&props.maturityDays>0)return LOGISTIC_SPAN/props.maturityDays;
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
    if(typeof spareOf!=='function')fail('a spare(method, event) function is required (skill to spared share is pending)');
    const spare=spareOf(method,ev);   // share of the patch the gatherer spares
    if(!Number.isFinite(spare)||spare<0||spare>1)fail('spare must be within [0,1]');
    // the botany of this method on this species is validated even when nothing stands to be taken (same rule as spare)
    const loss=breedingLoss(props,method,calendar(ev.day*MINUTES).season);
    const before=row.visible,taken=Math.min(ev.quantity,before);
    if(!taken)return 0;
    // The share of the breeding population destroyed is the taken amount over that population (the plants that can seed or
    // resprout = capacity × persistence), not over the visible stock: a patch cut to nothing still has its roots.
    const persistence=row.persistence??PPM,population=ctx.capacity*persistence/PPM,keep=1-spare;
    let lost;
    if(taken<population){
        // persistence × (taken / (capacity × persistence / PPM)) = PPM × taken / capacity: persistence cancels, so the exact loss per take
        // is PPM × loss × keep × taken / capacity. accrueStock adds that rationally (BigInt) with periods=taken, divisor=capacity and keeps
        // the fraction, so for one spare and one loss the total taken off is floor(PPM·loss·keep·Σtaken / capacity): strictly additive,
        // independent of how the same takes are grouped, with no float noise from persistence.
        lost=accrueStock(row,'breedingLoss',PPM*loss*keep,taken,ctx.capacity);
    }else{
        // the take reaches the whole breeding population: the damaged share is 1 (only the part the method destroys and the gatherer
        // does not spare). Not a linear accumulation, so it is computed on the persistence itself.
        lost=accrueStock(row,'breedingLoss',persistence*loss*keep);
    }
    row.persistence=persistence-Math.min(persistence,lost);
    row.visible=before-taken;
    return taken;
}

// settle(row, {props, methods, capacity, calendar, fromDay, toDay, harvests, spare})
// calendar(minute) must return {season} (the world calendar, e.g. minute=>engine.calendar(minute)).
// harvests: [{day, method, quantity, actor, ...}] with every day inside [fromDay,toDay).
// Returns {visible, regrown, taken, days:[{day,visible,regrown,taken}], ledger}; the ledger lists the postings that reproduce
// visible_end = visible_start + regrown − taken (src:regrowth → reserve, reserve → gatherer).
export function settle(target,{props,methods={},capacity,calendar,fromDay,toDay,harvests=[],spare}){
    const row=structuredClone(target);   // written back to `target` only after every day succeeded
    if(typeof calendar!=='function')fail('a world calendar function is required');
    if(!Number.isSafeInteger(fromDay)||!Number.isSafeInteger(toDay)||toDay<fromDay)fail('fromDay/toDay must be integer world days');
    if(!Number.isSafeInteger(row.visible)||row.visible<0)fail('row.visible must be a non-negative integer');
    num(capacity,'capacity');
    if(!Number.isSafeInteger(capacity)||capacity<1)fail('capacity must be a positive integer number of stock units');
    const rate0=baseRate(props),restart=restartOf(props),density=props.seasonDensity,ctx={props,methods,calendar,spareOf:spare,capacity};
    if(!Array.isArray(density))fail('seasonDensity is missing or pending');
    for(const ev of harvests)if(!Number.isSafeInteger(ev.day)||ev.day<fromDay||ev.day>=toDay)fail(`harvest day ${ev.day} is outside [${fromDay},${toDay})`);
    if(row.persistence!==undefined&&(!Number.isSafeInteger(row.persistence)||row.persistence<0||row.persistence>PPM))fail('row.persistence must be an integer within [0,1e6] ppm');
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
    for(const key of Object.keys(target))delete target[key];
    Object.assign(target,row);
    return {visible:row.visible,regrown:regrownTotal,taken:takenTotal,days,ledger};
}
