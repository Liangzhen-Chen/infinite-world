import fs from 'node:fs/promises';
import path from 'node:path';
import { CampaignStorage } from '../server-plugin/storage.mjs';
import { migrateLegacyChat, legacyReplayReducer } from '../server-plugin/migrations.mjs';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'SillyTavern/data/default-user/chats/无限原野·世界主持人');
const seed = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/legacy/seed.json'), 'utf8'));
const destination = path.join(root, 'backups', `migration-verification-${Date.now()}`);
const store = new CampaignStorage(destination, { reducer: legacyReplayReducer });
const results = [];
for (const name of (await fs.readdir(directory)).filter(name => name.endsWith('.jsonl'))) {
    const source = path.join(directory, name);
    const report = await migrateLegacyChat({ source, oldSeed: seed, store, id: `verified_${results.length + 1}` });
    const before = await store.read(report.campaignId);
    const restarted = new CampaignStorage(destination, { reducer: legacyReplayReducer });
    const after = await restarted.read(report.campaignId);
    if (JSON.stringify(before.document) !== JSON.stringify(after.document)) throw new Error('真实存档重启不一致');
    const imported = await restarted.import(await restarted.export(report.campaignId), `imported_${results.length + 1}`);
    if (JSON.stringify(before.document) !== JSON.stringify(imported.document)) throw new Error('真实存档导出导入不一致');
    results.push({ ...report, reloadEqual: true, exportImportEqual: true });
}
const report = { date: '2026-10-10', dryRun: true, originalsModified: false, destination, results };
await fs.writeFile(path.join(root, 'docs/测试报告/阶段1真实存档迁移.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
