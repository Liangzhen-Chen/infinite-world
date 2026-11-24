# 回报 ds/ds-temperature（写：Claude Sonnet 5.5 中档，未用 DeepSeek；核：待主会话）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 本卡无卷文，依据为卡文亮圳批准原意与 DeepSeek 官方参数页（写在 tools/dispatch/sampling.json source 字段） |
| 2 | 没有按 id/名字/场景写特例 | 是 | tools/dispatch/sampling-body.mjs 只按档表查，无用途分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/accept/dispatch-sampling.test.mjs：空用途、不存在用途、toString 原型键、字符串"0"、缺字段均报错；temperature 0 正常注入，null 明确不注入 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 测试用内造配置；仅一条读仓库档表，只验每档有出处且可解析 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改检查器与基线 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 148 行；run-card-ds.sh、sampling.json、sampling-body.mjs、说明文件、单元测试、本回报 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test --test-concurrency=3 tests/accept/*.test.mjs：tests 210 pass 210 fail 0；pre_commit verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 写代码类 DeepSeek 调用温度可配置、按用途分档，减少随机性，不涉及游戏规则 |
| 9 | 前置数据行是否已存在：本卡读写依赖的数据行、组件类、规则表逐项查过存在（列文件:行）；有不存在的，已停下回报，没有自编或绕过 | 是 | run-card-ds.sh、compose-card.mjs 已存在；docs/门禁说明/ 原不存在，新建 |

## 说明
- 用途参数：run-card-ds.sh 第四个位置参数，缺省 code。
- null 档：不注入，并 unset 继承来的 CLAUDE_CODE_EXTRA_BODY。
- 用途不存在或档值非法：退出码 2，报错。
- 风险：CLAUDE_CODE_EXTRA_BODY 是否真被采纳，以主会话抓包为准。
