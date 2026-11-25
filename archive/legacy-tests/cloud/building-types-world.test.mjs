// 长测，推进世界，本机常规测试不跑，腾讯云块验收（G18）跑；主会话 11-24 已定。
// 从 tests/kernel/building-types.test.mjs 挪来：真实世界整段补缺约两分钟。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { convertGeo, fillPlace } from '../../tools/convert-geo-g5b.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
const WORLD = join(dirname(fileURLToPath(import.meta.url)), '../../world');
const out = convertGeo(join(WORLD, 'geo'));

// 期望按改挂前的旧数据（locations.json 里这 19 栋的 parent 是 site_ms_ 住区行，住区的 parent 是营地站点）逐栋列成字面量：[私宅 id, 原住区 id, 营地站点 id]。
const HOMES = [
  ['bld_ms_gs_01', 'loc_site_ms_gs_tents', 'loc_ms_huipeng'], ['bld_ms_gs_02', 'loc_site_ms_gs_tents', 'loc_ms_huipeng'], ['bld_ms_gs_03', 'loc_site_ms_gs_carts', 'loc_ms_huipeng'],
  ['bld_ms_hx_01', 'loc_site_ms_hx_water', 'loc_ms_huixi'], ['bld_ms_hx_02', 'loc_site_ms_hx_water', 'loc_ms_huixi'], ['bld_ms_hx_03', 'loc_site_ms_hx_land', 'loc_ms_huixi'], ['bld_ms_hx_04', 'loc_site_ms_hx_land', 'loc_ms_huixi'],
  ['bld_ms_ll_home_01', 'loc_site_ms_ll_tents', 'loc_ms_lielu'], ['bld_ms_ll_home_02', 'loc_site_ms_ll_huts', 'loc_ms_lielu'], ['bld_ms_ll_home_03', 'loc_site_ms_ll_rocks', 'loc_ms_lielu'],
  ['bld_ms_td_home_01', 'loc_site_ms_td_tai', 'loc_ms_taideng'], ['bld_ms_td_home_02', 'loc_site_ms_td_qing', 'loc_ms_taideng'], ['bld_ms_td_home_03', 'loc_site_ms_td_li', 'loc_ms_taideng'],
  ['bld_ms_tj_home_01', 'loc_site_ms_tj_yan', 'loc_ms_tanjie'], ['bld_ms_tj_home_02', 'loc_site_ms_tj_ding', 'loc_ms_tanjie'], ['bld_ms_tj_home_03', 'loc_site_ms_tj_li', 'loc_ms_tanjie'],
  ['bld_ms_yg_home_01', 'loc_site_ms_yg_crown', 'loc_ms_yugen'], ['bld_ms_yg_home_02', 'loc_site_ms_yg_stone', 'loc_ms_yugen'], ['bld_ms_yg_home_03', 'loc_site_ms_yg_sett', 'loc_ms_yugen'],
];

test('19 栋住区下的私宅都落了位：真实世界整段补缺（约两分钟）后每栋 anchor、facing 都有（作者行或生成偏离行），不在补缺缺口里', { timeout: 600000 }, () => {
  const { doc, deferred } = fillPlace(out, () => {});
  for (const [home, quarter, camp] of HOMES) {
    const row = { ...doc.rows[home], ...(doc.generated[home] ?? {}) };
    assert.equal(deferred.some((d) => d.id === home && /layout|anchor|facing/.test(d.reason)), false, `${home} has no layout gap`);
    assert.equal(row.parent, camp, home);
    assert.equal(row.originSite, quarter, home);
    assert.ok(row.anchor !== undefined && typeof row.anchor.x === 'number' && typeof row.anchor.y === 'number', `${home} has an anchor`);
    assert.ok(Number.isInteger(row.facing), `${home} has a facing`);
  }
});
