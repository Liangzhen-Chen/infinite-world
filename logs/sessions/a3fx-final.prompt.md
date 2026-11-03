【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

续做（你的 a3cp-compact 已合入 a3a；主会话之后又改了两处：server-plugin/action-affordances.mjs 把开放路径改为排在注册动作之后且不被 limit 截掉；tests/playtests/a3_whimsy.json 把原第 1 回合拆成 whimsy_go_baishi 与 whimsy_buy_container 两回合）。新工作区 F:/dnd-wt/A3FX（分支 t-a3fx，自最新 a3a adf75569）。最终全量扫描（每文件单独进程）在 a3a 上发现以下失败，master 无此问题：
1. tests/a3-connectors.test.mjs:28「A9: the production proposal declaration is discoverable…」：modelActionCatalog 投影的 effects.maxItems=63，测试期望 64。生产提案 schema（server-plugin/primitive-schema.mjs:57 proposal.effects maxItems:64）是真相；action-affordances.mjs:85 的 63 是 10-20 的旧值，两处不一致。你的压缩改为从 affordance 取 schema，暴露了它。要求：模型投影的上限、op 枚举等关键事实以生产 schema 为准（必要时修 action-affordances.mjs:85 与生产 schema 对齐，说明依据），保持压缩形式；A9 后续断言（op 包含 transfer、不接受多余字段等）若因压缩形式改变，按“模型拿到的事实与生产校验一致”改写，保留意图；实际提交仍由生产 schema 校验。
2. tests/a3-builder-ui.test.mjs「真实后端无模型构造器：手机/桌面四步…」：期望 'suggested' 实得 undefined（单独运行可复现，浏览器测试在沙箱内 EPERM，请用你的判断读代码与断言定位；主会话会在沙箱外复跑）。查明是否由开放路径改为排在后面（构造器或 extension/action-builder.mjs 取第 0 项/查找 suggested 标记）引起，修根因。
3. tests/a3-openpath.test.mjs「试玩容器前提来自现有存货与真实交易…」：按位置取第 0 回合，现应按 anchor 'whimsy_buy_container' 查找。改测试取法，保留其余断言。
4. tests/ledger-price.test.mjs 整文件单独运行 11 过 1 败（master 上该文件超时无对照）：用 --test-name-pattern 定位失败用例，判断是否与今天的改动有关；有关则修，无关则报告根因与证据。
可改：extension/tools.mjs、server-plugin/action-affordances.mjs（仅第 1、2 项所需）、extension/action-builder.mjs（仅第 2 项根因）、上述测试文件。锁定：其余文件、静态提示、题集、判分器、world/。
验收：每个文件单独运行：tests/a3-connectors.test.mjs、tests/a3-openpath.test.mjs、tests/a3-model-catalog.test.mjs、tests/a3-affordance-state.test.mjs、tests/a3-builder.test.mjs、tests/action-registry.test.mjs、tests/a3-tool-surface.test.mjs 全部通过；ledger-price 报定位结论。
不调用真实模型。预计规模：小。
最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/a3fx-final.final.txt。不再启动其他会话或子代理。
