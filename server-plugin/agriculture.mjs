import {preconditionFailure} from './precondition.mjs';
import {husbandryAction} from './husbandry.mjs';
import {wearItem,useTool} from './items.mjs';
import {purse,treasury as treasuryAccount,moveCoins} from './money.mjs';
import {BOOKED} from './stock.mjs';
import {declareLedgerWriter,reviseLots} from './ledger.mjs';
import {granary as granaryAccount,seedBank as seedAccount,settlementStock,bag,crop as cropAccount,registerLegacyStock,accrueStock,armyRations,transit as transitAccount,moveStock,bookStock} from './stock.mjs';
import {derived} from './derived.mjs';
import {recordEntriesWhere} from './storage.mjs';
// S1b: 农事是粮仓与种粮的唯一写入者：收成与农副产来自 src:regrowth（田地按积温生长，05 §5.5），
// 吃掉的进 sink:consume，过期与月损进 sink:decay，仓满挤出与掠夺无主的进 sink:destroy；
// 播种的种粮进 sink:consume；成熟时再生到田地账户，收获只转移已有作物。
declareLedgerWriter('agriculture',{sources:{'src:regrowth':{'*':1000000}},sinks:['sink:consume','sink:decay','sink:destroy']});
import {granaryCapacity,installFacilityRuntime}from'./facility-state.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {consumeGrowthDay,validateGrowthRules,validateGrowthWorld}from'./magic-growth.mjs';
import {weatherAt}from'./weather.mjs';
import {damageFarmCrops,farmPestProfile}from'./farm-pests.mjs';
import {harvestSettlementWood}from'./forest-water.mjs';
// RW-04 forest/water stay inside the ecology pack; adapters reach them through this entry.
export {harvestSettlementWood,advanceForestWater,settleFuel,forestWaterPriceFactor}from'./forest-water.mjs';
export {farmWaterFactor}from'./water-cycle.mjs';
import {farmWaterFactor}from'./water-cycle.mjs';
import {preservedSpoilage}from'./magic-economy.mjs';
import {agriculturalEmployment} from './employment-state.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {domainRules,privateCropYieldBase} from './domain-rules.mjs';

const key=id=>`agriculture:${id}`,path=id=>['state','records',key(id)];
const clone=value=>structuredClone(value);
const int=(value,min=1,max=100000)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw preconditionFailure(`数量须在${min}到${max}之间`);return value;};
const awake=n=>n&&!['濒死','睡眠','昏迷'].includes(n.status)&&!['睡觉','睡眠'].includes(n.activity);
const profile=(engine,id)=>engine.rules.agriculture?.settlements.find(p=>p.settlement===id);
const fieldAccount=(engine,id,item=engine.rules.agriculture.grainItem)=>cropAccount(engine,id,item);
const cropLot=(id,day,expiresDay)=>({id,day,expiresDay,kind:'crop'});
const remainingCrop=c=>c.grownFood-Math.floor(c.harvestedUnits*c.grownFood/c.areaUnits);
registerLegacyStock('agriculture-fields',(engine,state,add)=>{
    for(const row of Object.values(state.records??{})){
        if(row.category==='private_farm'&&row.status==='ready')add(fieldAccount(engine,row.location,row.crop),row.yield,[{...cropLot(`private:${row.seedEvent}`,row.readyDay,row.expiresDay),qty:row.yield}]);
        if(row.category==='agriculture')for(const c of row.field.cohorts)if(c.ready){const qty=remainingCrop(c);add(fieldAccount(engine,profile(engine,row.settlement).fieldLocation),qty,[{...cropLot(`public:${c.id}`,c.readyDay,c.expiresDay),qty}]);}
    }
});
function balanced(r,s){
    if(r.batches.reduce((n,b)=>n+b.amount,0)!==s.food||r.field.seedBatches.reduce((n,b)=>n+b.amount,0)!==r.field.seedBank)throw Error('粮仓批次与聚落库存或种粮不一致，拒绝凭空补齐');
}
function storageDays(r,p){return r.granary.condition>=50?p.protectedStorageDays:p.normalStorageDays;}
// ---- S1b 双写：粮仓与种粮的流水 ------------------------------------------------
// 农事在克隆的记录 r 上计算，整条写回；每个改动粮批的原语在 r 的流水里记下"哪些批次、多少、去向或来处"，
// 写回同一处（commit）把流水逐条记入账本：转出按旧批次编号指定账本批次，转入带旧批次的元数据。
const journals=new WeakMap();
const note=(r,entry)=>{let j=journals.get(r);if(!j)journals.set(r,j=[]);j.push(entry);};
const seedLotId=b=>`${b.harvestDay}:${b.expiresDay}`;
export const REGROWTH=purpose=>({flow:'src:regrowth',purpose});
const flowAccount=(engine,spec,resource)=>spec.unbooked?null:spec.account??`${spec.flow}|${resource}|${spec.purpose}`;
function commit(d,engine,sid,r,eventId=null){
    const entries=journals.get(r)??[];journals.delete(r);
    const g=granaryAccount(engine,sid),seed=seedAccount(engine,sid),resource=g.split('|')[1],at=w=>w==='seed'?seed:w==='granary'?g:w;
    for(const e of entries){
        if(e.in){
            const from=flowAccount(engine,e.from,resource);
            moveStock(d,{from,to:at(e.in),amount:e.qty,writer:'agriculture',eventId,lot:e.lot});
            // 来自实体（交粮、送达）的部分若仓容不够，挤出的在交割处损毁（旧账 overflow）。
            if(e.overflow&&!e.from.flow)moveStock(d,{from,to:`sink:destroy|${resource}|overflow`,amount:e.overflow,writer:'agriculture',eventId});
        }else if(e.out){
            const to=flowAccount(engine,e.to,resource);
            if(!to){bookStock(d,engine,at(e.out),-(e.parts?e.parts.reduce((n,p)=>n+p.amount,0):e.qty),undefined);continue;}
            if(e.parts)for(const part of e.parts)moveStock(d,{from:at(e.out),to,amount:part.amount,writer:'agriculture',eventId,pick:part.id!==undefined?[String(part.id)]:null,lot:e.lot?e.lot(part):null});
            else moveStock(d,{from:at(e.out),to,amount:e.qty,writer:'agriculture',eventId});
        }else if(e.revise)reviseLots(d,at(e.revise),e.fn);
    }
}
function addBatch(r,s,p,amount,{id,day,source,kind='grain',expiresDay,growthSources,capacity=r.granary.capacity,from}={}){
    const space=Math.max(0,capacity-s.food-r.field.seedBank),stored=Math.min(amount,space),expires=expiresDay??day+(kind==='fresh'?1:storageDays(r,p));
    if(stored){r.batches.push({id,amount:stored,harvestDay:day,expiresDay:expires,source,kind,warehouse:p.warehouse??p.counter,...(growthSources?.length?{growthSources}: {})});s.food+=stored;}
    if(!from)throw preconditionFailure('入仓须指明来处（账本对方）');
    if(stored||amount-stored)note(r,{in:'granary',qty:stored,overflow:amount-stored,from,lot:{id:String(id),day,expiresDay:expires,kind}});
    r.ledger.overflow+=amount-stored;return stored;
}
function takeFood(r,s,amount,kind=null,to){
    let remaining=amount;const parts=[];
    r.batches.sort((a,b)=>a.expiresDay-b.expiresDay||a.id.localeCompare(b.id));
    for(const batch of r.batches){if(kind&&batch.kind!==kind)continue;const used=Math.min(remaining,batch.amount);if(used)parts.push({id:batch.id,amount:used});batch.amount-=used;remaining-=used;if(!remaining)break;}
    if(!to)throw preconditionFailure('出仓须指明去向（账本对方）');
    if(parts.length)note(r,{out:'granary',parts,to});
    r.batches=r.batches.filter(b=>b.amount>0);s.food-=amount-remaining;return amount-remaining;
}
function takeGrain(r,s,amount,trace=false,to,lot=null){
    let remaining=amount;const parts=[];
    r.batches.sort((a,b)=>a.expiresDay-b.expiresDay||a.id.localeCompare(b.id));
    for(const batch of r.batches.filter(b=>b.kind==='grain')){const used=Math.min(remaining,batch.amount);if(used)parts.push({...batch,amount:used});batch.amount-=used;remaining-=used;if(!remaining)break;}
    if(!to)throw preconditionFailure('出仓须指明去向（账本对方）');
    if(parts.length)note(r,{out:'granary',parts,to,lot});
    r.batches=r.batches.filter(b=>b.amount>0);s.food-=amount-remaining;return trace?{taken:amount-remaining,parts}:amount-remaining;
}
const DECAY={flow:'sink:decay',purpose:'spoil'};
function expire(r,s,day,p,monthly=false,preserved=()=>0){
    // 仓况变差：粮与种粮的保质期缩回常温上限（批次元数据的白名单改写，账本同规则改）。
    const shorten=b=>({...b,expiresDay:Math.min(b.expiresDay,b.day+p.normalStorageDays)});
    if(r.granary.condition<50){note(r,{revise:'granary',fn:l=>l.kind==='grain'?shorten(l):l});note(r,{revise:'seed',fn:shorten});}
    for(const b of r.batches){if(b.kind==='grain'&&r.granary.condition<50)b.expiresDay=Math.min(b.expiresDay,b.harvestDay+p.normalStorageDays);}
    const gone=r.batches.filter(b=>b.expiresDay<=day),expired=gone.reduce((n,b)=>n+b.amount,0);
    if(gone.length)note(r,{out:'granary',parts:gone.map(b=>({id:b.id,amount:b.amount})),to:DECAY});
    r.batches=r.batches.filter(b=>b.expiresDay>day);s.food-=expired;r.ledger.spoiled+=expired;
    for(const b of r.field.seedBatches)if(r.granary.condition<50)b.expiresDay=Math.min(b.expiresDay,b.harvestDay+p.normalStorageDays);
    const seedGone=r.field.seedBatches.filter(b=>b.expiresDay<=day),spoiledSeed=seedGone.reduce((n,b)=>n+b.amount,0);
    if(seedGone.length)note(r,{out:'seed',parts:seedGone.map(b=>({id:seedLotId(b),amount:b.amount})),to:DECAY});
    r.field.seedBatches=r.field.seedBatches.filter(b=>b.expiresDay>day);r.field.seedBank-=spoiledSeed;r.ledger.spoiled+=spoiledSeed;
    // U10: preservation casts covering the stock this month cut the spoilage.
    if(monthly&&day%30===29&&s.food){let spoil=Math.min(s.food,Math.ceil(s.food*p.spoilagePerMonth*(2-r.granary.condition/100)));spoil-=preserved(spoil,s.food);r.ledger.spoiled+=takeFood(r,s,spoil,null,{flow:'sink:decay',purpose:'loss'});}
}
function sow(r,engine,p,day,units){
    const c=engine.rules.agriculture.crop,f=r.field,year=Math.floor(day/360);
    if(f.sownYear!==year){f.sownYear=year;f.sownUnits=0;}
    const occupied=f.cohorts.reduce((n,row)=>n+row.areaUnits,0),available=Math.min(f.areaUnits-occupied,f.areaUnits-f.sownUnits);
    units=Math.min(units,available);
    while(units>0){
        const seed=Math.ceil((f.sownUnits+units)*c.seedPerHa/c.areaUnitsPerHa)-Math.ceil(f.sownUnits*c.seedPerHa/c.areaUnitsPerHa);
        if(seed<=f.seedBank){
            let remaining=seed;const seedSources=[];f.seedBatches.sort((a,b)=>a.expiresDay-b.expiresDay);
            for(const b of f.seedBatches){const used=Math.min(remaining,b.amount);if(used)seedSources.push({...b,amount:used});b.amount-=used;remaining-=used;if(!remaining)break;}
            if(seedSources.length)note(r,{out:'seed',parts:seedSources.map(b=>({id:seedLotId(b),amount:b.amount})),to:{flow:'sink:consume',purpose:'sow'}});
            f.seedBatches=f.seedBatches.filter(b=>b.amount>0);f.seedBank-=seed;r.ledger.seedSpent+=seed;f.sownUnits+=units;
            f.cohorts.push({id:`${year}:${day}:${f.sownUnits}`,sownDay:day,areaUnits:units,grownDays:0,qualitySum:0,qualityDays:0,ready:false,harvestedUnits:0,harvestedFood:0,seedSpent:seed,seedSources,
                ...(farmPestProfile(engine,p.settlement)?{pestDamageBps:0,potentialHarvestedFood:0}:{})});
            r.tools.condition=Math.max(0,r.tools.condition-units*p.toolWearPerArea);return{units,seed};
        }
        units--;
    }
    return{units:0,seed:0};
}
function harvest(r,s,engine,p,day,units,eventId,storageCapacity=r.granary.capacity){
    const c=engine.rules.agriculture.crop,seedTarget=Math.ceil(r.field.areaUnits*c.seedPerHa/c.areaUnitsPerHa);let grain=0,worked=0,pestLost=0,potential=0;const growthSources=new Set();
    const via=transitAccount(engine,`harvest:${p.fieldId}`,engine.rules.agriculture.grainItem);
    for(const row of r.field.cohorts.filter(row=>row.ready)){
        const amount=Math.min(units-worked,row.areaUnits-row.harvestedUnits);if(amount<=0)continue;
        const next=row.harvestedUnits+amount,gross=Math.floor(next*row.grownFood/row.areaUnits);
        const total=Math.floor(gross*(10000-(row.pestDamageBps??0))/10000);
        const grossDelta=gross-Math.floor(row.harvestedUnits*row.grownFood/row.areaUnits),netDelta=total-row.harvestedFood,account=fieldAccount(engine,p.fieldLocation);
        note(r,{out:account,parts:[{id:`public:${row.id}`,amount:netDelta}],to:{account:via}});
        if(grossDelta>netDelta)note(r,{out:account,parts:[{id:`public:${row.id}`,amount:grossDelta-netDelta}],to:DECAY});
        if(farmPestProfile(engine,p.settlement)){
            const grossDelta=gross-row.potentialHarvestedFood,netDelta=total-row.harvestedFood;
            if(grossDelta<netDelta||netDelta<0)throw Error('作物收成账不守恒，拒绝倒扣已经收获的粮食');
            potential+=grossDelta;pestLost+=grossDelta-netDelta;row.potentialHarvestedFood=gross;
        }
        for(const source of row.growthSources??[])growthSources.add(source);
        grain+=total-row.harvestedFood;worked+=amount;row.harvestedFood=total;row.harvestedUnits=next;
    }
    r.field.cohorts=r.field.cohorts.filter(row=>row.harvestedUnits<row.areaUnits);
    const reserved=Math.min(grain,Math.max(0,seedTarget-r.field.seedBank));r.field.seedBank+=reserved;
    if(reserved){const b={amount:reserved,harvestDay:day,expiresDay:day+storageDays(r,p)};r.field.seedBatches.push({...b,...(growthSources.size?{growthSources:[...growthSources]}:{})});
        note(r,{in:'seed',qty:reserved,from:{account:via},lot:{id:seedLotId(b),day,expiresDay:b.expiresDay,kind:'seed'}});}
    // Seed and edible grain share the actual warehouse. Seed gets priority;
    // any displaced edible stock is recorded as overflow, never extra capacity.
    const displaced=Math.max(0,s.food+r.field.seedBank-storageCapacity);
    if(displaced)r.ledger.overflow+=takeFood(r,s,displaced,null,{flow:'sink:destroy',purpose:'overflow'});
    r.ledger.harvested+=grain;r.tools.condition=Math.max(0,r.tools.condition-worked*p.toolWearPerArea);
    if(farmPestProfile(engine,p.settlement)){r.ledger.pestLost+=pestLost;r.ledger.potentialHarvested+=potential;}
    const stored=addBatch(r,s,p,grain-reserved,{id:`harvest:${eventId}`,day,source:'本田实际收获',growthSources:[...growthSources],capacity:storageCapacity,from:{account:via}});
    return{units:worked,grain,reserved,stored,...(farmPestProfile(engine,p.settlement)?{pestLost,potential}:{})};
}
export function advanceAgriculture(d,engine,id,source,day){
    advancePrivateFarms(d,engine,id,day);
    const p=profile(engine,id),original=d.get(...path(id));if(!p||original?.mode!=='managed')return null;
    const r=clone(original),s=clone(source);balanced(r,s);
    if(r.lastDay!==day-1)throw Error('农事日结顺序不连续，拒绝重复或补算过往收成');
    const weather=weatherAt(engine,d.document.randomSeed,p.fieldLocation,day*1440+720),season=engine.calendar(day*1440).season;
    // U12: able-bodied villagers away on levy (levy:<village>) are not in the fields.
    const hired=agriculturalEmployment(d.get('state'),id,day);
    const normalWorkers=Math.floor(s.population*p.workerFraction),availableWorkers=Math.max(0,normalWorkers-(d.get('state','records',`levy:${id}`)?.count??0)-hired.unavailable);
    // Meals are prepared first: levy or hired-out shifts take workers from fields, fresh gathering and wood, never rounding the granary's cooks down.
    const laborShare=normalWorkers?availableWorkers/normalWorkers:1,processing=Math.min(p.processingWorkers,availableWorkers);
    const freshWorkers=Math.min(Math.floor(p.freshWorkers*laborShare),Math.max(0,availableWorkers-processing)),fieldWorkers=Math.min(Math.floor(p.farmWorkers*laborShare+hired.hired),r.tools.capacity,Math.max(0,availableWorkers-processing-freshWorkers));
    const fresh=accrueStock(r,'fresh',derived(engine,d.document,'economy:yield',p.fieldLocation,{holder:id,base:p.freshFoodPerDay*p.freshSeasonFactors[season]*(weather?.cropMultiplier??1)*freshWorkers/p.freshWorkers}));
    if(day%30===29){
        r.granary.condition=Math.max(0,r.granary.condition-1);
        const maintenanceWorkers=availableWorkers-processing-freshWorkers-fieldWorkers;
        const repair=(stock,n)=>{s[stock]-=n;moveStock(d,{from:settlementStock(engine,id,stock),to:`sink:consume|${settlementStock(engine,id,stock).split('|')[1]}|repair`,amount:n,writer:'agriculture',eventId:`day_${day}`});};
        if(r.granary.condition<=70&&maintenanceWorkers>0&&s.wood>=p.repairWood){repair('wood',p.repairWood);r.granary.condition=Math.min(100,r.granary.condition+p.repairCondition);}
        if(r.tools.condition<50&&maintenanceWorkers>0&&s.wood>=p.repairWood&&s.iron>=p.repairIron){repair('wood',p.repairWood);repair('iron',p.repairIron);r.tools.condition=Math.min(100,r.tools.condition+p.repairCondition);}
    }
    expire(r,s,day,p,true,(spoil,food)=>preservedSpoilage(d,engine,id,day,spoil,food));
    let capacity=r.tools.condition>0?Math.floor(fieldWorkers*p.areaPerWorkerDay*r.tools.condition/100):0;
    const sowable=day%360>=engine.rules.agriculture.crop.sowDays[0]&&day%360<=engine.rules.agriculture.crop.sowDays[1]&&weather?.kind!=='storm'&&weather?.kind!=='snow';
    const planted=sowable?sow(r,engine,p,day,capacity):{units:0,seed:0};capacity-=planted.units;
    const pestDamage=damageFarmCrops(d,engine,r,id,day);
    for(const row of r.field.cohorts){
        if(row.ready)continue;
        if((weather?.temperatureC??10)>=engine.rules.agriculture.crop.minimumTemperatureC){row.grownDays++;row.qualityDays++;row.qualitySum+=(weather?.cropMultiplier??1)*farmWaterFactor(engine,d.get('state'),id,day);}
        }
    consumeGrowthDay(d,engine,r,p,day,weather);
    for(const row of r.field.cohorts){
        if(!row.ready&&row.grownDays>=engine.rules.agriculture.crop.growthDays){
            row.ready=true;row.readyDay=day;row.expiresDay=day+p.normalStorageDays;
            row.grownFood=Math.floor(derived(engine,d.document,'economy:yield',p.fieldLocation,{holder:id,base:row.areaUnits*engine.rules.agriculture.crop.yieldPerHa/engine.rules.agriculture.crop.areaUnitsPerHa*row.qualitySum/Math.max(1,row.qualityDays)}));
            note(r,{in:fieldAccount(engine,p.fieldLocation),qty:row.grownFood,from:REGROWTH('crop'),lot:cropLot(`public:${row.id}`,day,row.expiresDay)});
        }
        if(row.ready&&day>=row.expiresDay){
            note(r,{out:fieldAccount(engine,p.fieldLocation),parts:[{id:`public:${row.id}`,amount:remainingCrop(row)}],to:DECAY});
            r.ledger.fieldRotted=(r.ledger.fieldRotted??0)+remainingCrop(row);
            row.rotted=true;
        }
    }
    r.field.cohorts=r.field.cohorts.filter(row=>!row.rotted);
    const result=weather?.kind!=='storm'&&weather?.kind!=='snow'?harvest(r,s,engine,p,day,capacity,`day_${day}`,granaryCapacity(engine,d.get('state'),id,r.granary.capacity)):{units:0,grain:0,reserved:0,stored:0};
    r.ledger.freshProduced+=fresh;addBatch(r,s,p,fresh,{id:`fresh:${day}`,day,source:'每日农副产',kind:'fresh',capacity:granaryCapacity(engine,d.get('state'),id,r.granary.capacity),from:REGROWTH('fresh')});
    const mouths=Math.max(0,s.population-(d.get('state','records',`levy:${id}`)?.count??0));
    const MEAL={flow:'sink:consume',purpose:'meal'};
    const freshEaten=takeFood(r,s,mouths,'fresh',MEAL);
    const grainEaten=takeFood(r,s,Math.min(mouths-freshEaten,Math.floor(processing*p.processingPerWorker)),'grain',MEAL);
    const eaten=freshEaten+grainEaten;r.ledger.eaten+=eaten;
    const missingMeals=mouths-eaten;r.lastDay=day;
    const woodWorkers=Math.min(2,Math.max(0,availableWorkers-processing-freshWorkers-fieldWorkers)),woodProduced=harvestSettlementWood(d,engine,id,Math.floor(s.woodPerDay*woodWorkers/2),(day+1)*1440);
    r.lastReport={day,workers:{available:availableWorkers,processing,fresh:freshWorkers,field:fieldWorkers,wood:woodWorkers},fresh,wood:woodProduced,planted:planted.units,seedSpent:planted.seed,harvest:result.grain,seedReserved:result.reserved,stored:result.stored,freshEaten,grainEaten,eaten,missingMeals,
        ...(pestDamage?{harvestLostToPests:result.pestLost??0,pestDamageAddedMaxPercent:pestDamage.maximumAddedPercent}:{})};
    balanced(r,s);commit(d,engine,id,r,`day_${day}`);d.set(path(id),r);return{settlement:s,missingMeals,woodProduced};
}
// U12: an army quartermaster draws grain above the winter reserve (the same
// sellable surplus as a granary sale); raid:true seizes grain regardless of the
// reserve. Returns the units actually taken.
// S1b: 未托管农事的聚落按旧日产账结算（推进注册表的 daily）：当日产粮来自 src:regrowth，吃掉的进 sink:consume。
export function bookLegacyFood(d,engine,sid,produced,eaten,day){
    const g=granaryAccount(engine,sid),resource=g.split('|')[1],eventId=`day_${day}`;
    moveStock(d,{from:`src:regrowth|${resource}|harvest`,to:g,amount:produced,writer:'agriculture',eventId,lot:{id:'stock',day:null,expiresDay:null,kind:null}});
    moveStock(d,{from:g,to:`sink:consume|${resource}|meal`,amount:eaten,writer:'agriculture',eventId});
}
// S1b: to = 粮的去处（军队的军粮账户；掠夺而无本方队伍接收时为 sink:destroy）。
export function drawGranary(d,engine,id,quantity,{raid=false,to,eventId=null}={}){
    const p=profile(engine,id),s0=d.get('state','settlements',id);if(!p||!s0||!(quantity>0))return 0;
    to??={unbooked:true};// 未给去向的直接调用（测试夹具）记未入账漂移
    const original=d.get(...path(id));
    if(original?.mode!=='managed'){const take=Math.min(quantity,raid?s0.food:Math.max(0,s0.food-s0.population*p.reserveDays));if(take){const dst=flowAccount(engine,to,granaryAccount(engine,id).split('|')[1]);if(dst)moveStock(d,{from:granaryAccount(engine,id),to:dst,amount:take,writer:'agriculture',eventId});else bookStock(d,engine,granaryAccount(engine,id),-take,undefined);d.set(['state','settlements',id,'food'],s0.food-take);}return take;}
    const r=clone(original),s=clone(s0);balanced(r,s);
    const stock=r.batches.filter(b=>b.kind==='grain').reduce((n,b)=>n+b.amount,0),available=raid?stock:Math.max(0,stock-s.population*p.reserveDays);
    const taken=takeGrain(r,s,Math.min(quantity,available),false,to);if(!taken)return 0;
    // Leaves the granary like a sale (the conservation outflow); armyDrawn/raided break it down.
    r.ledger.sold+=taken;r.ledger[raid?'raided':'armyDrawn']=(r.ledger[raid?'raided':'armyDrawn']??0)+taken;
    balanced(r,s);commit(d,engine,id,r,eventId);d.set(path(id),r);d.set(['state','settlements',id],s);return taken;
}

// Physical containers are independent of account ownership: a batch in another
// warehouse, seed reserve, or travelling cargo is never lost with this building.
export function damageStoredGrain(d,engine,building,damage,condition,{eventId,minute}={}){
 const marker=`warehouse_loss:${eventId}`;if(d.get('state','records',marker))return 0;
 let lost=0;
 for(const p of engine.rules.agriculture?.settlements??[]){
  const sid=p.settlement,original=d.get(...path(sid));if(original?.mode!=='managed')continue;
  const r=clone(original),s=clone(d.get('state','settlements',sid));balanced(r,s);
  const parts=[];
  for(const b of r.batches){
   // Old saves have one real counter/warehouse. New batches carry that address.
   if((b.warehouse??p.warehouse??p.counter)!==building)continue;
   b.warehouse=building;
   const amount=Math.min(b.amount,Math.floor(b.amount*damage/condition));
   if(amount){b.amount-=amount;parts.push({id:b.id,amount});lost+=amount;s.food-=amount;}
  }
  if(!parts.length)continue;
  r.batches=r.batches.filter(b=>b.amount>0);
  // sold is the existing external-outflow conservation column; keep the actual
  // cause separately, just as armyDrawn/raided already do.
  const amount=parts.reduce((n,b)=>n+b.amount,0);r.ledger.sold+=amount;r.ledger.fireDestroyed=(r.ledger.fireDestroyed??0)+amount;
  note(r,{out:'granary',parts,to:{flow:'sink:destroy',purpose:'fire'}});commit(d,engine,sid,r,eventId);
  balanced(r,s);d.set(path(sid),r);d.set(['state','settlements',sid],s);
 }
 d.set(['state','records',marker],{category:'warehouse_loss',building,amount:lost,minute,sourceEvent:eventId});
 return lost;
}
export function settleAgricultureExpiry(d,engine,settlementId){
    const day=Math.floor(d.get('state','minute')/1440);
    for(const p of engine.rules.agriculture?.settlements??[]){
        if(settlementId&&p.settlement!==settlementId)continue;
        const original=d.get(...path(p.settlement));if(original?.mode!=='managed')continue;
        const batches=[...original.batches,...original.field.seedBatches];
        if(!batches.some(b=>b.expiresDay<=day||(original.granary.condition<50&&b.kind!=='fresh'&&b.expiresDay>b.harvestDay+p.normalStorageDays)))continue;
        const r=clone(original),s=clone(d.get('state','settlements',p.settlement));balanced(r,s);expire(r,s,day,p);
        balanced(r,s);commit(d,engine,p.settlement,r,`expiry:${day}`);d.set(path(p.settlement),r);d.set(['state','settlements',p.settlement],s);
    }
}
export function agricultureView(engine,document){
    if(!engine.rules.agriculture)return null;
    const p=engine.rules.agriculture.settlements.find(p=>[p.settlement,p.counter,p.fieldLocation].includes(document.state.location));if(!p)return null;
    const r=document.state.records[key(p.settlement)];
    if(!r)return{settlement:p.settlement,mode:'旧账待迁移'};
    return{settlement:p.settlement,mode:r.mode,food:document.state.settlements[p.settlement].food,seed:r.field.seedBank,
        field:{id:r.field.id,location:p.fieldLocation,areaHa:r.field.areaUnits/engine.rules.agriculture.crop.areaUnitsPerHa,
            ...(farmPestProfile(engine,p.settlement)?{damageType:'害兽啃食'}:{}),
            growth:clone(r.field.growthLeases??[]),
            growing:r.field.cohorts.filter(c=>!c.ready).map(c=>({areaHa:c.areaUnits/100,grownDays:c.grownDays,requiredDays:engine.rules.agriculture.crop.growthDays,...(c.pestDamageBps!==undefined?{pestDamagePercent:c.pestDamageBps/100}:{})})),
            readyHa:r.field.cohorts.filter(c=>c.ready).reduce((n,c)=>n+c.areaUnits-c.harvestedUnits,0)/100},
        granary:{...r.granary,capacity:granaryCapacity(engine,document.state,p.settlement,r.granary.capacity)},tools:r.tools,lastReport:r.lastReport,ledger:clone(r.ledger),fiscal:clone(document.state.records[`village-fiscal:${p.settlement}`]??null),contracts:(engine.rules.agriculture.settlements.map(p=>p.tradeContract).filter(c=>c&&[c.seller,c.buyer].includes(p.settlement))).map(c=>({...clone(c),settlement:clone(document.state.records[`village-trade:${c.id}`]??null)}))};
}
export function validateAgricultureRules(world){
    const errors=[...validateGrowthRules(world.rules.magicGrowth),...validateGrowthWorld(world)],r=world.rules.agriculture;if(!r)return errors;
    for(const spell of world.spells??[])if(spell.effectSpec?.kind==='growth'){
        const limit=world.rules.magicGrowth?.stageLimits?.[spell.stage];
        if(!limit||spell.effectSpec.power>limit.power||spell.duration>limit.duration)errors.push(`生长阶段界限不符：${spell.id}`);
    }
    const ids=new Map([...world.locations,...world.npcs,...world.items,...world.skills].map(row=>[row.id,row])),seen=new Set();
    if(!world.rules.weather)errors.push('农事源规则需要已接入地区天气');
    if(ids.get(r.grainItem)?.weight!==r.foodUnitKg||ids.get(r.grainItem)?.shelfLifeDays!==180)errors.push('粮仓转换必须绑定现有半公斤、180天的谷物目录，不能换成任意食物');
    if(!ids.has(r.farmingSkill))errors.push('农夫技能未登记');
    if(r.crop.sowDays[0]>r.crop.sowDays[1])errors.push('播种日期范围倒置');
    for(const p of r.settlements){
        if(seen.has(p.settlement))errors.push('聚落农业配置重复');seen.add(p.settlement);
        for(const id of [p.settlement,p.counter,p.manager,p.fieldLocation])if(!ids.has(id))errors.push(`农事引用不存在：${id}`);
        if(!p.counter.startsWith('bld_')||!p.manager.startsWith('npc_')||!p.fieldLocation.startsWith('loc_'))errors.push('柜台、管理人或农田类型不符');
        if((ids.get(p.manager)?.age??0)<18)errors.push('粮仓管理人必须成年');
        if(p.initialFood+p.initialSeed>p.granaryCapacity)errors.push('源开局粮食和种粮超过粮仓容量');
        if(p.initialSeed<Math.ceil(p.areaUnits*r.crop.seedPerHa/r.crop.areaUnitsPerHa))errors.push('源种粮不够播已登记田地');
        if(p.initialHarvestDay+p.protectedStorageDays<=0)errors.push('源开局储粮已过期');
        if(p.normalStorageDays!==180||p.protectedStorageDays!==p.normalStorageDays*2)errors.push('当前保存条件只支持登记180天与受控二倍，不能任意延寿');
        if(!world.rules.weather?.regions.some(c=>c.locations.includes(p.fieldLocation)))errors.push('登记农田缺地区天气');
    }
    return errors;
}
function counter(d,engine,p){
    if(d.get('state','location')!==p.counter||(!isEffective(engine,d,p.manager)||!awake(d.get('state','npcs',p.manager)))||d.get('state','npcs',p.manager,'location')!==p.counter)throw preconditionFailure('需要本人到粮仓柜台，与在场清醒管理员办理');
    const hours=engine.byId.get(p.counter)?.openHours,clock=d.get('state','minute')%1440;
    if(hours&&(clock<hours[0]||clock>=hours[1]))throw preconditionFailure('柜台当前不在登记开放时段');
}

function balancedFiscal(row){
 const fields=['openingTreasuryCopper','advanceCopper','salesGrossCopper','salesNetCopper','taxReceiptsCopper','purchasesCopper','exportedFood','importedFood'];
 if(row.category!=='village_fiscal'||!Array.isArray(row.entries)||fields.some(k=>!Number.isSafeInteger(row[k])||row[k]<0))throw Error('税贸账字段不完整或非法，拒绝结算');
 const sum=k=>row.entries.reduce((n,e)=>n+(e[k]??0),0);
 if(row.salesGrossCopper!==row.salesNetCopper+row.taxReceiptsCopper||row.advanceCopper!==sum('advanceCopper')||row.salesNetCopper!==sum('netCopper')||row.taxReceiptsCopper!==sum('taxCopper')||row.purchasesCopper!==-row.entries.filter(e=>e.phase==='deliver').reduce((n,e)=>n+e.copper,0)||row.exportedFood!==-row.entries.filter(e=>e.phase==='pickup').reduce((n,e)=>n+e.food,0)||row.importedFood!==row.entries.filter(e=>e.phase==='deliver').reduce((n,e)=>n+e.food,0))throw Error('税贸明细与总账不守恒，拒绝覆盖或补齐');
}
function settleVillageTrade(d,engine,p,args,eventId){
 const contracts=engine.rules.agriculture.settlements.map(p=>p.tradeContract).filter(Boolean),contract=contracts.find(c=>c.id===args.contract);
 if(!contract)throw preconditionFailure('粮约未登记；口头计划不能结算税贸款');
 if(!['pickup','deliver'].includes(args.phase))throw preconditionFailure('粮约须明确pickup提粮或deliver送达');
 const expected=args.phase==='pickup'?contract.seller:contract.buyer;
 if(p.settlement!==expected)throw preconditionFailure('必须本人到粮约本阶段的登记柜台，不可隔空交割');
 counter(d,engine,p);
 const official=engine.resolve(args.authority??'','npc'),code=legalCodeAt(engine,p.settlement,d.get('state'));
 if(official!==p.manager||!code?.judges.includes(official))throw preconditionFailure('此人没有粮约收款及税章权限；普通协调者不能征税');
 const tradeKey=`village-trade:${contract.id}`,old=d.get('state','records',tradeKey);
 if(old&&old.category!=='village_trade')throw Error('粮约账编号冲突，拒绝覆盖');
 if(old?.status==='delivered'||args.phase==='pickup'&&old?.status==='in-transit')return{contract:contract.id,status:old.status,alreadySettled:true,actionScope:{kind:'instant'}};
 const r=clone(d.get(...path(p.settlement))),stock=clone(d.get('state','settlements',p.settlement));
 if(r?.mode!=='managed'||!stock)throw preconditionFailure('公共粮账尚未采用；旧档不能按新开局库存结算');
 balanced(r,stock);
 const day=Math.floor(d.get('state','minute')/1440),cost=contract.quantity*contract.unitPriceCopper,tax=Math.floor(cost*contract.taxBps/10000);
 const fiscalKey=`village-fiscal:${p.settlement}`,fiscal=clone(d.get('state','records',fiscalKey)??{category:'village_fiscal',openingTreasuryCopper:stock.treasury,advanceCopper:0,salesGrossCopper:0,salesNetCopper:0,taxReceiptsCopper:0,purchasesCopper:0,exportedFood:0,importedFood:0,entries:[]});
 balancedFiscal(fiscal);
 if(args.phase==='pickup'){
  if(old)throw preconditionFailure('粮约账状态冲突');
  const surplus=r.batches.filter(b=>b.kind==='grain').reduce((n,b)=>n+b.amount,0)-stock.population*p.reserveDays;
  if(surplus<contract.quantity)throw preconditionFailure('没有实际可出口余粮，口头预计产量不能履约');
  if(d.get('state','player','coins')<cost)throw preconditionFailure('提粮须实际支付货款；未经同意不得扣取NPC铜钱');
  const goods=takeGrain(r,stock,contract.quantity,true,{account:bag(engine,'player',contract.item)});
  engine.itemDelta(d,'player',contract.item,contract.quantity,BOOKED);
  moveCoins(d,{from:purse(engine,'player'),to:treasuryAccount(p.settlement),amount:cost,writer:'agriculture',eventId});d.set(['state','player','coins'],d.get('state','player','coins')-cost);stock.treasury+=cost;r.ledger.sold+=contract.quantity;
  fiscal.advanceCopper+=cost;fiscal.exportedFood+=contract.quantity;
  fiscal.entries.push({eventId,contract:contract.id,phase:'pickup',other:'player',food:-contract.quantity,copper:cost,advanceCopper:cost,taxCopper:0});
  d.set(['state','records',tradeKey],{category:'village_trade',contract:contract.id,seller:contract.seller,buyer:contract.buyer,carrier:'player',item:contract.item,quantity:contract.quantity,prepaidCopper:cost,paidCopper:0,receivedCopper:0,taxCopper:0,expectedTaxCopper:tax,status:'in-transit',pickupDay:day,dueDay:day+contract.deliveryDays,batches:goods.parts,pickupEvent:eventId});
 }else{
  if(old?.status!=='in-transit'||old.carrier!=='player')throw preconditionFailure('尚未实际提粮付款，不能把合同记为已送达');
  if(day>old.dueDay||old.batches.some(b=>b.expiresDay<=day))throw preconditionFailure('粮约已逾期或原粮批已过期，不能作为正常履约');
  if(engine.quantity(d,'player',contract.item)<contract.quantity)throw preconditionFailure('携带粮物不足；登记提粮不是已完成送达');
  if(stock.treasury<cost)throw preconditionFailure('收货村没有实际铜钱，不能凭空付款');
  if(stock.food+r.field.seedBank+contract.quantity>granaryCapacity(engine,d.get('state'),p.settlement,r.granary.capacity))throw preconditionFailure('收货仓容不足，不能确认未入仓粮物');
  engine.itemDelta(d,'player',contract.item,-contract.quantity,BOOKED);
  for(const [i,b] of old.batches.entries())addBatch(r,stock,p,b.amount,{id:`trade:${eventId}:${i}`,day:b.harvestDay,expiresDay:b.expiresDay,source:`粮约${contract.id}实际送达`,capacity:granaryCapacity(engine,d.get('state'),p.settlement,r.granary.capacity),from:{account:bag(engine,'player',contract.item)}});
  moveCoins(d,{from:treasuryAccount(p.settlement),to:purse(engine,'player'),amount:cost,writer:'agriculture',eventId});r.ledger.donated+=contract.quantity;stock.treasury-=cost;d.set(['state','player','coins'],d.get('state','player','coins')+cost);
  fiscal.purchasesCopper+=cost;fiscal.importedFood+=contract.quantity;
  fiscal.entries.push({eventId,contract:contract.id,phase:'deliver',other:'player',food:contract.quantity,copper:-cost});
  const sourceFiscalKey=`village-fiscal:${contract.seller}`,sourceFiscal=clone(d.get('state','records',sourceFiscalKey));
  balancedFiscal(sourceFiscal??{});
  if(sourceFiscal.advanceCopper<cost)throw Error('源村预付款账不符，拒绝不守恒结算');
  sourceFiscal.advanceCopper-=cost;sourceFiscal.salesGrossCopper+=cost;sourceFiscal.salesNetCopper+=cost-tax;sourceFiscal.taxReceiptsCopper+=tax;
  sourceFiscal.entries.push({eventId,contract:contract.id,phase:'recognized',other:contract.buyer,food:0,copper:0,advanceCopper:-cost,netCopper:cost-tax,taxCopper:tax});
  balancedFiscal(sourceFiscal);d.set(['state','records',sourceFiscalKey],sourceFiscal);
  d.set(['state','records',tradeKey],{...old,prepaidCopper:0,paidCopper:cost,receivedCopper:cost,taxCopper:tax,status:'delivered',deliveryDay:day,deliveryEvent:eventId});
 }
 balanced(r,stock);balancedFiscal(fiscal);commit(d,engine,p.settlement,r,eventId);d.set(path(p.settlement),r);d.set(['state','settlements',p.settlement],stock);d.set(['state','records',fiscalKey],fiscal);
 return{contract:contract.id,status:args.phase==='pickup'?'in-transit':'delivered',quantity:contract.quantity,paidCopper:args.phase==='pickup'?0:cost,prepaidCopper:args.phase==='pickup'?cost:0,taxCopper:args.phase==='pickup'?0:tax,note:'提粮记预付款和在途；本人携货沿路线到收货村验收入仓后确认货款和税，不另扣私人铜钱。',actionScope:{kind:'instant'}};
}
export function agricultureAction(d,args,eventId){
    if(['husbandry_collect','husbandry_inspect'].includes(args.operation))return husbandryAction.call(this,d,args,eventId);
    const operation=args.operation??'inspect',id=args.settlement?this.resolve(args.settlement,'loc'):this.rules.agriculture?.settlements.find(p=>[p.settlement,p.counter,p.fieldLocation].includes(d.get('state','location')))?.settlement,p=profile(this,id);
    if(!p)throw preconditionFailure('这里尚未登记农田及粮仓规则');
    if(operation.startsWith('private_'))return privateFarmAction(d,this,p,args,eventId);
    if(operation==='settle_trade')return settleVillageTrade(d,this,p,args,eventId);
    if(operation==='inspect'){
        if(![p.settlement,p.counter,p.fieldLocation].includes(d.get('state','location')))throw preconditionFailure('不能隔空观察异地农事');
        return{agriculture:agricultureView(this,d.document),actionScope:{kind:'instant',instantaneous:true,note:'只读观察，不推进时间。'}};
    }
    const r=clone(d.get(...path(id))),s=clone(d.get('state','settlements',id));
    if(!r)throw Error('农事记录尚未迁移');
    if(operation==='adopt'){
        counter(d,this,p);if(r.mode!=='legacy')throw preconditionFailure('已经采用农事账，不能重复初始化');
        r.mode='managed';r.lastDay=Math.floor(d.get('state','minute')/1440)-1;r.ledger.openingFood=s.food;r.batches=s.food?[{id:`legacy:${eventId}`,amount:s.food,harvestDay:Math.floor(d.get('state','minute')/1440),expiresDay:Math.floor(d.get('state','minute')/1440)+p.normalStorageDays,source:'迁移保留的旧库存',kind:'grain'}]:[];
        // 旧库存不分批次；采用农事账时整仓改记为一个批次（经过路账户转出再转入，数量不变）。
        if(s.food){const g=granaryAccount(this,id),via=transitAccount(this,`agriculture:${id}`,this.rules.agriculture.grainItem),b=r.batches[0];
            moveStock(d,{from:g,to:via,amount:s.food,writer:'agriculture',eventId});moveStock(d,{from:via,to:g,amount:s.food,writer:'agriculture',eventId,lot:{id:b.id,day:b.harvestDay,expiresDay:b.expiresDay,kind:'grain'}});}
        d.set(path(id),r);return{settlement:id,adopted:true,food:s.food,seed:r.field.seedBank,note:'旧粮数量保持，未发新粮、种子或过去收成；播种前须实际预留种粮',actionScope:{kind:'instant'}};
    }
    if(r.mode!=='managed')throw preconditionFailure('这是旧日产账；到柜台明确adopt才能切换，不自动给旧存档添粮');
    balanced(r,s);
    if(['buy','donate','reserve_seed','repair'].includes(operation)){
        counter(d,this,p);
        const quantity=operation==='repair'?0:int(args.quantity);
        const item=this.rules.agriculture.grainItem;
        if(!this.replaying&&['buy','donate','reserve_seed'].includes(operation)&&args.item!==undefined&&this.resolve(args.item,'item')!==item)throw preconditionFailure(`粮仓此操作只办理${this.byId.get(item).name}，不能替换指定物品；其他商品请向实际商家交易`);
        if(operation==='buy'){
            const reserve=s.population*p.reserveDays,available=Math.max(0,r.batches.filter(b=>b.kind==='grain').reduce((n,b)=>n+b.amount,0)-reserve),price=this.byId.get(item).basePrice,cost=quantity*price;
            if(quantity>available)throw preconditionFailure('粮仓没有这份可售余粮，过冬储粮和种粮不出售');if(d.get('state','player','coins')<cost)throw preconditionFailure('买粮余额不足');
            const paid=takeGrain(r,s,quantity,false,{account:bag(this,'player',item)});if(paid!==quantity)throw preconditionFailure('粮仓实际库存不足');
            moveCoins(d,{from:purse(this,'player'),to:treasuryAccount(id),amount:cost,writer:'agriculture',eventId});this.itemDelta(d,'player',item,quantity,BOOKED);d.set(['state','player','coins'],d.get('state','player','coins')-cost);s.treasury+=cost;r.ledger.sold+=quantity;
        }else if(operation==='donate'){
            if(this.quantity(d,'player',item)<quantity)throw preconditionFailure('行囊谷物不足');this.itemDelta(d,'player',item,-quantity,BOOKED);
            r.ledger.donated+=quantity;addBatch(r,s,p,quantity,{id:`donation:${eventId}`,day:Math.floor(d.get('state','minute')/1440),source:'玩家实际交粮',capacity:granaryCapacity(this,d.get('state'),p.settlement,r.granary.capacity),expiresDay:Math.floor(d.get('state','minute')/1440)+this.byId.get(item).shelfLifeDays,from:{account:bag(this,'player',item)}});
        }else if(operation==='reserve_seed'){
            if(r.batches.filter(b=>b.kind==='grain').reduce((n,b)=>n+b.amount,0)<quantity)throw preconditionFailure('实际谷物不足，不能把蔬果或未来收成当种粮');
            const moved=takeGrain(r,s,quantity,true,{account:seedAccount(this,id)},b=>({id:seedLotId(b),kind:'seed'}));r.field.seedBank+=quantity;r.field.seedBatches.push(...moved.parts.map(({amount,harvestDay,expiresDay})=>({amount,harvestDay,expiresDay})));
        }else{
            if(s.wood<p.repairWood||s.iron<p.repairIron)throw preconditionFailure('修理需要实际公共木料和铁料');
            for(const [stock,n] of [['wood',p.repairWood],['iron',p.repairIron]])moveStock(d,{from:settlementStock(this,id,stock),to:`sink:consume|${settlementStock(this,id,stock).split('|')[1]}|repair`,amount:n,writer:'agriculture',eventId});
            s.wood-=p.repairWood;s.iron-=p.repairIron;r.tools.condition=Math.min(100,r.tools.condition+p.repairCondition);r.granary.condition=Math.min(100,r.granary.condition+p.repairCondition);
        }
        balanced(r,s);commit(d,this,id,r,eventId);d.set(path(id),r);d.set(['state','settlements',id],s);
        this.advance(d,operation==='repair'?90:10,eventId);return{settlement:id,operation,quantity,food:d.get('state','settlements',id,'food'),seed:d.get(...path(id),'field','seedBank'),note:'只结算实际粮物、材料及款项，不代表额外NPC承诺'};
    }
    if(operation==='guard'){
        const pest=farmPestProfile(this,id);if(!pest)throw preconditionFailure('当前农田没有启用害兽防护规则');
        if(d.get('state','location')!==p.fieldLocation)throw preconditionFailure('须本人到登记农田巡守');
        if(!r.field.cohorts.some(c=>!c.ready))throw preconditionFailure('没有正在生长的作物可巡护');
        const known=d.get('state','skills',this.rules.agriculture.farmingSkill),check=this.check(d,{attribute:'体质',...(known?{skill:this.rules.agriculture.farmingSkill}:{}),difficulty:10},eventId);
        this.advance(d,pest.guardMinutes,eventId);
        if(!check.success||d.get('state','player','status')!=='正常'||d.get('state','location')!==p.fieldLocation)return{...check,success:false,protection:null,note:'已经花费巡田时间；没有建立防护，没有伤害动物或恢复作物'};
        const latest=clone(d.get(...path(id)));if(!latest.field.cohorts.some(c=>!c.ready))return{success:false,protection:null,note:'巡田完成前作物已成熟，不回填保护'};
        const start=d.get('state','minute'),until=start+pest.guardDurationMinutes;
        latest.field.pestProtection.push({start,until});d.set(path(id),latest);
        const startLocal=this.calendar(start).text,untilLocal=this.calendar(until).text;
        return{success:true,...check,field:p.fieldId,protection:{start,until,startLocal,untilLocal,durationMinutes:pest.guardDurationMinutes,reductionPercent:pest.guardReductionBps/100},
            factSummary:`防护从${startLocal}起至${untilLocal}止，共${pest.guardDurationMinutes}分钟；只减轻这段时间内后续的害兽损失。`,
            note:'本人巡田，后续登记时段内减轻害兽活动时的损失，不杀动物、不追回此前损失、不领取报酬'};
    }
    if(!['sow','harvest'].includes(operation))throw preconditionFailure('未知农事操作');
    if(d.get('state','location')!==p.fieldLocation)throw preconditionFailure('须本人到登记农田工作');
    if(r.tools.condition<=0||r.tools.capacity<1)throw preconditionFailure('公共农具不可用');
    const day=Math.floor(d.get('state','minute')/1440),weather=weatherAt(this,d.document.randomSeed,p.fieldLocation,d.get('state','minute'));
    if(['storm','snow'].includes(weather?.kind))throw preconditionFailure('当前雨雪不宜进行这项田间工作');
    if(operation==='sow'&&(day%360<this.rules.agriculture.crop.sowDays[0]||day%360>this.rules.agriculture.crop.sowDays[1]))throw preconditionFailure('不在本作物播种窗口');
    if(operation==='sow'&&r.field.seedBank<=0)throw preconditionFailure('没有实际种粮');
    if(operation==='harvest'&&!r.field.cohorts.some(c=>c.ready))throw preconditionFailure('作物尚未成熟，不能把未来收成取出来');
    const cap=Math.max(1,Math.floor(p.areaPerWorkerDay*r.tools.condition/100/4));
    const skill=this.rules.agriculture.farmingSkill,known=d.get('state','skills',skill),outcome=this.check(d,{attribute:'体质',...(known?{skill}:{}),difficulty:10},eventId);
    this.advance(d,this.rules.agriculture.workMinutes,eventId);
    const latest=clone(d.get(...path(id))),stock=clone(d.get('state','settlements',id)),nowDay=Math.floor(d.get('state','minute')/1440);
    if(d.get('state','player','status')!=='正常'||d.get('state','location')!==p.fieldLocation)return{success:false,effectFailed:'工作完成前已失去履行能力或离开农田'};
    if(!outcome.success)return{success:false,...outcome,note:'已耗时，但未播种或收获'};
    const nowWeather=weatherAt(this,d.document.randomSeed,p.fieldLocation,d.get('state','minute'));
    if(['storm','snow'].includes(nowWeather?.kind)||latest.tools.condition<=0)return{success:false,effectFailed:'工作完成前天气或农具条件已不合适'};
    if(operation==='sow'&&(nowDay%360<this.rules.agriculture.crop.sowDays[0]||nowDay%360>this.rules.agriculture.crop.sowDays[1]))return{success:false,effectFailed:'工作完成时已错过播种窗口，种粮未投入'};
    const result=operation==='sow'?sow(latest,this,p,nowDay,cap):harvest(latest,stock,this,p,nowDay,cap,eventId,granaryCapacity(this,d.get('state'),p.settlement,latest.granary.capacity));
    balanced(latest,stock);commit(d,this,id,latest,eventId);d.set(path(id),latest);d.set(['state','settlements',id],stock);
    if(known&&(result.units??0)>0)this.practice(d,{skill,gain:3,target:p.fieldId},eventId);
    return{success:(result.units??0)>0,...result,field:p.fieldId,note:'这是公共田的志愿工作；产物进入公共粮仓，不自动送入玩家行囊'};
}
installFacilityRuntime({damageStoredGrain});

// Private crops share the registered crop/weather rules, but public workers
// never harvest them. Ownership is read at the action, not granted by sowing.
function privateFarmAction(d,engine,p,args,eventId){
    const location=args.location??p.fieldLocation,asset=d.get('state','buildings',location),id=`private-farm:${location}`;
    if(location!==p.fieldLocation||d.get('state','location')!==location||asset?.owner!=='player'||asset.condition<=0)throw preconditionFailure('须在本人合法持有且完好的登记田地操作');
    if(Object.values(d.get('state','records')??{}).some(r=>r.kind==='asset_lease'&&r.subject===location&&r.tenant!=='player'&&r.status==='有效'&&r.deadline>d.get('state','minute')))throw preconditionFailure('田地已有他人的有效租赁使用权，不能重复占用');
    const old=d.get('state','records',id),day=Math.floor(d.get('state','minute')/1440),crop=engine.rules.agriculture.crop;
    const crops=domainRules(engine).privateField.crops,seedItem=args.operation==='private_sow'?(args.item?engine.resolve(args.item,'item'):crops[0].seed):old?.seedItem;
    const binding=crops.find(c=>c.seed===seedItem),item=old?.crop??binding?.product;
    if(args.operation==='private_inspect')return{farm:old??null};
    if(!['private_sow','private_harvest'].includes(args.operation))throw preconditionFailure('未知私田操作');
    if(args.operation==='private_harvest'&&old?.status!=='ready')throw preconditionFailure('没有可收割的成熟作物');
    const areaMu=args.operation==='private_sow'?args.areaMu:old?.areaMu;
    int(areaMu,1,10000);
    const labor=engine.world.primitiveTables?.yields?.rows?.find(r=>r.selector==='field:wheat'&&r.laborSow!==undefined);
    const workday=engine.world.primitiveTables?.['action-costs']?.params?.find(r=>r.id==='workday.minutes')?.value;
    const fieldRule=domainRules(engine).privateField;
    const tool=useTool(d,engine,args.operation==='private_sow'?fieldRule?.sowRequiresUse:fieldRule?.harvestRequiresUse,Object.hasOwn(args,'tool')?args.tool:args.means?.tools?.[0]);
    if(!labor||!Number.isSafeInteger(workday)||!fieldRule||!tool)throw preconditionFailure('私田劳动数值未登记');
    const laborMinutes=Math.ceil(areaMu*(args.operation==='private_sow'?labor.laborSow:labor.laborHarvest)*workday);
    const started=d.get('state','minute');
    const work=()=>{
        const weather=weatherAt(engine,d.document.randomSeed,location,d.get('state','minute'));
        if(['storm','snow'].includes(weather?.kind))throw preconditionFailure('当前雨雪不宜进行田间工作');
        for(let remaining=laborMinutes;remaining>0;){
            const minutes=Math.min(remaining,workday);
            engine.advance(d,minutes,`${eventId}:work:${remaining}`);remaining-=minutes;
            if(remaining>0)engine.advance(d,1440-workday,`${eventId}:overnight:${remaining}`);
        }
        if(tool)wearItem(d,engine,'player',tool,1);
        const current=d.get('state','buildings',location);
        const endWeather=weatherAt(engine,d.document.randomSeed,location,d.get('state','minute'));
        return d.get('state','player','status')==='正常'&&d.get('state','location')===location&&current?.owner==='player'&&current.condition>0&&!['storm','snow'].includes(endWeather?.kind);
    };
    if(args.operation==='private_sow'){
        if(!binding)throw preconditionFailure('This seed has no registered crop');
        if(d.get(...path(p.settlement),'mode')!=='managed')throw preconditionFailure('须先采用登记农事账，不能给旧日产账额外增加私田产量');
        if(old&&!['harvested','rotted'].includes(old.status))throw preconditionFailure('本田已有未收作物');
        if(day%360<crop.sowDays[0]||day%360>crop.sowDays[1])throw preconditionFailure('不在本作物播种窗口');
        const available=(field,atDay=day)=>Math.max(0,field.areaUnits-Math.max(field.cohorts.reduce((n,c)=>n+c.areaUnits-c.harvestedUnits,0),field.sownYear===Math.floor(atDay/360)?field.sownUnits:0));
        const field=d.get(...path(p.settlement),'field'),capacityUnits=old?.capacityUnits??old?.areaUnits??available(field);
        if(capacityUnits<1)throw preconditionFailure('登记田地没有可划出的空闲面积');
        const areaUnits=areaMu*crop.areaUnitsPerHa/fieldRule.muPerHectare;
        if(areaUnits>capacityUnits)throw preconditionFailure('登记田地没有足够面积');
        // Both private-field table quantities are jin; kgPerJin comes from the domain table.
        const seed=binding.yieldSelector==='field:wheat'?Math.ceil(areaMu*engine.world.primitiveTables.yields.rows.find(r=>r.key==='field:wheat/seed').seedPerUnit.qty*fieldRule.kgPerJin/engine.byId.get(seedItem).weight):Math.ceil(areaMu*crop.seedPerHa/fieldRule.muPerHectare);
        if(engine.quantity(d,'player',seedItem)<seed)throw preconditionFailure('没有实际种粮');
        if(!work())return{success:false,effectFailed:'工作完成前已失去私田履行条件'};
        const completedDay=Math.floor(d.get('state','minute')/1440);
        if(completedDay%360<crop.sowDays[0]||completedDay%360>crop.sowDays[1])return{success:false,note:'工作完成时已错过播种窗口，种粮未投入'};
        if(!old){
            const publicFarm=clone(d.get(...path(p.settlement)));
            if(areaUnits>available(publicFarm.field,completedDay))return{success:false,effectFailed:'工作完成前公共田的空闲面积已被使用'};
            // A private allocation comes out of the same finite field. Public
            // workers cannot plant those units a second time next season.
            publicFarm.field.areaUnits-=areaUnits;d.set(path(p.settlement),publicFarm);
        }
        engine.itemDelta(d,'player',seedItem,-seed,{flow:'sink:consume',purpose:'private_sow',writer:'agriculture',eventId});
        const farm={category:'private_farm',id,location,settlement:p.settlement,owner:'player',crop:binding.product,seedItem,areaUnits,areaMu,capacityUnits:old?.capacityUnits??old?.areaUnits??areaUnits,seed,seedEvent:eventId,sownDay:completedDay,lastDay:completedDay-1,grownDays:0,qualitySum:0,qualityDays:0,status:'growing'};
        d.set(['state','records',id],farm);return{farm,laborMinutes,elapsed:d.get('state','minute')-started};
    }
    if(args.operation!=='private_harvest')throw preconditionFailure('未知私田操作');
    if(old?.status!=='ready')throw preconditionFailure('没有可收割的成熟作物');
    if(!work())return{success:false,effectFailed:'工作完成前已失去私田履行条件'};
    const latest=d.get('state','records',id);
    if(latest.status!=='ready')return{success:false,note:'收割完成前作物已腐烂，未取得粮物'};
    engine.itemDelta(d,'player',item,latest.yield,{account:fieldAccount(engine,location,latest.crop),pick:[`private:${latest.seedEvent}`],writer:'agriculture',eventId});
    d.set(['state','records',id],{...latest,status:'harvested',harvestedAt:d.get('state','minute'),harvestEvent:eventId});
    return{harvested:latest.yield,item,location,laborMinutes,elapsed:d.get('state','minute')-started};
}
function advancePrivateFarms(d,engine,settlement,day){
    const p=profile(engine,settlement),crop=engine.rules.agriculture.crop,item=engine.rules.agriculture.grainItem;
    for(const [id,old]of recordEntriesWhere(d.get('state','records'),'category','private_farm')){
        if(old.category!=='private_farm'||old.settlement!==settlement||!['growing','ready'].includes(old.status)||old.lastDay>=day)continue;
        const farm=clone(old);
        for(let at=old.lastDay+1;at<=day;at++){
            if(farm.status==='growing'){
                const weather=weatherAt(engine,d.document.randomSeed,farm.location,at*1440+720);
                if((weather?.temperatureC??10)>=crop.minimumTemperatureC){farm.grownDays++;farm.qualityDays++;farm.qualitySum+=(weather?.cropMultiplier??1)*farmWaterFactor(engine,d.get('state'),settlement,at);}
                if(farm.grownDays>=crop.growthDays){
                    farm.status='ready';farm.readyDay=at;farm.expiresDay=at+p.normalStorageDays;
                    farm.yield=Math.floor(derived(engine,d.document,'economy:yield',farm.location,{holder:farm.owner,base:privateCropYieldBase(engine,farm)}));
                    const account=fieldAccount(engine,farm.location,farm.crop),resource=account.split('|')[1];
                    moveStock(d,{from:`src:regrowth|${resource}|private_crop`,to:account,amount:farm.yield,writer:'agriculture',eventId:`${farm.seedEvent}:ripe:${at}`,lot:cropLot(`private:${farm.seedEvent}`,at,farm.expiresDay)});
                }
            }
            if(farm.status==='ready'&&at>=farm.expiresDay){
                const account=fieldAccount(engine,farm.location,farm.crop),resource=account.split('|')[1],eventId=`${farm.seedEvent}:rot:${at}`;
                moveStock(d,{from:account,to:`sink:decay|${resource}|unharvested`,amount:farm.yield,pick:[`private:${farm.seedEvent}`],writer:'agriculture',eventId});
                farm.status='rotted';farm.rottedDay=at;break;
            }
        }
        farm.lastDay=day;d.set(['state','records',id],farm);
    }
}

// Unmanaged settlement food shares the same derived, cumulative stock boundary.
export function accrueFoodProduction(engine,d,row,subject,base){
 return accrueStock(row,'food',derived(engine,d.document,'economy:yield',subject,{base}));
}
