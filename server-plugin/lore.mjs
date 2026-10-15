// Public projections are shared by lookup and search. Never index the full
// faction record: its description includes internal plans and disagreements.
import {publicRegion}from'./regions.mjs';
export const loreCategories=['cultures','deities','factions','history','regions','festivals'];
export function publicLore(row){
    const common={id:row.id,name:row.name,aliases:row.aliases??[],category:row.category};
    if(row.category==='culture'||row.category==='deity')return {...common,description:row.description,references:row.references??[]};
    if(row.category==='faction')return {...common,kind:row.kind,region:row.region,culture:row.culture,
        description:row.publicDescription,contactAnchor:row.contactAnchor,contactMode:row.contactMode};
    if(row.category==='history')return {...common,year:row.year,dateLabel:row.dateLabel,era:row.era,region:row.region,
        description:`流传说法，未经核实：${row.accounts.received.falseClaim}。查证线索：${row.presentTrace.evidenceAccess}`,
        source:row.accounts.received.source,verified:false};
    if(row.category==='province'||row.category==='county')return publicRegion(row);
    // T108: a published festival shows its date, venue, conditions and own-material cost;
    // the running host and effects stay with the engine.
    if(row.category==='festival')return {...common,culture:row.culture,deity:row.deity,organizer:row.organizer,
        date:`${row.calendar.month}月${row.calendar.day}日`,venue:{region:row.venue.region,location:row.venue.location,description:row.venue.description},
        condition:row.condition,participation:row.participation,resourceNeeds:row.resourceNeeds.map(({item,quantity,use})=>({item,quantity,use})),
        permission:row.permission,description:row.description,held:row.runtime?.status==='active'?'按年有条件举办；须主办人在场并经组织、材料物主同意':'举办地尚无可主持的常住人物，暂不举办'};
    return null;
}
export const publicLoreEntries=world=>loreCategories.flatMap(category=>(world[category]??[]).map(publicLore));
