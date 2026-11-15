// 卷十九第四版余项核查：终核三条、同类清单属本卷条目、parent 双写、卷二 v17 跟改。
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷十九/check-卷十九-余项.mjs    只读文件，不改任何卷。
import {readFileSync} from 'node:fs';

const DIR = 'F:/dnd/docs/统一底层设计/';
const read = f => readFileSync(DIR + f, 'utf8');
const all = read('卷十九-建筑与设施.md').split(/\r?\n/);
const cutApp = all.findIndex(l => l.startsWith('## 附 第二版影响面表'));
const lines = cutApp < 0 ? all : all.slice(0, cutApp);          // 正文：§0–§8 与术语表，不含影响面表、记账栏、附录
const body = lines.join('\n');
const v2 = read('卷二-维度表规范与统一入口.md');
const v3 = read('卷三甲-物质本源.md') + '\n' + read('卷三乙-物态类别与物品.md');   // 卷三已拆为甲、乙两卷，两卷都查
const v5 = read('卷五-地点地形与资源场.md');
const v6 = '卷六-经济.md';

const out = []; let failed = 0;
const report = (ok, name, detail = '') => { if (!ok) failed++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const row = code => lines.find(l => l.startsWith(`| ${code} |`)) ?? '';
const dimRow = name => lines.find(l => l.startsWith(`| \`${name}\` |`)) ?? '';
const sectionOf = (startRe, endRe) => {
  const s = lines.findIndex(l => startRe.test(l)); if (s < 0) return '';
  let e = lines.findIndex((l, i) => i > s && endRe.test(l)); if (e < 0) e = lines.length;
  return lines.slice(s, e).join('\n');
};
const rule = (n, k) => {
  const sec = sectionOf(new RegExp(`^#### 4\\.${n}\\.3 `), /^#### /).split('\n');
  const a = sec.findIndex(l => l.startsWith(`${k}. `)); if (a < 0) return '';
  let b = sec.findIndex((l, i) => i > a && /^\d+\. /.test(l)); if (b < 0) b = sec.length;
  return sec.slice(a, b).join('\n');
};
const s3 = sectionOf(/^## §3 /, /^## §4 /);
const s410 = sectionOf(/^### 4\.10 /, /^### 4\.11 /);
const s8 = sectionOf(/^## §8 /, /^## 附 /);

// ── 一、终核三条 ──
report(/^# 卷十九 建筑与设施（第十五版）/.test(all[0]), '0 卷标题为第十五版');   // 第十五版：只跟版本号，判据不变
// 新真问题 1：入口重名
report(!s3.includes('| `projectView` |') && s3.includes('| `buildProjectView` | `(buildProjectId)`'), '1.1 §3.2 入口改名 buildProjectView(buildProjectId)');
const oldName = lines.map((l, i) => /(^|[^A-Za-z])projectView/.test(l) ? i + 1 : 0).filter(Boolean);
report(oldName.length === 0, '1.1 正文不再出现旧名 projectView', oldName.join(' '));
const oldId = lines.map((l, i) => /(^|[^A-Za-z])projectId/.test(l) ? i + 1 : 0).filter(Boolean);
report(oldId.length === 0, '1.1 正文不再出现旧参名 projectId', oldId.join(' '));
report(!read(v6).includes('buildProjectView'), '1.1 卷六没有同名入口 buildProjectView');
report(row('Q18').includes('入口划分') && row('Q18').includes('buildProjectId'), '1.1 Q18 写明入口划分');
// 新真问题 2：S19-9 的排除登记
report(row('S19-9').includes('entryJudges') && !row('S19-9').includes('登记为进入判定实现者的模块'), '1.2 S19-9 改引 entryJudges');
report(/systems\.<名>\.entryJudges/.test(v2), '1.2 卷二 §2.7 确有 entryJudges 字段定义');
const five = ['accessDefaultOf', 'accessClassAt', 'storeTarget', 'stationFor', 'restSite'].filter(f => !s3.includes(`facilities.mjs#${f}`));
report(five.length === 0, '1.2 §3.3 登记本卷五个进入判定函数', five.join('、'));
report(row('Q19').includes('entryJudges'), '1.2 Q19 提请卷五登记 canEnter');
// 新真问题 3：存量只存原值
report(dimRow('materialKg').includes('map<ref material, number>') && dimRow('materialKg').includes('stockMode: raw'), '1.3 建筑行存各料质量 materialKg（raw）');
report(!/^\| `material` \| map<ref material, fraction> \| fraction \| 各值之和/m.test(body) && !/^\| `envelopeMassKg` \| number \| kg \| \[0/m.test(body), '1.3 份额与总质量不再是存储维度');
report(dimRow('material').includes('`materialKg`') && dimRow('envelopeMassKg').includes('`materialKg`'), '1.3 material、envelopeMassKg 是由 materialKg 派生的视图字段');
report(dimRow('repairedVolumeL').includes('stockMode: remainder') && dimRow('repairedVolumeL').includes('remDenominator: rules.facility.repair.minutesPerM3') && body.includes('repairedVolumeLRem'), '1.3 修缮体积带余数结转并登记分母');
report(dimRow('condition').includes('stockMode: extScale') && dimRow('condition').includes('precision 8'), '1.3 condition 用扩展标度');
const r7 = rule(1, 7), r6 = rule(1, 6);
report(['第 1 条', '第 2 条', '第 3 条', '第 5 条'].every(k => r7.includes(k)) && r6.includes('第 6 条'), '1.3 规则 6、7 逐条引卷二 §3.3 的存量规则');
report(!body.includes('envelopeMassKg × material[k]') && !/按这个恒等式由已存的质量与密度/.test(body), '1.3 不再由份额倒推体积');
const a12 = lines.find(l => l.startsWith('- 【不变量】A19-1.2')) ?? '';
report(a12.includes('切片不变') && a12.includes('往返不变') && a12.includes('误差界'), '1.3 A19-1.2 有切片不变、往返不变、误差界');
for (const k of ['存量与余数结转', 'stockMode', 'extScale', 'remDenominator']) report(v2.includes(k), `1.3 卷二确有 ${k}`);

// ── 二、同类清单属本卷条目 ──
const wsumBad = [];
lines.forEach((l, i) => { for (const m of l.matchAll(/wsum\(([^()]*)\)/g)) if (m[1].split(',').length !== 3) wsumBad.push(i + 1); });
report(wsumBad.length === 0, '2 A8 wsum 一律三参', wsumBad.join(' '));
report(row('S19-2').includes('place 表') && !row('S19-2').includes('全仓库不存在名为 `facilityType`'), '2 A6 S19-2 的 facilityType 禁令限 place 表');
report(body.includes('| `bform` 形制 | `bldform_` |') && !v3.includes('bldform_'), '2 族前缀 bldform_ 与卷三不撞');
const r163 = rule(16, 3);
report(r163.includes('materialKg[k] × b') && r163.includes('读扣后的'), '2 C9 燃烧从存量里扣质量');
report(row('Q7').includes('C10') && row('Q21').includes('C16'), '2 C10、C16 写进 §8 并写明定义方');
report(row('Q21').includes('定义方：'), '2 Q21 写明定义方');

// ── 三、parent 双写 ──
// 第六版（李白 11-13 裁定）：parent 只经卷二 §2.6 行改挂原语改写，不再"终止旧行、另建新行"。本组判据随裁定改向，不放宽：
// 原"本卷不写 parent"换成"本卷不直接写、只经原语、只限 comp_portable 行"；原"收起即终止"换成"收起不得终止"。
report(v2.includes('行改挂（通用原语，唯一定义）') && v2.includes('viaRelocate') && v2.includes('relocatable') && v2.includes('E-RELOC-TARGET'), '3 前提：卷二 §2.6 有行改挂原语与登记字段');
const parentWrite = lines.map((l, i) => /`parent` 改(挂|为)|把 `parent` 改|`parent`（仅可移动建筑）|writePath\([^)]*parent/.test(l) ? i + 1 : 0).filter(Boolean);
report(parentWrite.length === 0, '3 正文没有直接改写 parent 的规定', parentWrite.join(' '));
report(s3.includes('viaRelocate') && s3.includes('不对这些路径直接调 `writePath`') && s3.includes('withComponent: [comp_portable]') && s3.includes('固定建筑的行不在范围内'), '3 §3.3 位置量只经 relocate 改写，行范围限 comp_portable');
report(!body.includes('deployState') && !body.includes('`deploy_`'), '3 deployState 与 deploy 族已删');
// 第七版：规则 8（carrierItem 终止时建筑行正常终止，李白 11-13 裁定）是 §4.10 里唯一许可的 terminate；"收起、展开不得终止"照查，只把规则 8 那一条从被查文本里拿掉，并要求收起、展开两条里没有 terminate
const s410NoR8 = s410.replace(rule(10, 8), '');
report(!/terminate\(/.test(rule(10, 2)) && !/terminate\(/.test(rule(10, 3)) && rule(10, 8).includes('terminate(建筑行'), '3 收起、展开两条不含 terminate，终止只在规则 8');
report(s410.includes('relocate(') && s410.includes('离场') && s410.includes('行不终止') && s410.includes('id 不变') && !/terminate\((行|建筑行)/.test(s410NoR8) &&!s410.includes('portableState.<') && !s410.includes('整还'), '3 §4.10 收起、展开走行改挂，不终止、不另建行');
report(row('Q5').includes('定义方：') && row('Q5').includes('须卷五配合') && row('Q5').includes('viaRelocate') && row('Q5').includes('须卷二十配合'), '3 Q5 写明定义方与须卷五、卷二十配合的事');

// ── 四、卷二 v17 终止协议步骤号 ──
report(/1\. \*\*定后继与领域清理\*\*/.test(v2) && /2\. \*\*标记\*\*/.test(v2), '4 前提：卷二第 1 步定后继与领域清理、第 2 步标记');
const stepRefs = [];
lines.forEach((l, i) => { for (const m of l.matchAll(/终止协议[^。；|]{0,12}第 ?(\d) ?步([^。；|]{0,24})/g)) stepRefs.push({no: i + 1, n: m[1], tail: m[2]}); });
const stepBad = stepRefs.filter(r => !(r.n === '1' && /删除|清理|后继/.test(r.tail)));
report(stepBad.length === 0, '4 引用的步骤号与卷二 v17 一致', `共 ${stepRefs.length} 处` + (stepBad.length ? '，不符行 ' + stepBad.map(r => r.no).join(' ') : ''));
report(s3.includes('subjectRecords') && s3.includes('atTerminate') && s3.includes('rules.terminate.records'), '4 设施运行态按去留表登记');

// ── 五、第五版：余项单核四条（新真问题 1–3、遗漏 1） ──
const s2 = sectionOf(/^## §2 /, /^## §3 /);
const s5 = sectionOf(/^## §5 /, /^## §6 /);
const s7 = sectionOf(/^## §7 /, /^## §8 /);
const assertLine = code => lines.find(l => l.startsWith(`- 【不变量】${code}`)) ?? '';
const has = (text, keys) => keys.filter(k => !text.includes(k));
const need = (text, keys, name) => { const miss = has(text, keys); report(miss.length === 0, name, miss.length ? '缺 ' + miss.join('、') : ''); };
// 5.1 多料修缮按累计量分料
need(dimRow('repairLot'), ['quotaL', 'fillL', 'replaceL', 'doneL', 'stockMode: raw', '第 1、3 条'], '5.1 §2.1 登记修缮配额 repairLot（原值）');
// 第六版：排队算法上收到卷二 §3.3 第 3 条，本卷只引用；原来对本卷正文的性质要求改为"本卷引用 + 卷二写全"两头都查
need(r7, ['开笔', '按累计量分料', 'repairLot.doneL += ΔL', '末项取 `N_r` 减前几项之和', '卷二 §3.3 第 3 条"按顺序照累计量分摊"', '都不为负', '各项升数之和恒等于 `ΔL`', '一笔做完时各项恰等于配额', '逐位相同'], '5.1 规则 7 开笔定配额、按累计量取料（引卷二）');
report(!r7.includes('交叉相乘') && !/排在 `j ÷ quotaL\[k\]` 处/.test(r7), '5.1 规则 7 不再重复定义排队算法');
need(v2, ['按顺序照累计量分摊', '开笔时一次拆、存原值', '`j` 从 1 起', '`j ÷ q_k`', '交叉相乘', '固定代号序', '提交后的累计应得 − 提交前的累计应得', '切分无关', '单调', '做满等于配额', '来源卷十九第五版'], '5.1 卷二 §3.3 第 3 条写全分摊规则与四条性质');
report(!r7.includes('floor(ΔL × u_k)') && !r7.includes('以 `materialKg[k]` 为限'), '5.1 规则 7 不再按本次 ΔL 拆料、不再靠封顶兜底');
report(!a12.includes('只有一种料的建筑上') && a12.includes('料种数不限') && a12.includes('多料断言') && a12.includes('都不为负'), '5.1 A19-1.2 切片不变去掉单料限定并补多料断言');
need(s3, ['`repairLot` 的改写'], '5.1 §3.3 repairLot 有写者');
// 5.1 附：排队取料的数值自证（单调、切分无关、做满等于配额），并复现"floor + 末项取差"在三料时回落
const queue = q => { const seq = []; q.forEach((n, k) => { for (let j = 1; j <= n; j++) seq.push({k, j, n}); }); seq.sort((a, b) => (a.j * b.n - b.j * a.n) || (a.k - b.k)); return seq.map(x => x.k); };
const cum = (q, R) => { const x = q.map(() => 0); queue(q).slice(0, R).forEach(k => x[k]++); return x; };
const floorDiff = (q, R) => { const T = q.reduce((a, b) => a + b, 0); const x = q.slice(0, -1).map(n => Math.floor(R * n / T)); return [...x, R - x.reduce((a, b) => a + b, 0)]; };
let qOk = true, floorBad = false;
for (const q of [[1, 1, 1], [3, 5, 2], [7, 0, 4, 1], [10, 1], [2, 2, 2, 2, 1]]) {
  const T = q.reduce((a, b) => a + b, 0);
  for (let R = 0; R <= T; R++) {
    const x = cum(q, R);
    if (x.reduce((a, b) => a + b, 0) !== R || x.some((v, k) => v > q[k])) qOk = false;
    if (R > 0 && cum(q, R - 1).some((v, k) => v > x[k])) qOk = false;
    if (R > 0 && floorDiff(q, R - 1).some((v, k) => v > floorDiff(q, R)[k])) floorBad = true;
  }
  if (cum(q, T).some((v, k) => v !== q[k])) qOk = false;
}
report(qOk, '5.1 排队取料：各料累计单调、和等于累计量、做满等于配额（数值自证）');
report(floorBad, '5.1 对照：floor(累计×配额÷总数) 加末项取差在三料时会回落（改写法的理由成立）');
// 5.2 补缺与换料、设计体积
// 第十一版（李白对 审查/卷六重拆-二审.md N3 选 a：扩建同事务加设计体积，扩建是第二写者）：原必含"此后不变"是被裁定改掉的字面，改查现行原文；
//   并加反向：§2.1 不再写"此后不变（没有改写写者"，正文其余处也不得再说设计体积"此后不变/此后无人改写"（与 §2.1 两个改它的地方相反）。
// 第十二版（李白对 审查/卷六重拆-二审只核.md 新 3：扩建加 E_后 − E_前，与现存升数同一向上取整口径）：原必含"加上砌入的料的升数"是被裁定改掉的字面，改查"加上现存升数的增加量"；反向：旧句不得残留
// 第十三版（李白对 审查/卷六重拆-改后核对.md A：建成锚直接写建成那一刻的现存升数 E，与现存升数同式、同一个向上取整）：原必含"原地翻修整值重写（§4.4 规则 3）"是被裁定改掉的字面
//   （现文"原地翻修照建成同法整值重写"），改查现行原文，并补查"直接写入建成那一刻的现存升数 `E`"；反向：建成锚"体积换算成升、向下取整"的旧写法不得残留。不放宽。
need(dimRow('envelopeVolumeL'), ['integer', '建成时直接写入建成那一刻的现存升数 `E`', '同一个向上取整', '此后只有两处改它', '扩建在同一事务里加上现存升数的增加量（§4.4 规则 8）', '原地翻修照建成同法整值重写（§4.4 规则 3）', '修缮、燃烧、受损都不改它', '无围护'], '5.2 §2.1 建行存设计体积 envelopeVolumeL（第十三版：建成直接写现存升数 E，翻修同法整值重写；第十二版：扩建加现存升数的增加量）');
report(!/换算成升[^|]{0,12}向下取整/.test(dimRow('envelopeVolumeL')) && !/换算成升[^。]{0,12}向下取整/.test(rule(4, 6)) && !assertLine('A19-4.2').includes('换算成升后向下取整'), '5.2 反向（第十三版）：§2.1、§4.4 规则 6、A19-4.2 不再把建成锚写成体积换算成升向下取整');
report(!dimRow('envelopeVolumeL').includes('加上砌入的料的升数'), '5.2 反向（第十二版）：§2.1 envelopeVolumeL 不再写"加上砌入的料的升数"');
report(!dimRow('envelopeVolumeL').includes('此后不变（没有改写写者'), '5.2 反向：§2.1 envelopeVolumeL 不再写"此后不变（没有改写写者"');
{ const stale = lines.map((l, i) => /(设计体积|envelopeVolumeL)[^。|]{0,40}(此后不变|此后无人改写|此后都不变)|此后不变的围护体积/.test(l) && !l.startsWith('| `envelopeVolumeL` |') ? i + 1 : 0).filter(Boolean);
  report(stale.length === 0, '5.2 反向（第十一版，新真问题）：正文别处不再说设计体积"此后不变/此后无人改写"', stale.join(' ')); }
need(r7, ['M_r = max(0, V − E)', '只补不换', '`envelopeVolumeL`', '两部分分别计', '本次补缺升数 ÷ `V`', '`V` × `replaceShare`'], '5.2 规则 7 待办分补缺与换料，完好度回升分别计');
need(r7, ['建成时写入建成那一刻的现存升数（下面 `E` 的同一个式子）', '向上取整'], '5.2 规则 7 设计体积与现存体积：建成锚取现存升数 E 的同一个式子（第十三版）');
report(!r7.includes('取 `Σ_k(materialKg[k] ÷ density_k)`：每次读时'), '5.2 无围护建筑不再由 materialKg 倒推体积');
need(r163, ['不改设计体积 `envelopeVolumeL`', '`repairLot`'], '5.2 燃烧不改设计体积');
need(rule(4, 6), ['写入 `envelopeVolumeL`', '无围护的建筑同样写', '建成那一刻的现存升数 `E`', '向上取整'], '5.2 建成时写入设计体积（含无围护；第十三版：写建成那一刻的现存升数 E，向上取整）');
need(assertLine('A19-4.2'), ['建成的事务提交后 `envelopeVolumeL` 逐位等于由 `materialKg` 算出的现存升数 `E`（向上取整）', '待补升数为 0', '墙里实有体积不是整数升的建筑同样成立', '原地翻修提交后同此'], '5.2 A19-4.2 建成与翻修提交后设计体积逐位等于现存升数 E（第十三版）');
report(a12.includes('补缺') && a12.includes('`envelopeVolumeL` 逐位不变') && a12.includes('桥、堤') && assertLine('A19-16.2').includes('`envelopeVolumeL` 逐位不变') && assertLine('A19-4.2').includes('envelopeVolumeL'), '5.2 断言：设计体积不变、烧后可补回');
// 第十一版（N3 选 a）：原必含"`envelopeVolumeL` 同样只有建行写者"被裁定改为两个写者，改查现行原文；反向：旧句不得残留
// 第十二版（新 3）：第二写者加的量改查"现存升数的增加量 E_后 − E_前"；反向：旧句不得残留
need(s3, ['`envelopeVolumeL` 有两个写者', '与扩建时的 `facilities.mjs`（第二写者，只做加法', '安装固定装置的同一事务里加上现存升数的增加量 `E_后 − E_前`'], '5.2 §3.3 设计体积两个写者：建行写者与扩建时的 facilities.mjs（第十二版：加 E_后 − E_前）');
report(!s3.includes('安装固定装置的同一事务里加上砌入的料的升数'), '5.2 反向（第十二版）：§3.3 不再写"加上砌入的料的升数"');
report(!s3.includes('`envelopeVolumeL` 同样只有建行写者'), '5.2 反向：§3.3 不再写"设计体积只有建行写者"');
// 5.3 可移动建筑：通用搬运、持有边、解析入口
const r102 = rule(10, 2), r103 = rule(10, 3), r101 = rule(10, 1);
// 第六版：裁定的实质（不丢行上内容、不丢边、引用不断）不变，实现由"整取整还"改为行改挂；判据跟改并加严（状态实例、到期项、账户也要在）
need(r102, ['relocate(', '离场', '全部存储维度与偏离行', '状态实例', '到期项', '账户余额', '持有边', '安装边不解除', '一概不动', '不列字段名', '`carrierItem`'], '5.3 收起：行离场，行上内容与边原地不动');
report(!s410.includes('`intendedType`、`form`、`materialKg`、`wallThicknessM`、`storeys`') && !/搬进 `portableState\.<carrierItem>`——/.test(s410), '5.3 手列搬运清单已删');
need(r103, ['relocate(', 'placement', '同一个纯函数', '不建行', '处分权', '不重新滚档'], '5.3 展开：改挂到新地点，不建行、不重算');
need(r101, ['建筑的身份就是它的 place 行', 'id 不变', '行不终止', '卷二 §2.6', '已作废'], '5.3 规则 1 搬家不换行');
need(rule(10, 7), ['照旧存 place id', 'currentRowOf', '撤回', '返回 null'], '5.3 规则 7 长期引用照旧存 place id');
report(s3.includes('| `currentRowOf` | `(carrierItemId)`') && s5.includes('currentRowOf'), '5.3 §3.2、§5.1 的 currentRowOf 退化为反查');
need(assertLine('A19-10.2'), ['改挂前后除位置量外全部存储维度、边、状态实例、到期项逐位相同', '按维度表', '`accessClass`', '`currentRowOf`', '账户余额', '`subjectRecords`', 'id 跨收起、展开不变', '`state.terminated` 不因收起、展开新增条目', '建行函数不被调用'], '5.3 A19-10.2 改挂前后除位置量外逐位相同');
report(!body.includes('portableState.<') && !body.includes('edgeSlots') && !body.includes('zoneOrdinal') && !s3.includes('| `portableState'), '5.3 portableState、edgeSlots、zoneOrdinal 已删');
report(s2.includes('**组件类 `comp_portable`') && s2.includes('`relocatable` 为真') && dimRow('carrierItem').includes('byClass:comp_portable') && dimRow('packed').includes('离场'), '5.3 §2 登记 comp_portable 与视图字段 packed');
need(row('Q22'), ['定义方：', '卷十八', '卷六', '卷五', '卷二十七'], '5.3 Q22 写明定义方与四卷配合');
need(s5, ['卷六 §4.18、§4.10', '`accessClass`', '卷二十七'], '5.3 §5 同步卷六、卷五、卷二十七');
// 锚点修订 11-14：§7 第一列已改为 M19-n 编号（卷十一 R11-2.2）
report(/^\| M19-37 \|/m.test(s7) && /^\| M19-36 \|/m.test(s7), '5.3 §7 增第 36、37 行');
// 5.4 dirt 的存法
// 第六版：dirt 只按扩展标度登记（卷二 §1.2：remDenominator 只许 stockMode: remainder 写）。原"带余数"判据改为"不得带余数、增量为整数乘加"，切片不变、严格上升、误差界三项照查
report(/`\.remDenominator`[^\n]*`stockMode: remainder` 必须；其余不得写/.test(v2), '5.4 前提：卷二规定 remDenominator 只许 remainder 写');
need(dimRow('dirt'), ['precision 8', 'stockMode: extScale', '第 6 条', '不带余数字段', '整数个最小单位'], '5.4 §2.1 dirt 只按扩展标度登记');
report(!dimRow('dirt').includes('remDenominator') && !body.includes('dirtRem') && !body.includes('dirtDenominator'), '5.4 dirt 的余数字段与分母已删（正文零出现）');
const r114 = rule(11, 4);
need(r114, ['第 6 条', '整数乘加', '没有整除', '不被截成 0', '10⁸ 标度', '切片不变', '误差界', '逐位相同'], '5.4 规则 4 增量整数乘加、清扫扩展标度');
need(assertLine('A19-11.2'), ['切片不变', '逐位等于', '严格上升', '误差界', '往返不变', '没有余数字段'], '5.4 A19-11.2 切片不变断言');
report(s2.includes('`dirtPerVisit`、`dirtPerWorkMinute`（两项都是非负整数') && row('Q23').includes('定义方：') && row('Q23').includes('已关闭'), '5.4 规则表键、Q23 齐');
report(lines.some(l => l.startsWith('# 卷十九')) && all.some(l => l.startsWith('| 第五版：')) && all.some(l => l.startsWith('| 第六版：')), '5 影响面表有第五版、第六版各一行');

// ── 六、第七版（李白 11-13 裁定：卷二补2 单核新真问题 1 的连带、新真问题 5；全书相邻取法扫描本卷六处）。原有各项判据不动，只新增 ──
const a102 = assertLine('A19-10.2');
report(a102.includes('建行事务之外对位置量路径直接调 `writePath` 的计数为 0') && !a102.includes('全仓库对位置量路径直接调 `writePath` 的计数为 0'), '6.1 A19-10.2 写权限制只管建行事务之外');
report(/建行事务之外直接写这些模式/.test(v2) && v2.includes('**新建不挡**') && !v2.includes('或有文件对带 `viaRelocate` 的模式直接调 `writePath`'), '6.1 前提：卷二 §2.6 第 7 点不挡建行写者');
const r108 = rule(10, 8);
// 第八版（李白 11-13 裁定，第七版单核新真问题 1 取 (b)）：后继只取"终止前所在的地点行"。原判据里必含的短语"`carrierItem` 终止时自己的后继"是被裁定删去的那个序位，
// 从必含清单拿掉，改为"不得再把它列为序位"（见 7.1），其余短语照查；不是放宽：后继由两个候选收成一个，并在 7.1 加查它怎样读得到。
need(r108, ['`carrierItem` 没了，建筑跟着终止', '正常终止流程', '订阅 `verb_entity_terminated`', '清理函数不许调 `terminate`', '接手者（后继）', '终止前所在的地点行', '收起态与展开态同此处理', '返回 null'], '6.2 §4.10 规则 8：carrierItem 终止时建筑行正常终止并写明后继');
need(a102, ['**承载物终止**', '同一拍内', '不存在"`carrierItem` 已终止而建筑行未终止"的行', '收起态、展开态同判'], '6.2 A19-10.2 增承载物终止断言');
report(v2.includes('承载者终止时这一行怎样处置不归本原语') && v2.includes('不许留一行永远离场'), '6.2 前提：卷二 §2.6 行改挂第 3 点有承载者终止一句');
// 平行边取法六处（卷五 §4.1 规则 4 的通则）
report(/\*\*平行边的通则\*\*/.test(v5), '6.3 前提：卷五 §4.1 规则 4 有平行边通则');
const para = '卷五 §4.1 规则 4 的平行边通则';
need(rule(1, 1), [para, '相邻只算这一对房间一次', '`openness` 最大的那条', '"两端加通路类型"'], '6.3 §4.1 规则 1 门洞：相邻只算一次、扩散取最通畅、指名按两端加通路类型');
need(rule(1, 6), [para, '"两端加通路类型"定位', '另一种通路类型的那条边上的通行不计', '不因两地之间并存两条边而计两次'], '6.3 §4.1 规则 6 挂在边一端的建筑：计人次只算指名的那条边');
need(rule(9, 3), ['"两端加通路类型"定位', '另一种通路类型的边不受影响', '平行边通则'], '6.3 §4.9 规则 3 桥塌：只断指名的那条边');
need(rule(14, 4), [para, '只改它指名的那一条', '`openness` 最大的那条边'], '6.3 §4.14 规则 4 落闸：只改指名的边，扩散仍取最通畅');
// 锚点修订 11-14：卷十七成稿后引用改指具体规则 R17-1.2（在卷十七 §4.1 内），归属仍是卷十七
need(rule(14, 8), [para, '"两端加通路类型"定位', '卷十七 R17-1.2'],'6.3 §4.14 规则 8 轨道：指名的边与读路况的归属');
report(sectionOf(/^#### 4\.14\.5 /, /^#### /).includes('同两端的另一条边'), '6.3 §4.14.5 吊闸例写明是哪条边');
// 卷六第四版定稿的跟改（卷六"附 第四版修订记录"第三节九处）与卷六复审同类扫描本卷一条
const v6t = read(v6);
// 第九版（李白 11-13 卷六重拆裁定）删去的断言，逐条理由（判据没有放宽，被查的段落已按裁定删除）：
//  6.4 前提（卷六有 stationMinutes 入口、出墙的料一点与跟改清单）：卷六第六版按裁定删去 stationMinutes 入口与"出墙的料"推算段，前提不再存在。
//  6.4 正文不再有本卷自己存的工位占用分钟：裁定 ④ 把占用分钟定回本卷，日计数 stationMinutesToday 恢复，这条与裁定相反。
//  6.4 §3.3 改发事件、§4.3 规则 4 释放与到期发事件：两个事件的唯一订阅者卷六不再记分钟，事件撤销，段落已删。
//  6.4 A19-3.2 两卷数同一批占用边、§4.15 规则 1 利用率分子读卷六、§4.11 规则 4 积尘增量读卷六、A19-15.2 同口径、Q21 已定在卷六存：卷六的 stationUse 与 stationMinutes 已删，五处都改读本卷日计数。
//  6.5 §4.1 规则 7 的 `src_transform`、同一事务、同一份明细、只减 materialKg 不进账本；A19-1.2 的 `src_transform` 逐料质量；§4.4 规则 3、§4.16 规则 4 两条：
//      实物账改由本卷 wallFlowKg 记，腿的代号归卷六，本卷正文不再写卷六的代号；这几句已删。保留仍在的短语照查。
report(!rule(15, 1).includes('离屏时这个数由卷六 §4.7 的排班按同一定义给出'), '6.4 §4.15 规则 1 删去离屏另给一句');
// 第十版（守恒脚本缺口 G1）：可回收量改为照卷二 §3.3 第 3 条按累计量取差。原两条必含短语查的是逐次截断的旧写法（"本次换出质量 × salvageFraction"），
//   正文已改写，改查现行原文；并加否定项：逐次截断的旧句不得残留。判据由"给出可回收量"收紧为"按累计量取差、切分不变"，不是放宽。
// 第十一版（二审 N5：repairLot 开笔时存各料打捞比例）：式里的比例由 salvageFraction_k 改为 repairLot.salvage[k]，改查现行原文，并加开笔存比例与反向（旧式不得残留）
need(rule(1, 7), ['**换下的旧料去哪里**', '照卷二 §3.3 第 3 条"按顺序照累计量分摊"取，不按每次提交各自截断', '累计可回收量 `S_k(d) = floor(W_k(d) × repairLot.salvage[k])`', '式里的比例取开笔时存进 `repairLot.salvage` 的那个值', '一笔之内若每次提交重读', '本次可回收量 = 提交后的 `S_k` − 提交前的 `S_k`', '小笔提交绕不过截断'], '6.5 §4.1 规则 7 换下旧料的可回收量按累计量取差，比例取开笔时存的值');
need(rule(1, 7), ['`salvage[k]` = 此刻各料 `salvageFraction` 的有效值'], '6.5 §4.1 规则 7 开笔时写入 repairLot.salvage');
report(!rule(1, 7).includes('floor(W_k(d) × salvageFraction_k)'), '6.5 反向：规则 7 不再用每次重读的 salvageFraction_k 算累计可回收量');
report(!rule(1, 7).includes('可回收量 = 本次换出质量 × 该料的 `salvageFraction`'), '6.5 §4.1 规则 7 不再按每次提交各自截断');
// 第十一版（N5）：断言里的比例改为开笔存的值，改查现行原文；加"一笔之内 salvage 不变"与反向
need(assertLine('A19-1.2'), ['换料的可回收量按累计量取差', '料 k 的累计取出恰等于 `floor(累计换出质量 × repairLot.salvage[k])`', '其间材料修正项怎样变都不影响', '各料的取出、损失与一次提交逐位相同', '一笔之内 `fillL`、`replaceL`、`quotaL`、`salvage` 不变'], '6.5 A19-1.2 换下旧料的可回收量按累计量取差、比例开笔定下、切分不变');
report(!assertLine('A19-1.2').includes('floor(累计换出质量 × salvageFraction)'), '6.5 反向：A19-1.2 不再按重读的 salvageFraction 断言');
need(dimRow('repairLot'), ['salvage: map<ref material, fraction>', '键与 `quotaL` 相同', '不随修正项变化重读'], '6.5 §2.1 repairLot 登记 salvage（第十一版）');
report(v2.includes('按顺序照累计量分摊') && v2.includes('提交后的累计应得 − 提交前的累计应得'), '6.5 前提：卷二 §3.3 第 3 条有按累计量取差的写法');
report(all.filter(l => l.startsWith('| 第七版：')).length === 2, '6 影响面表有第七版两行');

// ── 七、第八版（李白 11-13 裁定：第七版单核新真问题 1–3、误差界 7 处、残留措辞 5 处、卷六第五版出墙量与损失量）。原有各项判据不动（6.2 一处见上），只新增 ──
report(all[2].includes('起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档'), '7.0 卷首有起草与审查模型一行');
report(rule(10, 2) !== '' && rule(10, 3) !== '' && r108 !== '', '7.0 §4.10 规则 2、3、8 条目非空（单核小项 6：空串不得空过）');
// 7.1 新真问题 1：后继只取地点行，rx 读得到
report(!r108.includes('① `carrierItem` 终止时自己的后继') && r108.includes('删去'), '7.1 规则 8 不再把"carrierItem 自己的后继"列为序位');
need(r108, ['只有一个', '`carrierLastPlace`', '终止清理函数', '终止标记写下之前', '这个地点行仍可读', '另一个实体', '不读已终止物品名下的任何东西', '不另起一笔'], '7.1 规则 8 后继只取地点行并写明标记之后仍可读');
need(dimRow('carrierLastPlace'), ['ref place nullable', '清理函数', '照样可读', 'successorRX'], '7.1 §2.1 登记 carrierLastPlace');
need(s2, ['① `carrierLastPlace` 非空时取它', '② 否则取 `carrierItem`', '`first`'], '7.1 §2.2 末可移动类别行 successorRX 照此写');
need(s3, ['`carrierLastPlace` 偏离行', 'terminationCleanup', '不调 `terminate`'], '7.1 §3.3 登记清理函数与写者');
report(v2.includes('registerTerminationCleanup') && v2.includes('这时实体还没有终止标记') && /`terminate\(state, entityId, cause\)`/.test(v2), '7.1 前提：卷二清理函数在标记之前调用，terminate 没有后继入参');
need(a102, ['逐位等于终止前建筑行上的 `carrierLastPlace`', '终止标记写下之前已写入', '房间行都先于建筑行终止'], '7.1 A19-10.2 后继与房间行断言');
// 7.2 新真问题 2：房间行先终止，只写一处
const r164 = rule(16, 4);
need(r164, ['**房间行先终止**', '只在这里写一次', '按 id 升序', '同一事务内', '最后才终止建筑行', '房间行的后继是它所在的建筑行', '整笔回滚'], '7.2 §4.16 规则 4 房间行先终止（单点）');
report(lines.filter(l => l.includes('按 id 升序逐个发起 `terminate(房间行')).length === 1, '7.2 发起房间行终止的规定全文只有一处');
report(r108.includes('§4.16 规则 4"房间行先终止"') && rule(4, 3).includes('§4.16 规则 4"房间行先终止"'), '7.2 §4.10 规则 8、§4.4 规则 3 引用该处');
need(assertLine('A19-16.2'), ['房间行全部已终止', '房间行按 id 升序在先、建筑行最后', '不存在"建筑行已终止而其下房间行未终止"的行'], '7.2 A19-16.2 房间行断言');
// 7.3 新真问题 3：接口总表与事件代号
// 第九版删：7.3 的两个事件代号、载荷四项、只有三个入口、stationMinutes(设施, 日)、src_transform 的同事务入账，与"§4.3 规则 4 写明事件代号登记族"一条——
//   事件已撤销（唯一订阅者卷六不再记分钟），出墙三入口与卷六入口的行按裁定删去。保留仍在的一项。
need(s5, ['`verb_entity_terminated` 的订阅'], '7.3 §5.2 终止事件的订阅仍在接口表');
// 7.4 残留措辞 5 处：正文不再出现"作业分钟"（第十版：工位占用只在本卷记，存逐条记录 stationLog 与折叠汇总 stationFold，卷六只读），ops、依赖次序不再写"日计数"
const workMin = lines.map((l, i) => l.includes('作业分钟') ? i + 1 : 0).filter(Boolean);
report(workMin.length === 0, '7.4 正文不再出现"作业分钟"', workMin.join(' '));
// 第九版删：ops 一行"不含日计数、含 stationMinutes(建筑, 当日)"两项——裁定 ④ 把日计数定回本卷，ops 改读本卷日计数。其余两项照查。
report(!/固定装置、日计数；/.test(s3) && s2.includes('每一工位占用分钟'), '7.4 依赖次序 ③、dirtPerWorkMinute 称工位占用分钟');
// 7.5 出墙量、损失量（卷六第五版）
// 第九版删：7.5 前提（卷六第五版分出墙量与损失量）、§4.1 规则 7 的出墙量与损失量七个短语、A19-1.2 四个短语——
//   "损失累计由卷六读时派生、不另存"正是裁定 ① 推翻的写法（审查/卷六-v5单核.md 新真问题 D、E）；改为本卷存 wallFlowKg 三项累计，段落已删。
report(!a12.includes('且不超过该事务里 `materialKg` 该料的减记'), '7.5 A19-1.2 不再只写"不超过"（由相等式推出，收紧）');
// 7.6 误差界 7 处换新口径（卷二 §3.3 第 6 条 m 的口径：误差量按语法树递推）。旧口径"截断次数"的写法不得残留
report(v2.includes('**m 的口径（唯一定义）**') && v2.includes('乘法把另一个因数当放大系数') && v2.includes('除法按除数下界的倒数放大'), '7.6 前提：卷二 §3.3 第 6 条 m 的口径与递推');
const oldBound = lines.map((l, i) => /（2n \+ 7）× 10⁻⁸ ?[，；。（]|双精度参考值之差不超过/.test(l) && !l.includes('作废') ? i + 1 : 0).filter(Boolean);
report(oldBound.length === 0, '7.6 旧口径（k ×（2n + 7）、同式双精度参考值）零残留', oldBound.join(' '));
need(dimRow('condition'), ['m 的口径（唯一定义）', '不是截断次数'], '7.6 §2.1 condition 写明口径');
need(dimRow('dirt'), ['m 的口径（唯一定义）', '等于这次提交的分钟数'], '7.6 §2.1 dirt 写明口径');
need(r6, ['**误差量**', 'e_w(x)   = 2 ×（n − 1）× x_max + n', 'm_劣化 = ⌈（e_自然 + e_使用）× 修正键 facility.wear 的求值结果 + 1⌉', 'm_修缮', 'm_受损 = ⌈（effectiveEnergyKJ ÷ L(Q)）× e_Q ÷ L(Q) + 1⌉', 'm_燃烧 = ⌈e_w(f) × S(burnShareCurve) + 1⌉', 'E 清零重计', '用有理数'], '7.6 §4.1 规则 6 四个改写式的确定式');
need(a12, ['各次 m 之和 × 10⁻⁸', '`m_劣化`、`m_修缮`、`m_受损`、`m_燃烧`', '`L(Q)` 恒为正'], '7.6 A19-1.2 误差界断言');
need(r114, ['**误差量**', '`m_清扫 = minutes`', '`m_增 = 0`', '清零重计'], '7.6 §4.11 规则 4 确定式');
need(assertLine('A19-11.2'), ['`m_清扫` 之和 × 10⁻⁸', '等于该次提交的分钟数', '每日增量的 m 为 0'], '7.6 A19-11.2 误差界断言');
need(rule(16, 2), ['不做除法', '`L(Q)`'], '7.6 §4.16 规则 2 除数下界不为正不做除法');
// 7.6 附：误差界验算（卷二 §3.3 第 6 条"参考值与断言"：定点实现对有理数参考值，实际误差不超过界，列出实际与界之比）
const S8 = 100000000n;
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const Q = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const k = gcd(n, d) || 1n; return [n / k, d / k]; };
const qadd = (a, b) => Q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]), qsub = (a, b) => Q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const qmul = (a, b) => Q(a[0] * b[0], a[1] * b[1]), qdiv = (a, b) => Q(a[0] * b[1], a[1] * b[0]);
const qlt = (a, b) => a[0] * b[1] < b[0] * a[1];
const q8 = x => Q(x, S8);                                   // 10⁸ 标度整数 → 有理数
const f4 = v => BigInt(Math.round(v * 1e4)) * 10000n;        // 四位精度的数 → 10⁸ 标度（无余数）
const mul8 = (a, b) => a * b / S8;                           // fixedMultiply8：截断一次
const errUnits = (fx, ref) => { const d = qsub(q8(fx), ref); const n = d[0] < 0n ? -d[0] : d[0]; return Number(n * S8 * 1000000n / d[1]) / 1e6; };   // |定点 − 参考|，以 10⁻⁸ 为单位
const curve = pts => pts.map(([x, y]) => [f4(x), f4(y)]);
const segOf = (c, x) => { if (x <= c[0][0]) return -1; if (x >= c[c.length - 1][0]) return c.length; let i = 0; while (x >= c[i + 1][0]) i++; return i; };
const lookF = (c, x) => { const i = segOf(c, x); if (i < 0) return c[0][1]; if (i >= c.length) return c[c.length - 1][1]; return c[i][1] + (c[i + 1][1] - c[i][1]) * (x - c[i][0]) / (c[i + 1][0] - c[i][0]); };
const lookR = (c, xr, i) => { if (i < 0) return q8(c[0][1]); if (i >= c.length) return q8(c[c.length - 1][1]); return qadd(q8(c[i][1]), qdiv(qmul(q8(c[i + 1][1] - c[i][1]), qsub(xr, q8(c[i][0]))), q8(c[i + 1][0] - c[i][0]))); };
const slopeMax = c => Math.max(...c.slice(1).map((p, i) => Math.abs(Number(p[1] - c[i][1]) / Number(p[0] - c[i][0]))));
const expo = curve([[0, 0.2], [0.3, 0.6], [0.7, 1.4], [1, 3]]), visitC = curve([[0, 0], [0.5, 0.2], [2, 0.7], [10, 1]]), burnC = curve([[0, 0], [5, 0.02], [20, 0.15], [40, 0.3]]);
const Sv = slopeMax(visitC), Sb = slopeMax(burnC);
let seed = 20261113; const rnd = () => (seed = seed * 48271 % 2147483647) / 2147483647;
const runCondition = ds => {
  const n = ds.mats.length, mk = ds.mats.map(m => BigInt(Math.round(m.kg * 1e4))), tot = mk.reduce((a, b) => a + b, 0n);
  const sh = mk.map(m => m * S8 / tot); sh[n - 1] = S8 - sh.slice(0, -1).reduce((a, b) => a + b, 0n);          // 份额：前几项整除，末项取差
  const wsF = d => ds.mats.reduce((a, m, k) => a + mul8(sh[k], f4(m[d])), 0n);
  const wsR = d => ds.mats.reduce((a, m, k) => qadd(a, qmul(Q(mk[k], tot), q8(f4(m[d])))), Q(0n));
  const ew = d => 2 * (n - 1) * Math.max(...ds.mats.map(m => m[d])) + n;
  const cmax = Math.max(...ds.mats.map(m => m.c)), Mkg = Number(tot) / 1e4, mass8 = tot * 10000n;
  const M8 = BigInt(Math.round(ds.M * 1e8)), R8 = BigInt(Math.round(ds.R * 1e8)), k8 = f4(ds.kappa), area8 = f4(ds.area), w8 = f4(ds.wear), s8 = f4(ds.useShare), rs8 = f4(ds.replaceShare), V = BigInt(ds.V);
  let cf = S8, cr = Q(1n), bound = 0, writes = 0, worst = 0, oldBroken = false, lPos = true;
  const step = (decF, decR, m, sign = -1n) => { cf += sign * decF; cr = sign < 0n ? qsub(cr, decR) : qadd(cr, decR); bound += m; writes++; const e = errUnits(cf, cr); worst = Math.max(worst, e / bound); if (e > writes * (2 * n + 7)) oldBroken = true; return e <= bound; };
  let ok = true;
  for (let day = 0; day < ds.days && ok; day++) {
    const h8 = f4(Math.round(rnd() * 1e4) / 1e4), visits = BigInt(Math.floor(rnd() * 400)), mins = BigInt(Math.floor(rnd() * ds.slots * 1440));
    const X = lookF(expo, h8), Xr = lookR(expo, q8(h8), segOf(expo, h8));
    const u = mins * S8 / BigInt(ds.slots * 1440), qv = visits * S8 * S8 / area8, v = lookF(visitC, qv);
    const ui = u + v > S8 ? S8 : u + v;
    const sum = qadd(Q(mins, BigInt(ds.slots * 1440)), lookR(visitC, qdiv(Q(visits), q8(area8)), segOf(visitC, qv))), uir = qlt(Q(1n), sum) ? Q(1n) : sum;
    const D = mul8(mul8(wsF('c'), X) + mul8(w8 * s8 / S8, ui), M8);
    const Dr = qmul(qadd(qmul(wsR('c'), Xr), qmul(qmul(q8(w8), q8(s8)), uir)), q8(M8));
    const eNat = ew('c') * (Number(X) / 1e8 + 1e-8) + cmax + 1, eUse = ds.wear * ds.useShare * (Sv + 2) + 1;
    if (cf - D <= 0n) break;                                                                                  // 不进钳位：钳位只会让误差清零
    ok = step(D, Dr, Math.ceil((eNat + eUse) * ds.M + 1)) && ok;
    if (day % 7 === 3) {                                                                                      // 受损
      const E8 = f4(Math.round(rnd() * ds.hit * 1e4) / 1e4), Qf = mul8(mul8(mul8(mass8, wsF('t')), k8), R8);
      const Qr = qmul(qmul(qmul(q8(mass8), wsR('t')), q8(k8)), q8(R8)), Qn = Number(Qr[0] * 1000000n / Qr[1]) / 1e6;
      const eQ = ((Mkg * ew('t') + 1) * ds.kappa + 1) * ds.R + 1, L = Qn - eQ * 1e-8;
      if (!(L > 0)) lPos = false;
      const dec = E8 * S8 / Qf;
      if (cf - dec > 0n) ok = step(dec, qdiv(q8(E8), Qr), Math.ceil(Number(E8) / 1e8 / L * eQ / L + 1)) && ok;
    }
    if (day % 11 === 5) {                                                                                     // 燃烧
      const x = wsF('f'), b = lookF(burnC, x);
      if (cf - b > 0n) ok = step(b, lookR(burnC, wsR('f'), segOf(burnC, x)), Math.ceil(ew('f') * Sb + 1)) && ok;
    }
    if (day % 9 === 8) {                                                                                      // 修缮回升：补缺、换料两个整除
      const dF = BigInt(Math.floor(rnd() * 3)), dR = BigInt(1 + Math.floor(rnd() * 3));
      const inc = dF * S8 / V + dR * S8 * S8 / (V * rs8), incR = qadd(Q(dF, V), qdiv(Q(dR), qmul(Q(V), q8(rs8))));
      if (cf + inc < S8) ok = step(inc, incR, (dF > 0n ? 1 : 0) + 1, 1n) && ok;
    }
  }
  return {ok, worst, writes, bound, oldBroken, lPos};
};
const DATA = [
  {name: '单料、倍率 1', mats: [{kg: 62208, c: 0.0004, t: 22, f: 0}], M: 1, R: 1, kappa: 0.05, area: 36, wear: 0.0002, useShare: 0.5, replaceShare: 0.3, V: 34560, slots: 2, days: 120, hit: 300},
  {name: '两料、倍率 2.5', mats: [{kg: 41000.5, c: 0.0011, t: 35, f: 0}, {kg: 3120.25, c: 0.0073, t: 8, f: 15.5}], M: 2.5, R: 1.4, kappa: 0.05, area: 84.5, wear: 0.0005, useShare: 0.35, replaceShare: 0.25, V: 21000, slots: 5, days: 150, hit: 500},
  {name: '三料、倍率 12', mats: [{kg: 900.7, c: 0.0031, t: 12, f: 17.2}, {kg: 1777.3, c: 0.0009, t: 40, f: 0}, {kg: 250.1, c: 0.0102, t: 5, f: 9.9}], M: 12, R: 3.25, kappa: 0.12, area: 12.3, wear: 0.0008, useShare: 0.9, replaceShare: 0.5, V: 1500, slots: 1, days: 40, hit: 60},
  {name: '五料、倍率 0.6', mats: [{kg: 120000, c: 0.0002, t: 60, f: 0}, {kg: 34000.1234, c: 0.0005, t: 44, f: 0}, {kg: 5600, c: 0.004, t: 15, f: 18}, {kg: 800.9, c: 0.012, t: 6, f: 21.3}, {kg: 77.7777, c: 0.02, t: 3, f: 30}], M: 0.6, R: 0.8, kappa: 0.07, area: 410, wear: 0.0003, useShare: 0.6, replaceShare: 0.2, V: 98000, slots: 12, days: 200, hit: 9000},
];
let anyOld = false;
for (const ds of DATA) {
  const r = runCondition(ds); anyOld = anyOld || r.oldBroken;
  report(r.ok && r.lPos && r.writes > 0, `7.6 验算 condition（${ds.name}）：实际误差不超过各次 m 之和`, `写入 ${r.writes} 次，界 ${r.bound} × 10⁻⁸，实际与界之比最大 ${r.worst.toFixed(4)}`);
}
report(anyOld, '7.6 对照：旧口径 k ×（2n + 7）在修正键倍率大于 1 的数据上被实际误差突破（换口径的理由成立）');
{ // dirt：每日增量整数乘加（m = 0），清扫每分钟减量截断一次、再乘分钟数（m = minutes）
  const clean8 = f4(0.35), Mc8 = 137654321n, dpv = 2500000n, dpw = 40000n;
  let df = 0n, dr = Q(0n), bound = 0, worst = 0, ok = true, n = 0;
  for (let day = 0; day < 300; day++) {
    const add = BigInt(Math.floor(rnd() * 900)) * dpv + BigInt(Math.floor(rnd() * 4000)) * dpw;
    if (df + add < 100n * S8) { df += add; dr = qadd(dr, q8(add)); }
    if (day % 4 === 1) {
      const minutes = BigInt(1 + Math.floor(rnd() * 45)), dec = mul8(clean8, Mc8) * minutes;
      if (df - dec > 0n) { df -= dec; dr = qsub(dr, qmul(qmul(q8(clean8), q8(Mc8)), Q(minutes))); bound += Number(minutes); n++; const e = errUnits(df, dr); worst = Math.max(worst, e / bound); ok = ok && e <= bound; }
    }
  }
  report(ok && n > 0, '7.6 验算 dirt：实际误差不超过累计清扫分钟数', `清扫 ${n} 次，界 ${bound} × 10⁻⁸，实际与界之比最大 ${worst.toFixed(4)}`);
}
report(all.some(l => l.startsWith('| 第八版：')) && row('Q24').includes('定义方：'), '7 影响面表有第八版一行，Q24 写明定义方');

// ── 八、第十版（李白对 审查/卷六重拆-一审.md 十一条的裁定；卷二【十七·补】⑲⑳㉑；守恒缺口 G1–G8）。原有各项判据不动（6.5 两条改查现行原文，见上），只新增 ──
report(all.some(l => l.startsWith('## 附 第十版修订记录')), '8.0 卷末有第十版修订记录');
// 8.1 工位占用：逐条记录加折叠汇总，删日计数
// 第十一版（二审 N4：删 stationFold.olderMinutes、olderCount）：原必含 olderMinutes 是被裁定删去的字段，改查"保留期之外的不留"，并加反向
need(dimRow('occupancy'), ['rows: list<struct{fixture: ref item, kind: ref vocab fixture, holder: ref person, fromMinute: integer, toMinute: integer, open: boolean}>', 'daily: map<integer, map<ref vocab fixture, integer>>}', '读自 `stationLog`', '读自 `stationFold`', '保留期之外的不留', '折叠前后这个数逐位不变', '各条落在该日内的分钟数之和'], '8.1 §2.1 occupancy 视图字段：逐条、按日汇总，保留期外不留');
report(!dimRow('occupancy').includes('olderMinutes'), '8.1 反向：occupancy 视图没有 olderMinutes');
need(lines.find(l => l.startsWith('| `station.json` |')) ?? '', ['`loadWindowDays`', '`maxRows`', '加载校验', '卷六不另设'], '8.1 §2.5 station.json 有 loadWindowDays、maxRows');
// 第十一版（N4 删两字段；二审小项 5 标题改"有占用的日子不走闭式"）：改查现行原文；反向：旧字段串与旧标题不得残留
need(s3, ['`stationLog.<建筑>`', '`stationFold.<建筑>.{daily: map<integer, map<ref vocab fixture, integer>>}`', '保留期内只做加法，过了保留期整日删去', '只追加与折叠', '占用边释放或到期的同一事务里往 `stationLog` 追加一条', '`rules.facility.station.loadWindowDays`、`maxRows` 折叠', '**补结按事件时间逐日交错**', '第 D 日的日结只读起止落在第 D 日内的那部分记录', '**离屏补结也逐日结算**', '卷二十七离屏补结 `condition` 时同样逐建筑逐日补结，劣化没有闭式', '有工位占用的日子，当日占用分钟照常从记录取'], '8.1 §3.3 stationLog、stationFold 一行：写者、折叠、补结交错、离屏补结也逐日结算');
// 1114 统计层勘误（甲批只核 T1）：标题"有占用的日子不走闭式"改为"离屏补结也逐日结算"；反向：§3.3 去掉"劣化没有闭式"一句后不得再有任何"闭式"
report(!/闭式/.test(s3.replace(/劣化没有闭式/g, '')), '8.1 反向：§3.3 无闭式残留（只许"劣化没有闭式"）');
report(!s3.includes('olderMinutes') && !s3.includes('olderCount') && !s3.includes('离屏闭式不读这份记录'), '8.1 反向：§3.3 没有 olderMinutes、olderCount 与旧标题"离屏闭式不读这份记录"');
need(s3, ['`stationLog.<建筑>`、`stationFold.<建筑>`', '五个路径模式在 `subjectRecords` 登记'], '8.1 §3.3 两条路径登记终止去留');
need(row('S19-6'), ['`stationLog`', '`stationFold`'], '8.1 S19-6 写者扫描含 stationLog、stationFold');
const r34 = rule(3, 4);
need(r34, ['**逐条记录**', '`{fixture, kind, holder, fromMinute, toMinute}`', '恰记一条', '**读视图**', '各日分到的分钟之和等于它的总时长', '补结第 D 日时照样按记录的时刻裁剪到第 D 日', '**日结只读它**', '本卷没有占用分钟的日计数', '**保留期、条数上限与折叠**', '① 保留期', '② 条数上限', '按 `toMinute`、固定装置 id、占用者 id 升序从最早的折起', '折叠前后 `occupancy` 给出的每日每类占用分钟逐位相同', '释放与到期不发事件'], '8.1 §4.3 规则 4 四点：逐条记录、读视图、日结只读它、保留期与折叠');
// 第十一版（N4）：原必含"有史以来全部已结束占用的分钟总和"是随两字段一并删去的断言，改查"daily 里没有早于保留期的日；stationFold 只有 daily"，并加反向
report(!assertLine('A19-3.2').includes('有史以来') && !assertLine('A19-3.2').includes('olderMinutes'), '8.1 反向：A19-3.2 不再有"有史以来总和"与 olderMinutes');
need(assertLine('A19-3.2'), ['恰在 `stationLog` 里记一条', '起止分钟与那条边逐位相同', '**折叠不变**', '`stationLog` 的条数在日结后不超过 `maxRows`', '`daily` 里没有早于保留期的日；`stationFold` 只有 `daily` 一个字段', '**补结不变**', '把第 D 日的日结推迟到第 D+1 日的若干释放、到期之后再跑', '`stationMinutesToday` 不存在'], '8.1 A19-3.2 逐条可查、折叠不变、补结不变');
need(row('Q21'), ['`stationLog`', '`stationFold`', '没有日计数', '已关闭'], '8.1 Q21 定为逐条记录');
need(lines.find(l => l.startsWith('| 卷六 §4.10 |')) ?? '', ['`.occupancy`', '`rules.facility.station.loadWindowDays`', '不存任何占用量'], '8.1 §5.1 卷六行：只读 occupancy，窗口读本卷键');
// 8.1 否定（只查正文，裸名）：删去或撤销的说明句里提到旧名不算，其余句子零出现；替卷六定腿的句子零出现
const DEL = /删去|已删|删除|撤销|作废|不存在/;
const liveHits = names => [...new Set(lines.flatMap((l, i) => l.split('。').filter(s => names.some(n => s.includes(n)) && !DEL.test(s)).map(() => i + 1)))];
const liveOld = liveHits(['stationMinutesToday', 'verb_station_released', 'verb_station_expired']);
report(liveOld.length === 0, '8.1 正文除删去、撤销说明句外不出现 stationMinutesToday、verb_station_released、verb_station_expired', liveOld.join(' '));
const sixLegs = lines.map((l, i) => /卷六只做三件事|卷六不记物品腿/.test(l) ? i + 1 : 0).filter(Boolean);
report(sixLegs.length === 0, '8.1 正文没有替卷六定腿的句子', sixLegs.join(' '));
// 8.2 实物账：规则 11 表十一行（含物化建行、扩建、承载物终止）与带事由代号的明细
const r111 = rule(1, 11);
const tbl = r111.split('\n').map(l => l.trim()).filter(l => l.startsWith('| ') && !l.startsWith('| 事由') && !/^\|[-| ]+\|$/.test(l));
const CAUSES = ['开局建行', '物化建行', '运行期建成', '扩建', '修缮补缺', '修缮换料', '燃烧', '拆除', '损毁', '承载物终止', '原地翻修'];
report(tbl.length === 11 && CAUSES.every((c, i) => (tbl[i] ?? '').startsWith(`| ${c}`)), '8.2 §4.1 规则 11 表恰十一行，事由依次齐全', `行数 ${tbl.length}`);
const trow = c => tbl.find(l => l.startsWith(`| ${c}`)) ?? '';
need(trow('物化建行'), ['§4.4 规则 9', '| 建行写入的各料质量 | — | — | 写入同样的质量 |'], '8.2 表"物化建行"行：记砌入');
need(trow('扩建'), ['§4.4 规则 8', '| 砌进去的各料质量（没有则不记） | — | — | 加同样的质量 |'], '8.2 表"扩建"行：砌进去的记砌入');
need(trow('承载物终止'), ['§4.10 规则 8', '可回收量（算式同损毁）', '行上其余的全部质量', '各料减到 0'], '8.2 表"承载物终止"行：记法同损毁');
need(trow('原地翻修'), ['先照"拆除"一行记旧料，再照"运行期建成"一行记新料', '先减到 0，再写入新料'], '8.2 表"原地翻修"行：翻修 = 拆除 + 新建');
need(r111, ['**守恒式（不变量）**', '`wallFlowKg[k].laidKg − wallFlowKg[k].takenKg − wallFlowKg[k].lostKg = materialKg[k]`', '不设容差', '没有第十二种', '**交出的明细**', '`{facility: 建筑行, cause: 上表的事由（verb 族代号，本卷登记）, rows: [{material, laidKg, takenKg, lostKg}]}`', '明细的结构只在这里定义', '只在卷六 §4.1 规则 5 定义，本卷不写', '燃烧只有损失一项，不交明细'], '8.2 §4.1 规则 11 守恒式与带事由代号 cause 的明细');
need(dimRow('wallFlowKg'), ['laidKg: number, takenKg: number, lostKg: number', 'stockMode: raw', '单调不减', '与 `materialKg` 的加减在同一步写入', '`laidKg − takenKg − lostKg = materialKg`'], '8.2 §2.1 wallFlowKg 一行');
need(a12, ['**实物账守恒**', '开局与物化建的行、扩建过的行、原地翻修过的行', '`laidKg − takenKg − lostKg = materialKg`', '已终止的建筑行（拆除、损毁、承载物终止三种起因）`materialKg` 各料为 0', '改写 `materialKg` 的代码路径与规则 11 表的行一一对应', '对平的断言只在卷六 A6-1.2'], '8.2 A19-1.2 实物账守恒句');
// 8.3 守恒缺口 G3、G6 写确定
need(r7, ['**上限的截法**', '`ΔL = min(floor(acc ÷ minutesPerM3), r)`', '`repairedVolumeLRem` 置 0', '与怎样切分提交无关', '**`materialKg` 里值为 0 的料不算在内**', '不参加"末项取 1 减前几项之和"'], '8.3 §4.1 规则 7 收下分钟上限确定式（G3）、零值料不算份额（G6）');
need(a12, ['`minutesPerM3` 小于每立方米升数时同样成立', '一笔做完时 `repairedVolumeLRem` 为 0', '`materialKg` 里值为 0 的料不出现在 `material` 里', '总质量为 0 的建筑 `material` 为空'], '8.3 A19-1.2 G3、G6 断言');
// 8.4 拆除一次截断、翻修四步（翻修 = 拆除 + 新建；房间按新形制的同一纯函数对应）、扩建、物化建行
const r43 = rule(4, 3);
// 第十一版（二审 N2 ①②）：对应键由未登记的"分区角色代号"改为形制 rooms 的角色代号（房间行存 roomRole），位置改写走 relocate；改查现行原文，反向：旧键不得残留
need(r43, ['**两次乘法只截断一次**', '中间积不截', '**原地翻修先拆再建**', '依次做四步', '① 旧料：照上面拆除的算式处置', '建筑行不走终止协议', '② 未完的修缮', '`repairLot` 置空、`repairedVolumeLRem` 置 0，`repairedVolumeL` 不动', '③ 新料与新形制：照规则 6', '④ 房间行', '用建行时生成房间行的同一个纯函数', '按新形制条目的 `rooms` 列表', '**对应只读角色代号**', '现有房间行按行上存的 `roomRole`（§2.1）分组', '后继是建筑行', '由建行函数补建并写 `roomRole`（§3.3）', '只读角色代号与序号，不读显示名', '资产份额与散料归谁，只在卷六 §4.1 规则 5 定义', '任何一步不成整笔回滚'], '8.4 §4.4 规则 3：拆除一次截断（G4）；翻修四步（G2）与房间行按 roomRole 对应');
report(!body.includes('分区角色'), '8.4 反向：正文不再出现未登记的"分区角色"（修订记录除外）');
// 第十一版（N3 选 a）：原必含"没有砌料的安装不改 `materialKg`、不交明细"被改写（多了"不改 envelopeVolumeL"），改查现行原文并补设计体积随之增大
// 第十二版（新 3）：原必含 floor(Σ_k 砌入质量_k ÷ density_k) 是被裁定改掉的写法（与现存升数取整方向相反），改查 E_后 − E_前、同一向上取整口径、待补升数不变；反向：旧式不得残留
need(rule(4, 8), ['**扩建就是加装固定装置**', '§4.1 规则 11"扩建"一行记砌入', '**同一事务里设计体积随之增大**', '`envelopeVolumeL` 加上这一事务使现存升数增加的量 `E_后 − E_前`', '同一个向上取整口径', '待补升数 `V − E` 逐位不变', '§3.3 的第二写者', '没有砌料的安装不改 `materialKg`、不改 `envelopeVolumeL`、不交明细', '一律走规则 3 的原地翻修'], '8.4 §4.4 规则 8 扩建（第十二版：加 E_后 − E_前，同一向上取整口径，待补升数不变）');
report(!rule(4, 8).includes('floor(Σ_k 砌入质量_k ÷ density_k)'), '8.4 反向（第十二版）：规则 8 不再按砌入质量向下取整加设计体积');
need(rule(4, 9), ['**远方地点的物化建行**', '规则 11"物化建行"一行', '事由代号与开局建行不同', '与哪里先被看见、推进怎样分段无关', '账本一侧怎样记归卷六 §4.1 规则 5'], '8.4 §4.4 规则 9 物化建行');
need(assertLine('A19-4.2'), ['开局建行、物化建行同判', '三个数精确相乘后只截断一次', '`repairLot` 为空、`repairedVolumeLRem` 为 0、`repairedVolumeL` 不变', '翻修之后任意修缮不会使任何一种料的 `materialKg` 为负', '翻修后房间行的集合恰等于建行纯函数按新形制算出的集合', '扩建（加装固定装置）前后 `form`、`wallThicknessM`、`storeys` 逐位不变', '`envelopeVolumeL` 的增加量逐位等于该事务前后现存升数之差 `E_后 − E_前`（同一个向上取整口径；没有砌料的安装为 0）', '扩建前后待补升数 `max(0, V − E)` 逐位不变', '扩建后烧掉一部分料再修到没有待办，`envelopeMassKg` 回到扩建后的值', '同一处地点在不同世界日物化，`form` 与 `materialKg` 逐位相同', '翻修时新旧房间的对应只读 `roomRole` 与序号', '本卷写者对这些路径的直接写入计数为 0'], '8.4 A19-4.2 拆除、翻修、扩建、物化断言（第十一版：扩建加设计体积、物化与世界日无关、房间对应与改写通道）');   // 第十一版：原"扩建前后 … envelopeVolumeL … 逐位不变"与 N3 相反，改查现行原文
report(!assertLine('A19-4.2').includes('`form`、`envelopeVolumeL`、`wallThicknessM`、`storeys` 逐位不变'), '8.4 反向：A19-4.2 不再说扩建前后设计体积不变');
report(!assertLine('A19-4.2').includes('增加量逐位等于该事务砌入的料的升数'), '8.4 反向（第十二版）：A19-4.2 不再按砌入的料的升数断言设计体积增加量');
// 8.5 承载物终止进实物账；卷二【十七·补】的 placement 与跨界边
need(r108, ['**墙料进实物账**', '§4.1 规则 11"承载物终止"一行', '算式与损毁相同', '事由代号是承载物终止', '凡设施行终止同一处理'], '8.5 §4.10 规则 8 承载物终止墙料进实物账');
// 第十一版（二审小项 2：卷二定义 placement.rows 是 map）：`{rows: [], …}` 改查 `{rows: {}, …}`；反向：数组写法不得残留
need(rule(10, 2), ['`relocate(建筑行, null, {rows: {}, edges: []}, 原因代号)`', '**跨界边在离场时作废**'], '8.5 §4.10 规则 2 收起 placement 为空、跨界边作废');
report(!body.includes('{rows: [], edges: []}') && /rows: map<EntityId/.test(v2), '8.5 反向：正文不再把 placement.rows 写成数组（卷二定义为 map）');
need(rule(10, 3), ['`placement.rows`', '`placement.edges`', '新跨界边'], '8.5 §4.10 规则 3 展开给 placement.rows 与 placement.edges');
need(a102, ['收起那一笔的 `placement` 是 `{rows: {}, edges: []}`', '（跨界边）计数为 0', '持有边照前半句逐位相同', '跨界边恰是该笔 `placement.edges` 给出的那些'], '8.5 A19-10.2 跨界边与 placement 断言');
// 8.6 燃烧 b 的标度、燃烧与损毁两个事务（G5、G7）
need(rule(16, 3), ['**烧到损毁线时分两个事务**', '`b` 取查表在 10⁸ 标度下的那个值', '不先截到四位', '损毁事务开始那一刻'], '8.6 §4.16 规则 3 b 取 10⁸ 标度（G5）、燃烧与损毁分两个事务（G7）');
need(rule(16, 4), ['承载物终止 §4.10 规则 8 都引用本句'], '8.6 §4.16 规则 4 房间行先终止被承载物终止引用');
need(assertLine('A19-16.2'), ['损毁、拆除、承载物终止三种起因同判', '该事务开始那一刻的 `materialKg`', '燃烧与损毁是先后两个事务', '同一个 10⁸ 标度的值'], '8.6 A19-16.2 三种终止起因同判、G5、G7');

// ── 九、第十一版（李白对 审查/卷六重拆-二审.md N1–N5 的裁定，及其后对 §8 Q26 选甲的追改；审查方补，见 审查/卷六重拆-二审只核.md）。原有各项判据不动，只新增 ──
report(all.some(l => l.startsWith('## 附 第十一版修订记录')), '9.0 卷末有第十一版修订记录');
// 9.1 N2 ①：形制登记房间角色与份额、房间行存角色代号
need(lines.find(l => l.startsWith('| `bform` 形制 |')) ?? '', ['`rooms: list<struct{role: ref vocab roomrole, share: fraction}>`', '份额之和为 1，加载校验', '可以为空列表'], '9.1 §2.4 bform.rooms 登记房间角色与份额');
need(lines.find(l => l.startsWith('| `roomrole` 房间角色 |')) ?? '', ['`roomrole_`', '开放', '只作房间行的对应键', '规则里不对任何一个代号分支'], '9.1 §2.4 roomrole 族');
need(dimRow('roomRole'), ['ref vocab roomrole nullable', '建行函数生成房间行时写入', '只作翻修时新旧房间的对应键', '别的规则不读它'], '9.1 §2.1 房间行维度 roomRole');
need(s3, ['房间行的 `roomRole`', '原地翻修是它的第二种调用', '按新形制的 `rooms` 补建缺的房间行、写它们的 `roomRole`'], '9.1 §3.3 建行写者写 roomRole、翻修是第二种调用（N2 ③）');
// 9.2 N2 ②（Q26 李白选甲之后）：房间位置改写只经 relocate，限翻修事务；作者自加的"判不可行"已撤
// 第十二版（李白对 审查/卷六重拆-二审只核.md 新 1 选 a）：原必含"**它的位置量与面积只经卷二的统一通道改写**"是被裁定改掉的字面（面积不是位置量），
//   改查两条通道：位置量走 relocate、placement.rows 不含面积；面积由 construction.mjs 在翻修事务内整值写、不经 relocate、事务外拒绝；反向：旧句不得残留
// 第十三版（李白对 审查/卷六重拆-改后核对.md B 选甲）：面积写权改用卷五 §3.3 单项登记名单的现成登记 `created.*.props.areaM2`（改写写者 construction.mjs，
//   行范围 comp_zone 且在 comp_facility 之内）；"只在翻修事务内写"是 construction.mjs 自己的代码路径约束（A19-10.2 按调用点计数查），卷二不加限事务的写权机制。
//   原必含"'仅限翻修事务内'可写""翻修事务之外对它的写入一律被拒""事务外对它的写入计数为 0"与卷五组件类一段的"另登记为'仅限翻修事务内'可写"、`causes`、`writer`
//   都是被这条裁定改掉的字面，改查现行原文（单项登记名单一行、行范围、代码路径约束、调用点只有两处）；反向：旧句不得残留，卷五正文不得再有"比照 relocatableIn"括注与
//   "以组件类一段为准"的优先级句。不放宽：写权由"限事务登记"换成"登记行范围 + 调用点计数"两头都查。
need(r43, ['**位置量与面积分两条通道改写**', '`placement.rows` 只给按新布局算出的位置量（不含面积', '本卷的写者不直接写位置量', '`areaM2` 由 `construction.mjs` 在翻修事务内按新布局', '整值写入，不经 `relocate`', '卷五 §3.3 单项登记名单里 `created.*.props.areaM2` 一行', '改写写者是 `construction.mjs`', '行范围只写 `inside: [comp_facility]`','是 `construction.mjs` 自己的代码路径约束', '写建筑之内各行（房间与嵌套设施）`areaM2` 的调用点只有两处', '即建筑之内的行（房间与嵌套设施', '最外层的建筑行本身与聚落的分区不在范围内', '**嵌套设施行与房间行一样处理**', '只在它外层建筑的翻修事务内，由 `construction.mjs` 随外层的新布局一并整值重算', '翻修事务之外对这些行 `areaM2` 的任何写入都被拒','建行函数（建行事务）与翻修这一步（翻修事务）', '别的函数不写', '**固定建筑的房间行同样照此挪位置**', '`relocatableIn`', '翻修事务之外对 `comp_zone` 的行调 `relocate` 一律被卷二拒绝', '**房间键不随挪位置变**'], '9.2 §4.4 规则 3 ④ 位置量走 relocate；面积由 construction.mjs 整值写，写权在卷五单项登记名单 areaM2 一行，只在翻修事务内写是代码路径约束（第十三版）');
// 第十五版（李白对 审查/卷十九-areaM2行种类核查.md 选方案三：嵌套设施行与房间行一样带 areaM2，只在外层建筑翻修事务内由 construction.mjs 重算）：
//   原必含"写房间行 `areaM2` 的调用点只有两处""聚落的分区都不在内""`areaM2` 在建筑之内的房间行上（行范围""`areaM2`（建筑之内的房间行除外"是被裁定改掉的"只有房间行"字面，
//   改查现行原文"建筑之内的行（房间与嵌套设施""最外层的建筑行本身与聚落的分区不在范围内"；反向：旧字面不得残留。不放宽：另加查嵌套设施行只在外层翻修事务内重算、事务外拒。
report(!r43.includes('写房间行 `areaM2` 的调用点只有两处'), '9.2 反向（第十五版）：规则 3 ④ 不再说"写房间行 areaM2 的调用点"（嵌套设施行同在内）');
report(!r43.includes('**它的位置量与面积只经卷二的统一通道改写**'),'9.2 反向（第十二版）：规则 3 ④ 不再说位置量与面积同经统一通道');
report(!r43.includes('"仅限翻修事务内"可写') && !r43.includes('翻修事务之外对它的写入一律被拒'), '9.2 反向（第十三版）：规则 3 ④ 不再有"仅限翻修事务内"可写的写权登记与"事务外写入一律被拒"句');
need(a102, ['`placement.rows` 里不含面积', '房间行 `areaM2` 的写入只出现在建行事务与翻修事务里，写者是 `construction.mjs`，这两种事务之外对它的写入计数为 0', '调用点只有建行函数与翻修一步两处', '代码路径约束', '按调用图计数', '写权登记在卷五 §3.3 单项登记名单 `created.*.props.areaM2` 一行', '行范围 `inside: [comp_facility]`，即建筑之内的行', '聚落分区的 `areaM2` 不在这条行范围内', '即建筑之内的行：房间与嵌套设施', '嵌套在建筑里的设施行及其房间同判', '只在外层建筑的翻修事务内由 `construction.mjs` 重算', '最外层建筑行本身的 `areaM2` 与聚落分区的 `areaM2` 不在这条行范围内，建成后无人改写', '可移动建筑展开（`deployFacility`）不写任何行的 `areaM2`'],'9.2 A19-10.2 面积写入只在建行与翻修事务内、调用点两处、写权引卷五单项登记名单（第十三版）');
report(!a102.includes('`construction.mjs`，事务外对它的写入计数为 0'), '9.2 反向（第十三版）：A19-10.2 不再是"事务外对它的写入计数为 0"的旧连写');
// 第十三版：卷五 §3.3 单项登记名单 created.*.props.areaM2 一行（改写写者 construction.mjs，行范围 comp_zone 且在 comp_facility 内）；只查卷五正文（修订记录除外）
{ const v5All = v5.split(/\r?\n/), v5Cut = v5All.findIndex(l => l.startsWith('## 附 '));
  const v5Body = v5Cut < 0 ? v5All : v5All.slice(0, v5Cut);
  const a33 = v5Body.findIndex(l => l.startsWith('### 3.3 ')), b33 = a33 < 0 ? -1 : v5Body.findIndex((l, i) => i > a33 && /^### 3\.4 /.test(l));
  const v5s33 = a33 < 0 ? [] : v5Body.slice(a33, b33 < 0 ? v5Body.length : b33);
  // 第十四版（李白对 审查/卷六重拆-改后核对2.md 裁定 ①）：行范围只写 inside: [comp_facility]；原必含 `withComponent: [comp_zone]`、"两条同时满足"、"聚落的分区不在内"
  //   与"（挂 `comp_zone` 且在挂 `comp_facility` 的行之内）"是被裁定改掉的字面，改查现行原文；反向：该行不再有 withComponent，静态量声明不再写旧括注。不放宽。
  const areaRegRow = v5s33.find(l => l.startsWith('| `created.*.props.areaM2` |')) ?? '';
  // 第十五版：卷五三处括注由"只有房间行"改为"建筑之内的行（房间与嵌套设施）"，行范围不变；改查现行原文，反向查旧字面
  need(areaRegRow, ['卷十九 `construction.mjs`', '`inside: [comp_facility]`', '只写这一条', '建筑之内的行（房间与嵌套设施', '最外层的建筑行本身与聚落的分区不在范围内'], '9.2 卷五 §3.3 单项登记名单 created.*.props.areaM2 一行：改写写者 construction.mjs，行范围只写 inside: [comp_facility]，圈建筑之内的行（房间与嵌套设施），最外层建筑行与聚落分区不在内（第十五版）');
  report(areaRegRow !== '' && !areaRegRow.includes('聚落的分区都不在内'), '9.2 反向（第十五版）：卷五名单 areaM2 一行不再写"聚落的分区都不在内"的旧括注');
  report(areaRegRow !== '' && !areaRegRow.includes('withComponent'), '9.2 反向（第十四版）：卷五单项登记名单 areaM2 一行不再有 withComponent（含 `withComponent: [comp_zone]`）');
  report(!(v5s33.find(l => l.startsWith('- 有改写写者的：')) ?? '').includes('挂 `comp_zone` 且在挂 `comp_facility` 的行之内'), '9.2 反向（第十四版）：卷五静态量声明不再写"挂 comp_zone 且在挂 comp_facility 的行之内"');
  const declW = v5s33.find(l => l.startsWith('- 有改写写者的：')) ?? '', declS = v5s33.find(l => l.startsWith('- 只有建行写者')) ?? '';
  need(declW, ['`areaM2` 在建筑之内的行上（行范围 `inside: [comp_facility]`', '嵌套在建筑里的设施行', '单项登记名单 `created.*.props.areaM2` 一行', '最外层的建筑行本身、聚落的分区', '上 `areaM2` 照旧只有建行写者'], '9.2 卷五 §3.3 静态量声明：建筑之内的行（房间与嵌套设施）的 areaM2 列在"有改写写者的"一项，最外层建筑行与聚落分区照旧只有建行写者（第十五版）');
  need(declS, ['`areaM2`（建筑之内的行——房间与嵌套在建筑里的设施——除外'], '9.2 卷五 §3.3 静态量声明："只有建行写者"一项把建筑之内的行（房间与嵌套设施）除外（第十五版）');
  report(!declW.includes('建筑之内的房间行上（行范围') && !declS.includes('建筑之内的房间行除外'), '9.2 反向（第十五版）：卷五静态量声明不再写"只有房间行"的旧括注');
  const zoneLine = v5Body.find(l => !l.startsWith('|') && l.includes('`comp_zone`') && l.includes('`relocatableIn`')) ?? '';   // 正文组件类一段
  need(zoneLine, ['建筑之内挂它的行的 `areaM2` 在 §3.3 单项登记名单里有改写写者', '面积不是位置量、不经 `relocate`'], '9.2 卷五 §2 组件类一段：面积写权引 §3.3 单项登记名单，面积不经 relocate（第十三版）');
  report(!zoneLine.includes('另登记为"仅限翻修事务内"可写') && !/比照[^。；]{0,40}relocatableIn/.test(zoneLine), '9.2 反向（第十三版）：卷五组件类一段不再有"仅限翻修事务内"可写的登记与"比照 relocatableIn"括注');
  const v5Bad = v5Body.map((l, i) => /比照[^。|]{0,40}relocatableIn|以组件类一段[^。|]{0,8}为准|"仅限翻修事务内"可写/.test(l) ? i + 1 : 0).filter(Boolean);
  report(v5Bad.length === 0, '9.2 反向（第十三版）：卷五正文没有"比照 relocatableIn"括注、"以组件类一段为准"的优先级句与"仅限翻修事务内"可写的登记', v5Bad.join(' ')); }
report(!r43.includes('否则 `buildPlan` 返回不可行与原因代号') && !r43.includes('**待裁定的前提**'), '9.2 反向：规则 3 ④ 不再有"保留而位置量须变的房间行判不可行"的临时限制');
report(v2.includes('relocatableIn') && v5.includes('relocatableIn'), '9.2 前提：卷二 §2.6 第 1 点 ③、卷五 comp_zone 已登记 relocatableIn');
need(row('Q26'), ['**房间行改挂一项已结案**', '选甲'], '9.2 Q26 写明已裁定');
// 9.3 新真问题（审查/卷六重拆-二审只核.md 新 1）：面积不是位置量（卷二 §2.6 第 2 点），relocate 的 placement.rows 不能给面积；规则 3 ④ 不得再让 relocate 写面积
report(!r43.includes('`placement.rows` 给它按新布局算出的位置量与面积'), '9.3 反向（新真问题）：规则 3 ④ 不让 relocate 写面积（面积不是位置量）');
// 9.4 新真问题（同上 新 3）：Q26 选甲后，A19-10.2 不得再说"对不挂 comp_portable 的行调 relocate 被拒"而不除翻修事务
report(!a102.includes('对不挂 `comp_portable` 的行调 `relocate` 被拒（卷二 E-VIEW-UNDECLARED-WRITE），固定建筑'), '9.4 反向（新真问题）：A19-10.2 的 relocate 拒绝句已按卷二【十七·补】㉒ 除去翻修事务');
// 9.5 N1：物化用料只由（世界种子、地点）决定
need(rule(4, 9), ['**物化建行的形制、用料与各料质量只由（世界种子、地点）决定**', '卷十在第 0 日给这处地点算建筑清单的同一个纯函数', '都不进这个函数', '世界日只影响建行之后的事'], '9.5 §4.4 规则 9 物化用料只由种子与地点决定（N1）');
report(!rule(4, 9).includes('（世界种子、地点、世界日）决定'), '9.5 反向：规则 9 不再说物化行由世界日决定');
// 9.6 N4：正文不出现两个已删字段
report(!body.includes('olderMinutes') && !body.includes('olderCount'), '9.6 反向：正文不出现 olderMinutes、olderCount（修订记录除外）');

// ── 十、areaM2 行种类核查（李白裁定：卷五 areaM2 改写登记行范围只写 inside:[comp_facility]，前提是"建筑之内带 areaM2 的行只有 comp_zone 一种"；
//    见 审查/卷十九-areaM2行种类核查.md）。从卷五、卷二十正文枚举"可能位于 comp_facility 之内且带 areaM2 的行种类"，断言集合恰为 {comp_zone, comp_facility}（第十五版裁定后）。不放宽：
//    若正文写明别种行可挂在建筑之下，本组即报 FAIL，须报李白，不擅自扩名单 ──
{ const cut = t => { const a = t.split(/\r?\n/), c = a.findIndex(l => l.startsWith('## 附 ')); return (c < 0 ? a : a.slice(0, c)).join('\n'); };
  const v5b = cut(v5), v20b = cut(read('卷二十-时间日历天气与环境.md'));
  const areaDim = v5b.split('\n').find(l => l.startsWith('| `areaM2` |')) ?? '';
  report(/\| always \|/.test(areaDim), '10.0 前提：卷五 §2.1 areaM2 必填 always（凡 place 行都带 areaM2，带不带只看能否位于建筑之内）');
  // 每条：行种类、正文依据（两卷正文的原句片段；全部命中才算"可位于建筑之内"）
  const evidence = [
    { comp: 'comp_zone', v5: ['分区是挂 `comp_zone` 的 place 行，`parent` 是站点或建筑'], v20: [] },
    { comp: 'comp_facility', v5: ['矿井、地窖是带围护的建筑实例'], v20: ['地下的围合空间（地窖、巷道）即使挂在地面建筑之下'] },   // 地窖、巷道 = 建筑实例行，可挂在地面建筑行之下
    { comp: 'comp_tract', v5: ['挂在建筑行之下'], v20: [] },   // 卷五只写水体存量单元"不挂在建筑行之下"；此条依据是否定句，下面单独排除
  ];
  const kinds = new Set(evidence.filter(e => e.comp !== 'comp_tract' && [...e.v5.map(k => v5b.includes(k)), ...e.v20.map(k => v20b.includes(k))].every(Boolean)).map(e => e.comp));
  report(v5b.includes('不挂在建筑行之下') && v5b.includes('`comp_tract` 与 `comp_enclosure`、`comp_facility`、`comp_zone` 互斥'), '10.1 前提：存量单元（含水体）不挂在建筑行之下、与建筑分区互斥，不计入');
  // 第十五版（李白选方案三照实写）：嵌套设施行（地窖、巷道）可位于建筑之内且带 areaM2，期望集合由 {comp_zone} 改为 {comp_zone, comp_facility}；仍要求恰等，不放宽
  const want = ['comp_zone', 'comp_facility'];
  report(kinds.size === want.length && want.every(k => kinds.has(k)), '10.2 可能位于 comp_facility 之内且带 areaM2 的行种类恰为 {comp_zone, comp_facility}（第十五版）',`实得 {${[...kinds].join(', ')}}`);
  const reg = v5b.split('\n').find(l => l.startsWith('| `created.*.props.areaM2` |')) ?? '';
  const scope = reg.split('|').map(s => s.trim())[4] ?? '';
  report(scope.startsWith('`inside: [comp_facility]`') && !reg.includes('withComponent'), '10.3 卷五名单 areaM2 一行行范围为 inside:[comp_facility]，无 withComponent', scope.slice(0, 40)); }

out.push(failed === 0 ? 'RESULT  全部通过' : `RESULT  未通过 ${failed} 项`);
console.log(out.join('\n'));
process.exitCode = failed === 0 ? 0 : 1;
