import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fc from 'fast-check';
import { createCampaign, commit, xpRequired } from '../extension/core.js';
const seed = JSON.parse(fs.readFileSync(new URL('fixtures/legacy/seed.json', import.meta.url)));
test('性质：成功扣款后钱非负，拒绝事务不改变账本', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1000 }), amount => {
        const c = createCampaign(seed), before = JSON.stringify(c);
        try { commit(c, { transaction_id: 'cost', reason: '性质测试', player: { coins_delta: -amount } }); assert.equal(c.state.player.coins, 180 - amount); }
        catch { assert.equal(JSON.stringify(c), before); }
        assert.ok(c.state.player.coins >= 0);
    }), { numRuns: 100, seed: 20261010 });
});
test('升级经验保留既有公式', () => {
    assert.equal(xpRequired(9), 900); assert.equal(xpRequired(10), 1000); assert.equal(xpRequired(200), 160000000);
});
