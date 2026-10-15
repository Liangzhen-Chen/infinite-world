// Read-only administrative level and promotion effects, without action imports.
const rankKey=s=>`settlement_rank:${s}`;
export const promotionRules=engine=>engine.rules.governance?.promotion??null;
export function adminLevel(engine,state,settlement){
    const r=state.records?.[rankKey(settlement)];
    if(r?.category==='settlement_rank')return {level:r.level,superior:r.superior,since:r.since,record:r.id};
    const j=promotionRules(engine)?.jurisdiction?.[settlement];
    return j?{level:j.level,superior:j.superior,since:null,record:null}:null;
}
const effectsOf=(engine,state,settlement)=>{
    // Only a promotion changes what a settlement had; founding levels keep their own terms.
    const rules=promotionRules(engine),rank=state.records?.[rankKey(settlement)],now=rank?.category==='settlement_rank'?rank.level:null;if(!rules||!now)return null;
    const i=rules.levels.indexOf(now);if(i<=0)return null;
    return rules.steps.filter(s=>rules.levels.indexOf(s.to)<=i).at(-1)?.effects??null;
};
// An office as it stands in a promoted settlement (name, quota, budget, tax range).
export function rankedOffice(engine,state,settlement,office){
    const e=effectsOf(engine,state,settlement)?.offices?.[office.id];
    if(!e){
        const level=adminLevel(engine,state,settlement)?.level,key={村:'villageHead',镇:'townHead',城:'cityHeadFirstBaron',郡:'countyHead',省:'provinceHead'}[level];
        if(office.id==='office_village_head'&&key)return {...office,name:level==='村'?office.name:`${level}长`,monthlyQuotaD:engine.rules.quests.monthlyQuotaD[key]};
        // Village-level titles follow the settlement's current level (村管事 → 镇管事).
        return level&&level!=='村'&&office.name?.startsWith('村')?{...office,name:`${level}${office.name.slice(1)}`}:office;
    }
    return {...office,name:e.name??office.name,monthlyQuotaD:e.quotaKey?engine.rules.quests.monthlyQuotaD[e.quotaKey]:e.monthlyQuotaD??office.monthlyQuotaD,
        monthlyBudgetCopper:e.monthlyBudgetCopper??office.monthlyBudgetCopper,...(e.taxBps?{taxBps:{...e.taxBps}}:{})};
}
export function marketFactor(engine,state,settlement){return effectsOf(engine,state,settlement)?.market?.restockFactor??1;}
