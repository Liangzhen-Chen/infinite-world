// T142（C6）九省纲要：按本批省、郡、节点与势力 ID 核对归属、邻接与统治方；不写死全世界的地点、势力或人物总数。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planWorldUpgrade,compatibleWorld} from '../server-plugin/world-upgrade.mjs';
import {regionOf,rulerOf,terrainBiomes,validateRegions} from '../server-plugin/regions.mjs';
import {mapView} from '../server-plugin/ui-map.mjs';
import {catalogDefinition} from '../server-plugin/catalog.mjs';
import {publicLoreEntries} from '../server-plugin/lore.mjs';
import {MemoryIndex} from '../server-plugin/retrieval.mjs';
import {buildBatch,provinces,counties,nodes,factions,cultures} from '../world/design/t142-provinces.mjs';
import {withoutT142} from '../tools/publish-t142-provinces.mjs';

const formal=await loadWorld(),batch=buildBatch(),engine=new WorldEngine(formal);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const region=id=>formal.regions.find(r=>r.id===id);
const CORE=['loc_hw','loc_bs','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban','loc_ms_tanjie','loc_ms_taideng','loc_ms_yugen','loc_ms_lielu','site_copper_ridge','site_basalt_steps'];

test('T142 正式发布九省、各省郡数不等合计25–40郡，每省每郡有地形群落、产业、统治、邻里和三到五名关键人物',()=>{
 for(const key of ['regions','locations','routes','cultures','factions','factionPeople'])for(const row of batch[key])
  assert.deepEqual(formal[key].find(r=>r.id===row.id),row,`${key}/${row.id}`);
 const ps=provinces.map(p=>region(p.id)),cs=counties.map(c=>region(c.id));
 assert.equal(ps.length,9);assert.ok(cs.length>=25&&cs.length<=40,String(cs.length));
 assert.ok(new Set(ps.map(p=>p.counties.length)).size>=3,'各省郡数应有多有少');
 for(const p of ps){assert.equal(p.category,'province');for(const id of p.counties)assert.equal(region(id).province,p.id);}
 for(const r of [...ps,...cs]){
  assert.ok(r.keyPeople.length>=3&&r.keyPeople.length<=5,r.id);assert.ok(r.industry.length>0&&r.terrain&&r.climate,r.id);
  // K8 reads biomes: they are exactly the K1 terrain vocabulary applied to the terrain words.
  assert.deepEqual(r.biomes,terrainBiomes(r.terrain),r.id);assert.ok(r.biomes.length>0,r.id);
  if(r.category==='county'){assert.ok(r.ruler.title&&r.ruler.polity&&r.population,r.id);assert.ok(r.ties.length>0,r.id);for(const t of r.ties)assert.ok(formal.regions.some(x=>x.id===t.with),r.id);}
 }
 assert.deepEqual(validateRegions(formal),[]);
});

test('T142 至少三个非人统治区各有文化与势力，并与人类政体有具体的通行、贸易、朝贡或敌对关系',()=>{
 const nonHuman=counties.map(c=>region(c.id)).filter(c=>c.control!=='human');
 const polities=new Map();for(const c of nonHuman)(polities.get(c.ruler.polity)??polities.set(c.ruler.polity,[]).get(c.ruler.polity)).push(c);
 assert.ok(polities.size>=3,[...polities.keys()].join());
 for(const [polity,rows] of polities){
  const faction=formal.factions.find(f=>f.id===rows[0].ruler.faction);assert.ok(faction,polity);
  assert.ok(formal.cultures.some(c=>c.id===faction.culture),polity);
  const ties=rows.flatMap(c=>c.ties).filter(t=>region(t.with)?.control==='human');
  assert.ok(ties.some(t=>['通行','贸易','朝贡','敌对','议和','互不进入','共治'].includes(t.kind)&&t.terms.length>8),polity);
 }
 // 新文化与核心区的非人聚居地呼应：木精联邑 ↔ 榆根里，赭牙部盟 ↔ 裂炉营，猎林共席 ↔ 苔灯坞。
 const rel=(f,peer)=>formal.factions.find(x=>x.id===f).relations.some(r=>r.faction===peer);
 assert.ok(rel('faction_far_lignum','faction_ms_yugen'));assert.ok(rel('faction_far_orcmoot','faction_ms_lielu'));assert.ok(rel('faction_far_scentmoot','faction_ms_taideng'));
 assert.equal(formal.cultures.find(c=>c.id==='culture_far_lignum').witness,'npc_ms_yg_jieyin');
 assert.equal(formal.factions.find(f=>f.id==='faction_scentkin').resources.memberCount,48,'砾耳交证群保留为四十八人的地方组织');
 assert.equal(formal.factions.find(f=>f.id==='faction_starpact').resources.memberCount,7,'沉星守窝群保留小群体');
});

test('T142 核心区挂到垄渠郡等已有郡下，原有地点内容与层级不变；统治不被默认的人类官府覆写',()=>{
 for(const id of CORE)assert.equal(regionOf(formal,id).county.id,'county_xichui_longqu',id);
 assert.equal(regionOf(formal,'loc_yandu').county.id,'county_xichui_xiadu');assert.equal(regionOf(formal,'loc_capital').county.id,'county_zhonglu_wangji');
 assert.equal(regionOf(formal,'site_deep_star_bowl').county.id,'county_wushan_guanxue');assert.equal(regionOf(formal,'site_peat_islets').county.id,'county_feicui_shuqiao');
 const before=withoutT142(formal);
 for(const row of before.locations)assert.deepEqual(formal.locations.find(r=>r.id===row.id),row,row.id);
 for(const id of ['loc_hw','loc_bs_yupo'])assert.equal(formal.locations.find(r=>r.id===id).mapHierarchy[1].name,'已知地区片区');
 assert.equal(rulerOf(formal,'loc_far_duanqi').polity,'赭牙部盟');assert.equal(rulerOf(formal,'loc_far_jijie').polity,'杉根联邑');assert.equal(rulerOf(formal,'loc_far_xiushi').polity,'砾耳兽裔');
 // 联络地点不是首府：非人势力的联络地点不作任何郡的治所。
 for(const f of factions){assert.ok(!formal.regions.some(r=>r.seat.location===f.contactAnchor),f.id);assert.equal(formal.locations.find(l=>l.id===f.contactAnchor).farNode,'border_market');}
 const broken=structuredClone(formal);const zheya=broken.regions.find(r=>r.id==='county_hanlu_zheya');zheya.ruler={title:'王国郡守',polity:'王国'};
 assert.ok(validateRegions(broken).some(e=>e.includes('county_hanlu_zheya')));
 const lawed=structuredClone(formal);lawed.rules.law.codes[0].locations.push('loc_far_duanqi');
 assert.ok(validateRegions(lawed).some(e=>e.includes('人类法典辖区落在非人统治郡')));
});

test('T142 地图按省郡分组并标明非人统治；目录与检索能识别各省各郡',()=>{
 const doc=engine.createCharacter(seed,{},'t142-map');
 doc.state.discoveries={...doc.state.discoveries,loc_far_duanqi:{source:'亲历',minute:0}};
 const view=mapView(engine,doc),duanqi=view.locations.find(r=>r.id==='loc_far_duanqi'),home=view.locations.find(r=>r.id===doc.state.location);
 assert.deepEqual(duanqi.hierarchy.slice(1,3).map(r=>r.name),['寒炉山地','赭牙谷']);
 assert.deepEqual(home.hierarchy.slice(1,3).map(r=>r.name),['西陲河谷','垄渠郡']);
 const zheya=view.regions.find(r=>r.id==='county_hanlu_zheya');assert.equal(zheya.control,'nonhuman');assert.equal(zheya.ruler,'赭牙部盟');
 assert.equal(view.regions.filter(r=>r.level==='省').length,9);
 const list=catalogDefinition(engine,doc,{kind:'region'});assert.equal(list.count,provinces.length+counties.length);
 const shan=catalogDefinition(engine,doc,{entity:'杉根联邑',kind:'region'});assert.equal(shan.control,'nonhuman');assert.equal(shan.ruler.polity,'杉根联邑');assert.equal(shan.keyPeople.length,3);
 const place=catalogDefinition(engine,doc,{entity:'嗅石集',kind:'location'});assert.equal(place.region.county,'砾耳猎林郡');assert.equal(place.region.polity,'砾耳兽裔');
 assert.equal(engine.resolve('赭牙谷'),'county_hanlu_zheya');assert.equal(engine.resolve('雾杉高地'),'prov_wushan');
 const index=new MemoryIndex({entities:engine.entities,resolver:engine.resolver});
 for(const row of publicLoreEntries(formal))index.upsert({id:`lore_${row.id}`,text:`${row.name}：${row.description}`,source:'公开世界设定',entities:[row.id,...row.references??[]],keywords:row.aliases??[],salience:2});
 assert.ok(index.search('兽人占的谷在哪里，赭牙谷归谁管').some(r=>r.id==='lore_county_hanlu_zheya'));
 assert.ok(index.search('季界亭 木精 入林').some(r=>r.id==='lore_county_wushan_shanyi'||r.id==='lore_faction_far_lignum'));
});

test('T142 远程干道：时长按指南速度，山口与高地冬季封路，无天气时旧路线最短路径不变',()=>{
 const summer=90*1440,winter=270*1440;
 // Nominal speeds (guide 4.2) are checked without weather; weather only slows or closes a road.
 const calm=new WorldEngine({...formal,rules:{...formal.rules,weather:undefined}}),days=(from,to,mode)=>calm.route(from,to,mode,summer,'t142').movingMinutes/480;
 assert.deepEqual(engine.route('loc_bs','loc_far_tongji','cart',summer,'t142').edges,['route_far_bs_tongji']);
 for(const [from,to,mode,expected]of[['loc_bs','loc_far_tongji','cart',3],['loc_far_tongji','loc_far_xuedeng','walk',5],['loc_yandu','loc_far_shuqiao','walk',2],['loc_capital','loc_far_zhufeng','walk',4],['loc_far_zhufeng','loc_far_luyu','walk',3]])
  assert.ok(Math.abs(days(from,to,mode)-expected)<=expected*.15,`${from}→${to} ${days(from,to,mode)}日`);
 assert.deepEqual(calm.route('loc_bs','loc_capital','walk',summer,'t142').edges,['route_bs_capital'],'无天气影响时仍走原有直达官道');
 assert.throws(()=>engine.route('loc_far_tongji','loc_far_xuedeng','walk',winter,'t142'),/没有当前季节可通行的路线/);
 assert.throws(()=>engine.route('loc_capital','loc_far_jijie','walk',winter,'t142'),/没有当前季节可通行的路线/);
 for(const n of nodes)assert.ok(formal.routes.some(r=>r.from===n.id||r.to===n.id),n.id);
});

test('T142 world_upgrade：旧存档升级后读到九省，原有变化保留；新版本丢失地区时保留旧地区',()=>{
 const old=withoutT142(formal);assert.equal(old.regions,undefined);
 const oldEngine=new WorldEngine(old);let doc=oldEngine.createCharacter(seed,{},'t142-upgrade');
 const villager=Object.keys(doc.state.npcs)[0];doc.state.npcs[villager].coins=777;doc.state.player.coins=321;
 doc.state.records.t142_marker={category:'note',text:'地区变化保留'};
 const upgrade=planWorldUpgrade(doc,old,formal,{worldHash:'t142',eventId:'t142-upgrade'}),next=applyPatches(doc,upgrade.patches);
 assert.equal(next.state.npcs[villager].coins,777);assert.equal(next.state.player.coins,321);assert.deepEqual(next.state.records.t142_marker,doc.state.records.t142_marker);
 for(const p of batch.factionPeople)assert.equal(next.state.npcs[p.id],undefined,'名册首领不实例化为居民');
 const upgraded=new WorldEngine(formal);assert.equal(upgraded.resolve('赭牙谷'),'county_hanlu_zheya');
 const dropped=structuredClone(formal);dropped.regions=dropped.regions.filter(r=>r.id!=='county_hanlu_heilu');
 const {world,retained}=compatibleWorld(formal,dropped);assert.ok(world.regions.some(r=>r.id==='county_hanlu_heilu'));assert.ok(retained.some(r=>r.id==='county_hanlu_heilu'));
 assert.equal(validateWorld(formal,{stage:'release'}).ok,true);
});

test('T142 两种新文化各有十条原创谚语，名册首领不伪造坐标',()=>{
 for(const c of cultures){const row=formal.cultures.find(x=>x.id===c.id);assert.equal(new Set(row.prose.proverbs).size,10);assert.ok(formal.npcs.some(n=>n.id===row.witness));}
 for(const p of batch.factionPeople){const row=formal.factionPeople.find(x=>x.id===p.id);assert.equal(row.location,null);assert.equal(row.detailLevel,'roster');}
});
