// Server-side half of the aiProfile switch (AI-00 section 3.2). The client sends its profile in the
// X-AI-Profile header on every request; a missing or unknown value means T0 (no model). Each model
// entry point asks aiAllows(req,use) in addition to having a client available.
export const AI_USES={T0:[],T1:['understand'],T2:['understand','narrate'],T3:['understand','narrate','npcPlanning','profileDraft']};
export const profileOfRequest=req=>{const value=req?.headers?.['x-ai-profile'];return Object.hasOwn(AI_USES,value)?value:'T0';};
export const aiAllows=(req,use)=>AI_USES[profileOfRequest(req)].includes(use);
