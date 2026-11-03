续做 a3h-replay（同一工作区 F:/dnd-wt/A3H；分支已合入最新 a3a，你的新测试与夹具仍在，未提交）。fix4-prelude 已合入，engine.mjs 与 storage.mjs 现已解锁给本卡（其他并行卡不碰这两个文件；primitives.mjs 仍不改）。
按你上一轮的判断实施：engine.mjs 给事件加原语版本，interactions/effects/magic 适配器按版本对旧事件保留旧结算、不补写新回执；若需兼容无版本的既有 a3a 事件，storage.mjs 最小改动传递已存回执信息。哈希校验不得删除或放宽。
验收：node --test --test-isolation=none tests/a3-legacy-replay.test.mjs tests/a3-native-state.test.mjs tests/a3-legacy-primitives.test.mjs tests/a3-prims-rites.test.mjs tests/a3-r8-effects.test.mjs tests/a3-r9-effects.test.mjs；另补一条：a3a 新引擎产生的新事件存档往返重放同样哈希一致。
本卡名 a3h-replay2。
通用：先读 docs/产品原则.md。所有 node 命令先设 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，测试用 --test-isolation=none，输出过滤为摘要。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结。不为测试新增生产接口、加载器分支或世界内容；测试前提用真实动作（tools/a3-setup/prelude.mjs 的 runPrelude 或直接 previewAction+reduce）。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/<本卡名>.final.txt。
