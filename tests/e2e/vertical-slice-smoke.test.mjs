// 零 mock 端到端竖切片烟测（docs/gemini/kickoff-1125.md:499 L-18；:121 六步闭环定义）。
// 直导真实入口 server-plugin/index.mjs#init，按「新开局 → state.created 新建实体并写另一实体 ref →
// 真实菜单动作经 submitProposal 落事务与 LogBook → postCommit 推进时间 → 存槽 → 读档 replay_apply 验 saveDigest」
// 六步顺序执行。当前新骨架装配未实现（index.mjs#init 即抛 S1-1），本测试是显式待转绿红灯桩：
// 不 mock、不 skip、不 todo、不私自改状态；每一步失败都报「停在第 N/6 步 + 哪个入口未实现」。
// S1-3 把真实入口接上后，本测试必须首次全绿并锁死为后续底线（任何一步接线被拔掉都要红）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENTRY = new URL('../../server-plugin/index.mjs', import.meta.url);

/** 取真实导出入口；缺了即按「未实现」抛出，绝不拿替身顶上。 */
function entry(plugin, name) {
  const fn = plugin && plugin[name];
  if (typeof fn !== 'function') throw new Error(`server-plugin/index.mjs#${name} 未实现（入口不存在）`);
  return fn;
}

/** 取真实对象上的入口方法；缺了即按「未实现」抛出。 */
function method(target, name) {
  const fn = target && target[name];
  if (typeof fn !== 'function') throw new Error(`运行期对象方法 ${name} 未实现（入口不存在）`);
  return fn;
}

test('零 mock 端到端烟测：新骨架竖切片 6 步闭环（当前为显式待转绿红灯桩）', async () => {
  const plugin = await import(ENTRY.href);
  let world;
  let proposalResult;

  // 六步：每步只调真实入口/真实运行期对象，不注入任何替身。
  const steps = [
    {
      name: '开局',
      target: 'server-plugin/index.mjs#init',
      async run() {
        world = await entry(plugin, 'init')();
        assert.ok(world && typeof world === 'object', 'init 未返回新开局世界对象');
      },
    },
    {
      name: 'state.created 新建实体并写另一实体 ref',
      target: 'writePath',
      async run() {
        const created = (world.events || world.log || []).find((e) => e && e.type === 'state.created');
        assert.ok(created, '事件日志缺 state.created');
        assert.ok(created.ref && typeof created.ref === 'string', 'state.created 未写 ref');
        await method(world, 'writePath')(created.ref, 'state.created.ref', created.ref);
      },
    },
    {
      name: '真实菜单动作',
      target: 'menuAction',
      async run() {
        await entry(plugin, 'menuAction')(world, { menu: 'look' });
      },
    },
    {
      name: 'submitProposal 落事务与 LogBook',
      target: 'submitProposal',
      async run() {
        const before = (world.logBook || []).length;
        proposalResult = await entry(plugin, 'submitProposal')(world, {
          intent: 'look',
          subject: world.player && world.player.ref,
          action: 'look',
          params: {},
        });
        assert.ok(proposalResult && proposalResult.committed !== false, 'submitProposal 未提交事务');
        assert.ok((world.logBook || []).length > before, 'LogBook 未追加动作记录');
      },
    },
    {
      name: 'postCommit 推进时间',
      target: 'postCommit',
      async run() {
        const before = world.clock && world.clock.minute;
        assert.equal(typeof before, 'number', '世界缺 clock.minute');
        const advance = proposalResult && proposalResult.postCommit && proposalResult.postCommit.advanceMinutes;
        assert.equal(typeof advance, 'number', 'submitProposal 结果缺 postCommit.advanceMinutes');
        await entry(plugin, 'postCommit')(world, proposalResult.postCommit);
        assert.equal(world.clock.minute, before + advance, 'postCommit 未按 advanceMinutes 推进时钟');
      },
    },
    {
      name: '存槽、读档并用 replay_apply 验 saveDigest 逐字节一致',
      target: 'saveSlot/loadSlot/replay_apply',
      async run() {
        const saved = await entry(plugin, 'saveSlot')(world);
        const loaded = await entry(plugin, 'loadSlot')(saved);
        const replayed = await entry(plugin, 'replay_apply')(loaded);
        assert.equal(replayed.saveDigest, saved.saveDigest, '读档 replay_apply 后 saveDigest 不一致');
      },
    },
  ];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    try {
      await step.run();
    } catch (e) {
      throw new Error(`[E2E 未实现] 停在第 ${i + 1}/6 步「${step.name}」，入口 ${step.target}：${e.message}`);
    }
  }
});
