// Explicit allow-list: rumor seeds/truth, hidden places, possible solutions and
// future runtime contracts never enter the public catalog or scene prompt.
export function publicSettlement(world,id){
 const p=world.settlementProfiles?.find(p=>p.id===id),d=p?.details;if(!d)return null;
 const name=id=>world.npcs.find(n=>n.id===id)?.name??world.residents?.find(n=>n.id===id)?.name??world.locations.find(l=>l.id===id)?.name??id;
 return {id:p.id,name:d.name,population:p.population,householdCount:p.householdCount,terrain:d.terrain,climate:d.climate,
  industries:[...d.economy.industries],coordination:{people:d.governance.coordinators.map(id=>({id,name:name(id)})),place:d.governance.meetingPlace,meeting:d.governance.meeting,customs:[...d.governance.customs],authority:d.governance.authority},
  issues:d.problems.map(p=>({id:p.id,title:p.title,location:p.location,status:'有待当事人协商；查到资料不代表此刻都在现场',people:p.stakeholders.map(s=>({id:s.person,name:name(s.person),position:s.position}))})),
  market:{days:[...d.calendar.marketDays],location:d.calendar.marketLocation},
  festivals:d.calendar.festivals.map(f=>({name:f.name,month:f.month,day:f.day,location:f.location,practice:f.practice,note:'当地节俗；当天是否举办和谁来参与须向在场者核实。'}))};
}
export function settlementScene(engine,document){
 let location=engine.byId.get(document.state.location);const seen=new Set();
 while(location&&!seen.has(location.id)){seen.add(location.id);const p=publicSettlement(engine.world,location.id);if(p)return `【本地事务】${p.name}：${p.issues.map(i=>i.title).join('；')}。协调处：${engine.byId.get(p.coordination.place)?.name??p.coordination.place}；相关人员须以实际在场为准。`;location=engine.byId.get(location.parent);}
 return '';
}
