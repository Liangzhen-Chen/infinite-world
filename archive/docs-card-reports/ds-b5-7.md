# 卡回报：块 5 第 5-7 张《块验收与整合》

分支 `ds/b5-7`；基线 `origin/master` e43a32f6（开工前 `git fetch origin && git rebase origin/master`，已是最新）。写：Claude Opus 5.5（子代理）。

## 卡头第三节自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 下节"卷文依据"；行号按现行卷文核过（R9-2.3 现行在卷九 :663，体检与卡文记 :658；R12-5.6 现行 :806，卡文记 :795） |
| 2 | 没有按 id/名字/场景写特例 | 是 | `kernel/load/world.mjs` 只按"写者核对函数 + 所属表"接线；`effects-validate.mjs` 按原语契约 `required` 的类型记号判非 id 参数，不点名原语；测试实体表是测试内造前提 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | paramsRX 省略本身合法（只有 id 型必需参数的原语如 move 省略即通过）；只有契约含非 id 必需参数的原语（如 vital 的 delta）缺参才报 E-EFF-PARAM——省略 paramsRX 或写成 `{}` 都算缺参（`tests/kernel/effects.test.mjs` 新用例）；加载器四类坏行各一例必失败（`tests/kernel/load-writer-checks.test.mjs`）；去留表未登记的世界运行期 `terminate` 读表即 E-RULES-UNREGISTERED、状态与事件不变（`tests/kernel/block5-accept.test.mjs` 新用例），"登记了才核"不成口子 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 守恒比前后合计、残余比空表、事件按种类计数对关闭边数；窗口到期时刻 = (终止日 4 + 窗口 3) × 日长（日长取 `_units` 换算）；不读仓库计数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | `TERMINATE_RULES_TABLE` 是 `terminate.mjs` 定义源 `S.rulesTable` 的导出，不是新常量；判据指纹重盖经登记器、rev+1 带记录，未手改 criteria.json |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 唯一清单外的一行是 paramsRX 一项的定义源 `kernel/handles/markers.mjs`（AGENTS"必要接点"，已列入"偏离卡文"第 4 条交主会话核）。diff 共约 3880 行：`git diff --cached --shortstat` → `14 files changed, 3829 insertions(+), 42 deletions(-)`（只核补改前读数；含勘误前快照 3300 余行与本回报）。偏离：`kernel/handles/markers.mjs` 一行（primitive 输出 need 的定义源）；`tools/accept/criteria.json` rebase 到含 K5-24 门禁的主线后取主线版本，再经登记器重盖 17 类指纹 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 737 / ℹ pass 737 / ℹ fail 0`（只核补改、rebase 后）；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（items 不过 3 条 A12-4.5、S12-2、S12-3，均非必过，master 上同样存在） |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 块 5 写者的坏数据现在在加载时就拦下、终止协议随加载装好，块 6 只剩装配文件的三处接点（已逐项挂卡）；装配期才能交的项没有在加载器里伪造 engine 或越组 import |

## 卷文依据（摘原句）

- 卷二 §2.6 :525：「不变量（事务提交后核对，违反即 E-TERM-RESIDUE）：不存在指向已终止实体的持有边、非零账户余额或状态实例……也不存在以它为 `owner` 或 `ref` 的到期项（窗口到期项除外）；对已终止实体的任何写入一律拒写，同码」。
- 卷二 §2.6 :530：「到期时刻是日历上'终止日 + `reviveWindowDays`'那一日的起点；到期时由 `kernel/terminate.mjs` 删除该实体名下全部 `hold` 记录，终止标记不动」。
- 卷二十 :506：「在 `due` 段发出到期事件（动词 `verb_due_elapsed`，带 `kind` 与 `owner`），由拥有者的订阅者处理后果。调度器不知道后果是什么」。
- 卷二 §2.7 :811：「kernel 不 import 任何其他组或共享库（E-KERNEL-UPWARD-IMPORT）……装配文件只调用各组的挂接函数，自己不做任何判定」。
- 卷十二 R12-5.6 :806：「用 §4.6 登记的场景加性质测试，不在测试里写某个实例应该是多少」；R12-6.7 :847：「都登记成 §2.8 的一个模板加参数，不各写一套比较程序」。
- 李白 11-19 11:0x ③（`docs/审查/李白裁定-1117.md:1180`）：「纯 id 原语也须写空 paramsRX：改成可省略，省略即"无数值参数"；原语的非 id 必需参数缺了仍报 E-EFF-PARAM」。
- 李白 11-18 22:10 五.2（同文件 :1083）：「块5验收如实记"部分、三适配器 not_run"」。

## 改了哪些文件

- `server-plugin/kernel/load/world.mjs`：词表收齐后跑 `checkVerbRows`、`checkHoldingKindRows`，规则目录登记了去留表时跑 `checkTerminationTables`，错误行并入加载报告（违者加载失败）；加载通过时 `installTermination(decl)`。
- `server-plugin/kernel/terminate.mjs`：导出 `TERMINATE_RULES_TABLE`（= `S.rulesTable`）；三处"挂 5-7"注释改为现状。
- `server-plugin/kernel/holdings.mjs`：只改四处"挂 5-7"注释（engine 交入挂块 6 装配卡）。
- `server-plugin/kernel/handles/markers.mjs`、`server-plugin/kernel/validate/effects-validate.mjs`：paramsRX 可省略；契约 `required` 的非 id 参数缺了报 E-EFF-PARAM。
- `docs/统一底层设计/卷二-维度表规范与统一入口.md` 附录追加 1118k29 补注一行；改前快照 `版本快照/卷二-v17补26-勘误前-1118k29补注.md`；现行快照同步，`cmp` 一致。
- 测试：新建 `tests/kernel/load-writer-checks.test.mjs`（真实世界通过 + 四类坏行即失败 + 加载后交入终止声明表）、`tests/kernel/block5-accept.test.mjs`（残余、守恒、I16′ 内核半边、窗口期满经调度器）；`tests/kernel/effects.test.mjs` 加正反夹具。paramsRX 新用例先写、改代码前跑过为红（实得 E-EFF-OUTPUT）；加载器接线用例是接线后写的，未在接线前单独跑红（偏离"测试先行"，如实记）。
- `docs/审查/块5验收/验收记录.md`：逐项 通过/部分/not_run、挂卡、卷:行；腾讯云长测清单（不开机）。
- `tools/accept/criteria.json`：经 `node tools/accept/register.mjs F:/dnd-tmp/b57-restamp.json` 重盖 17 个类别的判据指纹（rev+1，log「判定口径不变，重盖」），原因是加载器多 import 三个内核文件、markers.mjs 改一行，检测器依赖闭包指纹随之变（同 ds-b3-4 先例）。

## 偏离卡文

1. **`checkPrimitiveCatalog` 没接进加载器**：它在规则层 `server-plugin/primitives-runtime.mjs`，kernel 组 import 规则层违反卷二 :811。记"部分、挂块 6 装配卡"（装配文件调规则层挂接函数交入世界目录）。
2. **`installHoldingEngine` 没在加载器交入**：engine 含存档模板种子，装配期才齐，只能在 `server-plugin/index.mjs`（块 6），未建 index.mjs，挂块 6 装配卡。
3. **`expireReviveWindow` 没接生产到期分发**：卷二十 :506 规定到期事件交订阅者处理，`dueSource` 的 deliver 由装配处交入、订阅分发未建；验收测试用测试组装的 deliver 证实接口可接，记"部分、挂块 6 装配卡"。
4. **改了 `kernel/handles/markers.mjs` 一行**：primitive 输出的必填字段表定义源在此，paramsRX 可省略必须改它，不在 effects-validate 里另写特例。
5. 去留表核对按 `checkClockTables` 先例"登记了才核"：只放内核常数表的校验器夹具目录（7 个现有测试）不登记该表。

## 未解决的问题

- 验收记录里 not_run／部分的六项（A4 det_save_load、A5 原语事件、A6 适配器扫描、A7 场景登记、A8 史实回填、接线 5/7/8 装配三项）各已挂卡，块 5 封块按"部分验收"处理，由主会话定。
- `docs/问题.md` 第 308 行"verb 族加载期接线（挂 5-7）"已解决，该文件不在本卡清单，请主会话删去。
- pre_commit 里非必过的 3 条（A12-4.5、S12-2、S12-3）开工前就不过，本卡未动。
