// 测试与工具的统一临时目录：FIELDS_TMP，未设置时为仓库根下的 .tmp/，不使用系统临时目录。
// 每个进程只用自己的子目录，进程退出时递归删除；设 FIELDS_TMP_KEEP=1 可保留用于调试。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let runDir = null;

export function tempBase() {
    return path.resolve(process.env.FIELDS_TMP || path.join(repoRoot, '.tmp'));
}

function remove(target) {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/** 本进程的临时根目录（替代 os.tmpdir()），首次调用时创建并登记退出清理。 */
export function tmpRoot() {
    if (runDir) return runDir;
    const base = tempBase();
    fs.mkdirSync(base, { recursive: true });
    runDir = fs.mkdtempSync(path.join(base, `p${process.pid}-`));
    process.on('exit', () => {
        if (process.env.FIELDS_TMP_KEEP === '1') return;
        try { remove(runDir); } catch { /* 被占用时留给下次 cleanupStale */ }
        try { fs.rmdirSync(base); } catch { /* 非空或不存在 */ }
    });
    return runDir;
}

/** 在临时根目录下建一个带前缀的目录；传入 t（node:test 上下文）时测试结束即删除。 */
export function makeTempDir(prefix = 'tmp-', t = null) {
    const dir = fs.mkdtempSync(path.join(tmpRoot(), prefix));
    if (t?.after) t.after(() => removeTempDir(dir));
    return dir;
}

/** 删除 tmpRoot 内的目录；拒绝删除根目录之外的路径。 */
export function removeTempDir(dir) {
    const target = path.resolve(dir), root = tmpRoot();
    if (target === root || !target.startsWith(root + path.sep)) throw new Error('拒绝清理临时根目录之外的路径');
    remove(target);
}
