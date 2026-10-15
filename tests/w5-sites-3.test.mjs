import test from 'node:test';
import assert from 'node:assert/strict';
import {sitesContext,checkCatalog,walkSites,walkElements,checkUpgrade} from './w5-sites-check.mjs';

const ctx=await sitesContext(3);

test('T115 第三组20处据点逐ID登记，均有实际道路',()=>{
 checkCatalog(ctx);
 const ids=new Set(ctx.world.locations.map(l=>l.id));
 for(const s of ctx.sites){
  assert.ok(s.links?.some(id=>ids.has(id)),`${s.id} 关联到已登记地点`);
  for(const r of ctx.world.routes.filter(r=>r.to===s.id))assert.ok(ids.has(r.from)&&r.lengthKm>0,`${s.id} 路线起点真实`);
 }
 // Each investigable chain names the next site in a clue or truth.
 const linked=ctx.sites.filter(s=>s.links.some(id=>ctx.ids.includes(id)||/^site_w5_|^loc_wild_/.test(id)));
 assert.ok(linked.length>=12,'多数据点与其他据点形成可调查联系');
 assert.equal(ctx.ids.filter(id=>/^loc_ms_/.test(ctx.world.locations.find(x=>x.id===id).parent)).length,2,'两处聚居地附件');
});

test('T115 每处据点沿道路抵达，解机关、入内、调查、有限采集与真相解锁走通；物权另属的资源不能拿',async()=>{
 await walkSites(ctx);
});

test('T115 火烧木障、寒冻积水可直接解除对应机关',async()=>{
 assert.ok(await walkElements(ctx)>=5);
});

test('T115 本批之前的存档经world_upgrade保留旧变化，新据点可用',async()=>{
 await checkUpgrade(ctx);
});

test('T115 三组据点ID互不重复，60个本批ID逐个具备完整据点参数',async()=>{
 const ids=[];for(const n of [1,2,3])ids.push(...(await import(`../world/design/w5-sites-${n}.mjs`)).sites.map(s=>s.id));
 assert.equal(new Set(ids).size,ids.length);assert.ok(ids.length>=60);
 for(const id of ids){const s=ctx.world.locations.find(l=>l.id===id)?.site;
  assert.ok(s?.mechanisms.length&&s.clues.length>=2&&s.resources.length&&s.truths.length&&s.history?.length>=3&&s.changes?.length,`${id} 合格`);}
});
