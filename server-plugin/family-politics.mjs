import {preconditionFailure} from './precondition.mjs';
import {genealogy,familyEdges,familyAdult,familyPerson,natalFamily,familyOrganizationProjection,legalChildren} from './family-state.mjs';
import {npcHousehold,householdDefinition,householdMembers,npcAgeAt} from './npc-state.mjs';
import {marriageBlocker,marry} from './npc-life.mjs';
import {organizationState} from './organization-state.mjs';
import {activeGuardianship} from './family-inheritance.mjs';
import {fileFamilyDispute,manageWard} from './family-law.mjs';
import {familyAlliance} from './family-diplomacy.mjs';
import {relationView} from './npc-relations.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {lawAuthorities} from './entity-view.mjs';
import {declareHoldingWriter} from './holdings.mjs';
import {changeLegacyHoldings} from './transition.mjs';
import {holdingSet} from './holding-sources.mjs';
declareHoldingWriter('family-politics',{kinds:['kin','household_member','resides','resident_of','guardian_of']});

const DAY=1440,rec=id=>['state','records',id];
function person(e,s,value){const id=s.npcs?.[value]?value:e.resolve(value,'npc');if(!s.npcs?.[id])throw preconditionFailure('须为有实际状态的人物');return id;}
function present(e,s,id){const n=s.npcs?.[id];if(!n||n.location!==s.location||['死亡','濒死','昏迷','患病'].includes(n.status)||n.scheduleTravel||n.cognitionTravel||/睡眠|熟睡|睡觉/.test(n.activity??''))throw preconditionFailure('当事人须清醒在场');}
function consent(e,s,ids,args){if(args.consent!==true)throw preconditionFailure('须当事人明确同意');for(const id of ids)present(e,s,id);}
function willingKin(e,s,ids){for(const a of ids)for(const b of ids)if(a!==b&&relationView(e,s,a,b).trust<0)throw preconditionFailure('当事人不愿同意亲属转移');}
function membership(d,e,house,id,inside){
 const definition=householdDefinition(e,d.get('state'),house),row=d.get('state','family','households',house)??{},members=(row.members??[]).filter(x=>x!==id),left=(row.left??[]).filter(x=>x!==id);
 if(inside)members.push(id);else if(definition?.members.includes(id))left.push(id);
 holdingSet(d,null,['state','family','households',house],{...row,members,left},'family-politics');
}
function moveHouse(d,e,id,destination,eventId){
 const s=d.get('state'),from=npcHousehold(e,s,id);if(!from||!destination)throw preconditionFailure('迁出和迁入须有实际家户');
 if(from.id===destination.id)return;
 membership(d,e,from.id,id,false);membership(d,e,destination.id,id,true);
 const old=d.get('state','npcs',id),routine=e.byId.get(id)?.schedule??old.routine;
 const remap=v=>Array.isArray(v)?v.map(remap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,k==='location'&&v===from.homeLocation?destination.homeLocation:remap(v)])):v;
 holdingSet(d,null,['state','npcs',id,'residence'],{household:destination.id,settlement:destination.settlement,home:destination.homeLocation,since:s.minute,sourceEvent:eventId,schedule:remap(routine)},'family-politics');
 holdingSet(d,null,['state','npcs',id,'location'],destination.homeLocation,'family-politics');
 if(from.settlement!==destination.settlement)for(const [sid,delta]of [[from.settlement,-1],[destination.settlement,1]]){
  const n=d.get('state','settlements',sid,'population');if(!Number.isSafeInteger(n)||n+delta<0)throw Error('迁居人口账不可用');d.set(['state','settlements',sid,'population'],n+delta);
 }
 entityTransition(d,e,{id:`${eventId}:move:${id}`,verb:'migrate',actor:id,location:destination.homeLocation,tags:['family'],previousHousehold:from.id,household:destination.id,summary:'当事人迁出原户并登记进入新户'});
}
export function familyAction(d,args,eventId){
 const e=this,s=d.get('state');
 const split=s.family?.households?.[`house_split:${eventId}`];
 if(args.operation==='family_split'&&split)return {duplicate:true,household:split.id,from:split.previousHousehold,member:split.members[0]};
 const adopted=s.family?.adoptions?.[`adoption:${eventId}`];
 if(['family_adopt','family_foster'].includes(args.operation)&&adopted)return {duplicate:true,adoption:adopted,household:adopted.household};
 const married=Object.values(s.family?.marriages??{}).find(r=>r.requestId===eventId);
 if(args.operation==='family_marry'&&married)return {duplicate:true,marriage:married.id,partners:married.partners};
 if(args.operation==='family_alliance')return familyAlliance(d,e,args,eventId);
 const value=args.member??args.name,id=args.operation==='family_inspect'?(familyPerson(e,s,value)?value:e.resolve(value,'npc')):person(e,s,value),orgId=natalFamily(e,s,id);
 if(args.operation==='family_inspect'){
  let viewer='player';if(args.speaker){const speaker=person(e,s,args.speaker);present(e,s,speaker);if(relationView(e,s,speaker,'player').trust<0)throw preconditionFailure('对方不愿告知家事');viewer=speaker;}
  const tree=genealogy(e,s,id,viewer,'player'),org=orgId&&organizationState(e,s,orgId);
  const records=Object.values(s.records??{}).filter(r=>r.category==='guardianship'&&r.ward===id&&(r.guardian==='player'||s.location===npcHousehold(e,s,id)?.homeLocation));
  return {genealogy:tree,organization:org?familyOrganizationProjection(e,s,org,id,viewer):null,
   guardianships:records,choices:'family_marry: speaker/member，consent；family_adopt/foster: speaker养亲/member子女，authority原监护人，consent；family_split: member，plot本人房屋，consent；family_manage: member被监护人/speaker监护人，choice保管或侵吞，coins/content；family_dispute: sourceEvent死亡或监护ID，content；family_alliance: org/member双方组织，speaker/authority双方首脑，sourceEvent条件义务，consent',actionScope:{kind:'instant'}};
 }
 if(args.operation==='family_marry'){
  const a=person(e,s,args.speaker);consent(e,s,[a,id],args);
  const blocker=marriageBlocker(e,s,a,id,s.minute,true);if(blocker)throw Error(blocker);
  const marriage=marry(d,e,[a,id],{since:s.minute},s.minute);holdingSet(d,null,['state','family','marriages',marriage.id,'requestId'],eventId,'family-politics');return {marriage:marriage.id,partners:marriage.partners};
 }
 if(['family_adopt','family_foster'].includes(args.operation)){
  const parent=person(e,s,args.speaker),child=id,parents=familyEdges(e,s).filter(r=>r.kind==='parent'&&r.to===child).map(r=>r.from).filter(p=>familyAdult(e,s,p)&&legalChildren(e,s,p).includes(child));
  const guardian=activeGuardianship(e,s,child)?.guardian;
  if(!familyAdult(e,s,parent)||(npcAgeAt(e,s,parent)??0)<(npcAgeAt(e,s,child)??0)+18)throw preconditionFailure('养亲须成年且比子女年长至少十八岁');
  if(parent===child||genealogy(e,s,parent,parent).relations.some(r=>r.from===child&&r.to===parent))throw preconditionFailure('不能形成循环亲子关系');
  const responsible=[...new Set([...parents,...(guardian?[guardian]:[])])];
  if(responsible.length&&(!args.authority||!responsible.includes(args.authority)))throw preconditionFailure('收养过继须原父母或监护人同意');
  if(!responsible.length&&!familyAdult(e,s,child))throw preconditionFailure('未成年无监护人时须先由法庭指定监护人');
  const participants=[...new Set([parent,child,...responsible])];consent(e,s,participants,args);willingKin(e,s,participants);
  const house=npcHousehold(e,s,parent);if(!house)throw preconditionFailure('养亲须有真实家户');
  const aid=`adoption:${eventId}`,row={id:aid,parent,child,kind:args.operation==='family_foster'?'过继':'收养',household:house.id,minute:s.minute,participants,sourceEvent:eventId};
  holdingSet(d,null,['state','family','adoptions',aid],row,'family-politics');moveHouse(d,e,child,house,eventId);
  // Transfer legal care without erasing the recorded biological parents.
  if(!familyAdult(e,s,child)){
   const prior=activeGuardianship(e,s,child);if(prior)changeLegacyHoldings(d,e,{holder:prior.guardian,subject:child,kinds:['guardian_of'],eventId},()=>holdingSet(d,null,rec(prior.id),{...prior,status:'已结束',endedAt:s.minute,reason:row.kind},'family-politics'));
   holdingSet(d,null,rec(`guardianship:${aid}`),{category:'guardianship',id:`guardianship:${aid}`,ward:child,guardian:parent,since:s.minute,expires:s.minute+Math.max(0,18-(npcAgeAt(e,s,child)??0))*360*DAY,status:'代管中',responsibilities:['保全本人财产','逐笔记账','成年交还管理权'],ledger:[],sourceEvent:aid},'family-politics');
  }
  holdingSet(d,null,['state','family','seenByPlayer',aid],s.minute,'family-politics');
  entityTransition(d,e,{id:aid,verb:'transfer',actor:parent,target:child,location:house.homeLocation,visibility:'members',tags:['family',row.kind],summary:`当事人同意${row.kind}并实际迁入养亲家户`});return {adoption:row,household:house.id};
 }
 if(args.operation==='family_split'){
  consent(e,s,[id],args);if(!familyAdult(e,s,id))throw preconditionFailure('分家另立户须成年');
  const home=e.resolve(args.plot,'loc'),building=s.buildings?.[home],from=npcHousehold(e,s,id);
  if(!building||building.owner!==id||home!==s.location||!from||home===from.homeLocation)throw preconditionFailure('须在本人另有合法产权的居所分家');
  const hid=`house_split:${eventId}`;
  holdingSet(d,null,['state','family','households',hid],{id:hid,settlement:from.settlement,homeLocation:home,members:[],left:[],previousHousehold:from.id,sourceEvent:eventId},'family-politics');
  moveHouse(d,e,id,householdDefinition(e,d.get('state'),hid),eventId);return {household:hid,from:from.id,member:id};
 }
 if(args.operation==='family_manage'){
  const guardian=person(e,s,args.speaker);consent(e,s,[guardian],args);
  if(args.choice==='appoint'){
   const code=legalCodeAt(e,s.location,s),authority=args.authority&&person(e,s,args.authority);
   if(!code||s.location!==code.court||!lawAuthorities(e,s,code,'judge').includes(authority))throw preconditionFailure('监护指定须由当地有权法官在法院办理');
   present(e,s,authority);if(familyAdult(e,s,id)||!familyAdult(e,s,guardian)||id===guardian)throw preconditionFailure('须为未成年人与合格成年监护人');
   if(activeGuardianship(e,s,id))throw preconditionFailure('已有有效监护人，须先依法终止原监护');
   if(relationView(e,s,guardian,id).trust<0)throw preconditionFailure('候选人不愿监护');
   const prior=Object.values(s.records??{}).find(r=>r.category==='guardianship'&&r.ward===id&&['待指定','已撤换'].includes(r.status)),key=prior?.id??`guardianship:${eventId}`;
   const row={...prior,category:'guardianship',id:key,ward:id,guardian,since:s.minute,expires:s.minute+Math.max(0,18-(npcAgeAt(e,s,id)??0))*360*DAY,status:'代管中',responsibilities:['保全本人财产','逐笔记账','成年交还管理权'],ledger:prior?.ledger??[],appointedBy:authority,sourceEvent:eventId};
   holdingSet(d,null,rec(key),row,'family-politics');entityTransition(d,e,{id:`${eventId}:guardian`,verb:'appoint',actor:authority,target:guardian,location:s.location,visibility:'members',tags:['family','guardianship'],summary:'当地法庭指定未成年人的监护人'});return {guardianship:key,guardian};
  }
  return manageWard(d,e,{ward:id,guardian,coins:args.coins,kind:args.choice,purpose:args.content,recipient:args.authority,eventId});
 }
 if(args.operation==='family_dispute'){
  present(e,s,id);if(!args.content?.trim())throw preconditionFailure('须说明实际分产或监护争议');
  const caseId=fileFamilyDispute(d,e,{claimant:id,estate:args.sourceEvent,guardianship:args.sourceEvent,reason:args.content,eventId});return {case:caseId,status:'已报案',next:'world_law hear，由当地有权法官审理'};
 }
 throw preconditionFailure('未知家族事务');
}
