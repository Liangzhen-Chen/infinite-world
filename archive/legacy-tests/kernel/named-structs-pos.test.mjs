// G1 记账第一条：事件载荷 pos 的形状从命名 struct 登记派生，不在 events.mjs 手抄（跨卷共用定义只一处）。
// 期望值按卷二 §1.5 :252 `struct:pos = {w,x,y,z,coarse}` 手算成字面量，不读仓库当前读数。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installNamedStructs, posStructFields, isPosValue } from '../../server-plugin/kernel/named-structs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);

test('装入真实世界后 struct:pos 字段表与卷二 §1.5 :252 一致', () => {
  assert.deepEqual(posStructFields(), {
    w: 'integer:count', x: 'integer:count', y: 'integer:count', z: 'integer:count', coarse: 'boolean',
  });
});

test('isPosValue 按登记字段判形状：齐全为真，缺、多、类型错一律为假', () => {
  assert.equal(isPosValue({ w: 0, x: 1, y: 2, z: 3, coarse: true }), true);
  assert.equal(isPosValue({ w: 0, x: 1, y: 2, z: 3 }), false);
  assert.equal(isPosValue({ w: 0, x: 1, y: 2, z: 3, coarse: true, extra: 0 }), false);
  assert.equal(isPosValue({ w: 0, x: 1, y: 2, z: 3.5, coarse: true }), false);
  assert.equal(isPosValue({ w: 0, x: 1, y: 2, z: 3, coarse: 'yes' }), false);
  assert.equal(isPosValue(5), false);
  assert.equal(isPosValue(null), false);
});

test('判据从登记派生：换一份多一个字段的登记后形状随之变，测完装回真实登记', () => {
  installNamedStructs({
    rows: [{
      name: 'struct:pos',
      type: { struct: {
        w: 'integer:count', x: 'integer:count', y: 'integer:count', z: 'integer:count', coarse: 'boolean', tag: 'integer:count',
      } },
    }],
  });
  assert.equal(isPosValue({ w: 0, x: 1, y: 2, z: 3, coarse: true }), false);
  assert.equal(isPosValue({ w: 0, x: 1, y: 2, z: 3, coarse: true, tag: 4 }), true);
  const restored = loadWorld(ROOT);
  assert.ok(restored.ok, restored.text);
  assert.deepEqual(posStructFields(), {
    w: 'integer:count', x: 'integer:count', y: 'integer:count', z: 'integer:count', coarse: 'boolean',
  });
});
