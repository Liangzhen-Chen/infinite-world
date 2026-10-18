import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('family-inheritance');
import {familyLiving,familyAdult} from './family-state.mjs';
import {npcHousehold} from './npc-state.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {changeLegacyHoldings} from './transition.mjs';
declareHoldingWriter('family-inheritance',{kinds:['holds_office','fief','guardian_of','owns','share','resides','devotee_of','certified'],entities:['office','estate']});

const rec=id=>['state','records',id];
import {inheritanceRule as ruleFor,inheritanceCandidates,guardianCandidates} from './family-state.mjs';
export {inheritanceCandidates,guardianCandidates} from './family-state.mjs';
export function inheritanceRule(e,s,id,location){
 const house=npcHousehold(e,s,id),code=legalCodeAt(e,house?.settlement??location,s)??legalCodeAt(e,location,s);
 return ruleFor(e,s,id,location,code);
}
// Compatibility readers use the protocol receipt; allocation occurs only in transition.
export function settleFamilyEstate(d,e,id,minute,deathId,location){
 const row=d.get('state','family','deaths',deathId);
 if(row?.person===id&&row.estate)return structuredClone(row.estate);
 const protocol=d.get('holdings','protocol','entities',id);
 if(!protocol?.gone)throw Error('Estate settlement requires the lifecycle protocol');
 return {id:protocol.successor,heir:null,heirs:[],phase:d.get('holdings','protocol','procedures',protocol.successor,'phase')??'notice'};
}
export function activeGuardianship(e,s,ward){
 return Object.values(s.records??{}).find(r=>r.category==='guardianship'&&r.ward===ward&&r.status==='代管中'&&r.since<=s.minute&&(r.expires===null||s.minute<r.expires)&&!familyAdult(e,s,ward)&&familyAdult(e,s,r.guardian));
}
export function advanceGuardianships(d,e,minute){
 for(const r of Object.values(d.get('state','records')??{}).filter(r=>r.category==='guardianship'&&['代管中','待指定'].includes(r.status))){
  const s=d.get('state');
  if(familyAdult(e,s,r.ward,minute)||!familyLiving(s,r.ward)){
   changeLegacyHoldings(d,e,{holder:r.guardian,subject:r.ward,kinds:['guardian_of'],reason:'expired',eventId:`${r.id}:end`},()=>holdingSet(d,null,rec(r.id),{...r,status:'已结束',endedAt:minute,reason:familyLiving(s,r.ward)?'继承人已成年':'继承人死亡'},'family-inheritance'));
   entityTransition(d,e,{id:`${r.id}:end`,verb:'transfer',actor:r.guardian,target:r.ward,minute,location:npcHousehold(e,s,r.ward)?.homeLocation,visibility:'members',tags:['family','guardianship'],summary:'监护任期结束，结束财产代管'});
  }else if(r.guardian&&!familyAdult(e,s,r.guardian,minute))holdingSet(d,null,rec(r.id),{...r,guardian:null,status:'待指定',previousGuardian:r.guardian},'family-inheritance');
 }
}
