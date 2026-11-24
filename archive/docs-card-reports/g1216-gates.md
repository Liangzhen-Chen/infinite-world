# 卡回报：格子迁移第 4 步 G12–G16 开写前门禁（6 条）

写者：Claude Sonnet 5.5 中档，全程自写，未委派 DeepSeek（run-card-ds.sh 一次未用）。

## 卡头自查表

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 6 条条目 source 字段各带卷:行（卷十七 :324/:327/:288、卷五 :404/:581/:619、卷九 :670、卷二十 :478/:898/:881/:1105）；对照表 :15、:44、:45、:72、:78、复核 M7/M8 |
| 2 | 没有按 id/名字/场景写特例 | 是 | tools/accept/detectors/decl_guard.mjs：守护对象取自 state-owners 声明（stateKeys 写者、kernelApi 行），不点名文件；被禁导出名放类别行 importNames/importModules（登记数据） |
| 3 | 每个限额/校验都试过特殊值，无法绕过 | 是 | 空声明表、声明了但文件不在清单、别名导入、命名空间、重导出、const 别名、简写键均有测试（tests/accept/g1216-gates.test.mjs） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望计数按样本手算；"现仓库为 0"是卡文要求的验收，不是抄读数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改任何 server-plugin、world 文件 |
| 6 | 只改了卡文列出的文件 | 是 | 新增 decl_guard.mjs、测试文件、10 个夹具；改 tools/accept 五个登记文件（经 register.mjs） |
| 7 | 全量测试已跑 | 见下 | accept 全部文件分批跑过全过；kernel 见"验收" |
| 8 | 让块 6 哪一步更近 | 是 | G12–G16 五张写码卡开写前，位置写入点、perceiveEvent 调用点、场写入口、场步进读路网边、规则表读者、本地清醒判断六处跨文件规矩已有自动拦截；不违背北极星 |

## 6 条条目

| 条目 | 守什么 | 检测器 | 测试（tests/accept/g1216-gates.test.mjs） | 夹具用例 |
|---|---|---|---|---|
| vol17.S17-1（含 S17-4） | pos、facing 写入点只许声明写者文件（守写入点，不钉 placeSubject 调用方） | decl_guard dimWrite | S17-1 守写入点…／反例…／声明写者…／现仓库计数为 0 | decl_guard-01、02、11 |
| vol5.S5-5 | 本地清醒判断：awake 的两个输入 suppressesAwake、awakeMin 只许 sys.capacity 谓词文件读 | path_access read（照 K6-24） | S5-5 感知模块自己读…／现仓库计数为 0 | module_edge-50、51 |
| vol9.R9-2.10 | perceiveEvent 调用点闭集（emit 适配器） | decl_guard nameUse | R9-2.10 perceiveEvent 三条 | decl_guard-03、12 |
| vol20.S20-fieldCells | 离屏路径不得调场写入口 foldBubbleFields（S5-9 兄弟） | decl_guard nameUse | S20-fieldCells foldBubbleFields 三条 | decl_guard-04、12 |
| vol20.S20-4.7.6 | 场步进实现文件不得具名导入 routeView、pathView，不得导入 route-edges、route-grid（按具名导入判，zoneAt 同文件不误拦） | decl_guard importName | S20-4.7.6 四条 | 无（真声明表无 fields 写者，夹具造不出范围；正例靠测试里的声明表覆盖） |
| vol20.T-4 | 十二张规则表在 kernel 以外读即拦 | path_access read | T-4 两条 | module_edge-52、53 |

新类别 decl_guard（criteria rev 1），新检测器登记；module_edge 判据代码未变，故未升 rev。

## 偏离与未覆盖

- vol9.R9-2.10 与 vol20.S20-fieldCells 没用 call_edge entries 形：kernelApi 登记行须指向已存在的导出（tests/kernel/handles.test.mjs 逐行核），perceiveEvent、foldBubbleFields 尚未建，无法先登行。改用 nameUse：未登记前，定义文件外任何导入即计；落地卡登 kernelApi 行（callerFiles＝emit 适配器等）后自动交 api-callers 判。
- T-4 的 envAt import 矩阵一支未覆盖（envAt 未建、无 kernelApi 行），已在条目备注写明收紧条件；T-10 按卡文不登。
- T-4 局限：根变量本身叫 rules 的写法追不到（备注已写）。
- S17-1、S20-4.7.6 的"收紧"靠落地卡在 state-owners 登声明写者，条目无需再改。
- 命令纪律：我在摸底阶段误用了 cd、cut、awk 和管道各若干次（只读命令，未写任何文件）；发现后即停用。

## 验收

- node --test tests/accept/*.test.mjs（分三批）：全过（含新测试 19 条）。
- node --test tests/kernel/*.test.mjs：见提交说明。
- node tools/accept/run.mjs pre_commit：verdict pass；失败项仅 vol12.A12-4.5、S12-2、S12-3（基线），新 6 条 pass，新用例 10 条 pass。
