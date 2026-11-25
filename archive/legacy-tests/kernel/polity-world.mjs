// 卷八 §4.5 领地持有权测试共用夹具（tests/kernel/polity-title.test.mjs、gen-polity-world.test.mjs）：真实维度表目录拷到仓库外临时目录，只把本用例的组织行、政体行、层级与公库用途条目写进拷贝；
// 地点树取真实 place 表（loc_bs 之下的河湾村 loc_bs_hebu 与它的建筑 bld_bs_boat、同级的 loc_bs_liquan），不在 world/ 里放测试行。
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';

export { ROOT };
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.ok(loadWorld(ROOT).ok);
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
// 真实地点树里的一段（G5b 上格后）：垄渠郡之下是河湾村站点 loc_bs_hebu 与同级的 loc_bs_liquan（二者旧父是白石镇 loc_bs，上格时按坐标改挂所在郡，
// 原父记在作者字段 originSite，"属于某镇"不靠 parent 包含表达），河湾村之下是建筑 bld_bs_boat。统治边测试要的"祖先、站点、站点下的建筑、同级"四处取这几行。
export const SITE = 'loc_bs_hebu';
export const BUILDING = 'bld_bs_boat';
export const SIBLING = 'loc_bs_liquan';
export const PARENT = 'loc_county_xichui_longqu';

/**
 * 加载夹具世界。
 * @param {Record<string, any>} orgRows org 表的行 @param {Record<string, any>} polityRows polity 表的行
 */
export function loadPolityWorld(orgRows, polityRows) {
  const tmp = testTempRoot('polity-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'org.json', JSON.stringify({ ...JSON.parse(realText('org.json')), rows: orgRows }));
    writeUnderTempRoot(tmp, 'polity.json', JSON.stringify({ ...JSON.parse(realText('polity.json')), rows: polityRows }));
    const v = JSON.parse(realText('_vocab.json'));
    const f = v.families;
    f.purpose.entries = { ...f.purpose.entries, purpose_test: { ...f.purpose.entries.purpose_unmaterialized } };
    f.politykind.entries = { ...f.politykind.entries, pkind_test: { hyper: null } };
    f.succession.entries = { ...f.succession.entries, succession_test: { orderSource: 'succsrc_none', heirSource: null, contestSkill: null, poolRX: '1 == 1', cost: [] } };
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    const r = loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
    assert.equal(r.ok, true, r.text);
    return r;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** 一条测试组织行（挂种类条目 template 所指模板类别行，其余必填维度取最小合法值）。 */
export const orgRow = (orgKind, template, seat, parent, polity, extra = {}) => ({
  basis: 'test', extends: template, orgKind, polity, seat, parent, offices: [], headOffice: null, treasury: ['purpose_test'], ...extra,
});

/** 一条测试政体行；holderEligibility 写 rx 文本，landless 取假。 */
export const polityRow = (holderEligibility, extra = {}) => ({
  basis: 'test', polityKind: 'pkind_test', taxRules: [], successionDefault: 'succession_test', holderEligibility, councilOffices: [],
  domainLimitBase: 1, landless: false, mobileSeat: false, casus: [], influenceSources: [], ...extra,
});
