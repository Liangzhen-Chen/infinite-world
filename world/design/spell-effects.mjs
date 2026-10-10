// Engine numbers supplement the fixed mechanisms; they do not alter lore drafts.
import {waterMechanisms}from'./water-foundation.mjs';
export function mechanismEffect(mechanism,stage){
    if(mechanism==='servant')return{effectSpec:{kind:'summon',summonType:'water_cup',power:250,upkeepMp:1,upkeepMinutes:5}};
    const water=waterMechanisms[mechanism];
    if(water)return{effectSpec:{kind:'environment',operation:mechanism,power:water.power,unit:water.unit}};
    if(mechanism.startsWith('damage_'))return{effectSpec:{kind:'damage',power:8+stage*8,damageType:mechanism.slice(7)}};
    const fixed={
        dry:{kind:'dry',power:100},repair_metal:{kind:'repair',power:20},
        healing:{kind:'heal',power:5+stage*5},light:{kind:'light',power:2},
        stone_skin:{kind:'status',status:'stone_skin',power:4},
        shield_fire:{kind:'status',status:'fire_shield',power:40},
        mind_guard:{kind:'status',status:'mind_guard',power:35},
        ward:{kind:'status',status:'shadow_ward',power:25},
        fear:{kind:'status',status:'fear',power:2},
    };
    return fixed[mechanism]?{effectSpec:fixed[mechanism]}:{};
}
