// Guide 3.8.3: authored rodent pressure and nearby predator foraging.
export function withFarmPests(world){
    const w=structuredClone(world);
    w.rules.wildlife.farmPests={version:1,fields:[{
        settlement:'loc_hw',fieldId:'farm_hw_oats',habitat:'habitat_hw_field',maximumDamageBps:3500,
        guardMinutes:90,guardDurationMinutes:240,guardReductionBps:5000,
        pests:[{species:'monster_mottled_field_mouse',toleranceCount:18,fullDamageCount:24,dailyDamageBps:12}],
        predators:[{species:'monster_red_ear_fox',habitat:'habitat_hw_wood',prey:'monster_mottled_field_mouse',killsPerWeek:1.5,refugeCount:2,
            path:['route_loc_hw_northwood','route_loc_hw_fields']}],
    }]};return w;
}
