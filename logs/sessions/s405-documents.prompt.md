【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s405-documents：S4-05 文书原件——原件能由真实动作产生并读到

工作区 F:/dnd-wt/S405（分支 t-s405，基于 s4a）。设计依据：docs/架构设计/05-统一模型.md §5.4「文书」、§5.2.7；08-叙述与界面投影.md §8.5；docs/A3-后续阶段登记.md 第 49、107、109 行。先读 docs/产品原则.md 与这几节，只汇报与本卡有关的结论。

## 结果
交易/机构办理产生有实物和源事件的收据或告示；玩家可携带、阅读、出示或张贴原件；纸上写的说法不会自动变成判决或权利。

## 机制断言（全部要有测试）
1. 真实取得纸张（买或持有）并完成交易/办理后才签发原件：扣纸张、耗时；原件是一个实物实例，记录签发事件 id、规则版本、指向的实物/交易、持有人。
2. 只有阅读原件（持有或在可视范围内）才知道其内容；未读的人不知道。
3. 张贴只在张贴处可见（按 S4 感知/区域判定），不全境广播，不把来源历史和传闻暴露出来。
4. 出示/存读不复制纸、不第二次付款、不修改历史事件；批注写在同一原件上并保留来源，不生成第二张。
5. 原件上的文字只是主张：不会自动定罪、判决、转移所有权或授予权利。
6. 存档往返与复演保持原件、来源、持有人不变（复演不重新签发）。

## 恢复的 todo
- tests/a3-owner2-G.test.mjs：「G3: public notice is visible only at its original…」——用真实动作造前提（真实制作/张贴告示），恢复原断言意图。
- tests/a3-setup-institutions.test.mjs：「documents: native evidence annotates the same original…」——同上。
- 其余 G1/G3 申请与匿名票/G4 运输、当票、租契等需要各自业务生产者，**不**随本卡宣称恢复，保持 todo；案件提交相关等 06/07。
- 每个恢复的 todo：前提必须由真实游戏动作产生（setup.prelude 或真实调用序列），不得直接写 state、不得新增测试专用快照入口或内容；断言不放宽。

## 可改
新增 server-plugin/documents.mjs；server-plugin/{items,environment,governance,law,action-text}.mjs；world/actions/documents.json、world/actions/locale/zh-CN/documents.json（若动作目录按文件拆分，照现有 core.json/institutions.json 的写法；新动作走动态目录，不增加静态提示）；tests/{s4-documents(新),a3-owner2-G,a3-setup-institutions}.test.mjs。新模块要在 tools/arch-layers.mjs 归层、tools/system-map.mjs 登记。
锁：运输/当铺/租约业务模块、日历、司法阶段推进；不改 docs/、dist/、PLAN/PROGRESS/CHANGELOG/当前状态；不改冻结语料与 scorer。
纸张若世界里没有可买来源，先查现有物品/商人数据；确实缺就停下汇报，不要自己造一个只为测试的商人。

## 验收
`node --test tests/s4-documents.test.mjs`、`tests/a3-owner2-G.test.mjs`、`tests/a3-setup-institutions.test.mjs` 逐个单独进程跑全过（沙箱拦 spawn 用 --test-isolation=none）；另跑 arch-metrics、system-map、overfit-guard、CORE（engine/storage/plugin）各一次全过。静态提示预算检查：
`node --input-type=module -e "import {loadPromptBundle} from './tools/build-card.mjs'; const b=await loadPromptBundle(); console.log('staticTokens='+b.budget.estimatedTokens); if(b.budget.estimatedTokens>10593)process.exitCode=1"`

## 汇报（≤400 字）
改了哪些文件、新动作清单、恢复了哪几个 todo、跑的命令与 pass/fail 数、静态 token 数、偏离指令处、未解决问题。不贴代码与完整日志。
