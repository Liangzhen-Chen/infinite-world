import {copyWorldFixture} from './fixtures/w1-depth-editions.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import{tmpRoot}from'../tools/tmp-root.mjs';import path from 'node:path';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';import {validateWorld} from '../tools/validate-world.mjs';
import {villageProfileCandidates} from '../world/design/w1-village-profiles.mjs';
import {approvedProfiles,validateDraft,contextFor} from '../tools/w1-village-profiles-content.mjs';
import {depthBatches} from '../tools/npc-depth-content.mjs';
import {publishVillages} from '../tools/publish-w1-villages.mjs';import {publicSettlement,settlementScene} from '../server-plugin/settlement-profile.mjs';
import {catalogDefinition} from '../server-plugin/catalog.mjs';import {WorldEngine} from '../server-plugin/engine.mjs';
import {MemoryIndex} from '../server-plugin/retrieval.mjs';
const world=await loadRuntimeWorld(),profiles=await approvedProfiles({world}),withProfiles={...world,settlementProfiles:world.settlementProfiles.map(p=>{const d=profiles.find(d=>d.id===p.id);return d?{...p,details:d,pendingProfileSections:d.pendingProfileSections}:p;})};
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
test('四村问题立场都有原当事人依据，经济/官职登记且传播缺口保留',()=>{
 assert.equal(profiles.length,4);assert.equal(profiles.flatMap(p=>p.problems).length,20);assert.equal(profiles.flatMap(p=>p.rumors).length,40);
 for(const p of profiles){assert.deepEqual(validateDraft(p,p,world).errors,[]);assert.equal(p.economy.status,'registered-opening');assert.equal(p.economy.publicStock.closing,null);assert.equal(p.outsiderRatio,null);assert.deepEqual(new Set(p.rumors.map(r=>r.truth)),new Set(['true','partial','false']));}
 assert.equal(validateWorld(withProfiles,{stage:'release'}).ok,true);
 const bad=structuredClone(profiles[0]);bad.problems[0].stakeholders[0].person='npc_sb_zhangluo';assert.ok(validateDraft(bad,bad,world).errors.some(e=>e.includes('当事人')));
 const broken=structuredClone(withProfiles);broken.settlementProfiles.find(p=>p.details).details.rumors[0].source='npc_missing';assert.ok(validateWorld(broken).errors.some(e=>e.includes('传闻来源')));
});
test('公开目录和现场提示可取得当地问题，但不泄漏真伪、解法、隐秘处或伪造节日到场',()=>{
 const engine=new WorldEngine(withProfiles),doc=engine.initialFromLegacy(seed,'settlement-profile'),before=structuredClone(doc);
 for(const p of profiles){const view=catalogDefinition(engine,doc,{entity:p.id,kind:'location'}).settlement;assert.equal(view.issues.length,5);assert.deepEqual(view.market.days,[5,15,25]);assert.equal(view.issues[0].people[0].id,p.problems[0].stakeholders[0].person);
  const text=JSON.stringify(view);for(const secret of [p.hiddenPlaces[0].name,p.hiddenPlaces[0].detail,p.rumors[0].fact,p.problems[0].options[0].proposal])assert.equal(text.includes(secret),false);
  for(const key of ['truth','hiddenPlaces','rumors','options','carriers','sourceProblem'])assert.equal(text.includes('"'+key+'"'),false);
  assert.match(view.festivals[0].note,/是否举办/);view.issues[0].people[0].position='改动';assert.notEqual(p.problems[0].stakeholders[0].position,'改动');
 }
 assert.deepEqual(doc,before);doc.state.location='bld_yp_home_01';assert.match(settlementScene(engine,doc),/轮水册漏行/);assert.match(engine.scene(doc,'村里谁在协调'),/【本地事务】/);assert.ok(engine.scene(doc,'村里谁在协调').length<=6000);
 doc.state.location='loc_hw';assert.equal(settlementScene(engine,doc),'');assert.equal(publicSettlement(withProfiles,'loc_hw'),null);
});
test('重复发布的审核上下文不引用自身档案，任意改稿不能复用通过状态',async()=>{
 for(const p of profiles)assert.deepEqual(contextFor(p,withProfiles),contextFor(p,world));
 assert.deepEqual(await approvedProfiles({world:withProfiles}),profiles);
 const tmp=await fs.mkdtemp(path.join(tmpRoot(),'village-profile-review-'));
 try{await fs.cp('world/drafts/w1/village-ledgers',tmp,{recursive:true});const file=path.join(tmp,'loc_bs_yupo.json'),r=JSON.parse(await fs.readFile(file,'utf8'));r.draft.rumors[0].truth='false';await fs.writeFile(file,JSON.stringify(r));await assert.rejects(approvedProfiles({world,root:tmp}),/审查后内容已改变/);}finally{await fs.rm(tmp,{recursive:true,force:true});}
});

test('四村自然中文搜索命中公开数值、治理、问题和日历，作者秘密不进入索引',()=>{
 const engine=new WorldEngine(withProfiles),doc=engine.createCharacter(seed,{},'settlement-search'),before=structuredClone(doc),index=new MemoryIndex({entities:engine.entities});
 index.syncSettlements(withProfiles,doc);
 for(const p of profiles){
  for(const [question,key]of [['公共燕麦田一年产量多少','production_0'],['粮仓期初库存多少','opening'],['粮约税率多少','tax'],['和邻村的粮食贸易怎么结算','trade_0'],['运输价格系数多少','price'],['期初贸易收付多少','tradeLedger'],['村里头人执法者谁能搜查','governance'],[p.problems[0].title,`issue_${p.problems[0].id}`],['每月什么时候赶集','market'],[p.calendar.festivals[0].name,'festival_0']]){
   const hits=index.search(`${p.name}${question}`);assert.ok(hits.some(row=>row.id===`settlement_${p.id}_${key}`),`${p.name}${question}`);
  }
  const views=JSON.stringify([...index.documents.values()].filter(row=>row.scope===p.id));
  for(const rumor of p.rumors){assert.equal(views.includes(rumor.fact),false);assert.equal(views.includes(rumor.claim),false);assert.equal(views.includes(rumor.id),false);}
  for(const hidden of p.hiddenPlaces){assert.equal(views.includes(hidden.detail),false);assert.equal(views.includes(hidden.name),false);}
  for(const issue of p.problems)for(const option of issue.options)assert.equal(views.includes(option.proposal),false);
  assert.ok(p.problems.every(problem=>problem.options.length>=2));
 }
 assert.deepEqual(doc,before);const count=index.tokenizations;index.syncSettlements(withProfiles,doc);assert.equal(index.tokenizations,count);
 const revised=structuredClone(withProfiles);for(const p of revised.settlementProfiles.filter(row=>profiles.some(p=>p.id===row.id))){
  p.details.economy.production[0].truth='私有真相标记';p.details.governance.appointment.privateMemo='私有任命备注';p.details.governance.permissions.hidden='私有搜查解法';
 }
 index.syncSettlements(revised,doc);assert.equal(JSON.stringify([...index.documents.values()]).includes('私有'),false);
 doc.state.settlements.loc_bs_yupo.food=7;index.syncSettlements(withProfiles,doc);assert.match(index.documents.get('settlement_loc_bs_yupo_current').text,/粮食7粮单位/);
 index.syncSettlements({...withProfiles,settlementProfiles:[]},doc);assert.equal([...index.documents.keys()].some(id=>id.startsWith('settlement_')),false);
});
test('聚落档案出版保留人物补充，重复零写入，篡改 details 被拒绝',async()=>{
 const parent=await fs.mkdtemp(path.join(tmpRoot(),'village-profile-publish-')),tmp=await copyWorldFixture(parent);
 try{const first=await publishVillages({root:tmp,publish:true});assert.deepEqual(first.amendedProfileIds,profiles.map(p=>p.id));assert.deepEqual([...first.amendedNpcIds].sort(),Object.values(depthBatches).flatMap(b=>b.depthRows.map(r=>r.id)).sort());
  const next=await loadRuntimeWorld(tmp);assert.deepEqual(next.npcs,world.npcs);assert.deepEqual(next.items,world.items);assert.deepEqual(next.households,world.households);assert.deepEqual(next.locations,world.locations);
  assert.deepEqual((await publishVillages({root:tmp,publish:true})).changed,[]);
  const file=path.join(tmp,'geo/settlements.json'),rows=JSON.parse(await fs.readFile(file,'utf8'));rows.find(p=>p.details).details.governance.authority='任意征税';await fs.writeFile(file,JSON.stringify(rows));await assert.rejects(publishVillages({root:tmp}),/聚落补充冲突/);
 }finally{await fs.rm(parent,{recursive:true,force:true});}
});
