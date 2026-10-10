import fs from 'node:fs/promises';
const file='world/meta/rules.json',rules=JSON.parse(await fs.readFile(file,'utf8'));
rules.version='engine-rules-3';rules.engineRevision=2;
Object.assign(rules.check,{maximumToolBonus:5,maximumHelpers:2,helperMinimumProficiency:100,helperBonus:2});
rules.combat={
    character:{hpBase:8,hpPerLevel:4,hpPerConstitution:2,mpBase:8,mpPerLevel:2,mpPerSpirit:2,carryBase:10,carryPerStrength:2,
        attackBase:3,attackPerLevel:1.1,attackPerStrength:0.7,defenseBase:1,defensePerLevel:0.45,defensePerConstitution:0.4,
        hitBase:0.82,hitPerDexterity:0.005,evasionPerDexterity:0.004,castBaseSeconds:6,castPerSpirit:0.1,critical:0.05,professionAttackMultiplier:1.15},
    monster:{beast:{hpBase:4,hpPerLevel:2,attackBase:1,attackPerLevel:0.4,defensePerLevel:0.12},
        standard:{hpBase:6,hpPerLevel:3.3,attackBase:2,attackPerLevel:1.12,defensePerLevel:0.45},
        hit:0.8,critical:0.05,bossHpMultiplier:7.5,bossAttackMultiplier:1.65,bossAttacks:2,bossDefenseMultiplier:1.1},
    minimumHit:0.1,maximumHit:0.98,damageSpread:0.2,criticalMultiplier:1.5,simulationRoundLimit:300,
    exchangeSeconds:10,terrain:{cover:{hit:-0.15},highGround:{hit:0.08},narrow:{assistanceLimit:1},slippery:{evasion:-0.05},dark:{hit:-0.2}},
};
rules.levels.initial={attributeTotal:60,attributeMinimum:8,attributeMaximum:16,luckyHidden:true,openBirthplaces:['loc_hw']};
rules.levels.experience={novice:'newLevel * 100',advanced:'ceil(newLevel ** 4 / 10)',deathInsufficient:'扣到0，不降级',
    milestones:{discovery:[50,600],craft:[30,300],research:[300,3000],publicContribution:[100,1500]},
    monsterTemplateMultipliers:[0,10,20,40,60,90,130,180,250,400],repeatDecay:0.5,monsterLevelGapZero:10,
    intendedPace:{hoursPerDay:2,daysToLevel20:30}};
rules.equipment.workmanship=[{name:'粗糙',multiplier:0.8},{name:'普通',multiplier:1},{name:'精良',multiplier:1.15},{name:'优秀',multiplier:1.3},{name:'杰作',multiplier:1.5}];
rules.equipment.colors=['#a98b65','#969696','#b87333','#708090','#c0c0c0','#e5bd32','#d7e6ed','#5fafa5','#4bb47e','#7b8dcd','#afa1dc','#f2b04b','#f4e6aa','#cf7bdf','#aa7c55','#efcaca'];
rules.books={grades:['初级','中级','高级','特级','终极'],minimumLiteracy:100,readingMinutes:[120,240,480,960,1920]};
rules.magic={schools:['火','水','风','土','光','暗影','生命','精神','空间','召唤','信仰'],
    stageMpRanges:[[1,5],[6,15],[16,35],[36,80],[81,160],[161,320],[321,640],[641,1280],[1281,2560]],
    advancedSources:['研究','稀有典籍'],mentalPermitRequired:true,teleportRequiresAnchor:true,
    creationMinimumDays:3,creationStagePenalty:1,methods:['咒文','手势','符文','媒介','意志']};
rules.monsters={templates:['驯兽','野兽','怪兽','异兽','猛兽','凶兽','妖兽','灵兽','魔兽','圣兽','半神兽','神兽'],
    levelRanges:[[0,5],[1,10],[10,30],[30,50],[50,70],[70,90],[90,120],[120,150],[150,180],[180,200],[201,260],[261,500]],
    bossTierMeaning:'一至九阶首领对应野兽至圣兽族群中的首领强度；目录实例等级由地区生态确定',
    divineOrdinaryDamage:false,ordinaryRespawn:'种群恢复',bossRespawn:'巢穴继承'};
rules.quests.rewardCopperRanges={D:[20,100],C:[100,500],B:[1000,5000],A:[10000,50000],S:[100000,10000000]};
rules.quests.experienceRanges={D:[150,400],C:[1000,3000],B:[10000,20000],A:[50000,100000],S:[200000,1000000]};
rules.quests.monthlyQuotaD={resident:0,villageHead:10,townHead:40,cityHeadFirstBaron:120,countyHead:600,provinceHead:3000,king:15000,emperor:60000};
rules.governance={villagesPerTown:5,townsPerCity:5,citiesPerCounty:5,countiesPerProvince:5,provincesPerEmpire:20,empireHorizon:500,
    titles:['准爵','勋爵','男爵','子爵','伯爵','侯爵','公爵','国王','皇帝'],titleRanks:[3,3,3,3,3,3,3,1,1],
    resident:{days:30,feeCopper:20,guarantors:1},citizen:{days:90,feeCopper:100,requiresNoCrime:true},
    villageHead:{contribution:1000,requiresRecommendation:true,requiresAppointment:true},taxRateLimits:[0,0.3]};
rules.economy={wageCopperPerHalfDay:[12,24],dailyIncomeBySkillStage:[[20,40],[40,80],[80,150],[150,300],[300,600],[600,1500],[1500,4000],[10000,30000],[30000,100000]],
    priceFactorLimits:{region:[0.5,3],transport:[1,3],season:[0.6,2],shop:[1,1.4],relation:[0.85,1.15],bargain:[0.9,1.1]},
    loanMonthlyInterest:[0.01,0.08],rentalCopperPerNight:6,rentalCopperPerWeek:35,tradeCycleDays:7};
await fs.writeFile(file,JSON.stringify(rules,null,2)+'\n');
