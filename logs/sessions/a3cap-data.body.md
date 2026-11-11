卡 a3cap-data（A3 数据：液体容器的用途与容量）。项目《无限原野》。工作区 F:/dnd-wt/A3CAP（分支 t-a3cap，自 a3a）。先读 docs/产品原则.md。
目标（一句话）：世界目录里能盛液体的容器都有真实容量（capacityMl），素面陶罐也标为能盛液体，使新的日常取水动作能按实际容量装水。
现状：world/meta/items.json 中 item_clay_cup、item_clay_bowl、item_cooking_pot 已有 liquid_container 用途标签（10-23 a3w-props 经 L1/L2 发布），但全目录没有任何 capacityMl；item_clay_pot（“一只普通储物陶罐…”）只有 ceramic/container。另一张卡正在实现取水动作（读取物品 tags 含 liquid_container 与 capacityMl）。
要做：
1. rg 世界数据与已发布审批里对容量的已有依据（如 item_water“二百五十毫升清水”一份、各物品 use/description 的形制与重量、配方里装水量），给每件 liquid_container 物品定 capacityMl 并写明依据；item_clay_pot 按其描述加 liquid_container 用途与容量。只给描述确实支持的物品加；不确定的不加，列入报告。
2. 只经仓库现有审批管线写入（参照 world/design/a3w-props-approval.mjs 与 world/drafts/a3w-props 的做法，新开一批 drafts）：L1 → L2（真实模型 DeepSeek，key 只从环境变量 DEEPSEEK_API_KEY，不读 secrets.json；本卡上限 30 次调用、1 元，先试审 1 条确认格式再跑全批）→ 发布到 items.json；旧审批闸门测试按 a3w 的组合核验做法同步（先验新回执，再按历史字段核旧回执），保留篡改断言。
3. 若 schema/加载器对 capacityMl 字段有校验（rg schemas/、tools/validate-world.mjs），确认字段合法；不合法则报告，不擅改 schema。
可改：world/design/ 下新审批脚本、world/drafts/ 新批次、world/meta/items.json（仅这些物品的 tags 与 capacityMl）、相关审批闸门测试。锁定：server-plugin/、extension/、tools/、docs/、其他世界内容。
验收（逐文件单独运行）：tests/a3-world-approval.test.mjs、tests/a3w-props-approval.test.mjs、本批新闸门测试、tests/a3-content-approval.test.mjs、tests/a3-daily.test.mjs。报告：物品→容量→依据，调用次数与金额。
预计规模：小。通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/a3cap-data.final.txt。
