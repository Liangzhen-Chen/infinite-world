// S2-T1 黑盒验收：读不到就是 null 带 gap，不兜底、不设默认历法（草案 §7 第 5、6 条；卷二十:588）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2t1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as S from './support.mjs';
import { express } from '../../support/express.mjs';
import { copyRepo } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

after(S.cleanup);

test('5. 历法：文化表未建，本人 culture 解析不到历法，各次等待后 now.calendar 都为 null 且 gaps 非空（不设默认历法）', async () => {
  const { world, avatar } = await S.startAt(0);
  for (const m of [0, 1440, 5000]) {
    if (m > 0) await S.advanceBy(world, m);
    const now = S.nowOf(world, avatar);
    assert.equal(now.calendar, null, '文化未建，calendar 应为 null');
    assert.ok(Array.isArray(now.gaps) && now.gaps.length > 0, 'calendar 为 null 时 gaps 应非空');
  }
});

test('6a. 没有化身：now 只给系统时间（minute、day、minuteOfDay 为整数），其余项为 null，gaps 非空', async () => {
  const { world } = await S.freshWorld();
  const now = S.nowOfNoAvatar(world);
  assert.ok(now, '开局菜单应带 now');
  for (const k of ['minute', 'day', 'minuteOfDay']) assert.equal(Number.isInteger(now[k]), true, `${k} 应为整数`);
  for (const k of ['calendar', 'season', 'weather', 'solarTerm']) assert.equal(now[k] ?? null, null, `无化身时 ${k} 应为 null`);
  assert.ok(Array.isArray(now.gaps) && now.gaps.length > 0, '无化身时 gaps 应非空');
});

test('6b. 有化身：天气若为 null 则 gaps 非空；若非 null 则 state 只能是词表 weather 行，数值项为数或 null（为 null 时 gaps 非空，不出现 0 或默认值）；季节若为 null 则 gaps 非空，若非 null 则只能是词表行', async () => {
  // S2-T2 合入后改写（主会话 Q3 甲，门槛不降）：天气本卡已建，原「天气未建 → 必为 null」在合入后必红，改为「null 或词表行」。理由见 docs/卡档案/feat-s2-t2/出题.md。
  const WX_ENTRIES = S.loadJson(join(S.ROOT, 'world/ontology/dimensions/_vocab.json')).families.weather.entries;
  const { world, avatar } = await S.startAt(0);
  const now = S.nowOf(world, avatar);
  const wx = now.weather ?? null;
  if (wx === null) {
    assert.ok(Array.isArray(now.gaps) && now.gaps.length > 0, '天气为 null 时 gaps 应非空');
  } else {
    assert.ok(WX_ENTRIES[wx.state], `weather.state 应为词表 weather 行，实得 ${wx.state}`);
    for (const k of ['precipMm', 'windMps', 'windDirDeg', 'cloud', 'humidity']) {
      assert.ok(wx[k] === null || typeof wx[k] === 'number', `weather.${k} 应为数或 null`);
      if (wx[k] === null) assert.ok(Array.isArray(now.gaps) && now.gaps.length > 0, `weather.${k} 为 null 时 gaps 应非空`);
    }
  }
  if (now.season == null) {
    assert.ok(now.gaps.length > 0, 'season 为 null 时 gaps 应非空');
  } else {
    assert.ok(S.SEASON_ENTRIES[now.season.id], `season.id 应为词表 season 行，实得 ${now.season.id}`);
  }
});

test('6c. 单元无季节方案：夹具（临时副本）把有方案的单元行去掉 seasonScheme，开局后 now.season 为 null 且 gaps 非空，不取默认季', async () => {
  const fx = copyRepo();
  const saveRoot = testTempRoot('s2t1-save-');
  try {
    const placePath = join(fx.repo, S.PLACE_DIM_PATH);
    const doc = JSON.parse(readFileSync(placePath, 'utf8'));
    const withScheme = Object.keys(doc.rows).filter((k) => doc.rows[k].seasonScheme !== undefined);
    assert.ok(withScheme.length > 0, '前提：数据里应有带 seasonScheme 的单元行');
    for (const k of withScheme) delete doc.rows[k].seasonScheme;
    writeUnderTempRoot(fx.root, relative(fx.root, placePath).split(sep).join('/'), JSON.stringify(doc, null, 1));
    const mod = await import(pathToFileURL(join(fx.repo, 'server-plugin', 'index.mjs')).href);
    const world = await mod.init(express.Router(), { saveRoot });
    const { avatar } = await S.chooseOn(world, saveRoot, 0);
    const now = S.nowOf(world, avatar);
    assert.equal(now.season ?? null, null, '单元无季节方案时季节应为 null，不取默认季');
    assert.ok(Array.isArray(now.gaps) && now.gaps.length > 0, '季节未知时 gaps 应非空');
  } finally {
    removeTempRoot(saveRoot);
    removeTempRoot(fx.root);
  }
});
