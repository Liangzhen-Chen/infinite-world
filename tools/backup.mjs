import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { repoRoot, safeSegment } from './path-segment.mjs';

// 备份写在 backups/<时间戳-标签-随机>/ 下，每个源文件落成该目录里的一个扁平文件（相对路径的分隔符换成 "__"，原路径记在 manifest.json）：
// 写入路径都是 仓库根＋常量前导段 backups＋校验函数尾段，S12-2 可证明在 §2.11 之外（李白 11-17 21:2x 裁定一）。
export const root = repoRoot();
const sources = ['SillyTavern/data/default-user/chats', 'SillyTavern/data/default-user/characters',
    'SillyTavern/data/default-user/worlds', 'SillyTavern/data/default-user/settings.json',
    'SillyTavern/data/default-user/infinite-fields', 'SillyTavern/data/default-user/infinite-fields-worlds', 'SillyTavern/config.yaml',
    'SillyTavern/public/scripts/extensions/third-party/infinite-fields',
    'SillyTavern/plugins/infinite-fields',
    'SillyTavern/public/play-town.html', 'SillyTavern/public/play-town.js', '启动酒馆.ps1', '启动酒馆.cmd'];
const excluded = name => name === 'secrets.json' || name.startsWith('.env');
export async function backup(label = 'manual') {
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}-${randomUUID().slice(0, 6)}`;
    const directory = path.join(root, 'backups', safeSegment(stamp));
    await fs.mkdir(directory, { recursive: true });
    const files = [];
    async function copy(source, relative) {
        if (excluded(path.basename(source))) return;
        const info = await fs.lstat(source);
        if (info.isSymbolicLink()) throw new Error(`备份拒绝符号链接：${relative}`);
        if (info.isDirectory()) {
            for (const name of await fs.readdir(source)) await copy(path.join(source, name), path.join(relative, name));
        } else {
            const bytes = await fs.readFile(source);
            const flat = relative.replaceAll('\\', '/').replaceAll('/', '__');
            await fs.writeFile(path.join(repoRoot(), 'backups', safeSegment(stamp), safeSegment(flat)), bytes);
            const hash = value => createHash('sha256').update(value).digest('hex');
            const digest = hash(bytes);
            if (hash(await fs.readFile(path.join(directory, flat))) !== digest) throw new Error(`备份校验失败：${relative}`);
            files.push({ path: relative.replaceAll('\\', '/'), stored: flat, bytes: bytes.length, sha256: digest });
        }
    }
    for (const relative of sources) {
        try { await copy(path.join(root, relative), relative); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await fs.writeFile(path.join(repoRoot(), 'backups', safeSegment(stamp), safeSegment('manifest.json')), JSON.stringify({ format: 2, layout: 'flat', label, excludes: ['secrets.json', '.env*'], files }, null, 2));
    console.log(JSON.stringify({ backup: directory, files: files.length, verified: true }));
    return directory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await backup(process.argv[2]);
