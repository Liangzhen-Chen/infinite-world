# PT-AI 玩家驱动（E2）

让 Claude 经游戏的玩家回合接口（create/read/scene/actions/search/catalog/execute）开放式试玩；模型只看到场景与工具结果。

- 运行：`node tools/ptai/driver.mjs --config <config.json> --origin <游戏服务地址> --run-id <id> [--seed N] [--manifest-hash H]`；密钥只读环境变量 `CLAUDE_API_KEY`，缺失即停。
- 配置见 `config.example.json`：模型、回合数、单局/月度美元上限、单价（按提供方价目表填写，示例值仅占位）。
- 轨迹：`<outDir>/<runId>/trace.jsonl`（header 含种子、初态哈希、git HEAD、门禁 manifest 哈希、驱动哈希、模型；每回合含完整请求/响应、用量、花费、工具调用与结果）。
- 账本：`ledgerPath` 只追加 JSONL，按 UTC 月累计；单局或当月上界将超限时在下一次调用前停止。
- 本卡未联网、未运行；离线测试用假 fetch：`tests/ptai-driver.test.mjs`。
