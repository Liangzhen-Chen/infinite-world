// User-authorized S4LAW candidate shared by publication and the pre-existing
// village ledger validator. Keep both historical and this exact newer edition.
export function trialProcedureFor(code){
 return {procedure:{...code.procedure,
  evidence:{weights:{eyewitness:1,statement:0.5,confession:2,document:3,mark:1},stanceDiscount:0.5,
   convictionThreshold:Object.fromEntries(Object.keys(code.penalties).map(offense=>[offense,offense.endsWith('_attempt')?2:offense==='homicide'?5:3]))},
  appealWindowMinutes:4320,appealStaysExecution:{criminal:true,civil:false},refundOnReversal:true,
  costs:{...code.procedure?.costs,filingFee:code.procedure?.costs?.filingFee??code.procedureCosts?.filingFee??0}},
  appeal:{...code.appeal,judges:['npc_hc_yicen'],minutes:code.appeal?.minutes??60,
   source:'s4law-content；西陲王国诉讼章与环城郡署现任上级主官，原审回避'}};
}
