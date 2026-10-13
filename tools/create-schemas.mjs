import fs from 'node:fs/promises';
const str={type:'string',minLength:1},num={type:'number',minimum:0},int={type:'integer',minimum:0};
const id=prefix=>({type:'string',pattern:`^${prefix}_[a-zA-Z0-9_-]+$`});
const list=items=>({type:'array',items});
const object=(properties,required)=>({type:'object',properties,required,additionalProperties:true});
const entity=(prefix,properties,required)=>object({id:id(prefix),name:str,aliases:list(str),scope:{type:['string','null']},...properties},['id','name',...required]);
const material=object({item:id('item'),amount:{type:'integer',minimum:1}},['item','amount']);
const residentIdentity={species:id('monster'),society:id('loc')};
const locationAccess={oneOf:[
    {type:'object',properties:{mode:{const:'public'}},required:['mode'],additionalProperties:false},
    {type:'object',properties:{mode:{const:'council'},requiresConsent:{const:true},authority:id('npc')},required:['mode','requiresConsent','authority'],additionalProperties:false},
    {type:'object',properties:{mode:{const:'private'},requiresConsent:{const:true},residents:{...list(id('npc')),minItems:1,uniqueItems:true}},required:['mode','requiresConsent','residents'],additionalProperties:false}
]};
const prerequisite={oneOf:[id('skill'),object({skill:id('skill'),minimum:{type:'integer',minimum:0,maximum:2699}},['skill','minimum'])]};
const legalStatus={enum:['public','consent','permit','crime']};
const featureState=object({capacityMl:int,waterMl:int,turbidity:{type:'number',minimum:0,maximum:100},saltMg:num,toxinUg:num,pathogenRisk:{type:'number',minimum:0,maximum:100},odor:str,
    siltGrams:int,loosenedSiltGrams:int,initialSiltGrams:int,initialBlockagePercent:{type:'number',minimum:0,maximum:100},blockagePercent:{type:'number',minimum:0,maximum:100},flowLimitMl:int,
    baseMoisturePercent:{type:'number',minimum:0,maximum:100},moisturePercent:{type:'number',minimum:0,maximum:100},worked:{type:'boolean'}},[]);
const feature=object({id:id('feature'),name:str,aliases:list(str),kind:{enum:['water','container','channel','soil','silt_heap']},owner:str,access:{enum:['public','consent']},
    position:{type:'array',items:{type:'number'},minItems:2,maxItems:2},links:object({source:id('feature'),destination:id('feature'),channel:id('feature')},[]),state:featureState},
    ['id','name','kind','owner','access','position','state']);
const tamingRule=object({category:{enum:['support','combat','mount']},minimumSkill:{type:'integer',minimum:0,maximum:2699},minimumPlayerLevel:{type:'integer',minimum:0,maximum:200},
    trustThreshold:{type:'integer',minimum:1,maximum:100},minutes:{type:'integer',minimum:1,maximum:43200},difficulty:{enum:[10,15,20,25,30]},bossCondition:str,
    food:{type:'array',minItems:1,items:object({item:id('item'),hungerRelief:{type:'integer',minimum:1,maximum:100},trustGain:{type:'integer',minimum:0,maximum:10}},['item','hungerRelief','trustGain'])},
    skills:{...list(str),uniqueItems:true},rideable:{type:'boolean'},riderWeightKg:{type:'integer',minimum:1,maximum:200},carryKg:{type:'integer',minimum:1,maximum:10000}},
    ['category','minimumSkill','minimumPlayerLevel','trustThreshold','minutes','difficulty','food','skills','rideable','riderWeightKg','carryKg']);
const wildlifeProfile=object({habitat:id('habitat'),population:{type:'integer',minimum:0,maximum:100000},capacity:{type:'integer',minimum:1,maximum:100000},
    recoveryPerWeek:{type:'number',minimum:0,maximum:10000},activeHours:{type:'array',minItems:2,maxItems:2,items:{type:'integer',minimum:0,maximum:1440}},
    predatorOf:{...list(id('monster')),uniqueItems:true},distinction:str,gather:object({minutes:{type:'integer',minimum:1,maximum:1440},tool:{anyOf:[id('item'),{type:'null'}]},consumes:list(material)},['minutes','tool','consumes'])},
    ['habitat','population','capacity','recoveryPerWeek','activeHours','predatorOf','distinction','gather']);
const schemas={
    rules:object({version:str,engineRevision:{enum:[1,2]},attributes:{type:'array',items:str,minItems:6,maxItems:6,uniqueItems:true},
        bossEcology:object({version:{const:1},hpMultiplier:{type:'number',minimum:1,maximum:20},approachMinutes:{type:'integer',minimum:1,maximum:1440},learningThreshold:{type:'integer',minimum:1,maximum:10},
            damageReductionPerStep:{type:'number',exclusiveMinimum:0,maximum:.5},maximumDamageReduction:{type:'number',minimum:0,maximum:.8},escapeDifficulty:{enum:[15,20,25,30]}},
            ['version','approachMinutes','learningThreshold','damageReductionPerStep','maximumDamageReduction','escapeDifficulty']),
        wildlife:object({version:{const:1},trackMinutes:{type:'integer',minimum:1,maximum:1440},maximumPresent:{type:'integer',minimum:1,maximum:20},corpseMinutes:{type:'integer',minimum:1,maximum:43200},
            seasonRecovery:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:0,maximum:3}},scarcityMaximum:{type:'number',minimum:1,maximum:5},
            farmPests:object({version:{const:1},fields:{type:'array',minItems:1,items:object({settlement:id('loc'),fieldId:id('farm'),habitat:id('habitat'),maximumDamageBps:{type:'integer',minimum:1,maximum:9000},
                guardMinutes:{type:'integer',minimum:10,maximum:600},guardDurationMinutes:{type:'integer',minimum:30,maximum:1440},guardReductionBps:{type:'integer',minimum:1,maximum:10000},
                pests:{type:'array',minItems:1,items:object({species:id('monster'),toleranceCount:{type:'integer',minimum:0},fullDamageCount:{type:'integer',minimum:1},dailyDamageBps:{type:'integer',minimum:1,maximum:1000}},['species','toleranceCount','fullDamageCount','dailyDamageBps'])},
                predators:{type:'array',minItems:1,items:object({species:id('monster'),habitat:id('habitat'),prey:id('monster'),killsPerWeek:{type:'number',exclusiveMinimum:0,maximum:100},refugeCount:{type:'integer',minimum:0},path:{...list(id('route')),minItems:1,uniqueItems:true}},['species','habitat','prey','killsPerWeek','refugeCount','path'])}},
                ['settlement','fieldId','habitat','maximumDamageBps','guardMinutes','guardDurationMinutes','guardReductionBps','pests','predators'])}},['version','fields']),
            migration:object({version:{const:1},routes:{type:'array',minItems:1,items:object({id:id('migration'),species:id('monster'),from:id('habitat'),to:id('habitat'),
                departDay:{type:'integer',minimum:0,maximum:359},travelDays:{type:'integer',minimum:1,maximum:89},fraction:{type:'number',exclusiveMinimum:0,maximum:1},path:{...list(id('route')),minItems:1,uniqueItems:true}},
                ['id','species','from','to','departDay','travelDays','fraction','path'])}},['version','routes']),
            habitats:{type:'array',minItems:1,items:object({id:id('habitat'),name:str,location:str},['id','name','location'])}},['version','trackMinutes','maximumPresent','corpseMinutes','seasonRecovery','scarcityMaximum','habitats']),
        agriculture:object({version:{const:1},foodUnitKg:{const:0.5},grainItem:id('item'),farmingSkill:id('skill'),workMinutes:{type:'integer',minimum:1,maximum:1440},
            crop:object({id:id('crop'),sowDays:{type:'array',minItems:2,maxItems:2,items:{type:'integer',minimum:0,maximum:359}},growthDays:{type:'integer',minimum:1,maximum:359},minimumTemperatureC:{type:'number',minimum:-20,maximum:40},seedPerHa:{type:'integer',minimum:1,maximum:10000},yieldPerHa:{type:'integer',minimum:1,maximum:10000},areaUnitsPerHa:{const:100}},['id','sowDays','growthDays','minimumTemperatureC','seedPerHa','yieldPerHa','areaUnitsPerHa']),
            settlements:{type:'array',minItems:1,items:object({settlement:id('loc'),counter:id('bld'),manager:id('npc'),fieldLocation:id('loc'),fieldId:id('farm'),
                ...Object.fromEntries(['areaUnits','farmWorkers','freshWorkers','processingWorkers','processingPerWorker','areaPerWorkerDay','freshFoodPerDay','granaryCapacity','toolCapacity','initialFood','initialSeed','protectedStorageDays','normalStorageDays','reserveDays','repairWood','repairIron','repairCondition'].map(key=>[key,{type:'integer',minimum:1,maximum:100000}])),
                workerFraction:{type:'number',exclusiveMinimum:0,maximum:1},granaryCondition:{type:'number',minimum:1,maximum:100},toolCondition:{type:'number',minimum:1,maximum:100},initialHarvestDay:{type:'integer',minimum:-360,maximum:0},spoilagePerMonth:{type:'number',minimum:0,maximum:0.5},toolWearPerArea:{type:'number',exclusiveMinimum:0,maximum:1},freshSeasonFactors:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:0,maximum:3}}},
                ['settlement','counter','manager','fieldLocation','fieldId','areaUnits','farmWorkers','freshWorkers','processingWorkers','processingPerWorker','areaPerWorkerDay','freshFoodPerDay','granaryCapacity','toolCapacity','initialFood','initialSeed','protectedStorageDays','normalStorageDays','reserveDays','repairWood','repairIron','repairCondition','workerFraction','granaryCondition','toolCondition','initialHarvestDay','spoilagePerMonth','toolWearPerArea','freshSeasonFactors'])}},['version','foodUnitKg','grainItem','farmingSkill','workMinutes','crop','settlements']),
        calendar:object({months:{type:'array',items:str,minItems:12,maxItems:12,uniqueItems:true},daysPerMonth:{const:30},monthsPerYear:{const:12},epoch:str,
            tens:{type:'array',items:str,minItems:3,maxItems:3,uniqueItems:true},marketDays:{type:'array',items:{type:'integer',minimum:1,maximum:30},uniqueItems:true}},['months','daysPerMonth','monthsPerYear','epoch']),
        weather:object({version:{const:1},annualReset:{const:true},persistence:{type:'number',minimum:0,maximum:0.95},
            states:object(Object.fromEntries(['clear','cloudy','rain','storm','snow','fog'].map(key=>[key,object({name:str,humidity:{type:'integer',minimum:0,maximum:100},temperatureOffset:{type:'integer',minimum:-30,maximum:30},
                ...Object.fromEntries(['walk','horse','cart','boat'].map(mode=>[mode,{type:'number',minimum:1,maximum:5}])),boatClosed:{type:'boolean'},hit:{type:'number',minimum:-0.5,maximum:0},crop:{type:'number',minimum:0,maximum:2},mood:{type:'integer',minimum:-5,maximum:5}},['name','humidity','temperatureOffset','walk','horse','cart','boat','hit','crop','mood'])])),['clear','cloudy','rain','storm','snow','fog']),
            seasonalWeights:{type:'array',minItems:4,maxItems:4,items:{type:'array',minItems:6,maxItems:6,items:num}},cropSeasonFactors:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:0,maximum:3}},
            regions:{type:'array',minItems:1,items:object({id:id('climate'),locations:{...list(str),minItems:1,uniqueItems:true},indoor:{...list(str),uniqueItems:true},latitude:{type:'number',minimum:-60,maximum:60},temperatures:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:-50,maximum:50}}},['id','locations','indoor','latitude','temperatures'])}},['version','annualReset','persistence','states','seasonalWeights','cropSeasonFactors','regions']),
        levels:object({maximum:{const:200},freeAttributePoints:{type:'integer',minimum:1,maximum:10},initial:object({attributeTotal:{const:60},attributeMinimum:{const:8},attributeMaximum:{const:16},luckyHidden:{const:true},openBirthplaces:list(id('loc'))},['attributeTotal','attributeMinimum','attributeMaximum'])},['maximum','freeAttributePoints']),
        practice:object({dailyCaps:{type:'array',items:int,minItems:9,maxItems:9},maximum:{const:2699},stageSize:{const:300}},['dailyCaps','maximum','stageSize']),
        check:object({skillDivisor:{type:'integer',minimum:1},contextLimit:{const:5},maximumToolBonus:{type:'integer',minimum:0,maximum:10},maximumHelpers:{type:'integer',minimum:0,maximum:5},helperMinimumProficiency:{type:'integer',minimum:0,maximum:2699},helperBonus:{type:'integer',minimum:0,maximum:5}},['skillDivisor','contextLimit']),
        equipment:object({qualities:{type:'array',items:str,minItems:16,maxItems:16,uniqueItems:true},requiredLevels:{type:'array',items:int,minItems:16,maxItems:16}},['qualities','requiredLevels']),
        pets:object({support:{const:3},combat:{const:5},mount:{const:10},knightMount:{const:20},summonerCombat:{const:0}},['support','combat','mount','knightMount','summonerCombat']),
        petCare:object({tamingSkill:id('skill'),medicineSkill:id('skill'),treatmentItem:id('item'),
            ...Object.fromEntries(['hungerPerHour','restPerHour','hungryThreshold','sickThreshold','sickHours','starvationDamage','loyaltyLoss','escapeLoyalty','neglectHours','contactMinutes','contactTrust','contactsPerDay','feedMinutes','groomMinutes','groomLoyalty','treatmentMinutes','treatmentHeal','treatmentMinimumSkill','trainMinutes','trainExperience','trainMinimumSkill','travelFatiguePer30Minutes','maximumRideFatigue','maximumSummons'].map(key=>[key,{type:'integer',minimum:1,maximum:2699}]))},
            ['tamingSkill','medicineSkill','treatmentItem','hungerPerHour','restPerHour','hungryThreshold','sickThreshold','sickHours','starvationDamage','loyaltyLoss','escapeLoyalty','neglectHours','contactMinutes','contactTrust','contactsPerDay','feedMinutes','groomMinutes','groomLoyalty','treatmentMinutes','treatmentHeal','treatmentMinimumSkill','trainMinutes','trainExperience','trainMinimumSkill','travelFatiguePer30Minutes','maximumRideFatigue','maximumSummons']),
        death:object({dyingMinutes:{type:'integer',minimum:1,maximum:60},immediateOverkillRatio:{type:'number',minimum:1},reviveFraction:{type:'number',exclusiveMinimum:0,maximum:1},dropInventory:{type:'boolean'},loseLevel:{const:false},
            points:{type:'array',minItems:1,items:object({location:id('bld'),settlement:id('loc'),fee:{type:'integer',minimum:0,maximum:100000},minimumLevel:{type:'integer',minimum:0,maximum:200},minutes:{type:'integer',minimum:1,maximum:120}},['location','settlement','fee','minimumLevel','minutes'])}},['dyingMinutes','immediateOverkillRatio','reviveFraction','dropInventory','loseLevel']),
        currency:object({copperPerSilver:{const:100},silverPerGold:{const:100}},['copperPerSilver','silverPerGold']),
        environment:object({minimumCondensationHumidity:{type:'integer',minimum:1,maximum:100},carrySiltMaximumGrams:{type:'integer',minimum:1,maximum:10000},carrySiltMinutes:{type:'integer',minimum:1,maximum:1440},walkingMetresPerMinute:{type:'integer',minimum:1,maximum:100}},['minimumCondensationHumidity','carrySiltMaximumGrams','carrySiltMinutes','walkingMetresPerMinute']),
        law:object({actionMinutes:{type:'integer',minimum:1,maximum:60},maximumTheftCoins:{type:'integer',minimum:1,maximum:1000},maximumTheftWeightKg:{type:'number',exclusiveMinimum:0,maximum:50},
            codes:{type:'array',minItems:1,items:object({id:id('law'),name:str,locations:{...list(str),minItems:1,uniqueItems:true},officers:{...list(id('npc')),minItems:1,uniqueItems:true},judges:{...list(id('npc')),minItems:1,uniqueItems:true},court:id('bld'),
                reportMinutes:{type:'integer',minimum:1,maximum:1440},searchMinutes:{type:'integer',minimum:1,maximum:1440},hearingMinutes:{type:'integer',minimum:1,maximum:1440},maximumDetentionMinutes:{type:'integer',minimum:1,maximum:43200},
                evidenceRequired:{type:'integer',minimum:1,maximum:10},communityMinutesPerCopper:{type:'integer',minimum:1,maximum:1440},prisonMinutesPerCopper:{type:'integer',minimum:1,maximum:1440},maximumSentenceMinutes:{type:'integer',minimum:1,maximum:43200},
                penalties:object(Object.fromEntries(['theft','theft_attempt','assault','assault_attempt','homicide'].map(key=>[key,object({baseFine:{type:'integer',minimum:0,maximum:100000},valueMultiplier:{type:'number',minimum:0,maximum:10}},['baseFine','valueMultiplier'])])),['theft','theft_attempt','assault','assault_attempt','homicide'])},
                ['id','name','locations','officers','judges','court','reportMinutes','searchMinutes','hearingMinutes','maximumDetentionMinutes','evidenceRequired','communityMinutesPerCopper','prisonMinutesPerCopper','maximumSentenceMinutes','penalties'])}},['actionMinutes','maximumTheftCoins','maximumTheftWeightKg','codes']),
        repairs:list(object({id:id('repair'),name:str,item:id('item'),skill:id('skill'),attribute:str,minimumProficiency:{type:'integer',minimum:0,maximum:2699},
            materials:list(material),tools:{...list(id('item')),uniqueItems:true,maxItems:8},workstation:str,minutes:{type:'integer',minimum:1,maximum:43200},
            difficulty:{enum:[10,15,20,25,30]},toolWear:{type:'integer',minimum:0,maximum:10},restore:{type:'integer',minimum:1,maximum:10000},maxLoss:{type:'integer',minimum:0,maximum:100}},
            ['id','name','item','skill','minimumProficiency','materials','tools','workstation','minutes','difficulty','toolWear','restore','maxLoss']))},['version','attributes','levels','practice','check','equipment','pets','currency']),
    npc:entity('npc',{...residentIdentity,age:{type:'integer',minimum:0,maximum:300},location:str,coins:int,inventory:{type:'object'},
        skills:{anyOf:[list(id('skill')),{type:'object',additionalProperties:{type:'integer',minimum:0,maximum:2699}}]},
        flags:object({minor:{type:'boolean'},romanceable:{type:'boolean'}},['minor','romanceable']),notes:str},['age','location','coins','inventory','flags','notes']),
    location:entity('(?:loc|bld|site)',{access:locationAccess,coordinates:{type:'array',items:{type:'number'},minItems:2,maxItems:2},parent:{type:['string','null']},terrain:str,
        features:list(feature),microclimate:object({humidityPercent:{type:'number',minimum:0,maximum:100}},['humidityPercent']),
        workstations:list(object({id:{type:'string',pattern:'^station_'},kind:str,owner:str,access:{enum:['public','consent']},fee:{type:'integer',minimum:0,maximum:100000}},['id','kind','owner','access','fee']))},['coordinates','parent','terrain']),
    item:entity('item',{quality:str,weight:num,durability:int,basePrice:int,checkBonus:object({bonus:{type:'integer',minimum:0,maximum:5},attributes:list(str),skills:list(id('skill'))},['bonus']),
        book:object({grade:{enum:['初级','中级','高级','特级','终极']},author:str,edition:str,origin:str,rare:{type:'boolean'},teaches:{type:'array',items:{type:'string',pattern:'^(spell|skill|recipe)_'},minItems:1,uniqueItems:true},readingMinutes:{type:'integer',minimum:1,maximum:43200},prerequisites:list(prerequisite)},['grade','author','edition','origin','teaches'])},['quality','weight','durability','basePrice']),
    profession:entity('profession',{kind:{enum:['combat','life','hidden']},fee:int,minimumLevel:{type:'integer',minimum:0,maximum:200},skillTree:list(id('skill')),
        abandonFee:int,abandonCooldownMinutes:int,
        promotions:list(object({level:{enum:[30,60,90,120,150,180]},choices:{type:'array',minItems:2,maxItems:3,items:object({id:str,name:str,orientation:{enum:['attack','defense']},requiredSkill:id('skill'),minimumProficiency:{type:'integer',minimum:0,maximum:2699},fee:int},['id','name','orientation','requiredSkill','minimumProficiency','fee'])}},['level','choices'])),
        trigger:object({metric:str,minimum:{type:'integer',minimum:1}},['metric','minimum']),capacity:{type:'integer',minimum:1},cost:str,initiation:str},['kind','fee','minimumLevel']),
    skill:entity('skill',{attribute:str,profession:{type:['string','null']},prerequisites:list(prerequisite),stage:{type:'integer',minimum:0,maximum:8},source:str},['attribute','profession']),
    spell:entity('spell',{skill:id('skill'),mp:int,materials:list(material),duration:int,minutes:int,difficulty:{enum:[10,15,20,25,30]},stage:{type:'integer',minimum:0,maximum:8},
        effect:str,learnFee:int,learnMinutes:int,teachers:list(id('npc')),prerequisites:list(prerequisite),
        law:object({river:legalStatus,city:legalStatus,port:legalStatus},['river','city','port']),
        effectSpec:object({kind:{enum:['damage','heal','repair','dry','status','light','environment','summon']},power:{type:'integer',minimum:1,maximum:5000},summonType:{enum:['water_cup']},upkeepMp:{type:'integer',minimum:1,maximum:1000},upkeepMinutes:{type:'integer',minimum:1,maximum:1440},armorFactor:{type:'number',minimum:0,maximum:1},status:{enum:['stone_skin','fire_shield','mind_guard','shadow_ward','fear']},damageType:{enum:['fire','cold','wind','earth','light','shadow','mind']},
            operation:{enum:['condense','clean_water','sense_water','irrigate','clear_silt','soil_water']},unit:{enum:['millilitre','turbidity_point','reading','litre','gram']}},['kind','power']),
        failureDamage:{type:'integer',minimum:0,maximum:50}},['skill','mp','materials','duration','minutes','difficulty','stage','effect','learnFee','learnMinutes','teachers']),
    recipe:entity('recipe',{skill:id('skill'),minimumProficiency:{type:'integer',minimum:0,maximum:2699},materials:list(material),minutes:{type:'integer',minimum:1},
        difficulty:{enum:[10,15,20,25,30]},output:object({item:id('item'),quantity:{type:'integer',minimum:1,maximum:200}},['item','quantity']),tools:{...list(id('item')),uniqueItems:true},
        workstation:str,location:str,learningRequired:{type:'boolean'},stage:{type:'integer',minimum:0,maximum:8},source:str,byproducts:list(object({item:id('item'),amount:{type:'integer',minimum:1,maximum:200}},['item','amount'])),toolWear:{type:'integer',minimum:0,maximum:10},failure:object({recoverFraction:{type:'number',minimum:0,maximum:1},injury:{type:'integer',minimum:0,maximum:50}},[])},
        ['skill','minimumProficiency','materials','minutes','difficulty','output','tools']),
    monster:entity('monster',{template:{type:'integer',minimum:0,maximum:11},levelRange:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:2},wildlife:wildlifeProfile,
        habitatTags:list(str),grouping:str,diet:str,drops:list(material),taming:object({possible:{type:'boolean'},conditions:list(str)},['possible','conditions']),tamingRule,intelligence:{type:'integer',minimum:0,maximum:5}},
        ['template','levelRange','habitatTags','grouping','diet','drops','taming','intelligence']),
    boss:entity('boss',{actor:id('npc'),monster:id('monster'),tier:{type:'integer',minimum:1,maximum:11},level:int,lair:str,territory:str,
        tactics:list(str),weakness:str,drops:list(material),taming:str,tamingRule,intelligence:{type:'integer',minimum:0,maximum:5},minions:{...list(id('monster')),uniqueItems:true},
        residence:object({id:id('lair'),name:str,location:str,habitat:id('habitat'),replacementSpecies:{...list(id('monster')),uniqueItems:true},vacancyDays:{type:'integer',minimum:1,maximum:360},minionCount:{type:'integer',minimum:0,maximum:8}},
            ['id','name','location'])},
        ['monster','tier','level','lair','territory','tactics','weakness','drops','taming','intelligence']),
    route:object({id:id('route'),from:str,to:str,lengthKm:num,terrainMultiplier:{type:'number',exclusiveMinimum:0},
        modes:{type:'array',items:{enum:['walk','horse','cart','boat']},minItems:1},closedSeasons:{type:'array',items:{type:'integer',minimum:0,maximum:3}},toll:int,risk:int},
        ['id','from','to','lengthKm','modes','closedSeasons','toll','risk']),
};
const world=object({version:str,rules:{$ref:'#/$defs/rules'},...Object.fromEntries(Object.entries({npcs:'npc',locations:'location',routes:'route',items:'item',professions:'profession',skills:'skill',spells:'spell',recipes:'recipe',monsters:'monster',bosses:'boss'}).map(([key,value])=>[key,list({$ref:`#/$defs/${value}`})]))},
    ['version','rules','npcs','locations','routes','items','professions','skills','spells','recipes']);
world.$schema='http://json-schema.org/draft-07/schema#';world.$defs=schemas;
const socialResidence=structuredClone(schemas.boss.properties.residence),wildResidence=structuredClone(socialResidence);
socialResidence.properties.replacementSpecies.maxItems=0;socialResidence.properties.minionCount.const=0;
wildResidence.required.push('habitat','replacementSpecies','vacancyDays','minionCount');wildResidence.properties.replacementSpecies.minItems=1;
schemas.boss.allOf=[{if:{properties:{actor:{}},required:['actor']},then:{properties:{residence:socialResidence}},else:{properties:{residence:wildResidence}}}];
await fs.mkdir('schemas',{recursive:true});await fs.writeFile('schemas/world.schema.json',JSON.stringify(world,null,2)+'\n');
