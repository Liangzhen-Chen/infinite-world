卡 old-content（a3a 旧回归：新增人物运行档、立绘映射、本体标签三处内容接线）。工作区 F:/dnd-wt/A3O3（分支 t-a3o3，自 a3a）。
组7：ce51b5f5 新增的六名人物（修理学徒及亲属、猎户张三、佃户老周等，见报告与 world/people/baseline.json）缺 schedule 与 tier，npc-schedule.mjs:243 跳过无日程者，他们不会“自己过日子”（违反产品原则一.2）。先按原则核对六人确有题外的世界必要性（他们是 A3 内容卡为真实玩法加的人物），保留者经仓库现有人物审批与发布管线（L1/L2/L4）补真实身份层级、模拟层与作息（从职业、住处与工作地点派生，参照同类已发布人物），不塞空日程凑数，不手改已发布档案。验收 tests/npc-schedule.test.mjs（:175 有作息数=目录数）及所用管线的闸门测试。
组9：m6-08.test.mjs:37/58 人物立绘映射 838/期 845，缺六名新增人物、张三老周与 npc_bs_townhead 共 7 人。用 tools/build-m6-art.mjs 依据已发布人物同步 world/art/mapping.json、portrait-prompts.json 与生成的 assets/visual/manifest.json，保留覆盖、原创与未成年约束。验收 tests/m6-08.test.mjs（浏览器类 EPERM 列出）。
组15：ontology.test.mjs:20 unknown.tags=[certification,festival]（professions.mjs:118、legacy-primitives.mjs:267 是实际生产者）。按既有本体流程在 world/ontology/tags.json 补真实语义及上位关系，保持 I18 闭包断言。验收 tests/ontology.test.mjs。
真实模型：组7 的 L2 审核用 DeepSeek，key 只从环境变量 DEEPSEEK_API_KEY，不读 secrets.json；上限 40 次调用、1 元，如实记账。若试审 1 条后响应格式不对，停下报告，不再烧调用。
可改：world/people/ 与对应审批 design/drafts、world/art/、assets/visual/（仅生成物）、world/ontology/tags.json、相关闸门测试。锁定：server-plugin/、tools/（build-m6-art 只运行不改）、docs/。
预计规模：中。本卡名 old-content。
通用：先读 docs/产品原则.md。根因分析报告见 F:/dnd/logs/sessions/older-rca.final.txt（编号即下文组号，含证据与最小复现）。修根因，不放宽断言、不删/跳过测试、不写特判。TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要；单个失败只看最后 30 行。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑；子进程/浏览器类 EPERM 列出即可。最后回复不超过 10 行（每组根因一句、改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/<本卡名>.final.txt。
