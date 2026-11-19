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
