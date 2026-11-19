// 块 6 补值卡 G：材料 wearResistance 取真实权威值（李白 11-19 21:0x ①(b)）。
// 刻度：score = 22 + 38 × ln(H/61) / ln(1274.9/61)，H 为 MPa 的压入硬度；锚点竹 61 MPa（Janka 6100 N ÷ 100 mm²）=22，
// 熟铁 1274.9 MPa（130 HB × 9.80665）=60。期望值按这式与出处原始值手算成字面量。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rows = JSON.parse(fs.readFileSync(new URL('../../world/ontology/dimensions/material.json', import.meta.url), 'utf8')).rows;

test('锚点：竹 22、熟铁 60 仍是卷三甲 §4.2.5 例值', () => {
  assert.equal(rows.mat_bamboo.wearResistance, 22);
  assert.equal(rows.mat_wrought_iron.wearResistance, 60);
});

// 手算：ln(20.9) = 3.0397，斜率 38/3.0397 = 12.501；例：红橡 57 MPa → 22 + 12.501×ln(57/61) = 21.15 → 21.2
const expected = {
  mat_oak: 21.2, // 57 MPa（Janka 5700 N）
  mat_elm: 15.7, // 36.9 MPa（3690 N）
  mat_wicker: 7.5, // 19.2 MPa（1920 N）
  mat_cast_iron: 68.7, // 260 HB = 2549.7 MPa
  mat_copper: 48.8, // 520 MPa
  mat_gold: 36.1, // 189 MPa
  mat_silver: 37.2, // 206 MPa
  mat_lead: 16.6, // 39.65 MPa
};

for (const [id, v] of Object.entries(expected)) {
  test(`${id} wearResistance 按出处原始值换算 = ${v}，带暂定标记与出处`, () => {
    assert.equal(rows[id].wearResistance, v);
    const g = rows[id].cellGrades.wearResistance;
    assert.equal(g.grade, 'designed');
    assert.ok(g.basis.startsWith('暂定，待试玩标定：'));
    assert.equal(g.citation, null); // designed 级出处写进 basis（material.test.mjs 体例）
    assert.ok(g.basis.includes('出处 '));
  });
}

// 块 6 补值卡 H：布、绳、皮、纸的 wearResistance 是类内相对顺序的设定数（非硬度换算）；真实寿命放物品 wearPerUse。
test('布绳皮纸 wearResistance：类内顺序 皮 > 绳 > 布 > 毡 > 纸，标设定数待调、非硬度换算', () => {
  const v = (id) => rows[id].wearResistance;
  assert.ok(v('mat_leather') > v('mat_hemp_cord') && v('mat_hemp_cord') > v('mat_linen_cloth'));
  assert.ok(v('mat_linen_cloth') > v('mat_cotton_cloth') && v('mat_cotton_cloth') > v('mat_felt') && v('mat_felt') > v('mat_paper'));
  for (const id of ['mat_leather', 'mat_rawhide', 'mat_sheepskin', 'mat_hemp_cord', 'mat_linen_cloth', 'mat_cotton_cloth', 'mat_sheep_wool', 'mat_felt', 'mat_paper']) {
    const g = rows[id].cellGrades.wearResistance;
    assert.equal(g.grade, 'designed');
    assert.ok(g.basis.startsWith('设定数待调（非硬度换算）'), id);
  }
});

// 块 6 补值卡 H：新增材料行，手算期望（Feedipedia Main analysis；碳水差减 = 1 − 粗蛋白 − 脂肪 − 灰分，含纤维）。
const grains = {
  mat_oat: { carb: 0.806, fiber: 0.139, energy: 19.5, moisture: 0.121 }, // 1−.110−.054−.030；DM 87.9%
  mat_barley: { carb: 0.836, fiber: 0.052, energy: 18.4, moisture: 0.129 }, // 1−.118−.020−.026；DM 87.1%
  mat_rye: { carb: 0.863, fiber: 0.022, energy: 18.0, moisture: 0.134 }, // 1−.103−.014−.020；DM 86.6%
};
for (const [id, e] of Object.entries(grains)) {
  test(`${id} 谷物行：成分取 Feedipedia 并带出处`, () => {
    const r = rows[id];
    assert.equal(r.carbContent, e.carb);
    assert.equal(r.fiberContent, e.fiber);
    assert.equal(r.energyDensity, e.energy);
    assert.equal(r.moisture, e.moisture);
    for (const k of ['carbContent', 'fiberContent', 'energyDensity', 'moisture']) {
      assert.equal(r.cellGrades[k].grade, 'measured');
      assert.ok(r.cellGrades[k].citation.includes('feedipedia.org/node/'), `${id}.${k}`);
    }
  });
}

test('亚麻、麻布、绵羊毛：极限氧只有二手转述不入库，易燃度取同类行的设定值（designed，basis 写参照行与"待核"）', () => {
  const ref = { mat_flax_fiber: 'mat_hemp_fiber', mat_linen_cloth: 'mat_cotton_cloth', mat_sheep_wool: 'mat_goat_hair' };
  for (const [id, base] of Object.entries(ref)) {
    assert.equal(rows[id].flammability, rows[base].flammability, id);
    const g = rows[id].cellGrades.flammability;
    assert.equal(g.grade, 'designed');
    assert.ok(g.basis.startsWith(`设：参照 ${base}`) && g.basis.includes('待核'), id);
  }
});

test('谷物行照抄小麦的格：basis 只写"参照 mat_wheat"，不冒用卷三甲例 1 全集表出处', () => {
  for (const id of ['mat_oat', 'mat_barley', 'mat_rye']) {
    for (const k of ['decomposePoint', 'density.solid', 'flammability', 'nutrients.nutr_salt']) {
      const g = rows[id].cellGrades[k];
      assert.equal(g.grade, 'designed');
      assert.ok(g.basis.startsWith('设：参照 mat_wheat'), `${id}.${k}`);
    }
  }
});
