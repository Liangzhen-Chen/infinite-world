// Read models only. Kinship and property remain in their original stores.
import {npcAgeAt,npcHousehold,householdDefinition} from './npc-state.mjs';

export const familyPerson=(e,s,id)=>s.family?.people?.[id]??s.created?.[id]??e.byId.get(id);
import {isGone} from './lifecycle-state.mjs';
export const familyLiving=(s,id)=>!isGone(null,s,id)&&(s.records?.[`transition:${id}`]?.gone===false||!Object.values(s.family?.deaths??{}).some(r=>r.person===id&&(r.incarnation??0)===(s.npcs?.[id]?.incarnation??0)));
export const familyAdult=(e,s,id,at=s.minute)=>familyLiving(s,id)&&(npcAgeAt(e,s,id,at)??-1)>=(e.rules.npcLife?.adultAge??18);
const childTypes=new Set(['子女','儿子','女儿']),parentTypes=new Set(['父亲','母亲','父母']),siblingTypes=new Set(['兄弟','姐妹','兄妹','姐弟','兄长','姐姐','弟弟','妹妹']);
const extendedKin=new Set(['父女','孙女','孙子','孙辈','外孙','外孙女','外甥','外甥女','外祖父','儿媳','女婿','岳父','同户小辈','同户长者','同户晚辈']),affinal=new Set(['儿媳','女婿','岳父']);
const graphCache=new WeakMap();
const relationshipCache=new WeakMap();
function actorKin(s){
 const actors=s.npcs??{},prior=relationshipCache.get(actors);if(prior)return prior;
 const rows=[];for(const [id,p]of Object.entries(actors))for(const [withId,r]of Object.entries(p.relationships??{}))if(childTypes.has(r.type)||parentTypes.has(r.type)||siblingTypes.has(r.type)||extendedKin.has(r.type)||r.type==='配偶')rows.push({id,with:withId,...r});
 const out={rows,key:JSON.stringify(rows)};relationshipCache.set(actors,out);return out;
}
export function familyEdges(e,s){
 const prior=graphCache.get(e.world),relations=actorKin(s);
 if(prior&&prior.relations===relations.key&&prior.people===s.family?.people&&prior.adoptions===s.family?.adoptions&&prior.marriages===s.family?.marriages&&prior.created===s.created)return prior.edges;
 const rows=[],seen=new Set(),people=new Map([...e.world.npcs??[],...e.world.residents??[],...Object.values(s.created??{}),...Object.values(s.family?.people??{})].map(p=>[p.id,p]));
 const add=r=>{const key=[r.kind,...(r.kind==='parent'?[r.from,r.to]:[r.from,r.to].sort()),r.source].join('|');
  if(!people.has(r.from)||!people.has(r.to))return;
  if(seen.has(key)){const old=rows.find(x=>x.key===key);if(r.private||r.knownBy){old.private=old.private||r.private;old.knownBy=[...new Set([...old.knownBy??[],...r.knownBy??[]])];}return;}
  seen.add(key);rows.push({...r,key});};
 for(const [id,p]of people){
  for(const r of [...p.relationships??[],...relations.rows.filter(r=>r.id===id)]){
   const fatherDaughter=r.type==='父女'&&[p.sex,people.get(r.with)?.sex].sort().join('')==='女男';
   const kind=childTypes.has(r.type)||parentTypes.has(r.type)||fatherDaughter?'parent':r.type==='配偶'?'spouse':siblingTypes.has(r.type)?'sibling':extendedKin.has(r.type)?'kin':null;if(!kind)continue;
   const reverse=parentTypes.has(r.type)||fatherDaughter&&p.sex==='女';
   add({from:reverse?r.with:id,to:reverse?id:r.with,kind,type:r.type,affinal:affinal.has(r.type),private:r.private,knownBy:r.knownBy,source:r.sourceEvent??'catalog'});
  }
  for(const parent of Object.values(p.parents??{}))add({from:parent,to:id,kind:'parent',type:'亲生',source:p.sourceEvent??'catalog',participants:[parent,id]});
 }
 for(const r of Object.values(s.family?.marriages??{}))if((r.since??0)<=s.minute)add({from:r.partners[0],to:r.partners[1],kind:'spouse',type:'配偶',source:r.sourceEvent??r.id,ended:r.status!=='在婚',participants:r.partners,knownBy:r.knownBy,private:r.private});
 for(const r of Object.values(s.family?.adoptions??{}))if(r.minute<=s.minute)add({from:r.parent,to:r.child,kind:'parent',type:r.kind,source:r.id,participants:r.participants,knownBy:r.knownBy,private:r.private});
 graphCache.set(e.world,{relations:relations.key,people:s.family?.people,adoptions:s.family?.adoptions,marriages:s.family?.marriages,created:s.created,edges:rows});return rows;
}
export function familyFactKnown(s,row,viewer='player'){
 if(row.private||row.knownBy)return row.participants?.includes(viewer)||row.knownBy?.includes(viewer)||false;
 if(row.source==='catalog'||row.participants?.includes(viewer))return true;
 if(viewer==='player'&&s.family?.seenByPlayer?.[row.source]!==undefined)return true;
 const memories=viewer==='player'?s.player?.memoryStream:s.npcs?.[viewer]?.memoryStream;
 return (memories??[]).some(m=>!m.private&&m.minute<=s.minute&&[m.sourceEvent,m.rootMemoryId].includes(row.source));
}
export function genealogy(e,s,root,viewer='player',recipient=viewer){
 const edges=familyEdges(e,s).filter(r=>familyFactKnown(s,r,viewer)&&(!(r.private||r.knownBy)||familyFactKnown(s,r,recipient))),ids=new Set([root]);
 for(let changed=true;changed;){changed=false;for(const r of edges)if(ids.has(r.from)||ids.has(r.to))for(const id of [r.from,r.to])if(!ids.has(id)){ids.add(id);changed=true;}}
 const knownEdges=edges.filter(r=>ids.has(r.from)&&ids.has(r.to));
 return {root,people:[...ids].sort().filter(id=>familyPerson(e,s,id)).map(id=>{
  const p=familyPerson(e,s,id),death=Object.values(s.family?.deaths??{}).find(r=>r.person===id);
  const knownDeath=death&&familyFactKnown(s,{source:death.id,participants:[id]},viewer);
  return {id,name:p.name,age:npcAgeAt(e,s,id,knownDeath?death.minute:s.minute),...(knownDeath?{status:'已故',diedAt:death.minute}:{} )};
 }),relations:knownEdges.map(r=>({from:r.from,to:r.to,type:r.type,source:r.source,ended:r.ended??false}))};
}
export function familyOrganizationProjection(e,s,org,root,viewer='player'){
 const tree=genealogy(e,s,root,viewer,'player'),known=new Set(tree.people.map(p=>p.id));
 return {id:org.id,name:`${familyPerson(e,s,root)?.name??'本'}家族`,leader:known.has(org.leader)?org.leader:null,
  members:Object.keys(org.members).filter(id=>known.has(id)),charter:org.charter,
  properties:(org.properties??[]).map(r=>({id:r.id,owner:r.owner===org.id?r.owner:known.has(r.owner)?r.owner:null,owners:Object.fromEntries(Object.entries(r.owners??{}).filter(([id])=>known.has(id)))}))};
}
// Marrying into a household does not erase either person's natal family.
// Adoption changes the legal lineage; biological links remain in genealogy.
export function legalChildren(e,s,id){
 const moved=new Map(Object.values(s.family?.adoptions??{}).sort((a,b)=>a.minute-b.minute).map(r=>[r.child,r]));
 return [...new Set(familyEdges(e,s).filter(r=>r.kind==='parent'&&r.from===id&&(!moved.has(r.to)||moved.get(r.to).parent===id)).map(r=>r.to))];
}
export function familyGroup(e,s,houseId){
 const house=householdDefinition(e,s,houseId);if(!house)return null;
 const moved=new Map(Object.values(s.family?.adoptions??{}).sort((a,b)=>a.minute-b.minute).map(r=>[r.child,r]));
 const members=new Set(house.members.filter(id=>!moved.has(id)||moved.get(id).household===houseId)),edges=familyEdges(e,s).filter(r=>r.kind==='parent'?(!moved.has(r.to)||moved.get(r.to).parent===r.from):['sibling','kin'].includes(r.kind)&&!r.affinal&&!moved.has(r.from)&&!moved.has(r.to));
 if(!members.size)return null;
 for(let changed=true;changed;){changed=false;for(const r of edges)if(members.has(r.from)||members.has(r.to))for(const id of [r.from,r.to])if(!members.has(id)){members.add(id);changed=true;}}
 const adults=[...members].filter(id=>familyAdult(e,s,id)),head=adults.sort((a,b)=>(npcAgeAt(e,s,b)??0)-(npcAgeAt(e,s,a)??0)||a.localeCompare(b))[0]??null;
 const living=[...members].filter(id=>familyLiving(s,id)),properties=Object.entries(s.buildings??{}).filter(([,r])=>{
  const owners=Object.keys(r.owners??{});return r.owner===`family:${houseId}`||owners.length>1&&owners.every(id=>members.has(id));
 }).map(([id,r])=>({id,owner:r.owner,owners:r.owners}));
 return {id:`family:${houseId}`,name:`${familyPerson(e,s,head??house.members[0])?.name??houseId}家族`,source:'family',kind:'家族',seat:house.homeLocation,
  leader:head,leaderTitle:'族长',members:Object.fromEntries(living.map(id=>[id,{position:id===head?'族长':adults.includes(id)?'长老':'成员',joinedAt:null,arrears:0}])),
  properties,treasury:0,charter:{mode:'elders',approval:true,fee:0,dues:0,rules:['共同财产须按组织议决，个人财产仍归本人']}};
}
export function natalFamily(e,s,id){
 const adoption=Object.values(s.family?.adoptions??{}).filter(r=>r.child===id).sort((a,b)=>b.minute-a.minute)[0];
 const house=adoption?.household??e.world.households?.find(h=>h.members.includes(id))?.id??npcHousehold(e,s,id)?.id;
 return house?`family:${house}`:null;
}

export function inheritanceRule(e,s,id,location,code){
 const culture=(s.created?.[id]??e.byId.get(id))?.culture,law=e.rules.law?.family;
 const local=(culture&&law?.rules?.find(r=>r.culture===culture))||(code&&law?.rules?.find(r=>r.code===(code.template??code.id)))||law?.rules?.find(r=>r.polity===(code?.polity??'王国'));
 return {property:'spouse-first',title:'eldest-child',office:'vacant',...local,law:code?.id??null};
}
export function inheritanceCandidates(e,s,id,rule,minute,eligible=()=>true){
 const living=ids=>[...new Set(ids)].filter(x=>x!==id&&familyLiving(s,x)&&eligible(x)&&(s.npcs?.[x]||e.byId.has(x)||s.created?.[x]));
 const children=living(legalChildren(e,s,id)).sort((a,b)=>(npcAgeAt(e,s,b,minute)??-1)-(npcAgeAt(e,s,a,minute)??-1)||a.localeCompare(b));
 const spouses=living(familyEdges(e,s).filter(r=>r.kind==='spouse'&&!r.ended&&(r.from===id||r.to===id)).map(r=>r.from===id?r.to:r.from)).filter(x=>familyAdult(e,s,x,minute)).sort();
 const house=living(npcHousehold(e,s,id)?.members??[]).sort();
 const first=spouses.length?spouses:children.length?children:house;
 return {children,spouses,house,heirs:rule.property==='equal'?(children.length||spouses.length?living([...children,...spouses]).sort():house.slice(0,1)):rule.property==='eldest'?(children.length?children.slice(0,1):first.slice(0,1)):rule.property==='household'?house:rule.property==='children'?(children.length?children:first):first.slice(0,1)};
}
export function guardianCandidates(e,s,ward,from,minute){
 const edges=familyEdges(e,s),parents=edges.filter(r=>r.kind==='parent'&&r.to===ward).map(r=>r.from);
 const kin=edges.filter(r=>['sibling','kin'].includes(r.kind)&&[r.from,r.to].includes(ward)).map(r=>r.from===ward?r.to:r.from);
 return [...new Set([...parents,...kin,...npcHousehold(e,s,ward)?.members??[]])].filter(id=>id!==from&&familyAdult(e,s,id,minute)&&!s.records?.[`transition:${id}`]?.gone).sort((a,b)=>Number(parents.includes(b))-Number(parents.includes(a))||Number(kin.includes(b))-Number(kin.includes(a))||a.localeCompare(b));
}
