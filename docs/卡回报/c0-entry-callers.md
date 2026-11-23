入口生产调用者报告（只报不拦；装配入口 server-plugin/index.mjs，代码根 server-plugin/）

生成命令：node tools/accept/entry-report.mjs（基于合入 origin/master 后的内容；入口清单读 tools/accept/entries.json，加入口只加一行；块验收时重跑，带 --strict 时有任一入口不通即退出 1）。

| 入口 | 定义文件 | 状态 | 调用点数 | 调用文件数 | 其中从装配入口可达 |
|---|---|---|---|---|---|
| generateWorld | server-plugin/world-create.mjs | no-caller | 0 | 0 | 0 |
| installSaveEnv | server-plugin/kernel/save-session.mjs | no-caller | 0 | 0 | 0 |
| setGame | server-plugin/kernel/save-session.mjs | ok | 1 | 1 | 1 |
| bindCampaignSeed | server-plugin/kernel/mount.mjs | no-caller | 0 | 0 | 0 |
| registerPropagate | server-plugin/perceive.mjs | no-caller | 0 | 0 | 0 |
| registerEnvAt | server-plugin/perceive.mjs | no-caller | 0 | 0 | 0 |
| registerEventDerive | server-plugin/kernel/events.mjs | no-caller | 0 | 0 | 0 |
| routeView | server-plugin/kernel/place.mjs | no-caller | 0 | 0 | 0 |
| pathView | server-plugin/kernel/place.mjs | no-caller | 0 | 0 | 0 |
| losView | server-plugin/sight.mjs | no-caller | 0 | 0 | 0 |
| priceFor | server-plugin/price.mjs | unreachable | 1 | 1 | 0 |
| execute | server-plugin/primitives-runtime.mjs | no-caller | 0 | 0 | 0 |

共 12 个入口，11 个不通（no-def 未定义、no-caller 无生产调用者、unreachable 调用者不可达）。

说明：priceFor 唯一调用点在 demand.mjs，而 demand.mjs 本身没有被 index.mjs 沿 import 到达；generateWorld 已在 world-create.mjs 定义，但生产代码里还没有调用者（块 6 要接通）。
