const key=id=>`agriculture:${id}`;
import {mealMouthsOf,farmTargetDays} from './settlement-mouths.mjs';
import {granaryCapacity} from './facility-state.mjs';
// 农事聚落的粮食目标持有 = min(餐口 × farmTargetDays, 粮仓容量 − 种粮)：村子不会想存装不下的粮。
// 容量出处：agriculture.settlements[].granaryCapacity（加上已建公共粮仓设施，facility-state.granaryCapacity，与 agriculture.mjs 收粮上限同一函数）；
// 种粮占同一仓（agriculture.mjs:397 收粮检查：food + seedBank ≤ capacity），有农事记录取其 seedBank，开局前取 profile.initialSeed。
export function farmTargetFood(engine,state,profile,minute){
    const s=state.settlements[profile.settlement],rec=state.records?.[key(profile.settlement)];
    const capacity=granaryCapacity(engine,state,profile.settlement,rec?.granary?.capacity??profile.granaryCapacity),seed=rec?.field?.seedBank??profile.initialSeed;
    return Math.min(Math.ceil(mealMouthsOf(engine,state,profile.settlement,s.population??0)*farmTargetDays(engine,minute,profile)),Math.max(0,capacity-seed));
}
// 开局存粮 = 开局日的目标持有（同上）：常态 = 目标，不再有写死的开局存量。
export function openingFood(engine,state,profile,day){return farmTargetFood(engine,state,profile,day*1440);}
export function agricultureState(profile,day,{fresh=false,food=0}={}){
    return{category:'agriculture',format:1,mode:fresh?'managed':'legacy',settlement:profile.settlement,initializedDay:day,lastDay:day-1,
        granary:{capacity:profile.granaryCapacity,condition:profile.granaryCondition},tools:{capacity:profile.toolCapacity,condition:profile.toolCondition},
        field:{id:profile.fieldId,areaUnits:profile.areaUnits,sownYear:Math.floor(day/360),sownUnits:0,seedBank:fresh?profile.initialSeed:0,
            seedBatches:fresh?[{amount:profile.initialSeed,harvestDay:profile.initialHarvestDay,expiresDay:profile.initialHarvestDay+profile.protectedStorageDays}]:[],cohorts:[]},
        batches:fresh?[{id:'source_opening',amount:food,harvestDay:profile.initialHarvestDay,expiresDay:profile.initialHarvestDay+profile.protectedStorageDays,source:'源开局仓储',kind:'grain'}]:[],
        ledger:{openingFood:fresh?food:0,openingSeed:fresh?profile.initialSeed:0,freshProduced:0,harvested:0,eaten:0,spoiled:0,overflow:0,
            seedSpent:0,sold:0,donated:0,seedDonated:0},lastReport:null};
}
export function initializeAgriculture(engine,document){
    if(!engine.rules.agriculture)return document;
    const doc=structuredClone(document),day=Math.floor(doc.state.minute/1440);
    if(day!==0)throw new Error('源农事开局仅对应第一日；不能把过往收成或源储粮回填到中途战役');
    for(const p of engine.rules.agriculture.settlements){
        if(!doc.state.settlements[p.settlement]){if(!p.opening||!engine.byId.has(p.settlement)||!engine.byId.has(p.manager))continue;doc.state.settlements[p.settlement]={...structuredClone(p.opening),food:0,starvation:0};}
        if(doc.state.records[key(p.settlement)])throw new Error('新战役农业记录已存在，拒绝重复初始化补粮');
        const food=openingFood(engine,doc.state,p,day);
        doc.state.records[key(p.settlement)]=agricultureState(p,day,{fresh:true,food});
        doc.state.settlements[p.settlement].food=food;
    }
    return doc;
}
export function planAgricultureMigration(document,rules){
    if(!rules.agriculture)return[];
    if(document.schemaVersion!==2)throw new Error('农事迁移只支持格式2存档');
    const patches=[];
    for(const p of rules.agriculture.settlements){
        if(!document.state.settlements[p.settlement])continue;
        const id=key(p.settlement),old=document.state.records?.[id];
        if(old){if(old.category!=='agriculture'||old.format!==1||old.settlement!==p.settlement||!['managed','legacy'].includes(old.mode))throw new Error('农事记录编号冲突或更高版本，拒绝覆盖');continue;}
        // No new seed, standing crop, past harvest or food is gifted to an import.
        patches.push({op:'set',path:['state','records',id],value:agricultureState(p,Math.floor(document.state.minute/1440))});
    }
    return patches;
}
