// Public projections are shared by lookup and search. Never index the full
// faction record: its description includes internal plans and disagreements.
import {publicRegion}from'./regions.mjs';
export const loreCategories=['cultures','deities','factions','history','regions'];
export function publicLore(row){
    const common={id:row.id,name:row.name,aliases:row.aliases??[],category:row.category};
    if(row.category==='culture'||row.category==='deity')return {...common,description:row.description,references:row.references??[]};
    if(row.category==='faction')return {...common,kind:row.kind,region:row.region,culture:row.culture,
        description:row.publicDescription,contactAnchor:row.contactAnchor,contactMode:row.contactMode};
    if(row.category==='history')return {...common,year:row.year,dateLabel:row.dateLabel,era:row.era,region:row.region,
        description:`流传说法，未经核实：${row.accounts.received.falseClaim}。查证线索：${row.presentTrace.evidenceAccess}`,
        source:row.accounts.received.source,verified:false};
    if(row.category==='province'||row.category==='county')return publicRegion(row);
    return null;
}
export const publicLoreEntries=world=>loreCategories.flatMap(category=>(world[category]??[]).map(publicLore));
