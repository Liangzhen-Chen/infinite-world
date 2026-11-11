【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

续做 a3r2-intent（同一工作区 F:/dnd-wt/A3R2X；主会话已把你的未完成改动提交为 WIP，并合入最新 a3a——其中 a3r1-discover 已完成，extension/tools.mjs 现已解锁给你）。
1. extension/tools.mjs:191 一带模型侧 schema：effects 改为可选后也要保留其 schema（以生产 proposal schema 为准），并在 open:proposal 条目里说明“可只填 intent，由引擎判定”；模型投影仍 ≤1200 估算 token，静态提示 ≤10593（当前 10587）。修 a3-builder 25/26、a3-openpath 7/8 的剩余失败。
2. 主会话设计决定：补一个真实的日常取水动作——普通人可把自己持有的、具备 liquid_container 用途的容器，在可触及的水源（如渡口池水这类登记的环境水体、公用水盏等）处装水：水量受容器容量与水源实际存量限制，水质/污染随水转移（守恒，不清零），取用他人或公共水源须遵守现有权限与可及性规则，耗时按现有成本表；装好的水进入容器的真实内容物，后续可卖、可喝、可倒掉。优先复用现有的容器水与水体账户逻辑（server-plugin/items.mjs 的 containerUnits/takeContainerUnit/reconcileContainerWater、环境水体与法术搬水处理器里的守恒部分），只增加普通人入口，不复制第二套水量逻辑；经现有动作目录（world/actions/core.json 及 locale，经 tools/build-action-registry.mjs 流程）开放；构造器能从“把池水装进陶罐”意图推导到该动作。
3. 然后让 tests/a3-intent-proposal.test.mjs 的“装水意图”用例通过（保留原断言），并补取水动作的机制测试：容量上限、污染随转、水源减少、无容器/容器非液体容器/远处水源被拒且给替代、存档往返。
可改：上轮文件 + extension/tools.mjs + 取水所需的 server-plugin 模块（逐处列出）+ world/actions/core.json 与 locale + 新测试。锁定：题集、判分器、prompt/、world/ 其余内容（不新增物品或水体）。
验收：每个文件单独运行：tests/a3-intent-proposal.test.mjs、tests/a3-open-actions.test.mjs、tests/a3-refusal-contract.test.mjs、tests/a3-builder.test.mjs、tests/a3-openpath.test.mjs、tests/a3-model-catalog.test.mjs、tests/a3-tool-surface.test.mjs、tests/a3-derived-difficulty.test.mjs，以及取水新测试与 rg 找到的容器水相关测试，全部通过。
不调用真实模型。预计规模：中。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/a3r2-intent2.final.txt。不再启动其他会话或子代理。
