// RG-A: one renewable-stock law for wood, herbs, wild fruit, reeds and water (pure functions; not yet wired into sites/forest-water).
// Everything is derived from material properties (props), the harvest method table and the gatherer's skill; no resource or site id
// appears here. State lives in the caller's row, exactly like stock.mjs logisticStock:
//   row.visible        integer harvestable stock (the ledger reserve)
//   row.persistence    integer ppm of the breeding population still alive (default 1e6); capacity scales with it
//   row.growthAnchors / row.accruals   continuous anchors kept by logisticStock / accrueStock
// A world day is the only step: events of day d apply at the start of d, then day d grows. Cutting [from,to) into smaller
// intervals therefore gives the identical state. Growth is logistic (stock.mjs), r = ratePerDay (or ln19 / maturityDays; ln19 is
// the logistic 5%→95% duration) × the season's density. The unit of stock is the scale of the breeding base: while any breeding
// population survives, one unit of base lets the stock restart (zero stock with no survivor cannot regrow, as in logisticStock).
import {createHash} from 'node:crypto';
import {logisticStock,accrueStock} from './stock.mjs';

export const LN19=Math.log(19);
const PPM=1e6,MINUTES=1440;
const fail=message=>{throw Error(`renewable: ${message}`);};
const num=(v,label)=>{if(!Number.isFinite(v))fail(`${label} is missing or pending`);return v;};

// Base growth rate per day from the species record.
export function baseRate(props){
    if(Number.isFinite(props?.ratePerDay)&&props.ratePerDay>0)return props.ratePerDay;
    if(Number.isFinite(props?.maturityDays)&&props.maturityDays>0)return LN19/props.maturityDays;
    return fail('species needs ratePerDay or maturityDays');
}
// Capacity in stock units = area × standing stock per km².
export const capacityOf=(props,areaKm2)=>Math.floor(num(areaKm2,'areaKm2')*num(props?.standingPerKm2,'standingPerKm2'));
const quarterOf=day=>Math.floor((((day%360)+360)%360)/90);

// Deterministic uniform draw in [0,1) from (seed, site, day, actor).
export function draw(seed,site,day,actor){
    return createHash('sha256').update(`${seed}|${site}|${day}|${actor}`).digest().readUIntBE(0,6)/2**48;
}
// Share of the taken plants' breeding units destroyed (botany, no coefficients): a root-pulled plant is gone; a shoot-cut plant
// is gone unless it resprouts from the root; seed-regenerated plants lose their offspring when taken before the species sheds
// seed; picking fruit takes the seed. After the seed season an annual's seed is already in the ground.
export function breedingLoss(props,method,season){
    const seeds=props.regrowFrom==='seed',before=seeds&&season<num(props.seedSeason,'seedSeason');
    if(!['root','seed'].includes(props.regrowFrom))fail('species regrowFrom must be root or seed');
    if(method.kills==='root')return seeds&&!before?0:1;
    if(method.kills==='shoot')return props.regrowFrom==='root'?0:before?1:0;
    return method.takesSeed&&before?1:0;
}

function applyHarvest(row,ev,ctx){
    const {props,methods,seed,site,seasonOf,noise}=ctx,method=methods[ev.method];
    if(!method)fail(`unknown harvest method ${ev.method}`);
    if(!Number.isSafeInteger(ev.quantity)||ev.quantity<0)fail('harvest quantity must be a non-negative integer');
    const before=row.visible,taken=Math.min(ev.quantity,before);
    if(!taken)return 0;
    const skill=Math.min(1,Math.max(0,num(ev.skill,'skill'))),cap=num(method.leaveCap,'leaveCap');
    const spare=Math.min(cap,Math.max(0,skill*cap*(1+noise*(2*draw(seed,site,ev.day,ev.actor)-1))));   // share of the patch the gatherer spares
    const damage=taken/before*breedingLoss(props,method,seasonOf(ev.day))*(1-spare);
    row.persistence=Math.floor((row.persistence??PPM)*(1-damage));
    row.visible=before-taken;
    return taken;
}

// settle(row, {props, methods, capacity, fromDay, toDay, harvests, seed, site, seasonOf, immigrationPerDay, noise})
// Returns {visible, regrown, taken, days:[{day,visible,regrown,taken}], ledger}; the ledger lists the postings that reproduce
// visible_end = visible_start + regrown − taken (src:regrowth → reserve, reserve → gatherer).
export function settle(row,{props,methods={},capacity,fromDay,toDay,harvests=[],seed='',site='',seasonOf=quarterOf,immigrationPerDay=0,noise=0}){
    if(!Number.isSafeInteger(fromDay)||!Number.isSafeInteger(toDay)||toDay<fromDay)fail('fromDay/toDay must be integer world days');
    if(!Number.isSafeInteger(row.visible)||row.visible<0)fail('row.visible must be a non-negative integer');
    num(capacity,'capacity');if(!(noise>=0&&noise<=1))fail('noise must be within [0,1]');
    const rate0=baseRate(props),density=props.seasonDensity,ctx={props,methods,seed,site,seasonOf,noise};
    row.persistence??=PPM;
    const events=harvests.map((ev,i)=>({ev,i})).filter(({ev})=>ev.day>=fromDay&&ev.day<toDay).sort((a,b)=>a.ev.day-b.ev.day||a.i-b.i);
    const days=[],ledger=[];let regrownTotal=0,takenTotal=0,next=0;
    for(let day=fromDay;day<toDay;day++){
        let taken=0;
        for(;next<events.length&&events[next].ev.day===day;next++){
            const t=applyHarvest(row,events[next].ev,ctx);taken+=t;
            if(t)ledger.push({day,from:'reserve',to:'gatherer',actor:events[next].ev.actor,amount:t});
        }
        const season=seasonOf(day),rate=rate0*(density?.[season]??1),from=day*MINUTES,to=from+MINUTES;
        // breeding population: logistic recovery; an immigration trickle can restart an extinct patch
        row.persistence=logisticStock(row,'persistence',{reserve:row.persistence,capacity:PPM,rate,from,to});
        if(immigrationPerDay>0)row.persistence=Math.min(PPM,row.persistence+accrueStock(row,'immigration',immigrationPerDay*PPM));
        const base=row.persistence>0?1:0,limit=capacity*row.persistence/PPM+base;
        const grown=Math.max(row.visible,logisticStock(row,'stock',{reserve:row.visible+base,capacity:limit,rate,from,to})-base);
        const regrown=grown-row.visible;row.visible=grown;
        if(regrown)ledger.push({day,from:'src:regrowth',to:'reserve',amount:regrown});
        regrownTotal+=regrown;takenTotal+=taken;days.push({day,visible:row.visible,regrown,taken});
    }
    return {visible:row.visible,regrown:regrownTotal,taken:takenTotal,days,ledger};
}
