// routeMenu 单元测试（卷二 :965、:999）：三种载荷按判别键分流；错误上报进 report 并回 received；不属于任何一种的对象拒 E-DIM-STRUCT-FIELD。
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeMenu } from '../../server-plugin/kernel/transport/menu-entry.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';

test('错误上报：登记码加数值字段进 report，回 received', () => {
  const got = [];
  const prev = useReportSink((rec) => got.push(rec));
  try {
    const r = routeMenu({ errorCode: 'E-SAVE-TORN', fields: { slot: 2 } });
    assert.deepEqual(r, { resultCode: 'received' });
    assert.equal(got.length, 1);
    assert.equal(got[0].code, 'E-SAVE-TORN');
    assert.deepEqual({ ...got[0].fields }, { slot: 2 });
  } finally { useReportSink(prev); }
});

test('错误上报：码未登记、字段带文字都拒 E-DIM-STRUCT-FIELD，不进 report', () => {
  const got = [];
  const prev = useReportSink((rec) => got.push(rec));
  try {
    for (const body of [{ errorCode: 'E-NOPE-NOPE' }, { errorCode: 'E-SAVE-TORN', fields: { slot: 'has space' } }, { errorCode: 7 }]) {
      assert.deepEqual(routeMenu(body), { resultCode: 'rejected', rejectCode: 'E-DIM-STRUCT-FIELD' });
    }
    assert.equal(got.length, 0);
  } finally { useReportSink(prev); }
});

test('动作的槽位形状不符走 E-ACT-SLOT；形状对而代号不在目录走 E-ACT-UNKNOWN；errorCode 不参与选动作', () => {
  const slot = { resultCode: 'rejected', rejectCode: 'E-ACT-SLOT' };
  for (const slots of [[], 'x', null, { minutes: 1.5 }, { minutes: 'a' }, { 'Bad Key': 1 }]) assert.deepEqual(routeMenu({ action: 'act_wait', slots }), slot);
  assert.deepEqual(routeMenu({ action: 'act_wait', slots: { minutes: 30 } }), { resultCode: 'rejected', rejectCode: 'E-ACT-UNKNOWN' });
  assert.deepEqual(routeMenu({ action: 'act_wait', errorCode: 'E-SAVE-TORN' }), { resultCode: 'rejected', rejectCode: 'E-ACT-UNKNOWN' });
});

test('界面命令与动作：处理未建，拒 E-ACT-UNKNOWN；空对象与无判别键的对象拒 E-DIM-STRUCT-FIELD', () => {
  assert.deepEqual(routeMenu({ command: 'open_panel' }), { resultCode: 'rejected', rejectCode: 'E-ACT-UNKNOWN' });
  assert.deepEqual(routeMenu({ action: 'act_wait', slots: {} }), { resultCode: 'rejected', rejectCode: 'E-ACT-UNKNOWN' });
  assert.deepEqual(routeMenu({}), { resultCode: 'rejected', rejectCode: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(routeMenu({ other: 1 }), { resultCode: 'rejected', rejectCode: 'E-DIM-STRUCT-FIELD' });
});
