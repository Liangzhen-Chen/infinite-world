| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 §2.5 :503（terminal 的读者只有 action-capacity.mjs，别处读即 E-VIEW-PREDICATE-LOCAL）；卷四 :417、P-5 :448；卷六 A6-21.1 :1226、§4.21 规则 9、M6-29 :1545；卷二十七 S27-3 :244、A27-3.1 :478、M27-12 :855；卷二 §2.9 第 0 条装配文件 :982（mountInput 可缺项）、§1.12 未建派生登记 :390（1118k23 体例）；李白 11-19 12:4x 丙5、丙9、丙10（docs/审查/李白裁定-1117.md :1215） |
| 2 | 没有按 id/名字/场景写特例 | 是 | terminal 读者取自 state-owners.json systems.sys.capacity.predicates（path_access readerPredicates），不点名文件；类名豁免取维度表文件名即 kind（lit_scope tableKinds），不列名字；未建列登记按（表，维度）整类，不按行 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 未建列：空 columns 不放行、出错条目不放行、never/派生/未声明维度拒收、只放行缺值不放行越界值（tests/kernel/dimensions.test.mjs 新四条）；门禁：解构（声明、参数、for…of、改名、嵌套、字串键）均计；类名豁免只认恰等，同前缀实例 id 照计（instance_name-42） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具自造前提，断言命中文件名与码；真实仓库断言为 0 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未动业务代码；REQUIRED 加 never 键是比较处引用的句柄（同文件 always 的写法），不为降计数 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | lit_scope.mjs、lib/item-form.mjs 属卡文"必要的检测器接点"，temp-repo.mjs 属 tests/accept/ 相应测试（见偏离）；已跟踪文件 +673/−54（其中 criteria/items/cases 经登记器、vol2 现行快照与正文同改）；新增勘误前快照（全文复制）、9 个绕法夹具、1 个夹具维度表 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 见文末 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 6-2、6-6 有了机读"未建列"登记口、加载器支持；6-19 装配可不调 mountAi/mountNarration；块 6 新文件一提交即受 terminal 读者、basePrice、墙钟、id 字面量门禁；未缩规模、未写缺省 |

## 做了什么
- 卷二勘误 1119k3（快照 版本快照/卷二-v17补26-勘误前-1119k3.md 与 origin/master 正文一致；现行快照与正文 cmp 一致；不升版本）：① §2.9 第 0 条装配文件末补"块 6 可缺两项"；② §1.12 增"未建维度／未建列登记（唯一定义）"；附录勘误行一条。
- 加载器：dimensions-validate.mjs readUnbuiltColumns（同文件 columns，字段同 entries）；rows.mjs checkRequired 对登记（表，维度）缺值放行；加载结果带 unbuiltColumns。运行期读缺值本就按未知（known:false），未改 dimensions.mjs。_unbuilt-derived.json 加 note 与空 columns。
- 门禁：vol2.K6-24（terminal 读者闭集，path_access read＋readerPredicates，全部组）；vol6.A6-21.1（basePrice 读点，全部组，码 E-VIEW-INPUT-IMPORT 同 A6-1.1.a）；vol27.S27-3（墙钟，call_edge 取 wallclock 函数表，规则层、内核与服务端非 gate 组）。三条 implemented。path_access read 方式加单段模式的对象解构计入。
- 主会话追加项：lit_scope entityPrefix 字串恰等于已登记维度表 kind 不计（instance_name-41 必不报、-42 必报）。
- PLAN.md :39 其余适配器行注 move／time／create 改挂 6-27。

## 自定裁定
- 勘误号 1119k3（原取 1119k2；6-7 卷五勘误先合入占了 1119k2，按主会话更正改号）。两项合一号 ①②，同 1118k31 体例。
- 未建列登记放在 _unbuilt-derived.json 的 columns（卡文文件清单只列此文件；丙9"登记文件体例同 _unbuilt-derived.json"）；missing/card 文法与 entries 同；不设"已建须删"核对：列是否已建加载器判不出（运行期建行也可能缺），不同于派生式"能否编译"。
- terminal 门禁范围取全部服务端与客户端组：卷二 :503"其他所有卷与所有文件只调用这个谓词"；对照表写 [kernel, rules] 是下限。
- basePrice 不用 legacy_symbol 类：其检测器 sym_exists 没有模块（tools/accept/detectors/ 无 sym_exists.mjs，S3.b/S6/S14 全为 registered），参数按卷十二 :223、R12-11.5 要迁移行键而仓库无机读迁移行登记；改用 module_edge 现有 path_access read（同 A6-1.1.a），不新建类别。
- 墙钟范围不含 gate：M27-12 :855"扫描器在 gate 组，不受限"。
- 类名豁免的 kind 取维度表文件名（加载器 E-DIM-SCHEMA-KIND 保证 kind 与文件名一致）；用例回归时与前缀同源并入 tests/accept/bypass/dims（新增夹具表 body_plan.json，前缀 body_）。未取 kernel/load/state-owners.mjs 的 ENTITY_KINDS：检测器 import 内核文件会把该文件并入判据指纹，内核每改一次都要升判据版本；6-4 建 body_plan 表后即由表名覆盖。

## 偏离
- 卡文文件外三处接点：tools/accept/detectors/lit_scope.mjs（主会话追加项）、tools/accept/lib/item-form.mjs（登记参数键 readerPredicates）、tests/accept/temp-repo.mjs（临时仓库带上派生出的谓词文件，同 ledger.mjs 先例）。
- path_access、lit_scope、item-form 共用，经登记器 21 个类别各 rev+1 带记录（module_edge 23、wallclock、instance_name 另记本卡内容，其余记"判定口径不变"）。
- 门禁条目 1 的文字匹配半条（text_judge，#3、#38、#49）未装：rules、inputEdge、outputGate 组的 text_judge 条目（V-2.a、V-20、S13、V-23、V-25.a）一旦 implemented，现有 9 个"要 tsc"必须报用例（text_judge-35、41–48）报不出即 E-ACC-BYPASS-REGRESSION；词法检测器做不到，改用例即降门槛。id 字面量（S1）、数值字面量（S10）已 in_core 覆盖全部组，server-plugin 下新目录按余数归 rules 组，无需扩 groups。
- 块6.md 第七节只读核对，未改（不在可改清单）。

## 未决
- text_judge 半条等主会话定（需类型检查器或李白改口径）。
- 他卷维度所引词表族未建时表头怎么写（如 abilities 引 ability 族，现表头核对报 E-DIM-REF-MISSING），勘误②未涉及，6-2/6-6 碰到再报。
- pre_commit 中 vol12.A12-4.5、S12-2、S12-3 三条 implemented 条目在基线即不过（非必过，verdict 仍 pass），新条目随 K5-24 先例出现在 S12-3 行里。

## 验证
- node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：ℹ tests 797 / ℹ pass 797 / ℹ fail 0
- node tools/accept/run.mjs pre_commit：verdict pass；新用例 module_edge-45–49、wallclock-21/22、instance_name-41/42 全 pass。
- 写：Claude Opus 中档（子代理）。

## 改一轮（Opus 只核 docs/审查/6-0-Opus只核-1119.md）
- M1：path_access.mjs 解构计数不计带 readerSystems 的条目（vol6.A6-1.1.a 回到原口径），新测 api-callers.test.mjs"A6-1.1 口径不变"；module_edge rev+1 记录如实写 rev 23 记录不实与本版口径；path_access 共用的 cross_write、display_read、dual_write、version_fork 各 rev+1。
- M2：vol6.A6-21.1 source 如实写"读点"；对象字面量键、裸字串、规则数据未覆盖，挂 6-9；物品数据半由加载器既有"未声明字段即 E-DIM-STRUCT-FIELD"守（加测 tests/kernel/dimensions.test.mjs"A6-21.1 数据半"），前提物品表头不声明该维度，挂 6-2、6-22。不在加载器里按字段名特判。
- M3：vol27.S27-3 source 如实写"墙钟与性能计数器"；计时器半条不补：createWallTimer（kernel/scheduler.mjs:787 用 setTimeout）的豁免须从 kernelApi 派生，call_edge 现无此口，补了即误报，挂 6-19；costPlan/advancePlan 参数表半条挂首张建 cost-model 的卡。wallclock rev+1 记录。挂卡四行写在 docs/PLAN.md 挂卡栏。
- 块6.md :191 后补 AI-05 §7.1 P-01…P-12 块 6 覆盖子集表：P-01（buy、sell）、P-08/P-11（move）为块 6 子集，P-12 重放块 6 必过；P-01…P-11 整局 not_run（E-ACC-REQUIRED-NOT-RUN）挂块 7 各卷首卡。
- 块6.md 第七节逐条 grep 复核：卷九、卷十二、卷三乙、卷六、卷二十九、卷十各行无误；卷二四处已后移（装配清单 :983、assembly.calls :584、outputGate 组 :578、回应通道 :942、§2.5 :501、terminated :504），已改表并写结论。
- 勘误号改为 1119k3：正文、现行快照、附录行、勘误前快照文件名（git mv）、加载器与测试注释、_unbuilt-derived.json note、块6.md 一并改；勘误前快照内容不变（与改前 origin/master 正文一致）。
- 合入 origin/master（6-7 已合）：rebase 在 criteria.json 冲突，改用 merge；criteria.json 取 origin 版后只经登记器把本卡各类别修订记录逐轮接到 origin 现 rev 之后（module_edge 24、25，wallclock 26、27，instance_name 54 等），本卡用例 addedAtRev 随之换算，module_edge rev 25 记录里引的版本号同步改正。
- 改一轮验证（合并后）：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → ℹ tests 836 / ℹ pass 836 / ℹ fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass"。
