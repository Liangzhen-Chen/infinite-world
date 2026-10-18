// Initial local rules for guide 3.12. Amounts and procedure are recorded in D024.
const locations = ['loc_hw','bld_hw_qingdeng','bld_hw_mill','bld_hw_council','bld_hw_riverhome',
    'bld_hw_forge','loc_hw_northwood','bld_hw_herbs','loc_hw_dock','loc_hw_fields','bld_hw_weaving',
    'loc_hw_gate','loc_hw_orchard','bld_hw_school','loc_hw_apiary','bld_hw_post','site_beilin_tower','bld_hw_altar'];
export const lawFoundation = {
    actionMinutes: 5, maximumTheftCoins: 20, maximumTheftWeightKg: 2,
    codes: [{ id: 'law_hw_property', name: '河湾财物调处规约', locations,
        officers: ['npc_hw_gucen'], judges: ['npc_hw_chenbai'], court: 'bld_hw_council',
        reportMinutes: 15, searchMinutes: 10, hearingMinutes: 60, maximumDetentionMinutes: 1440,
        evidenceRequired: 2, communityMinutesPerCopper: 30, prisonMinutesPerCopper: 60,
        maximumSentenceMinutes: 10080,
        penalties: { negligent_fire:{baseFine:10,valueMultiplier:0}, theft: { baseFine: 10, valueMultiplier: 1 }, theft_attempt: { baseFine: 5, valueMultiplier: 0 },
            assault: { baseFine: 20, valueMultiplier: 0 }, assault_attempt: { baseFine: 5, valueMultiplier: 0 },
            homicide: { baseFine: 100, valueMultiplier: 0 } } }],
};
export function withLawRules(source) {
    const world = structuredClone(source), existing = world.rules.law?.codes ?? [];
    // Wanted, bribery and per-polity supplements (U5) live beside the codes and are kept.
    const kept = Object.fromEntries(['wanted', 'bribery', 'polities'].filter(key => world.rules.law?.[key] !== undefined).map(key => [key, world.rules.law[key]]));
    world.rules.law = { ...kept, ...structuredClone(lawFoundation),
        codes: [...existing.filter(code => !lawFoundation.codes.some(row => row.id === code.id)), ...structuredClone(lawFoundation.codes)] };
    return world;
}
