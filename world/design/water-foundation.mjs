// Authored mechanics, not lore. See D022 for units, initial values and limits.
export const waterMechanisms={
    condense:{power:50,unit:'millilitre',duration:0},
    clean_water:{power:40,unit:'turbidity_point',duration:0},
    sense_water:{power:1,unit:'reading',duration:0},
    irrigate:{power:20,unit:'litre',duration:0},
    clear_silt:{power:2000,unit:'gram',duration:0},
    soil_water:{power:10,unit:'litre',duration:0},
};
export const environmentRules={minimumCondensationHumidity:5,carrySiltMaximumGrams:1000,carrySiltMinutes:20,walkingMetresPerMinute:75};
const water=(capacityMl,waterMl,turbidity,salinityPpt,toxinPpm,pathogenRisk,odor)=>({capacityMl,waterMl,turbidity,saltMg:waterMl*salinityPpt,toxinUg:waterMl*toxinPpm,pathogenRisk,odor});
export const environmentFoundation={
    loc_hw_dock:[
        {id:'feature_hw_pool',name:'渡口取水凹池',aliases:['取水池'],kind:'water',owner:'loc_hw',access:'public',position:[0.5,0],state:water(60000,30000,70,0.2,0,35,'泥腥味')},
        {id:'feature_hw_cup',name:'渡口公用水盏',aliases:['公用水盏'],kind:'container',owner:'loc_hw',access:'public',position:[0,0.5],state:water(250,0,0,0,0,0,'无明显气味')},
        {id:'feature_hw_channel',name:'渡口菜圃引水沟',aliases:['引水沟'],kind:'channel',owner:'loc_hw',access:'public',position:[1.5,0],
            links:{source:'feature_hw_pool',destination:'feature_hw_plot'},state:{siltGrams:8000,loosenedSiltGrams:0,initialSiltGrams:8000,initialBlockagePercent:70,blockagePercent:70,flowLimitMl:20000}},
        {id:'feature_hw_plot',name:'渡口公用菜圃田垄',aliases:['菜圃田垄'],kind:'soil',owner:'loc_hw',access:'public',position:[2.5,0],links:{channel:'feature_hw_channel'},
            state:{...water(20000,0,0,0,0,0,'土腥味'),worked:true,baseMoisturePercent:15,moisturePercent:15,siltGrams:0}},
        {id:'feature_hw_silt_heap',name:'沟旁指定堆泥地',aliases:['堆泥地'],kind:'silt_heap',owner:'loc_hw',access:'public',position:[1.5,1],state:{siltGrams:0}},
    ],
    bld_hw_qingdeng:[
        {id:'feature_hw_kitchen_bucket',name:'青灯后厨水桶',aliases:['后厨水桶'],kind:'container',owner:'npc_hw_linsui',access:'consent',position:[1,0],state:water(10000,8000,55,0.1,2,60,'微酸气味')},
    ],
};
