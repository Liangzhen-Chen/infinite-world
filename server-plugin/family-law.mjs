import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('family-law');
import {actorPath} from './npc-state.mjs';
import {familyAdult} from './family-state.mjs';
import {activeGuardianship} from './family-inheritance.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {entityTransition} from './entity-transitions.mjs';

const rec=id=>['state','records',id];
export function fileFamilyDispute(d,e,{claimant,estate,guardianship,reason,eventId}){
 const s=d.get('state'),death=Object.values(s.family?.deaths??{}).find(r=>r.id===estate),guard=s.records?.[guardianship];
 if(!death&&guard?.category!=='guardianship')throw Error('须指定实际死亡分产或监护登记');
 const own=death?.estate.allocations?.some(r=>r.heir===claimant)||guard?.ward===claimant;
 if(!own)throw Error('申请人须为实际继承当事人');
 const g=guard??death?.estate.guardianships?.map(id=>s.records[id]).find(r=>r.ward===claimant);
 const code=legalCodeAt(e,death?.settlement??s.location,s)??legalCodeAt(e,s.location,s);if(!code)throw Error('当地没有可受理的法典');
 if(s.location!==code.court)throw Error('须到本地法庭提出分产或监护争议');
 const prior=Object.values(s.records??{}).find(r=>r.category==='legal_case'&&r.familyCivil?.claimant===claimant&&r.familyCivil?.estate===(death?.id??g.estate)&&r.status!=='已结案');if(prior)return prior.id;
 const id=`legal_case:family:${eventId}`,row={category:'legal_case',id,procedureVersion:1,law:code.id,settlement:code.settlement??death?.settlement,
  offender:g?.guardian??death?.estate.heir,victim:claimant,offense:g?'guardianship_account':'inheritance_partition',value:0,stolen:null,
  minute:s.minute,location:s.location,status:'已报案',reported:true,witnesses:[],evidence:[],sourceEvent:eventId,
  familyCivil:{estate:death?.id??g.estate,guardianship:g?.id??null,reason,claimant,documents:[death?.id,g?.id].filter(Boolean)}};
 if(d.get(...rec(id)))return id;d.set(rec(id),row);return id;
}
// Same local court and appeal hierarchy as criminal/debt cases. Documentary
// estate and management records determine restitution, never an invented fine.
export function adjudicateFamilyDispute(d,e,row,code,judge,eventId){
 const s=d.get('state'),civil=row.familyCivil,guard=s.records?.[civil.guardianship],death=Object.values(s.family?.deaths??{}).find(r=>r.id===civil.estate);
 if(row.judgment)return {case:row.id,judgment:row.judgment,replayed:true};
 const diversions=(guard?.ledger??[]).filter(r=>r.kind==='侵吞'&&!r.recoveredBy),owed=diversions.reduce((n,r)=>n+r.coins,0);
 const restored=[];
 if(death)for(const allocation of death.estate.allocations??[])for(const asset of allocation.assets??[]){
  const building=s.buildings?.[asset];if(!building||restored.includes(asset))continue;
  const entitled=death.estate.allocations.filter(r=>r.assets.includes(asset)).map(r=>r.heir);
  const original=death.estate.propertyOwners?.[asset]??{},expected={...original};
  for(const allocation of death.estate.allocations.filter(r=>r.assets.includes(asset)))expected[allocation.heir]=(original[allocation.heir]??0)+(allocation.propertyShares?.[asset]??1/entitled.length);
  if(Object.keys(building.owners??{}).sort().join('|')===Object.keys(expected).sort().join('|')&&Object.entries(expected).every(([id,n])=>building.owners[id]===n))continue;
  d.set(['state','buildings',asset],{...building,owner:entitled.length===1?entitled[0]:building.owner,owners:expected,partitionJudgment:row.id});restored.push(asset);
 }
 const judgment={judge,minute:s.minute,compensation:owed,fine:0,evidenceScore:2,restored,decision:owed?'返还侵吞财产':restored.length?'按死亡分产登记恢复产权':'维持依法分产，监护继续按期记账'};
 d.set(rec(row.id),{...row,status:owed?'待赔偿':'已结案',judgment,value:owed,compensationPaid:owed===0});
 if(owed&&guard)d.set(rec(guard.id),{...guard,status:'已撤换',removedAt:s.minute,removalCase:row.id});
 entityTransition(d,e,{id:`${eventId}:family:judgment`,verb:'transfer',actor:judge,target:row.victim,location:code.court,tags:['family','law'],summary:judgment.decision});
 return {case:row.id,convicted:false,civil:true,judgment};
}
export function recoverFamilyCompensation(d,e,row,eventId){
 if(!row.judgment)throw Error('须先由有权法庭审理');
 const s=d.get('state'),remaining=Math.max(0,row.judgment.compensation-(row.recovered??0));
 const offenderPath=actorPath(e.world,row.offender),victimPath=actorPath(e.world,row.victim),available=d.get(...offenderPath,'coins')??0,amount=Math.min(remaining,available);
 if(amount){moveCoins(d,{from:purse(e,row.offender),to:purse(e,row.victim),amount:amount,writer:'family-law',eventId:row.id});d.set([...offenderPath,'coins'],available-amount);d.set([...victimPath,'coins'],(d.get(...victimPath,'coins')??0)+amount);}
 const recovered=(row.recovered??0)+amount,closed=recovered===row.judgment.compensation;
 d.set(rec(row.id),{...row,recovered,status:closed?'已结案':'待赔偿',compensationPaid:closed});
 if(closed){const guard=d.get(...rec(row.familyCivil.guardianship));if(guard)d.set(rec(guard.id),{...guard,ledger:guard.ledger.map(r=>r.kind==='侵吞'?{...r,recoveredBy:row.id}:r)});}
 return {case:row.id,recovered:amount,remaining:remaining-amount,closed};
}
export function manageWard(d,e,{ward,guardian,coins,kind,purpose,recipient,eventId}){
 const s=d.get('state'),guard=activeGuardianship(e,s,ward);
 const previous=guard?.ledger.find(r=>r.sourceEvent===eventId);if(previous)return {guardianship:guard.id,entry:previous};
 if(!guard||guard.guardian!==guardian||!familyAdult(e,s,guardian))throw Error('没有有效的本人监护代管权限');
 if(!Number.isSafeInteger(coins)||coins<=0)throw Error('代管金额须为正整数');
 if(!purpose?.trim())throw Error('代管开支须记明用途');
 const source=actorPath(e.world,ward),target=actorPath(e.world,kind==='支出'?recipient:guardian),have=d.get(...source,'coins')??0;
 if(have<coins)throw Error('继承人财产不足');
 if(!['保管','支出','侵吞'].includes(kind))throw Error('choice 须为保管、支出或侵吞；保管不改变所有权');
 if(kind==='支出'&&(!recipient||recipient===guardian||recipient===ward||!d.get(...target)||d.get(...target,'location')!==s.location))throw Error('受监护人开支须支付给在场实际收款者，不能转作监护人私财');
 if(kind!=='保管'){moveCoins(d,{from:purse(e,ward),to:purse(e,kind==='支出'?recipient:guardian),amount:coins,writer:'family-law',eventId:eventId});d.set([...source,'coins'],have-coins);d.set([...target,'coins'],(d.get(...target,'coins')??0)+coins);}
 const entry={kind,coins,purpose,...(recipient?{recipient}:{}),minute:s.minute,sourceEvent:eventId};d.set(rec(guard.id),{...guard,ledger:[...guard.ledger,entry]});
 entityTransition(d,e,{id:`${eventId}:guard`,verb:kind==='侵吞'?'steal':'transfer',actor:guardian,target:ward,location:s.location,visibility:'members',tags:['family','guardianship'],summary:`监护代管记账：${purpose}`});
 return {guardianship:guard.id,entry};
}
