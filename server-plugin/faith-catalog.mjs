// Temple identity comes from existing teaching institutions and churches.
// This selector has no actor/state dependency, so account and identity readers
// can share it without persisting another catalog or copying a leader.
export function temples(engine){
 const out=(engine.world.factions??[]).filter(f=>f.kind==='教会').map(f=>({id:f.id,name:f.name,seat:f.contactAnchor,
  deity:engine.world.deities?.find(g=>g.church.name===f.name)?.id??null,teacher:f.leader,source:'faction'}));
 for(const e of engine.rules.training?.institutions??[]){
  if(!e.ritual)continue;
  const id=`temple:${e.institution}:${e.deity??e.profession}`;
  if(out.some(t=>t.id===id))continue;
  out.push({id,name:`${engine.byId.get(e.institution)?.name??e.institution}·${e.deity?engine.byId.get(e.deity)?.church.name:e.church}`,
   seat:e.institution,deity:e.deity??null,teacher:e.teacher,profession:e.profession,rule:e.rule,source:'temple'});
 }
 return out;
}
export function templeById(engine,id){
 const all=temples(engine),direct=all.find(t=>t.id===id||t.name===id);if(direct)return direct;
 const place=engine.world.locations?.find(l=>l.id===id||l.name===id),local=all.filter(t=>t.seat===place?.id);
 return local.length===1?local[0]:undefined;
}
export function placeAncestors(engine,id){
 const out=[];while(id&&!out.includes(id)){out.push(id);id=engine.byId.get(id)?.parent;}return out;
}

// Existing T110 scheduler and K6 transactions execute competition. No clock
// runs without a real conversion between the two local congregations.
export function faithConflictClocks(engine){
 if(!engine.rules.faith?.competition)return [];
 const out=[],churches=temples(engine),settlements=new Set((engine.world.settlementProfiles??[]).map(s=>s.id));
 const territory=t=>placeAncestors(engine,t.seat).find(id=>settlements.has(id))??t.seat;
 for(let a=0;a<churches.length;a++)for(let b=a+1;b<churches.length;b++){
  const x=churches[a],y=churches[b];if(territory(x)!==territory(y))continue;
  const id=`faith:${x.id}:${y.id}`,cost={coins:0,items:{}};
  out.push({id,triggerRecord:`faith_competition:${id}`,source:'rules.faith.competition + current church seats',faction:x.id,rival:y.id,settlement:territory(x),intervalDays:7,probability:1,cycle:'once',
   contact:{location:x.seat},stages:[
    {id:'contest',name:'信众与香火争议',condition:{kind:'record',id:`faith_competition:${id}`,field:'active',equals:true},cost,effects:[{kind:'relation',target:y.id,delta:-5}]},
    {id:'dispute',name:'寺观地盘争端',condition:{kind:'always'},cost,effects:[{kind:'dispute',target:y.id,id:'faith',status:'open'}]},
    {id:'suit',name:'请求地方裁断',condition:{kind:'always'},cost,effects:[{kind:'dispute',target:y.id,id:'faith',status:'escalated'},{kind:'faith_claim',target:y.id}]}
   ],interventions:[{id:'mediate',name:'请双方暂停争议',location:x.seat,minutes:30,stage:'dispute',effect:'pause',cost:{coins:0}}]});
 }
 return out;
}
