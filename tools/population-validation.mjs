import {validateVillageLedger} from '../world/design/w1-village-profiles.mjs';
// Read-only population and household catalogs. Roster entries identify people;
// they never create purse, inventory, service or presence state.
export function validatePopulation(world){
 const errors=[],people=new Map([...(world.npcs??[]),...(world.residents??[])].map(row=>[row.id,row]));
 const places=new Map((world.locations??[]).map(row=>[row.id,row])),cultures=new Set((world.cultures??[]).map(row=>row.id));
 const households=new Map(),membership=new Map(),profiles=new Map();
 const check=(condition,message)=>{if(!condition)errors.push(message);};
 const settlements=new Set((world.settlementProfiles??[]).map(row=>row.id));
 const species=new Set((world.monsters??[]).map(row=>row.id));
 for(const row of people.values()){
  if(row.species!==undefined)check(species.has(row.species),`居民物种不存在：${row.id}/${row.species}`);
  if(row.society!==undefined){
   const profile=world.settlementProfiles?.find(p=>p.id===row.society);
   check(row.settlement===row.society&&profile?.residentIds?.includes(row.id),`居民社会归属与人口册不符：${row.id}`);
   check(species.has(row.species),`社会居民须登记物种：${row.id}`);
  }
 }
 const belongs=(location,settlement)=>{
  const visited=new Set();let parent=places.get(location)?.parent;
  while(parent&&places.has(parent)&&!visited.has(parent)){
   if(parent===settlement)return true;
   if(settlements.has(parent))return false;
   visited.add(parent);parent=places.get(parent).parent;
  }
  return false;
 };
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
  const seeded=row.registrationMode==='seeded-on-demand';
  check(row.registrationMode===undefined||['complete','seeded-on-demand'].includes(row.registrationMode),`人口登记模式无效：${row.id}`);
  check(new Set(row.residentIds).size===row.residentIds.length,`人口册人物重复：${row.id}`);
  if(seeded){
   for(const key of ['registeredPopulation','pendingPopulation','registeredHouseholdCount','pendingHouseholdCount'])check(Number.isInteger(row[key])&&row[key]>=0,`种子人口缺少非负整数：${row.id}/${key}`);
   check(typeof row.populationSeed==='string'&&/^[a-z0-9][a-z0-9_-]*$/.test(row.populationSeed),`种子人口缺少稳定种子：${row.id}`);
   check(row.registeredPopulation+row.pendingPopulation===row.population,`种子人口登记与待生成合计不符：${row.id}`);
   check(row.registeredHouseholdCount+row.pendingHouseholdCount===row.householdCount,`种子户籍登记与待生成合计不符：${row.id}`);
   check(row.pendingPopulation>=row.pendingHouseholdCount,`待生成户数超过待生成人口：${row.id}`);
   check(row.pendingPopulation===0||row.pendingHouseholdCount>0,`待生成人口没有待生成住户：${row.id}`);
  }else{
   check(row.populationSeed===undefined,`完整人口册不得声明待生成种子：${row.id}`);
   check(row.registeredPopulation===undefined||row.registeredPopulation===row.population,`完整人口册登记人数不符：${row.id}`);
   check(row.pendingPopulation===undefined||row.pendingPopulation===0,`完整人口册不得留待生成人口：${row.id}`);
   check(row.registeredHouseholdCount===undefined||row.registeredHouseholdCount===row.householdCount,`完整人口册登记户数不符：${row.id}`);
   check(row.pendingHouseholdCount===undefined||row.pendingHouseholdCount===0,`完整人口册不得留待生成户籍：${row.id}`);
  }
  check(row.residentIds.length===(seeded?row.registeredPopulation:row.population),`人口册人数不符：${row.id}`);
  if(seeded){
   const keys=['children','youngAdults','adults','elders'],ages={children:0,youngAdults:0,adults:0,elders:0};
   for(const id of row.residentIds){const age=people.get(id)?.age;if(Number.isFinite(age))ages[age<18?'children':age<35?'youngAdults':age<60?'adults':'elders']++;}
   check(row.ageStructure&&row.registeredAgeStructure&&row.pendingAgeStructure,`种子人口缺少分层年龄结构：${row.id}`);
   for(const key of keys){
    check(row.registeredAgeStructure?.[key]===ages[key],`已登记年龄结构不符：${row.id}/${key}`);
    check(Number.isInteger(row.pendingAgeStructure?.[key])&&row.pendingAgeStructure[key]>=0,`待生成年龄结构无效：${row.id}/${key}`);
    check(row.ageStructure?.[key]===row.registeredAgeStructure?.[key]+row.pendingAgeStructure?.[key],`种子年龄结构合计不符：${row.id}/${key}`);
   }
   check(keys.reduce((sum,key)=>sum+(row.pendingAgeStructure?.[key]??NaN),0)===row.pendingPopulation,`待生成年龄人数不符：${row.id}`);
  }
  if(row.ageStructure)check(Object.values(row.ageStructure).reduce((sum,value)=>sum+value,0)===row.population,`人口年龄结构合计不符：${row.id}`);
  for(const id of row.buildingIds??[])check(belongs(id,row.id),`聚落建筑归属不符：${row.id}/${id}`);
  if(row.details){const d=row.details;
   if(d.economy?.status==='registered-opening')errors.push(...validateVillageLedger(d,world).map(e=>`${row.id}：${e}`));
   for(const key of ['id','population','householdCount'])check(d[key]===row[key],`聚落档案登记不符：${row.id}/${key}`);
   check(JSON.stringify(d.buildingIds)===JSON.stringify(row.buildingIds)&&JSON.stringify(d.ageStructure)===JSON.stringify(row.ageStructure),`聚落档案建筑或年龄结构不符：${row.id}`);
   const ids=new Set();for(const entry of [...d.problems,...d.rumors,...d.hiddenPlaces]){check(!ids.has(entry.id),`聚落详情编号重复：${entry.id}`);ids.add(entry.id);}
   for(const p of d.problems){check(belongs(p.location,row.id),`地方问题地点不符：${p.id}`);for(const s of p.stakeholders)check(people.get(s.person)?.settlement===row.id,`地方问题当事人不符：${p.id}/${s.person}`);}
   for(const r of d.rumors){check(d.problems.some(p=>p.id===r.sourceProblem),`传闻缺来源问题：${r.id}`);for(const id of [r.source,...r.carriers,...r.witnesses])check(people.get(id)?.settlement===row.id,`传闻来源人物不符：${r.id}/${id}`);}
   for(const id of [...d.governance.coordinators,...d.calendar.festivals.map(f=>f.host),...d.hiddenPlaces.flatMap(h=>h.knownBy)])check(people.get(id)?.settlement===row.id&&people.get(id)?.age>=18,`聚落责任人不符：${row.id}/${id}`);
   for(const id of [d.governance.meetingPlace,...d.calendar.festivals.map(f=>f.location),...d.hiddenPlaces.map(h=>h.location)])check(belongs(id,row.id),`聚落详情地点不符：${row.id}/${id}`);
  }
  const locals=new Set(row.residentIds),homes=[...households.values()].filter(h=>h.settlement===row.id);
  check(homes.length===(seeded?row.registeredHouseholdCount:row.householdCount),`人口册户数不符：${row.id}`);
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
 for(const place of world.locations??[])if(place.access?.mode==='council'){
  const authority=people.get(place.access.authority);
  check(place.access.requiresConsent===true&&authority?.tier==='full'&&authority.age>=18,`议事区缺少成年完整档负责人：${place.id}`);
 }
 return errors;
}
