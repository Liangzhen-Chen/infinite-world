import {natalFamily,familyAdult,familyEdges} from './family-state.mjs';
import {standing,adjustStanding} from './standing.mjs';
import {organizationState} from './organization-state.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {obligationRow} from './obligation-state.mjs';
import {declareHoldingWriter} from './holdings.mjs';
import {holdingSet} from './holding-sources.mjs';
declareHoldingWriter('family-diplomacy',{kinds:['allied_with']});

const key=(a,b)=>[a,b].sort().join(':'),rec=id=>['state','records',id];
const fulfilled=o=>['已完成','completed','settled'].includes(o?.status);
function marriages(e,s){
 const rows=Object.values(s.family?.marriages??{});
 for(const r of familyEdges(e,s).filter(r=>r.kind==='spouse'&&r.source==='catalog')){
  if(rows.some(m=>m.partners.includes(r.from)&&m.partners.includes(r.to)))continue;
  rows.push({id:`marriage:static:${[r.from,r.to].sort().join('|')}`,partners:[r.from,r.to],status:'在婚',since:0});
 }
 return rows.map(m=>({...m,parties:m.partners.map(id=>natalFamily(e,s,id)),factions:m.partners.map(id=>(s.created?.[id]??e.byId.get(id))?.faction)}));
}
export function marriagePolitics(d,e,marriage){
 const s=d.get('state'),[a,b]=marriage.partners,fa=natalFamily(e,s,a),fb=natalFamily(e,s,b);
 const factions=[a,b].map(id=>(s.created?.[id]??e.byId.get(id))?.faction);
 const pairs=[[fa,fb],factions].filter(([a,b])=>a&&b&&a!==b);
 for(const [left,right]of pairs)for(const [from,to]of [[left,right],[right,left]])adjustStanding(d,e,from,to,e.rules.law?.family?.marriageStanding??10,{sourceEvent:marriage.id,reason:'成年双方自愿联姻',minute:marriage.since});
}
export function familyAlliance(d,e,args,eventId){
 const s=d.get('state'),a=organizationState(e,s,args.org),b=organizationState(e,s,args.member);
 if(!a||!b||a.id===b.id)throw Error('须指定两个实际家族或势力组织');
 const link=marriages(e,s).find(r=>(r.parties.includes(a.id)&&r.parties.includes(b.id)||r.factions.includes(a.id)&&r.factions.includes(b.id))&&r.status==='在婚'&&r.partners.every(id=>familyAdult(e,s,id)));
 if(!link)throw Error('双方没有持续有效的成年自愿联姻');
 if(args.consent!==true||args.speaker!==a.leader||args.authority!==b.leader)throw Error('联盟须双方有权首脑当面同意');
 for(const leader of [a.leader,b.leader])if(!familyAdult(e,s,leader)||s.npcs?.[leader]?.location!==s.location||['昏迷','濒死','患病'].includes(s.npcs[leader].status))throw Error('双方首脑须成年清醒在场');
 if(Math.min(standing(e,s,a.id,b.id),standing(e,s,b.id,a.id))<0)throw Error('双方敌对，首脑不愿结盟');
 if(Object.values(s.records??{}).some(w=>w.category==='war'&&['交战','停战'].includes(w.status)&&key(w.aggressor,w.defender)===key(a.id,b.id)))throw Error('交战或停战期间须先议和');
 const condition=args.sourceEvent?obligationRow(s,args.sourceEvent):null;
 if(args.sourceEvent&&(!condition||!['待履行','进行中','pending','已完成','completed','settled'].includes(condition.status)))throw Error('条件须为真实待履行或已完成的义务');
 if(condition&&!([a.leader,b.leader,...link.partners].includes(condition.debtor??condition.promisor)&&[a.leader,b.leader,...link.partners].includes(condition.creditor??condition.promisee)))throw Error('条件义务须由双方当事人承担');
 const id=`diplomacy:${key(a.id,b.id)}`,old=s.records?.[id];if(old?.marriage===link.id&&old.status==='结盟')return {alliance:id,status:old.status};
 const row={category:'diplomacy',id,parties:[a.id,b.id],status:condition&&!fulfilled(condition)?'待条件':'结盟',condition:condition?.id??args.sourceEvent??null,
  marriage:link.id,representatives:[a.leader,b.leader],minute:s.minute,sourceEvent:eventId};
 holdingSet(d,e,rec(id),row,'family-diplomacy');
 entityTransition(d,e,{id:`${eventId}:alliance`,verb:'pact',actor:a.leader,target:b.leader,location:s.location,tags:['family','diplomacy'],summary:row.status==='结盟'?'双方首脑同意依联姻结盟':'双方首脑同意在义务履行后结盟'});
 return {alliance:id,status:row.status,condition:row.condition};
}
export function advanceFamilyAlliances(d,e,minute){
 const s=d.get('state');
 for(const row of Object.values(s.records??{}).filter(r=>r.category==='diplomacy'&&r.marriage&&['待条件','结盟'].includes(r.status))){
  const marriage=marriages(e,s).find(m=>m.id===row.marriage),condition=obligationRow(s,row.condition);
  const valid=marriage?.status==='在婚'&&marriage.partners.every(id=>familyAdult(e,s,id,minute));
  const breached=condition&&(['违约','取消','失败','breached','cancelled','void','bad_debt'].includes(condition.status)||condition.endedAt!==undefined&&!fulfilled(condition));
  const next=!valid||breached?'已解除':row.status==='待条件'&&fulfilled(condition)?'结盟':row.status;
  if(next===row.status)continue;
  holdingSet(d,e,rec(row.id),{...row,status:next,changedAt:minute},'family-diplomacy');
  entityTransition(d,e,{id:`${row.id}:${next}:${minute}`,verb:'pact',actor:row.parties[0],target:row.parties[1],minute,tags:['family','diplomacy'],summary:next==='结盟'?'联姻联盟条件已履行，联盟生效':'联姻或约定义务终止，联盟解除'});
 }
}
