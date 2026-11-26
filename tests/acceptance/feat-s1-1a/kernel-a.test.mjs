// S1-1 卡 A（L0 底座与黑户）黑盒验收。出题方：Claude Haiku 5.5（API），标识 haiku-api-test-s1a。
// 依据：卷二:121（实体行键带 idPrefix）、卷二:128（state.created[id].props 为偏离行）、卷二:131（偏离行覆盖实体行）、
// 卷二:484（Fact = {known, applicable, value, ...}）、卷二:509（stateMemo(state, engine, key, build, inputs)）、
// 卷二:541（事务内写入与拒写处置）、docs/gemini/kickoff-1125.md:64/:90/:91。
// 新约定（主会话 11-23 裁定）：写只经 writeScope(engine, state, (tx) => ...) 作用域；writePath/createEntity 显式收 tx（放最后）。
// 1p 对齐（卷二:535–536，主会话 11-26 裁定）：readPath(state, path)、writePath(state, path, value, tx)、
// createEntity(state, id, kind, props, tx)；路径只经 engine.P 构造，不再手写数组路径。
// 不写死任何实体 id、维度名：全部从 world/ontology/dimensions 真实表读取。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

import { init } from '../../../server-plugin/index.mjs';
import { kindOfEntity, readPath, writePath, createEntity } from '../../../server-plugin/kernel/storage.mjs';
import { writeScope } from '../../../server-plugin/kernel/transaction.mjs';
import { dim } from '../../../server-plugin/kernel/dimensions.mjs';
import { stateMemo, invalidateTop } from '../../../server-plugin/kernel/memo.mjs';
import { buildRegistry } from '../../../server-plugin/rules/load/registry.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIM_DIR = join(ROOT, 'world/ontology/dimensions');
const KERNEL_DIR = join(ROOT, 'server-plugin/kernel');

function loadTables() {
  return readdirSync(DIM_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(readFileSync(join(DIM_DIR, f), 'utf8')));
}

async function bootEnv() {
  const booted = await init();
  assert.ok(booted && booted.engine && booted.state, 'init() 应返回 {engine, state}');
  return { engine: booted.engine, state: booted.state };
}

function prefixOf(table) {
  const p = table.entity && table.entity.idPrefix;
  assert.ok(Array.isArray(p) && p.length > 0, `表 ${table.kind} 缺 entity.idPrefix`);
  return p[0];
}

// 找一条真实的 ref 维度：持有表 holder 的 dimensions[dimName] 指向另一真实实体表 target，
// 且 target 有一个非派生的数值维度 numDim（用于验证偏离行覆盖）。
function findRefPair(tables) {
  for (const holder of tables) {
    for (const [dimName, d] of Object.entries(holder.dimensions ?? {})) {
      if (d.type !== 'ref' || typeof d.kind !== 'string' || d.derived) continue;
      const target = tables.find((t) => t.kind === d.kind);
      if (!target || !target.entity || !Array.isArray(target.entity.idPrefix) || target.entity.idPrefix.length === 0) continue;
      const numEntry = Object.entries(target.dimensions ?? {}).find(
        ([, nd]) => nd.type === 'number' && !nd.derived && (!Array.isArray(nd.domain) || nd.domain.length === 2),
      );
      if (numEntry) return { holder, dimName, target, numName: numEntry[0], numDef: numEntry[1] };
    }
  }
  throw new Error('真实维度表里找不到可用的 ref 维度对（测试前提不成立）');
}

function midValue(numDef) {
  if (Array.isArray(numDef.domain)) {
    const [lo, hi] = numDef.domain;
    return lo + (hi - lo) / 2;
  }
  return 3;
}

// ---- 1 ----
test('真实实体行 id 经 kindOfEntity 认出其所在表的 kind', async () => {
  const tables = loadTables();
  const table = tables.find((t) => t.rows && Object.keys(t.rows).length > 0);
  assert.ok(table, '真实维度表里应有带实体行的表');
  const rowId = Object.keys(table.rows)[0];
  const { engine, state } = await bootEnv();
  assert.equal(kindOfEntity(engine, state, rowId), table.kind);
});

// ---- 2 ----
test('createEntity 用真实前缀新建 A、B；ref 写回；readPath 读回相等；dim 读到偏离行写入值', async () => {
  const tables = loadTables();
  const pair = findRefPair(tables);
  const { engine, state } = await bootEnv();
  const { P } = engine;

  const idA = `${prefixOf(pair.target)}s1a_probe_a`;
  const idB = `${prefixOf(pair.holder)}s1a_probe_b`;
  const value = midValue(pair.numDef);
  const refPath = P.created_props(idB, pair.dimName);

  writeScope(engine, state, (tx) => {
    createEntity(state, idA, pair.target.kind, { [pair.numName]: value }, tx);
    createEntity(state, idB, pair.holder.kind, {}, tx);
    writePath(state, refPath, idA, tx);
  });

  assert.equal(kindOfEntity(engine, state, idA), pair.target.kind);
  assert.equal(kindOfEntity(engine, state, idB), pair.holder.kind);
  assert.equal(readPath(state, refPath), idA);

  const fact = dim(engine, state, pair.target.kind, idA, pair.numName);
  assert.equal(fact.value, value);
});

// ---- 3 ----
test('未知 id、空串、非字符串：kindOfEntity 抛；未知 id 的 code 为 E-DIM-REF-MISSING', async () => {
  const { engine, state } = await bootEnv();
  assert.throws(
    () => kindOfEntity(engine, state, 'zzz_no_such_entity_s1a'),
    (err) => /** @type {any} */ (err) && /** @type {any} */ (err).code === 'E-DIM-REF-MISSING',
  );
  assert.throws(() => kindOfEntity(engine, state, ''));
  // 故意传错类型的负例：先标 unknown 再强转为 string（any 被 E-TSC-ESCAPE-ANY 禁用）
  assert.throws(() => kindOfEntity(engine, state, /** @type {string} */ (/** @type {unknown} */ (12345))));
  assert.throws(() => kindOfEntity(engine, state, /** @type {string} */ (/** @type {unknown} */ (null))));
});

// ---- 4 ----
test('createEntity 三种拒收（均在作用域内）：未登记 kind、前缀不符、id 重复', async () => {
  const tables = loadTables();
  const table = tables.find((t) => t.rows && Object.keys(t.rows).length > 0);
  const prefix = prefixOf(table);
  const { engine, state } = await bootEnv();

  assert.throws(() => writeScope(engine, state, (tx) => {
    createEntity(state, `${prefix}s1a_unreg`, 'zz_unregistered_kind_s1a', {}, tx);
  }));

  // 前缀不符：用另一张真实表的前缀拼 id，但声明为 table.kind
  const other = tables.find((t) => t !== table && t.entity && Array.isArray(t.entity.idPrefix) && t.entity.idPrefix.length > 0);
  assert.ok(other, '需要另一张真实表以构造前缀不符的 id');
  assert.throws(() => writeScope(engine, state, (tx) => {
    createEntity(state, `${prefixOf(other)}s1a_mismatch`, table.kind, {}, tx);
  }));

  const dupId = `${prefix}s1a_dup`;
  writeScope(engine, state, (tx) => {
    createEntity(state, dupId, table.kind, {}, tx);
  });
  assert.throws(() => writeScope(engine, state, (tx) => {
    createEntity(state, dupId, table.kind, {}, tx);
  }));
});

// ---- 5 ----
test('writePath 写指向不存在实体的 ref 抛（在作用域内）', async () => {
  const pair = findRefPair(loadTables());
  const { engine, state } = await bootEnv();
  const { P } = engine;
  const idB = `${prefixOf(pair.holder)}s1a_probe_dangling`;
  writeScope(engine, state, (tx) => {
    createEntity(state, idB, pair.holder.kind, {}, tx);
  });
  const missing = `${prefixOf(pair.target)}s1a_does_not_exist`;
  assert.throws(() => writeScope(engine, state, (tx) => {
    writePath(state, P.created_props(idB, pair.dimName), missing, tx);
  }));
});

// ---- 6 ----
test('stateMemo 切片：invalidateTop(X) 后只有依赖 X 的格重算；createEntity 后依赖 created 的格重算；inputs 为空数组抛', async () => {
  const { engine, state } = await bootEnv();
  const X = 's1a_memo_dep_x'; // 只作缓存依赖名，不往 state 里写
  assert.equal(Object.prototype.hasOwnProperty.call(state, X), false);

  let buildsCreated = 0;
  let buildsX = 0;
  const keyCreated = ['s1a-memo-created'];
  const keyX = ['s1a-memo-x'];
  const readCreated = () => stateMemo(state, engine, keyCreated, () => { buildsCreated += 1; return Object.keys(state.created).length; }, [['created']]);
  const readX = () => stateMemo(state, engine, keyX, () => { buildsX += 1; return 0; }, [[X]]);

  readCreated();
  readX();
  assert.equal(buildsCreated, 1);
  assert.equal(buildsX, 1);

  invalidateTop(state, X);
  readCreated();
  readX();
  assert.equal(buildsCreated, 1, '依赖 created 的格不应因失效 X 而重算');
  assert.equal(buildsX, 2, '依赖 X 的格应因失效 X 而重算一次');

  const table = loadTables().find((t) => t.entity && Array.isArray(t.entity.idPrefix) && t.entity.idPrefix.length > 0);
  const newId = `${prefixOf(table)}s1a_memo_new`;
  writeScope(engine, state, (tx) => {
    createEntity(state, newId, table.kind, {}, tx);
  });
  readCreated();
  assert.equal(buildsCreated, 2, '写 created（新建实体）后依赖 created 的格应重算一次');

  assert.throws(() => stateMemo(state, engine, ['s1a-memo-empty'], () => 0, []));
});

// ---- 7 ----
test('buildRegistry：前缀冲突抛；rows 键不带本表前缀抛；正对照不抛（输入为自造最小表，不改世界）', () => {
  const base = JSON.parse(readFileSync(join(DIM_DIR, 'item.json'), 'utf8'));
  const mk = (kind, prefix, rows) => {
    const d = structuredClone(base);
    d.kind = kind;
    d.entity = { ...d.entity, idPrefix: [prefix] };
    d.rows = rows;
    d.generated = {};
    return d;
  };

  // 正对照：单独一份合法表可构造
  assert.doesNotThrow(() => buildRegistry([mk('zz_ok_s1a', 'zzok_', {})]));

  // 前缀冲突：两表同前缀
  assert.throws(() => buildRegistry([mk('zz_a_s1a', 'zzdup_', {}), mk('zz_b_s1a', 'zzdup_', {})]));

  // rows 键不带本表前缀
  assert.throws(() => buildRegistry([mk('zz_c_s1a', 'zzpre_', { wrong_key_s1a: {} })]));
});

// ---- 8 ----
test('静态：files.json ≤15 且每项存在；baseline.json 无 c_module_state；kernel 顶层无 WeakMap/Map（memo.mjs 除外）', () => {
  const files = JSON.parse(readFileSync(join(KERNEL_DIR, 'files.json'), 'utf8'));
  assert.ok(Array.isArray(files));
  assert.ok(files.length <= 15, `files.json 项数 ${files.length} 超过 15`);
  for (const f of files) {
    assert.ok(existsSync(join(ROOT, f)), `files.json 登记的文件不存在：${f}`);
  }

  const baseline = JSON.parse(readFileSync(join(ROOT, 'tools/accept/baseline.json'), 'utf8'));
  const modRows = baseline.rows.filter((r) => r.compCode === 'c_module_state');
  for (const r of modRows) {
    assert.equal(r.current, 0, `c_module_state 行仍有违例：${JSON.stringify(r.rowKeys)}`);
    assert.deepEqual(r.rowKeys, []);
  }

  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const sources = walk(KERNEL_DIR).filter((p) => p.endsWith('.mjs') && !p.endsWith(`${sep}memo.mjs`));

  const isFn = (n) => /Function|Arrow|Class|MethodDefinition/.test(n.type);
  const topLevelNewMapOrWeak = (node) => {
    let hit = false;
    const visit = (n) => {
      if (hit || !n || typeof n.type !== 'string') return;
      if (isFn(n)) return; // 函数体内不算模块顶层
      if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && (n.callee.name === 'Map' || n.callee.name === 'WeakMap')) {
        hit = true;
        return;
      }
      for (const key of Object.keys(n)) {
        const v = n[key];
        if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c));
        else if (v && typeof v.type === 'string') visit(v);
      }
    };
    visit(node);
    return hit;
  };

  for (const file of sources) {
    const ast = acorn.parse(readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
    for (const stmt of ast.body) {
      assert.equal(topLevelNewMapOrWeak(stmt), false, `模块顶层出现 new Map/WeakMap：${relative(ROOT, file)}`);
    }
  }
});

// ---- 9 ----
test('事务整笔撤回：作用域内先 createEntity 合法实体，再做必抛的写入，抛出后该实体不在 state.created 里', async () => {
  const pair = findRefPair(loadTables());
  const { engine, state } = await bootEnv();
  const { P } = engine;
  const idB = `${prefixOf(pair.holder)}s1a_rollback_holder`;
  const idR = `${prefixOf(pair.target)}s1a_rollback_ok`;
  writeScope(engine, state, (tx) => {
    createEntity(state, idB, pair.holder.kind, {}, tx);
  });

  const missing = `${prefixOf(pair.target)}s1a_rollback_missing`;
  assert.throws(() => writeScope(engine, state, (tx) => {
    createEntity(state, idR, pair.target.kind, {}, tx);
    writePath(state, P.created_props(idB, pair.dimName), missing, tx);
  }));
  assert.equal(Object.prototype.hasOwnProperty.call(state.created, idR), false, '整笔撤回后合法实体不应残留');
});

// ---- 10 ----
test('作用域外或 tx 不属该 state 调用写函数即抛', async () => {
  const pair = findRefPair(loadTables());
  const { engine, state } = await bootEnv();
  const { engine: otherEngine, state: otherState } = await bootEnv();
  const { P } = engine;
  const idB = `${prefixOf(pair.holder)}s1a_scope_holder`;
  const idA = `${prefixOf(pair.target)}s1a_scope_target`;
  const path = P.created_props(idB, pair.dimName);

  writeScope(engine, state, (tx) => {
    createEntity(state, idB, pair.holder.kind, {}, tx);
    createEntity(state, idA, pair.target.kind, {}, tx);
  });

  // 作用域外直接调（tx 为 undefined）
  assert.throws(() => writePath(state, path, idA, undefined));
  assert.throws(() => createEntity(state, `${prefixOf(pair.holder)}s1a_scope_out`, pair.holder.kind, {}, undefined));

  // tx 不属该 state：在另一 state 的作用域里取到的 tx，拿到本 state 上用
  let foreignTx;
  writeScope(otherEngine, otherState, (tx) => {
    foreignTx = tx;
  });
  writeScope(engine, state, () => {
    assert.throws(() => writePath(state, path, idA, foreignTx));
  });
  // 另一个 engine 的 P 发出的路径 + 外来 tx，写本 state：抛
  assert.throws(() => writePath(state, otherEngine.P.created_props(idB, pair.dimName), idA, foreignTx));
});

// ---- 11 ----
test('未登记顶层键造不出路径：engine.P 上没有该键的成员（P 只为登记模式生成）', async () => {
  const { engine, state } = await bootEnv();
  const unregistered = 's1a_unregistered_top_key';
  assert.equal(Object.prototype.hasOwnProperty.call(state, unregistered), false);
  assert.equal(Object.prototype.hasOwnProperty.call(engine.P, unregistered), false);
  assert.equal(typeof engine.P[unregistered], 'undefined');
  assert.equal(Object.prototype.hasOwnProperty.call(state, unregistered), false);
});
