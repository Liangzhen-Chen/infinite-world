// Read-only population and household catalogs. Roster entries identify people;
// they never create purse, inventory, service or presence state.
export function validatePopulation(world){
 const errors=[],people=new Map([...(world.npcs??[]),...(world.residents??[])].map(row=>[row.id,row]));
 const places=new Map((world.locations??[]).map(row=>[row.id,row])),cultures=new Set((world.cultures??[]).map(row=>row.id));
 const households=new Map(),membership=new Map(),profiles=new Map();
 const check=(condition,message)=>{if(!condition)errors.push(message);};
 for(const row of world.residents??[]){
  check(row.tier==='roster',`名册档级必须是roster：${row.id}`);
  check(row.flags?.minor===(row.age<18)&&!(row.age<18&&row.flags?.romanceable),`名册年龄与标记冲突：${row.id}`);
  check(places.has(row.location)&&places.has(row.home?.location)&&places.has(row.settlement),`名册地点不存在：${row.id}`);
  check(cultures.has(row.culture),`名册文化不存在：${row.id}`);
  for(const id of row.household??[])check(people.has(id)&&id!==row.id,`名册同户人物不存在或指向自己：${row.id}/${id}`);
  for(const conflict of row.socialProfile?.conflicts??[])check(people.has(conflict.with)&&conflict.with!==row.id,`名册矛盾对象不存在或指向自己：${row.id}/${conflict.with}`);
 }
 for(const row of world.households??[]){
  check(!households.has(row.id),`户籍编号重复：${row.id}`);households.set(row.id,row);
  check(places.has(row.settlement)&&places.has(row.homeLocation),`户籍住处不存在：${row.id}`);
  for(const id of row.members){
   check(people.has(id),`户籍成员不存在：${row.id}/${id}`);
   check(!membership.has(id),`人物重复入户：${id}`);membership.set(id,row.id);
  }
 }
 for(const row of world.settlementProfiles??[]){
  check(!profiles.has(row.id),`聚落人口册重复：${row.id}`);profiles.set(row.id,row);
  check(places.has(row.id)&&(!row.parent||places.has(row.parent)),`人口册聚落不存在：${row.id}`);
  check(row.residentIds.length===row.population,`人口册人数不符：${row.id}`);
  if(row.ageStructure)check(Object.values(row.ageStructure).reduce((sum,value)=>sum+value,0)===row.population,`人口年龄结构合计不符：${row.id}`);
  for(const id of row.buildingIds??[])check(places.has(id)&&places.get(id).parent===row.id,`聚落建筑归属不符：${row.id}/${id}`);
  const locals=new Set(row.residentIds),homes=[...households.values()].filter(h=>h.settlement===row.id);
  check(homes.length===row.householdCount,`人口册户数不符：${row.id}`);
  const registered=new Set(homes.flatMap(h=>h.members));
  check(registered.size===locals.size&&[...registered].every(id=>locals.has(id)),`常住名单与户籍不一致：${row.id}`);
  for(const id of [...row.residentIds,...row.visitors??[],...row.commuters??[]])check(people.has(id),`人口册人物不存在：${row.id}/${id}`);
  for(const id of [...row.visitors??[],...row.commuters??[]])check(!locals.has(id),`访客或通勤者重复计入常住：${row.id}/${id}`);
  for(const relation of row.kinship??[]){
   check(people.has(relation.parent)&&people.has(relation.child),`亲属不存在：${relation.parent}/${relation.child}`);
   check(people.get(relation.parent)?.age-people.get(relation.child)?.age>=15,`亲子年龄不成立：${relation.parent}/${relation.child}`);
  }
  for(const external of row.externalRelatives??[])check(locals.has(external.relatedTo),`外居亲属关联者不在本村：${row.id}/${external.relatedTo}`);
 }
 for(const row of [...world.npcs??[],...world.residents??[]])if(row.householdId){
  const h=households.get(row.householdId);
  check(h?.members.includes(row.id)&&h?.settlement===row.settlement,`人物与户籍归属不一致：${row.id}`);
  check(profiles.has(row.settlement),`人物所属人口册不存在：${row.id}`);
  check((row.household??[]).every(id=>h?.members.includes(id)),`同户关系跨户：${row.id}`);
 }
 for(const place of world.locations??[])if(place.access?.mode==='private'){
  check(place.access.requiresConsent===true&&place.access.residents?.length>0,`私宅缺少进入许可或住户：${place.id}`);
  for(const id of place.access.residents??[])check(people.has(id)&&people.get(id)?.home?.location===place.id,`私宅住户与住处不符：${place.id}/${id}`);
 }
 return errors;
}
