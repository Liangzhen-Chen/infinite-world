import fs from 'node:fs/promises';
import path from 'node:path';
import { withPetRules } from '../world/design/pet-foundation.mjs';
import { loadWorld } from './load-world.mjs';
import { validateWorld } from './validate-world.mjs';
import { atomicJSON, digest } from '../server-plugin/storage.mjs';
import { backup } from './backup.mjs';

const source = await loadWorld(), candidate = withPetRules(source), check = validateWorld(candidate);
if (!check.ok) throw new Error(check.errors.join('\n'));
const publish = process.argv.includes('--publish');
let directory = null;
if (publish) {
    directory = await backup('stage2-pet-rules');
    const file = 'world/meta/rules.json', saved = path.join(directory, 'world-source', file);
    await fs.mkdir(path.dirname(saved), { recursive: true });
    await fs.copyFile(file, saved);
    await atomicJSON(file, candidate.rules);
}
const report = { published: publish, backup: directory, sourceHash: digest(source), candidateHash: digest(candidate),
    scope: '宠物照料规则与临时召唤维持参数；不补造动物、不发布法术、不修改在线战役' };
await fs.writeFile('docs/测试报告/宠物规则发布.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
