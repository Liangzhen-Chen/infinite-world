import test from 'node:test';
import assert from 'node:assert/strict';
import {sitesContext,checkCatalog,walkSites,walkElements,checkUpgrade} from './w5-sites-check.mjs';

const ctx=await sitesContext(2);

test('T114 第二组20处据点逐ID登记，均有实际道路，历史与占据关系互相指引',()=>{
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

test('T114 每处据点沿道路抵达，解机关、入内、调查、有限采集与真相解锁走通；物权另属的资源不能拿',async()=>{
 await walkSites(ctx);
});

test('T114 火烧木障、寒冻积水可直接解除对应机关',async()=>{
 assert.ok(await walkElements(ctx)>=5);
});

test('T114 本批之前的存档经world_upgrade保留旧变化，新据点可用',async()=>{
 await checkUpgrade(ctx);
});
