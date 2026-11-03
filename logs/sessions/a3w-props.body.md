卡 a3w-props（A3 收口第 2 步 b 的数据前置：工具用途属性）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3W（分支 t-a3w，自 a3a）。

目标（一句话）：世界目录里的工具和物品带上可推导用途的结构化属性（如翻土、收割、夹持、细探、撬、切、盛液体、可饮用等），使后续代码能“按物品属性判断能不能用”，而不是认死某个物品 ID。

背景（规划核实，行号请自行复核）：world/rules/tables/domain-rules.json:4–17 两种机关各指定 1 个工具 ID；:36–40 播种/收获各指定 1 个工具 ID；:57–61 指定 2 个中转地点 ID；action-router.mjs:322 按 item_water 判饮用。world/meta/items.json 中铁锄、铁镰无 tags/checkBonus，铁线只有 w3_journey/material，铁钳只有 metal/tool，不足以区分用途。
步骤：
1. 读上述消费处，列出这些规则真正需要的用途属性。优先复用世界已有的性状/标签词汇（K1 性状、items 的 tags、即兴制作用的性状标签——先 rg 找词汇表），确实缺才新增，新增词写进对应词汇表并说明。
2. 按物品自身描述，给目录里所有确实具备该用途的物品加属性（不是只给现在被写死的那几个 ID；例如凡是刃具都可“切”）。不确定的不加，列入报告。
3. 只经仓库现有审批管线写入（参照 world/design/a3-world-approval.mjs 与 world/drafts/a3-world-approval 的做法，新开一批 drafts），L1/L2 跑完再写正式文件；不手改已发布条目，不改 dist/。
4. 本卡不改 domain-rules.json 的 ID 名单、不改 server-plugin（代码改动属于下一张卡）。
真实模型：DeepSeek，key 只从环境变量 DEEPSEEK_API_KEY，不读 secrets.json；上限 40 次调用、1 元，如实记 usage。若沙箱拦截联网，停在 L2 前，把要运行的完整命令写进报告，由主会话在沙箱外运行。
可改：world/design/ 下新的审批目录脚本、world/drafts/ 下本批目录、world/meta/items.json 及词汇表文件、tests/a3-world-approval.test.mjs 或新增同类闸门测试。锁定：server-plugin/、tools/、docs/、tests/fixtures/。
验收：node --test --test-isolation=none tests/a3-world-approval.test.mjs tests/a3-content-approval.test.mjs tests/a3-daily.test.mjs tests/daily-b2-mechanisms.test.mjs，以及本批闸门测试。报告附：属性词 → 物品清单。
预计规模：中（数据为主）。
通用：先读 docs/产品原则.md。所有 node 命令先设 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，测试一律用 --test-isolation=none（沙箱禁子进程），输出过滤为摘要。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结不改。不为测试新增生产接口、加载器分支或世界内容。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不再启动其他会话或子代理。最后回复不超过 10 行（改动文件、验收命令与结果、偏离卡片处、未解决问题），同样内容写到 F:/dnd/logs/sessions/<卡名>.final.txt。CORE（engine/storage/plugin 三个测试）由主会话在沙箱外跑，你不必跑。
