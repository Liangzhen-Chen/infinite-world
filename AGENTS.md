# 项目规则（无限原野）

- 开始任何工作前，先读 docs/无限原野_扩充与重构指南.md 的第 0 章、docs/进度.md 和 docs/待用户确认.md。
- 不读取、不输出、不提交 SillyTavern/data/*/secrets.json；调用 DeepSeek 只用环境变量 DEEPSEEK_API_KEY。
- 改动存档格式必须附迁移脚本与迁移测试；动手前运行 node tools/backup.mjs。
- 每次提交前运行 npm test。改动提示词或 NPC 行为时，另跑 npm run test:scenarios -- --quick。
- 阶段 0 的回归测试保留失败，使用 npm run test:baseline 核对失败编号，不能将缺陷标为通过。
- 世界内容只写进 world/，不手改 dist/。
- 不复制小说正文、人名、地名、组织名与情节，屏蔽表见 world/meta/blocklist.json。
- 测试没通过就写进 docs/已知问题.md，不调低阈值。
- 每个阶段结束时更新 docs/进度.md，写明改动、验证和剩余工作。

用户要求以自然段汇报，表述具体、克制，不用机械排比或宣传措辞。
