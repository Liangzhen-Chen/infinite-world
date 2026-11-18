// 校验器自己的测试数据：造的最小词表、单位表与一张虚构表 gadget（不是世界内容，不对应任何真实维度表）。
// 每个用例取一份新拷贝改坏一处，正反两极各跑一次。
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function fixture() {
  return {
    units: { units: [{ id: 'kg', dimension: 'mass', si: 1 }, { id: 'count', dimension: 'count', si: 1 }] },
    vocab: {
      families: {
        class: { closed: false, prefix: 'cls_', entries: { cls_base: {}, cls_tool: {}, cls_heavy_tool: { broader: 'cls_tool' } } },
        component: { closed: false, prefix: 'cmp_', entries: { cmp_sharp: { table: 'gadget', requires: ['mass'], enables: ['use'] } } },
        grade: { closed: false, prefix: 'grd_', entries: { grd_a: {}, grd_b: {} } },
        vstatus: { closed: true, prefix: 'vst_', entries: { vst_ok: {} } },
        aggregate: { closed: true, prefix: 'agx_', entries: { agx_count: {}, agx_exists: {} } },
        relation: { closed: false, prefix: 'rel_', entries: { rel_part: {} } },
      },
    },
    gadget: {
      kind: 'gadget', namespace: 'core', version: 1,
      entity: { idPrefix: ['gad_'], classPrefix: 'cls_', singletonIds: [], instanceTable: null },
      behaviors: ['use'],
      dimensions: {
        mass: { type: 'number', unit: 'kg', domain: [0, 100], precision: 2, required: 'always', onUnknown: 'error', modifiable: false, source: 'test', owner: 'test' },
        grade: { type: 'enum', vocab: 'grade', required: 'byClass:cls_tool', onUnknown: 'error', modifiable: false, source: 'test', owner: 'test' },
        parts: { type: 'set', of: { type: 'ref', kind: 'gadget' }, domain: { maxSize: 3 }, required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' },
        weights: { type: 'map', key: { type: 'ref', vocab: 'grade' }, value: { type: 'number', unit: 'kg', domain: [0, 10], precision: 1 }, required: 'never', onUnknown: 'error', modifiable: false, source: 'test', owner: 'test' },
        rule: { type: 'rx', nullable: true, required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' },
        spec: { type: 'struct', fields: { low: { type: 'integer', unit: 'count', domain: [0, 9] }, high: { type: 'integer', unit: 'count', domain: [0, 9] } }, required: 'never', onUnknown: 'gap', modifiable: false, source: 'test', owner: 'test' },
        size: { type: 'number', unit: 'kg', domain: [0, 100], precision: 1, required: 'ifPresent:spec', onUnknown: 'gap', modifiable: true, stacking: 'none', bounds: [0, 100], source: 'test', owner: 'test' },
      },
      precedenceGroups: { default: ['cls_heavy_tool', 'cls_tool'] },
      classes: {
        cls_base: { abstract: true, mass: 1, basis: 'b' },
        cls_tool: { extends: 'cls_base', 'mass*': 2, grade: 'grd_a', basis: 'b' },
        cls_heavy_tool: { extends: 'cls_tool', 'mass~': 3.5, basis: 'b' },
      },
      rows: {
        gad_box: { mass: 5, parts: [], basis: 'b', status: 'vst_ok' },
        gad_hammer: { classes: ['cls_heavy_tool'], weights: { grd_a: 1, grd_b: null }, rule: 'mass > 2 && grade == grd_a', parts: ['gad_box'], basis: 'b', status: 'vst_ok' },
      },
      generated: {},
    },
  };
}

export const OPTIONS = Object.freeze({ namespaces: ['core'], displaySet: [], ns: [{ ns: 'story', shape: '<字段>', type: 'number' }], limits: { extendsMaxDepth: 4, rxMaxDepth: 16 } });

export function sourcesOf(f) {
  return {
    units: JSON.stringify(f.units),
    vocab: JSON.stringify(f.vocab),
    tables: [{ file: 'gadget.json', text: JSON.stringify(f.gadget) }],
  };
}

// 造的维度表目录（tests/kernel/dims）配真实规则表时，真实规则表里按真实词表族登记的表（如卷六资源种类表按 resource 族取行键）在造的词表下必然报未登记族；
// 所以用造的目录加载时，规则目录只放真实的内核常数表一行（同 rules.test.mjs 的 withRules 做法），在仓库外临时目录里，用完即删。
export function withKernelConstantsRules(fn) {
  const tmpRoot = testTempRoot('kc-rules-');
  try {
    const real = (f) => readFileSync(join(REPO, 'world/rules', f), 'utf8');
    const row = JSON.parse(real('registry.json')).rows.find((r) => r.code === 'kernelConstants');
    writeUnderTempRoot(tmpRoot, 'registry.json', JSON.stringify({ rows: [row] }));
    writeUnderTempRoot(tmpRoot, row.file, real(row.file));
    return fn(tmpRoot);
  } finally { rmSync(tmpRoot, { recursive: true, force: true }); }
}
