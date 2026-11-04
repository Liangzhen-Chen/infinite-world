// usage: node acc-determinism.mjs <root>
import fs from 'node:fs';
import { runGuard } from './acc-run.mjs';
const root = process.argv[2] || 'F:/dnd-wt/GUARD';
const a = 'F:/dnd-tmp/k8-acc/det-a.json', b = 'F:/dnd-tmp/k8-acc/det-b.json';
fs.rmSync(a, { force: true }); fs.rmSync(b, { force: true });
runGuard(root, a); runGuard(root, b);
const same = fs.existsSync(a) && fs.existsSync(b) && Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;
console.log(same ? 'PASS: 两次报告逐字节相同' : 'FAIL: 两次报告不同或缺失');
process.exit(same ? 0 : 1);
