【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 a3r-route（A3 收口第 2 步 a：路由不靠同义词）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3R（分支 t-a3r，自 a3a）。

目标（一句话）：玩家的提案只要结构（效果原语、目标种类、资源方向）与某个注册动作完全一致且候选唯一，就按该注册动作结算——不论用什么说法、有没有命中同义词；多个候选时文字只用于排序消歧并返回候选让玩家选，不擅猜。

背景（主会话已核实）：server-plugin/action-router.mjs:50–71、113–124 得分=签名×0.6+文字×0.4、门槛 0.7，完整签名无文字命中最多 0.6，于是换个说法就掉进开放路径（开放路径按“不比注册动作更划算”取较差数值），等于用同义词给玩家封顶。设计 §6.8 原公式与产品原则二.2 冲突，以原则为准（主会话负责登记设计修订）。另 action-router.mjs:322 按 item_water 判消费，是按 ID 特判。
要做：
1. 签名 Jaccard=1 且候选唯一 → 路由（返回 routed 与“按某动作结算”的解释），文字不再是必要条件；签名部分匹配时维持原评分（文字仍可加分），不扩同义词表；同签名多候选时不按字典序任挑，返回候选澄清。
2. item_water 特判改为读物品自身的结构化属性（如已有的 liquid/drink 类标签或 nutrition.hydration）；若现有数据不足以区分，不写名单，在报告里列出缺的属性（交数据卡）。
3. 保留：目录文字搜索、实体名称/aliases 解析、纯文字输入的澄清、9 个 bareIntent 的 mention 规则不在本卡改。
可改：server-plugin/action-router.mjs；tests/a3-routing*.test.mjs；新增 tests/a3-structural-routing.test.mjs。锁定：其余所有文件。
验收：node --test --test-isolation=none tests/a3-structural-routing.test.mjs tests/a3-routing.test.mjs tests/a3-routing-order.test.mjs tests/a3-routing-references.test.mjs tests/a3-open-actions.test.mjs tests/a3-effect-signatures.test.mjs
新测试须覆盖：同一结构两种完全不同说法（含零同义词命中）结果相同；文字强但效果矛盾不路由；同签名不同目标/资源方向不混淆；同签名多候选返回澄清且不写状态；隐藏实体仍不可解析。
另跑一次判分体检（只报数不优化）：node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/a3r-route-score.json，报路由/签名两项与 F:/dnd/logs/sessions/a3-score-v5d.json 对比。
不调用真实模型。预计规模：中（约 200–400 行含测试）。
通用：先读 docs/产品原则.md。所有 node 命令先设 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，测试一律用 --test-isolation=none（沙箱禁子进程），输出过滤为摘要。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结不改。不为测试新增生产接口、加载器分支或世界内容。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不再启动其他会话或子代理。最后回复不超过 10 行（改动文件、验收命令与结果、偏离卡片处、未解决问题），同样内容写到 F:/dnd/logs/sessions/<卡名>.final.txt。CORE（engine/storage/plugin 三个测试）由主会话在沙箱外跑，你不必跑。
