// Guide 3.8.3. Authored initial routes, not claims about all world biomes.
export function withSeasonalMigration(world){
    const w=structuredClone(world),wood='habitat_hw_wood',field='habitat_hw_field';
    const paths=['route_loc_hw_northwood','route_loc_hw_fields'];
    w.rules.wildlife.migration={version:1,routes:[
        {id:'migration_deer_winter',species:'monster_brown_deer',from:wood,to:field,departDay:270,fraction:.4,travelDays:1,path:paths},
        {id:'migration_deer_spring',species:'monster_brown_deer',from:field,to:wood,departDay:0,fraction:1,travelDays:1,path:[...paths].reverse()},
        {id:'migration_goat_winter',species:'monster_bent_horn_goat',from:field,to:wood,departDay:270,fraction:.5,travelDays:1,path:[...paths].reverse()},
        {id:'migration_goat_spring',species:'monster_bent_horn_goat',from:wood,to:field,departDay:0,fraction:1,travelDays:1,path:paths},
    ]};return w;
}
