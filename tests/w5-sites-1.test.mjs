import test from 'node:test';
import assert from 'node:assert/strict';
import {sitesContext,checkCatalog,walkSites,walkElements,checkUpgrade} from './w5-sites-check.mjs';

const ctx=await sitesContext(1);
const BAISHI=new Set(['loc_bs','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban','loc_ms_tanjie']);

test('T113 第一组20处据点逐ID登记历史、物权、机关、资源与时间变化，白石镇所属范围至少15处',()=>{
 checkCatalog(ctx);
 const local=ctx.ids.filter(id=>{const l=ctx.world.locations.find(x=>x.id===id);return BAISHI.has(l.scope)||l.parent==='loc_bs';});
 assert.ok(local.length>=15,local.join(','));
 const society=ctx.ids.filter(id=>/^loc_ms_/.test(ctx.world.locations.find(x=>x.id===id).parent));assert.equal(society.length,2,'两处聚居地附件');
});

test('T113 每处据点沿道路抵达，解机关、入内、调查、有限采集与真相解锁走通；占据者在场不能进入',async()=>{
 await walkSites(ctx);
});

test('T113 火烧木障、寒冻积水可直接解除对应机关',async()=>{
 assert.ok(await walkElements(ctx)>=8);
});

test('T113 本批之前的存档经world_upgrade保留旧变化，新据点可用',async()=>{
 await checkUpgrade(ctx);
});
