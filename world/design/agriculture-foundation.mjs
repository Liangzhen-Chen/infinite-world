// Mechanical source parameters for guide 3.13; initial values and scope are D026.
export const agricultureFoundation={
    version:1,foodUnitKg:0.5,grainItem:'item_oats',farmingSkill:'skill_life_0_core',workMinutes:90,
    crop:{id:'crop_oats',sowDays:[5,25],growthDays:180,minimumTemperatureC:4,seedPerHa:120,yieldPerHa:1700,areaUnitsPerHa:100},
    settlements:[{settlement:'loc_hw',counter:'bld_hw_council',manager:'npc_hw_chenbai',fieldLocation:'loc_hw_fields',fieldId:'farm_hw_oats',
        areaUnits:1400,farmWorkers:8,freshWorkers:8,processingWorkers:2,processingPerWorker:30,workerFraction:0.55,
        areaPerWorkerDay:20,freshFoodPerDay:20,freshSeasonFactors:[1,1.3,1.1,0.25],
        granaryCapacity:20000,granaryCondition:85,toolCondition:90,toolCapacity:8,
        initialFood:8000,initialHarvestDay:-150,initialSeed:1680,protectedStorageDays:360,
        normalStorageDays:180,spoilagePerMonth:0.002,reserveDays:90,
        repairWood:2,repairIron:1,repairCondition:20,toolWearPerArea:0.0005}],
};
export function withAgricultureRules(source){const world=structuredClone(source);world.rules.agriculture=structuredClone(agricultureFoundation);return world;}
