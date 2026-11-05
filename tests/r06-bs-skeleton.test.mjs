import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv';
import {loadWorld} from '../tools/load-world.mjs';
import {baishiSkeleton} from '../world/design/w1-baishi-skeleton.mjs';
import {settlementHead} from '../world/design/a3-world-governance.mjs';
import {prepare,validateSkeleton,integrate,approved,root} from '../tools/w1-baishi.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
const world=await loadWorld(),original=JSON.parse(await fs.readFile(`${root}/original-contacts.json`,'utf8'));
// 严哲的现行世界数据 = R06 原始联系人 + 经审批管线发布的 s504-silk-1 蚕丝备货（W2b）；除此之外不得多出钱物。
const silk=JSON.parse(await fs.readFile('world/drafts/s504-silk/candidate.json','utf8')),silkStock=silk.entries.find(e=>e.id==='sb-yanzhe-silk-stock').row;
const yanApproved={...original.yan,inventory:{...original.yan.inventory,...silkStock.inventory}};
const base={...world,npcs:world.npcs.map(p=>p.id===original.yan.id?original.yan:p),locations:world.locations.map(l=>l.id==='loc_bs'?original.town:l.id==='bld_bs_shrine'?original.shrine:l)};
const bones=baishiSkeleton(base),ids=new Set(bones.residents.map(p=>p.id)),locationIds=new Set(bones.locations.map(l=>l.id));
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
test('正式目录只核对白石本批，306登记加694seed与90加210户核平',async()=>{
 const {b}=await approved(world);validateSkeleton(b);
 const registered=[...world.npcs,...world.residents].filter(p=>p.settlement==='loc_bs');
 assert.equal(registered.length,b.profile.residentIds.length);assert.equal(world.npcs.find(p=>p.id===b.yan.id)?.tier,'full');
 assert.deepEqual(new Set(registered.map(p=>p.id)),new Set(b.profile.residentIds));
 assert.equal(registered.filter(p=>ids.has(p.id)).length,b.residents.length);
 assert.equal(world.households.filter(h=>h.settlement==='loc_bs').length,90);
 // T90 skeleton facts remain frozen; only the separately approved A3 authority
 // patch changes governance. Compare every other field without weakening it.
 const p=world.settlementProfiles.find(p=>p.id==='loc_bs');
 assert.deepEqual({...p,details:{...p.details,governance:b.profile.details.governance}},b.profile);
 assert.deepEqual(p.details.governance,{...b.profile.details.governance,head:settlementHead.head,enforcers:settlementHead.enforcers,authority:settlementHead.authority});
 assert.equal(p.population,p.registeredPopulation+p.pendingPopulation);assert.equal(p.householdCount,p.registeredHouseholdCount+p.pendingHouseholdCount);
 assert.equal(p.pendingPopulation,146*3+64*4);assert.equal(p.pendingHouseholdCount,146+64);
 const pending=Object.values(p.pendingAgeStructure).reduce((n,x)=>n+x,0);assert.equal(pending,p.pendingPopulation);
 assert.equal(new WorldEngine(world).byId.has('npc_bs_seed_001'),false);
});
test('户籍和年龄从实有名册计算，住宅成员相互对应，后续99人只登记提升计划',()=>{
 const p=world.settlementProfiles.find(p=>p.id==='loc_bs'),registered=[...world.npcs,...world.residents].filter(p=>p.settlement==='loc_bs'),people=new Map(registered.map(p=>[p.id,p]));
 const ages={children:0,youngAdults:0,adults:0,elders:0};
 for(const x of registered)ages[x.age<18?'children':x.age<35?'youngAdults':x.age<60?'adults':'elders']++;
 assert.deepEqual(p.registeredAgeStructure,ages);
 for(const h of world.households.filter(h=>h.settlement==='loc_bs')){
  const home=world.locations.find(l=>l.id===h.homeLocation);assert.equal(home.purpose,'私宅');assert.deepEqual(home.access.residents,h.members);
  for(const id of h.members){const x=people.get(id);assert.equal(x.householdId,h.id);assert.equal(x.home.location,home.id);assert.deepEqual(x.household,h.members.filter(i=>i!==id));assert.equal(x.flags.minor,x.age<18);if(x.age<18)assert.equal(x.flags.romanceable,false);}
 }
 for(const k of p.kinship)assert.ok(people.get(k.parent).age-people.get(k.child).age>=15);
 const planned=bones.promotionGroups.flatMap(g=>g.ids);assert.equal(planned.length,99);assert.equal(new Set(planned).size,99);assert.ok(planned.every(id=>people.has(id)));
 const invalid=structuredClone(bones);invalid.residents[0].age=1;assert.throws(()=>validateSkeleton(invalid));
});
test('六街区与18处行业公共建筑及逐户住宅均可寻路，原官道与归途殿保持',()=>{
 const e=new WorldEngine(world),old=new WorldEngine(base);
 assert.equal(bones.locations.filter(l=>l.id.startsWith('loc_')).length,6);
 assert.equal(bones.locations.filter(l=>l.purpose!=='私宅'&&l.id.startsWith('bld_')).length+1,18);
 for(const l of world.locations.filter(l=>locationIds.has(l.id)))assert.ok(e.route('loc_bs',l.id,'walk',540,'t90').minutes>0,l.id);
 assert.equal(e.route('loc_hw','loc_bs','walk',540,'t90').minutes,old.route('loc_hw','loc_bs','walk',540,'t90').minutes);
 assert.deepEqual(world.locations.find(l=>l.id==='bld_bs_shrine'),original.shrine);
 // K5：原手写窑位改由设备派生，编号、类别、收费不变。
 const station=s=>({id:s.id,kind:s.kind,fee:s.fee,access:s.access});
 // 原始联系人里的手写名单要从文件读：引擎构造会把传入地点的名单换成派生视图。
 const authored=JSON.parse(readFileSync(`${root}/original-contacts.json`,'utf8')).town.workstations;
 assert.deepEqual(world.locations.find(l=>l.id==='loc_bs').workstations.map(station),authored.map(station));
 assert.ok(e.route('loc_bs_dongxue','bld_bs_shrine','walk',540,'t90').minutes>0);
});
test('玩家实际走到街区和前厅，私宅无许可拒绝；严辙在场许可可入户且不转移库存',async()=>{
 const e=new WorldEngine(world);let doc=e.createCharacter(legacy,{},'t90-entry');doc.state.location='loc_bs';doc.state.minute=540;
 doc.state.npcs[original.yan.id].location='loc_bs';doc.state.npcs[original.yan.id].activity='核对货单';delete doc.state.npcs[original.yan.id].scheduleTravel;
 const run=async(tool,args,id)=>{const out=await e.reduce(doc,{tool,args,eventId:id});doc=applyPatches(doc,out.patches);return out.result;};
 await run('world_move',{destination:'loc_bs_zhanxi'},'street');await run('world_move',{destination:'bld_bs_guild'},'front');assert.equal(doc.state.location,'bld_bs_guild');
 await run('world_move',{destination:'loc_bs'},'back');doc.state.npcs[original.yan.id].location='loc_bs';doc.state.npcs[original.yan.id].activity='核对货单';delete doc.state.npcs[original.yan.id].scheduleTravel;
 const home=bones.households[0].homeLocation,before=structuredClone(doc);
 await assert.rejects(run('world_move',{destination:home},'no-consent'),/成年住户/);assert.deepEqual(doc,before);
 const permission=(await run('world_promise',{operation:'grant_access',promisor:original.yan.id,location:home,minutes:60,content:'独自进屋看共用起居间，不取用物品'},'consent')).authorization;
 const inventory=structuredClone(doc.state.npcs[original.yan.id].inventory),playerInventory=structuredClone(doc.state.inventory);
 await run('world_move',{destination:home,authorization:permission},'enter');assert.equal(doc.state.location,home);assert.deepEqual(doc.state.npcs[original.yan.id].inventory,inventory);assert.deepEqual(doc.state.inventory,playerInventory);
});
test('聚落经济引用实有商货和小窑，职责与争议有来源和边界，登记不凭空发钱物',()=>{
 const p=world.settlementProfiles.find(p=>p.id==='loc_bs'),d=p.details,y=world.npcs.find(p=>p.id===original.yan.id);
 assert.deepEqual([silk.status,silkStock.npc],['published',original.yan.id]);assert.deepEqual(y.inventory,yanApproved.inventory);assert.equal(y.coins,original.yan.coins);assert.deepEqual(y.schedule,original.yan.schedule);assert.equal(y.occupation,'商旅行会代理');
 assert.ok(d.economy.tradePartners.includes('loc_hw'));assert.match(d.economy.reason,/5铜/);assert.match(d.economy.reason,/每五天/);assert.equal(d.economy.production,null);assert.equal(d.economy.publicStock,null);
 assert.ok(d.governance.customs.some(s=>s.includes('户籍')));assert.ok(d.governance.customs.some(s=>s.includes('巡更')));assert.ok(d.governance.customs.some(s=>s.includes('行会')));
 assert.equal(d.problems.length,6);for(const p of d.problems){assert.equal(p.status,'unresolved');assert.ok(p.options.length>=2);assert.ok(p.stakeholders.every(s=>[...world.npcs,...world.residents].some(x=>x.id===s.person&&x.age>=18)));}
 for(const r of d.rumors)assert.equal(r.propagation,'pending-event');
 assert.deepEqual(d.calendar.marketDays,world.rules.calendar.marketDays);
 for(const l of bones.locations){assert.deepEqual(l.inventory,{});assert.deepEqual(l.workstations??[],[]);/* K5：工位由设备派生，骨架不带设备即没有工位 */}
 const e=new WorldEngine(world),doc=e.createCharacter(legacy,{},'t90-no-grants');for(const p of bones.residents){if(world.npcs.some(n=>n.id===p.id))assert.ok(doc.state.npcs[p.id]);else assert.equal(doc.state.npcs[p.id],undefined);}
});
test('提升名册保留同ID和原事实，升级不覆盖已运行的现金库存关系记忆，重复升级无差异',()=>{
 const old={...world,npcs:world.npcs.map(p=>p.id===original.yan.id?yanApproved:p)},person=bones.residents.find(p=>p.age>=18);
 const full={...person,tier:'full',coins:12,inventory:{},trust:0,affection:0,skills:[],services:[],notes:person.currentConcern};
 const proposed={...world,npcs:[...world.npcs,full],residents:world.residents.filter(p=>p.id!==full.id)};
 const {world:next}=compatibleWorld(old,proposed);assert.equal(next.residents.some(p=>p.id===full.id),false);assert.equal(next.npcs.filter(p=>p.id===full.id).length,1);
 const republished=integrate(next,bones);assert.equal(republished.residents.some(p=>p.id===full.id),false);assert.deepEqual(republished.npcs.find(p=>p.id===full.id),full);
 const e=new WorldEngine(old),doc=e.createCharacter(legacy,{},'t90-upgrade'),id=original.yan.id;
 Object.assign(doc.state.npcs[id],{coins:77,trust:23,affection:8,inventory:{item_clay:0},location:'loc_hw'});doc.state.npcs[id].memoryStream=[{id:'keep-t90',content:'已经实际交谈过的私有记忆'}];
 const saved=structuredClone(doc.state.npcs[id]);const update=planWorldUpgrade(doc,old,next,{worldHash:'t90-promotion',eventId:'t90-up'}),after=applyPatches(doc,update.patches);
 assert.deepEqual(after.state.npcs[id],saved);assert.equal(after.state.npcs[person.id].coins,12);assert.equal(after.state.npcs[person.id].location,person.location);
 for(const key of ['name','age','householdId','household','occupation','traits','home','currentConcern','visibleFeature'])assert.deepEqual(next.npcs.find(p=>p.id===person.id)[key],person[key]);
 after.state.npcs[person.id].coins=4;after.state.npcs[person.id].trust=9;after.state.npcs[person.id].memoryStream=[{id:'new-memory',content:'提升后形成的记忆'}];const replay=planWorldUpgrade(after,next,next,{worldHash:'t90-promotion',eventId:'t90-replay'});
 assert.deepEqual(applyPatches(after,replay.patches).state.npcs,after.state.npcs);
});
test('重复整合不改旧人物；正式白石条目使用现有schema有效',async()=>{
 const next=integrate(world,bones);assert.deepEqual(integrate(next,bones),next);
 for(const p of world.npcs)if(p.id!==original.yan.id)assert.deepEqual(next.npcs.find(n=>n.id===p.id),p);
 const s=JSON.parse(await fs.readFile('schemas/world.schema.json','utf8')),ajv=new Ajv({strict:true,allowUnionTypes:true,allErrors:true});
 for(const [kind,rows] of [['resident',world.residents.filter(p=>ids.has(p.id))],['household',world.households.filter(h=>h.settlement==='loc_bs')],['settlementProfile',[world.settlementProfiles.find(p=>p.id==='loc_bs')]],['location',world.locations.filter(l=>locationIds.has(l.id)||l.id==='loc_bs')]]){
  const validate=ajv.compile({$ref:`#/$defs/${kind}`,$defs:s.$defs});for(const row of rows)assert.ok(validate(row),`${row.id}: ${JSON.stringify(validate.errors)}`);
 }
});
