# DeepSeek 调用温度按用途分档（亮圳 11-22 19:46 批准「温度零点零1122」）

## 怎么配
档表只在 `tools/dispatch/sampling.json` 的 `purposes` 里：每档一个 `temperature`（数字或 `null`）和 `source`（出处）。加一档只添一项，不改代码。

## 怎么用
`sh tools/dispatch/run-card-ds.sh <工作目录> <提示文件> [flash] [用途]`（型号只许 flash，亮圳 11-22 20:07 定不再用 v4-pro）

第四参数是用途，缺省 `code`。脚本调 `tools/dispatch/sampling-body.mjs <用途>` 读档表，生成 `{"temperature":值}`，只在派卡子进程的环境里设 `CLAUDE_CODE_EXTRA_BODY`，不改全局设置、不打印密钥。

- 用途不在档表里：非 0 退出（2）并报错，不回落。
- 档值是 `null`：不注入，并清掉继承来的 `CLAUDE_CODE_EXTRA_BODY`，行为同改动前（服务端默认值）。
- 档值不是非负数也不是 `null`：报错退出。

## 各档取值与出处
| 用途 | temperature | 出处 |
|---|---|---|
| code | 0.0 | https://api-docs.deepseek.com/quick_start/parameter_settings 写代码、数学推荐 0.0；亮圳 11-22 19:46 批准 |
| test | 0.0 | 同上 |
| review | 0.0 | 同上 |
| design | null | 未定，发散活以后单独设 |
| story | null | 未定，发散活以后单独设 |

## 已知风险
`CLAUDE_CODE_EXTRA_BODY` 是否被 Claude Code 与 DeepSeek 接口真正采纳，以主会话抓包结果为准。Claude Code 官方文档没有 temperature 设置，该环境变量文档也未明说能带 temperature。
