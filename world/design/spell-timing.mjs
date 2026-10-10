// Duration measures ongoing magical support, not how long an ordinary result lasts.
// A repaired object, dried garment or collected water does not revert on expiry.
const instantaneous=new Set([
    'ignite','dry','condense','clean_water','clear_silt','irrigate','soil_water','clean_air','dry_grain',
    'imprint','level_ground','ore','structural_sense','fracture',
    'reveal_wear','color','shadow_measure','trace','contract_sense',
    'healing','herb_sense','disease_sense','clean_wound','graft','parasite','restore_tendon',
    'record_feeling','wake','hesitation','release_mind',
    'measure','organize','anchor_sense','retrieve','calibrate_anchor','anchor_cargo','teleport',
    'contract_read','reassign','dismiss','invite',
    'clean_altar','witness_oath','exorcise','faith_contract','restore','purify_area','repair_metal',
]);
export function mechanismDuration(mechanism,stage){
    if(mechanism==='air_bubble')return 1;
    if(mechanism==='levee')return 60;
    if(mechanism.startsWith('damage')||mechanism.startsWith('sense_')||mechanism.startsWith('survey_')||instantaneous.has(mechanism))return 0;
    return 30*(stage+1);
}
