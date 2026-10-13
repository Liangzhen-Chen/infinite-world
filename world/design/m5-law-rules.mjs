// T43 procedure adapters use the existing court and D024 durations. This does
// not grant the other villages, faction contacts or catalogue leaders a court.
export function withM5LawRules(source) {
    const world=structuredClone(source);
    for(const code of world.rules.law?.codes??[]) {
        if(code.id!=='law_hw_property')continue;
        code.settlement='loc_hw';
        code.source='world/design/law-foundation.mjs; D024';
        code.appeal={judges:[...code.judges],minutes:code.hearingMinutes,source:code.source};
    }
    world.rules.reputation={
        source:'M5/T43 runtime evaluation; judicial jurisdiction remains rules.law.codes',
        settlements:[...new Set(['loc_bs',...(world.settlementProfiles??[]).map(row=>row.id)])],
        // Numeric evaluation is an engine rule, not an additional penal code.
        deltas:{conviction:{reputation:-4,fame:0,notoriety:2},fulfilled:{reputation:1,fame:0,notoriety:0}},
        // A foreign court's notice has less local weight; it still conveys a
        // reported ruling, never authority to arrest under an unregistered code.
        remoteDeltas:{conviction:{reputation:-1,fame:0,notoriety:1},fulfilled:{reputation:0,fame:1,notoriety:0}},
        factions:(world.factions??[]).map(row=>({id:row.id,members:[row.leader,...row.coreMembers??[]],
            relations:structuredClone(row.relations??[]),source:`world/lore/factions.json#${row.id}`})),
    };
    return world;
}
