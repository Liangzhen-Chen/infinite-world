import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkStorage } from '../tools/benchmark-storage.mjs';
import { benchmarkContext } from '../tools/benchmark-context.mjs';
import { EntityResolver } from '../server-plugin/retrieval.mjs';

test('战役实体增量解析与完整重建一致，重名、私有创建实体及玩家改名不污染世界', () => {
    const world = [{ id: 'npc_1', name: '林穗', aliases: ['店主'], scope: 'loc_hw' }];
    const resolver = new EntityResolver(world);
    const additions = [{ id: 'npc_created', name: '店主', scope: 'loc_yp' }, { id: 'player', name: '旅人', aliases: ['客人'] }];
    const scoped = resolver.extend(additions), rebuilt = new EntityResolver([...world, ...additions]);
    assert.deepEqual(scoped.entities, rebuilt.entities);
    assert.deepEqual(scoped.aliases, rebuilt.aliases);
    assert.deepEqual(scoped.names, rebuilt.names);
    assert.deepEqual(scoped.mentions('店主与客人', 'loc_yp'), rebuilt.mentions('店主与客人', 'loc_yp'));
    assert.throws(() => scoped.resolve('店主'), /歧义/);
    assert.throws(() => resolver.extend([{ id: 'npc_1', name: '另一人' }]), /重复/);
    assert.equal(resolver.resolve('店主'), 'npc_1');
    assert.equal(resolver.entities.has('player'), false);
    const renamed = resolver.extend([{ id: 'player', name: '新名字' }]);
    assert.equal(renamed.resolve('新名字'), 'player');
    assert.equal(renamed.aliases.has('旅人'), false);
});

test('10000事件：提交含快照≤10ms，对账≤500ms，每1000回合增长≤30MB，撤销后冷加载守恒', { timeout: 120000 }, async () => {
    const report = await benchmarkStorage();
    assert.equal(report.events, 10000);
    assert.equal(report.firstSegmentUnchanged, true, '追加事件不得改写第一段日志');
    assert.equal(report.replayCorrect, true, '撤销早期扣款后重启必须恢复正确余额');
    assert.ok(report.commitMs <= 10, `普通提交 ${report.commitMs}ms`);
    assert.ok(report.snapshotCommitMs <= 10, `快照提交 ${report.snapshotCommitMs}ms`);
    assert.ok(report.unchangedReconcileMs <= 500, `无变化对账 ${report.unchangedReconcileMs}ms`);
    assert.ok(report.reconcileMs <= 500, `早期撤销对账 ${report.reconcileMs}ms`);
    assert.equal(report.growth.length, 10);
    assert.ok(report.growth.every(bytes => bytes <= 30e6), `每1000回合增量 ${report.growth}`);
    assert.equal(report.pass, true);
});

test('5000消息：真实历史分组、覆盖裁剪、场景与工具提示组装≤150ms，保持输入与增量索引', async () => {
    const report = await benchmarkContext();
    assert.equal(report.messages, 5000);
    assert.equal(report.unchanged, true);
    assert.equal(report.incrementalIndex, true);
    assert.equal(report.scenePresent, true, '最终请求必须包含引擎实际生成的场景正文');
    assert.equal(report.retainedMessages, 3500);
    assert.equal(report.removedTurns, 750);
    assert.ok(report.requestBytes > 0);
    assert.ok(report.samples.every(ms => ms <= 150), `组装用时 ${report.samples}ms`);
    assert.equal(report.pass, true);
});
