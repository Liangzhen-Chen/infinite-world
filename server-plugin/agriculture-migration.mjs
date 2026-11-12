const key=id=>`agriculture:${id}`;
// 本模块在 L0（迁移归存档），不得依赖 L1：目标持有 farmTargetFood / openingFood / openingStockFood 在 farm-target.mjs，开局初始化 initializeAgriculture 在 agriculture.mjs。
export function agricultureState(profile,day,{fresh=false,food=0}={}){
    return{category:'agriculture',format:1,mode:fresh?'managed':'legacy',settlement:profile.settlement,initializedDay:day,lastDay:day-1,
        granary:{capacity:profile.granaryCapacity,condition:profile.granaryCondition},tools:{capacity:profile.toolCapacity,condition:profile.toolCondition},
        field:{id:profile.fieldId,areaUnits:profile.areaUnits,sownYear:Math.floor(day/360),sownUnits:0,seedBank:fresh?profile.initialSeed:0,
            seedBatches:fresh?[{amount:profile.initialSeed,harvestDay:profile.initialHarvestDay,expiresDay:profile.initialHarvestDay+profile.protectedStorageDays}]:[],cohorts:[]},
        batches:fresh?[{id:'source_opening',amount:food,harvestDay:profile.initialHarvestDay,expiresDay:profile.initialHarvestDay+profile.protectedStorageDays,source:'源开局仓储',kind:'grain'}]:[],
        ledger:{openingFood:fresh?food:0,openingSeed:fresh?profile.initialSeed:0,freshProduced:0,harvested:0,eaten:0,spoiled:0,overflow:0,
            seedSpent:0,sold:0,donated:0,seedDonated:0},lastReport:null};
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
