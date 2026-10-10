// Guide 3.9 does not prescribe these amounts. D023 records them as initial balance values.
export const petCareRules = {
    tamingSkill: 'skill_life_15_core', medicineSkill: 'skill_life_19_core',
    hungerPerHour: 4, restPerHour: 2, hungryThreshold: 80, sickThreshold: 90,
    sickHours: 6, starvationDamage: 1, loyaltyLoss: 1, escapeLoyalty: 10,
    neglectHours: 6, contactMinutes: 30, contactTrust: 5, contactsPerDay: 1,
    feedMinutes: 5, groomMinutes: 15, groomLoyalty: 2,
    treatmentMinutes: 30, treatmentItem: 'item_herb', treatmentHeal: 10,
    treatmentMinimumSkill: 100, trainMinutes: 60, trainExperience: 10,
    trainMinimumSkill: 100, travelFatiguePer30Minutes: 2, maximumRideFatigue: 80,
    maximumSummons: 3,
};

export function withPetRules(source) {
    const world = structuredClone(source);
    world.rules.petCare = structuredClone(petCareRules);
    return world;
}
