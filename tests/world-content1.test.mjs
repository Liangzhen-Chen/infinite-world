import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {settlementGovernment,groupView,placeView} from '../server-plugin/entity-view.mjs';
import {ensureHoldings,aliveHoldings} from '../server-plugin/holdings.mjs';
import {buildBatch,applySpiritRules} from '../world/design/monster-society-3.mjs';
import {mergeMonsterSociety3,withoutMonsterSociety3} from '../tools/publish-monster-society-3.mjs';

const world=await loadWorld();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const rows=[
 {settlement:'loc_ms_huixi',org:'faction_ms_huixi',head:'npc_ms_hx_yiheng',next:'npc_ms_hx_qiaosui',store:'site_ms_hx_store'},
 {settlement:'loc_ms_huipeng',org:'faction_ms_huipeng',head:'npc_ms_gs_shenge',next:'npc_ms_gs_zheqian',store:'site_ms_gs_store'},
];

test('已有认岸议与明签会承担聚落治理，首长来自组织现任职位，撤任后留空',()=>{
 for(const row of rows){
  const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'content1-government'),s=document.state;
  const before=structuredClone(s);
  assert.equal(settlementGovernment(engine,s,row.settlement).head.value,row.head);
  assert.equal(groupView(engine,s,row.org).leader.value,row.head);
  assert.deepEqual(s,before,'派生读取不能创建任命或变更公库');
  const draft=engine.primitiveDraft(document);ensureHoldings(draft,engine);
  assert.ok(aliveHoldings(draft,{kind:'holds_office',holder:row.head}).some(h=>h.subject===`office_org:${row.org}:leader`));
  s.records[`organization:${row.org}`]={category:'organization',id:row.org,leader:row.next,members:{[row.next]:{position:'成员'}}};
  assert.equal(settlementGovernment(engine,s,row.settlement).head.value,row.next,'替换首领后不仍指向旧首领');
  s.records[`organization:${row.org}`].leader=null;
  assert.equal(settlementGovernment(engine,s,row.settlement).head.value,null,'明确空缺不回退原任');
 }
});

test('组织公共储备与公秤有明确所有者，看管者及公共通行边界保留',()=>{
 const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'content1-property');
 for(const row of rows){
  const store=engine.byId.get(row.store);
  assert.equal(placeView(engine,document.state,row.store).owner.value,row.org);
  assert.equal(store.site.owner,row.org);
  assert.equal(store.site.manager,row.head,'看管者没有被组织编号替代');
  assert.match(store.authoredFacts.ownershipBasis,/world\/lore\/factions\.json/);
  assert.deepEqual(store.inventory,{},'接线不预发公共库存或个人物品');
 }
 const scale=engine.byId.get('site_ms_gs_scale');
 assert.equal(scale.owner,'faction_ms_huipeng');assert.equal(scale.access.mode,'public');
 assert.equal(engine.byId.get('site_ms_hx_council').access.authority,'npc_ms_hx_qiaosui');
 assert.equal(engine.byId.get('bld_ms_hx_01').owner,null,'公共储备不牵连私人住宅');
 assert.equal(engine.byId.get('bld_ms_gs_01').owner,null);
});

test('内容发布重放保留更正后的公物归属，发布前视图不遗留已移除组织的公库引用',()=>{
 const batch=buildBatch(),next=mergeMonsterSociety3(world,batch);
 for(const row of rows){
  assert.equal(next.locations.find(l=>l.id===row.store).owner,row.org);
  assert.equal(applySpiritRules(world.rules).questSources.funds[row.settlement],row.org);
 }
 const before=withoutMonsterSociety3(world,batch);
 for(const row of rows){
  assert.equal(before.rules.questSources.funds[row.settlement],undefined);
  assert.equal(before.factions.some(f=>f.id===row.org),false);
 }
 assert.equal(before.rules.questSources.funds.loc_ms_tanjie,'faction_ms_tanjie','只移除本批引用');
});
