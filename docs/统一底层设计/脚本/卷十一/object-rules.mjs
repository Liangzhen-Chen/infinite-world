// 落点对象的两条整类判据（李白 11-15 17:28 第 1 条、chk-1115-y6 真问题①②），供 check-objects-six.mjs 与 apply 脚本共用。
// 判据说明见 审查/乙阶段-落点对象整类判据-1115y8c.md。只读、确定性、不联网；本文件不出现任何迁移行编号。
//  一、接收卷：落点文字写"迁/交/归/移 卷X"的，取卷X；否则取落点里第一个节号引用所在的卷（"卷X §n"取卷X，裸"§n"取本卷）；
//      落点里没有节号引用的取本卷。系统键一律从 乙4补-systems补全.json 按卷读。
//  二、进程：锚点代码文件按卷二 §2.9 第 0 条进程分组表的根目录判进程（不带根目录的路径按同节"路径写法"取默认根目录）；
//      模块组键按同表成员判进程。对象是客户端组、而全部代码锚点都在服务端的，取显示职责在服务端的对应组
//      （display → outputGate，卷二 §2.7 outputGate 注"显示闸"）；没有对应组的列出。
export const PLACEHOLDER = new Set(['待补']); // 李白裁定"照旧待补，不进计数"的占位，不是对象

// ---- 一：接收卷 ----
export function receivingVolume(target, self, volCode) {
  const t = String(target ?? '').replace(/；原对象栏写[\s\S]*$/, '');
  const V = `(${volCode.replace(/^\^|\$$/g, '')})`;
  const verb = t.match(new RegExp(`(?:迁(?:到|至|入|往)?|交(?:给|由)?|归|移(?:交|到|至)?)\\s*${V}`));
  if (verb) return { vol: verb[1], how: `落点写"${verb[0]}"` };
  const sec = t.match(new RegExp(`(?:${V}\\s*)?§\\s*\\d`));
  if (sec) return sec[1] ? { vol: sec[1], how: `落点第一个节号引用在${sec[1]}` } : { vol: self, how: '落点第一个节号引用是本卷' };
  return { vol: self, how: '落点没有节号引用，取本卷' };
}

// ---- 二：进程分组（读卷二 §2.9 第 0 条进程分组表与"路径写法"）----
export function processTable(regText) {
  const L = regText.split(/\r?\n/);
  const s = L.findIndex(l => /^### 2\.9 /.test(l));
  const roots = []; const groupProc = new Map(); let defaultRoot = null;
  let head = null;
  for (let i = s + 1; i < L.length && !/^### /.test(L[i]); i++) {
    const l = L[i];
    const d = l.match(/不带根目录的路径一律相对 `([^`]+?)\/?`/); if (d && !defaultRoot) defaultRoot = d[1] + '/';
    if (!/^\|/.test(l)) { head = null; continue; }
    const c = l.split('|').slice(1, -1).map(x => x.trim());
    if (!head) { head = c; continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    const ip = head.indexOf('进程'), im = head.indexOf('成员'), ir = head.indexOf('根目录');
    if (ip < 0 || im < 0 || ir < 0) continue;
    const rs = [...c[ir].matchAll(/`([^`*]+)\/\*\*`/g)].map(m => m[1] + '/');
    if (!rs.length) continue;
    for (const r of rs) roots.push({ root: r, proc: c[ip] });
    for (const m of c[im].split(/[；;]/)[0].split('、')) groupProc.set(m.trim(), c[ip]);
  }
  return { roots, groupProc, defaultRoot };
}
const CODE = /\.(?:mjs|js)$/;
export function procOfSpec(pt, spec) {
  if (!CODE.test(spec)) return null; // 只按代码文件判进程；数据文件不在进程里
  const r = pt.roots.find(x => spec.startsWith(x.root));
  if (r) return r.proc;
  return (pt.roots.find(x => x.root === pt.defaultRoot) ?? {}).proc ?? null;
}
// 显示职责在两个进程里的组（卷二 §2.7：display 客户端渲染；outputGate 显示闸）
export const DISPLAY_DUTY = ['display', 'outputGate'];

// 一行的代码锚点按进程归类
export function anchorProcs(row, pt) {
  const procs = new Set(); const files = [];
  for (const a of row.anchors ?? []) { const p = procOfSpec(pt, a.file); if (p) { procs.add(p); files.push(a.file); } }
  return { procs, files };
}
