import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('family-inheritance');
import {familyEdges,legalChildren,familyLiving,familyAdult,natalFamily} from './family-state.mjs';
import {npcAgeAt,npcHousehold,actorPath} from './npc-state.mjs';
import {rosterLifeState} from './population.mjs';
import {transferItems} from './items.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {entityTransition} from './entity-transitions.mjs';

const DAY=1440,YEAR=360*DAY,rec=id=>['state','records',id];
export function inheritanceRule(e,s,id,location){
 const house=npcHousehold(e,s,id),code=legalCodeAt(e,house?.settlement??location,s)??legalCodeAt(e,location,s);
 const culture=(s.created?.[id]??e.byId.get(id))?.culture,law=e.rules.law?.family;
 const local=(culture&&law?.rules?.find(r=>r.culture===culture))||(code&&law?.rules?.find(r=>r.code===(code.template??code.id)))||law?.rules?.find(r=>r.polity===(code?.polity??'王国'));
 return {property:'spouse-first',title:'eldest-child',office:'vacant',...local,law:code?.id??null};
}
function candidates(e,s,id,rule,minute){
 const living=ids=>[...new Set(ids)].filter(x=>x!==id&&familyLiving(s,x)&&(s.npcs?.[x]||e.byId.has(x)||s.created?.[x]));
 const children=living(legalChildren(e,s,id)).sort((a,b)=>(npcAgeAt(e,s,b,minute)??-1)-(npcAgeAt(e,s,a,minute)??-1)||a.localeCompare(b));
 const spouses=living(familyEdges(e,s).filter(r=>r.kind==='spouse'&&!r.ended&&(r.from===id||r.to===id)).map(r=>r.from===id?r.to:r.from)).filter(x=>familyAdult(e,s,x,minute)).sort();
 const house=living(npcHousehold(e,s,id)?.members??[]).sort();
 const first=spouses.length?spouses:children.length?children:house;
 return {children,spouses,house,heirs:rule.property==='equal'?(children.length||spouses.length?living([...children,...spouses]).sort():house.slice(0,1)):rule.property==='eldest'?(children.length?children.slice(0,1):first.slice(0,1)):rule.property==='household'?house:rule.property==='children'?(children.length?children:first):first.slice(0,1)};
}
const portions=(n,ids)=>ids.map((id,i)=>({id,amount:Math.floor(n/ids.length)+(i<n%ids.length?1:0)}));
function materialize(d,e,id,at){
 if(d.get('state','npcs',id))return;
 const row=rosterLifeState(e,d.get('state'),id,at,'继承',{minor:!familyAdult(e,d.get('state'),id,at)});
 if(row)d.set(['state','npcs',id],row);
}
function guardianship(d,e,ward,from,deathId,minute,coins){
 const s=d.get('state'),family=natalFamily(e,s,ward),parents=familyEdges(e,s).filter(r=>r.kind==='parent'&&r.to===ward).map(r=>r.from);
 const pool=[...new Set([...parents,...npcHousehold(e,s,ward)?.members??[]])].filter(id=>id!==from&&familyAdult(e,s,id,minute)).sort((a,b)=>Number(parents.includes(b))-Number(parents.includes(a))||a.localeCompare(b));
 const guardian=pool[0]??null,id=`guardianship:${deathId}:${ward}`,age=npcAgeAt(e,s,ward,minute);
 const profile=s.family?.people?.[ward]??s.created?.[ward]??e.byId.get(ward),adult=e.rules.npcLife?.adultAge??18;
 const expires=profile?.birth?((profile.birth.year-1+adult)*360+(profile.birth.month-1)*30+profile.birth.day-1)*DAY:age===null?null:Math.max(minute,(adult-(profile?.age??age))*YEAR);
 d.set(rec(id),{category:'guardianship',id,ward,guardian,family,estate:deathId,since:minute,expires,status:guardian?'代管中':'待指定',responsibilities:['保全本人财产','逐笔记账','成年交还管理权'],receivedCoins:coins,ledger:[],sourceEvent:deathId});
 entityTransition(d,e,{id:`${id}:appoint`,verb:'appoint',actor:guardian??family,target:ward,minute,location:npcHousehold(e,s,ward)?.homeLocation,visibility:'members',tags:['family','guardianship'],summary:guardian?'未成年继承人的财产由监护人记账代管':'未成年继承人的财产保留本人名下，等待指定监护人'});
 return id;
}
// Called only by V2's death commit. Ownership changes once; the death row
// records the allocation, never a second balance of the inherited estate.
export function settleFamilyEstate(d,e,id,minute,deathId,location){
 const s=d.get('state'),rule=inheritanceRule(e,s,id,location),selection=candidates(e,s,id,rule,minute);
 for(const heir of [...selection.heirs,...selection.children])materialize(d,e,heir,minute);
 const heirs=selection.heirs.filter(x=>d.get('state','npcs',x)),current=d.get(...actorPath(e.world,id));
 const estate={heir:heirs[0]??null,heirs,rule,coins:current.coins??0,items:{},allocations:heirs.map(heir=>({heir,coins:0,items:{},assets:[]})),debts:Object.entries(s.records??{}).filter(([,r])=>r.category==='debt'&&[r.debtor,r.creditor].includes(id)&&r.amount>(r.paid??0)).map(([key])=>key).sort(),guardianships:[]};
 if(!heirs.length){
  for(const [key,row]of Object.entries(s.records??{}))if(row.holder===id&&(row.category==='title'&&row.status!=='已除爵'||row.category==='governance_office'&&row.status==='在任'))d.set(rec(key),{...row,status:row.category==='title'?'已除爵':'已免职',removedAt:minute,reason:'持有人死亡，无可继承人'});
  return estate;
 }
 const rowFor=who=>estate.allocations.find(r=>r.heir===who);
 for(const {id:to,amount}of portions(estate.coins,heirs))if(amount){moveCoins(d,{from:purse(e,id),to:purse(e,to),amount:amount,writer:'family-inheritance',eventId:deathId});d.set(['state','npcs',to,'coins'],(d.get('state','npcs',to,'coins')??0)+amount);rowFor(to).coins=amount;}
 if(estate.coins)d.set([...actorPath(e.world,id),'coins'],0);
 for(const item of Object.keys(current.inventory??{}).sort()){
  const quantity=e.quantity(d,id,item);if(!quantity)continue;estate.items[item]=quantity;
  for(const {id:to,amount}of portions(quantity,heirs))if(amount){transferItems(d,e,id,to,item,amount);rowFor(to).items[item]=amount;}
 }
 for(const [asset,row]of Object.entries(s.buildings??{})){
  if(row.owner!==id&&!Object.hasOwn(row.owners??{},id))continue;
  const owned=row.owners?.[id]??1,owners={...row.owners};delete owners[id];
  estate.propertyOwners={...estate.propertyOwners,[asset]:{...owners}};
  for(const heir of heirs){owners[heir]=(owners[heir]??0)+owned/heirs.length;rowFor(heir).assets.push(asset);rowFor(heir).propertyShares={...rowFor(heir).propertyShares,[asset]:owned/heirs.length};}
  d.set(['state','buildings',asset],{...row,owner:Object.keys(owners).length===1?heirs[0]:natalFamily(e,s,id),owners,inheritedAt:minute,inheritance:deathId});
 }
 for(const [key,row]of Object.entries(s.records??{})){
  if(row.category==='title'&&row.holder===id&&row.status!=='已除爵'||row.category==='governance_office'&&row.holder===id&&row.status==='在任'){
   const title=row.category==='title',successor=title?selection.children[0]??heirs[0]:row.hereditary===true&&rule.office==='hereditary'?selection.children[0]??heirs[0]:null;
   d.set(rec(key),{...row,...(successor?{holder:successor,previousHolder:id,inheritedAt:minute,inheritance:deathId,...(!familyAdult(e,s,successor,minute)?{heldInMinority:true}:{})}:{status:title?'已除爵':'已免职',removedAt:minute,reason:'持有人死亡，职位不世袭'})});
   if(successor){materialize(d,e,successor,minute);if(!heirs.includes(successor)&&!familyAdult(e,s,successor,minute))estate.guardianships.push(guardianship(d,e,successor,id,deathId,minute,0));}
   entityTransition(d,e,{id:`${deathId}:succession:${key}`,verb:successor?'appoint':'dismiss',actor:id,target:successor,minute,location,tags:['family','succession'],summary:successor?'持有人死亡，按当地规则承接称号或世袭职务':'持有人死亡，任职终止'});
  }
  if(row.category==='equity'&&row.holder===id&&row.status==='有效'){
   d.set(rec(key),{...row,status:'已继承',inheritance:deathId});
   for(const heir of heirs){const next=`${key}:inherit:${deathId}:${heir}`;d.set(rec(next),{...row,id:next,holder:heir,share:row.share/heirs.length,stake:(row.stake??0)/heirs.length,distributed:(row.distributed??0)/heirs.length,inheritance:deathId});rowFor(heir).assets.push(next);}
  }
  // Keep the original debt and collateral together. Co-heirs acquire explicit
  // shares of the same claim/liability instead of duplicating its principal.
  if(row.category==='bank'&&row.accounts?.[id]){
   const account=row.accounts[id],accounts={...row.accounts};delete accounts[id];
   // Accounts are copper balances; interest timestamps stay with each share.
   for(const {id:heir,amount}of portions(account,heirs)){
    accounts[heir]=(accounts[heir]??0)+amount;rowFor(heir).assets.push(`${key}:account`);
   }
   d.set(rec(key),{...row,accounts});
  }
 }
 for(const allocation of estate.allocations){
  const heir=allocation.heir;
  d.set(['state','npcs',heir,'developments'],[...d.get('state','npcs',heir,'developments')??[],{type:'继承',source:deathId,minute,from:id}]);
  if(!familyAdult(e,d.get('state'),heir,minute))estate.guardianships.push(guardianship(d,e,heir,id,deathId,minute,allocation.coins));
 }
 return estate;
}
export function activeGuardianship(e,s,ward){
 return Object.values(s.records??{}).find(r=>r.category==='guardianship'&&r.ward===ward&&r.status==='代管中'&&r.since<=s.minute&&(r.expires===null||s.minute<r.expires)&&!familyAdult(e,s,ward)&&familyAdult(e,s,r.guardian));
}
export function advanceGuardianships(d,e,minute){
 for(const r of Object.values(d.get('state','records')??{}).filter(r=>r.category==='guardianship'&&['代管中','待指定'].includes(r.status))){
  const s=d.get('state');
  if(familyAdult(e,s,r.ward,minute)||!familyLiving(s,r.ward)){
   d.set(rec(r.id),{...r,status:'已结束',endedAt:minute,reason:familyLiving(s,r.ward)?'继承人已成年':'继承人死亡'});
   entityTransition(d,e,{id:`${r.id}:end`,verb:'transfer',actor:r.guardian,target:r.ward,minute,location:npcHousehold(e,s,r.ward)?.homeLocation,visibility:'members',tags:['family','guardianship'],summary:'监护任期结束，结束财产代管'});
  }else if(r.guardian&&!familyAdult(e,s,r.guardian,minute))d.set(rec(r.id),{...r,guardian:null,status:'待指定',previousGuardian:r.guardian});
 }
}
