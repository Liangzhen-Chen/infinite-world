// The five original villages (Hewan + four) keep their published 152 full / 294 roster
// population; later Baishi (npc_bs_*) and monster-society (npc_ms_*/loc_ms_*) batches
// add people elsewhere, so counts are checked per cohort instead of on the whole catalog.
export const villageSettlements=['loc_hw','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban'];
export const villageFull=n=>n.tier==='full'&&/^npc_(hw|yp|wt|lq|sb)_/.test(n.id);
export const villageResident=n=>villageSettlements.includes(n.settlement);
