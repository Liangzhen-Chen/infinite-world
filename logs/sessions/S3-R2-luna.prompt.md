【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出；失败细节只看该用例最后 30 行。每个文件修好只确认一次，最后统一跑验收组。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。主会话分诊（沙箱外实测）：F:/dnd/logs/sessions/S3-triage.md。

卡 S3-R2（S3 结构类回归）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3-R2（分支 s3-r2，基于 s3）。
- tests/holdings-writers.test.mjs 2 项：S3 新模块写了持有来源所读的旧字段却没经 holdingSet/holdingRemove 双写；调用写入包装的模块未声明持有写入者。补包装与声明（server-plugin/holding-sources.mjs 的写入者登记）。
- tests/arch-metrics.test.mjs：“新模块须在 tools/arch-layers.mjs 归层”——为 S3 新增模块（obligation-*.mjs、service-queue.mjs 等）按设计层次归层；若有向上依赖，改为下层查询接口，不许加进基线。
- tests/ontology.test.mjs I18 词汇封闭：S3 用到的新动词/标签/罪名补登记到 world/ontology 的词表（世界内容只写 world/）。
- tests/system-map.test.mjs、tests/tool-groups.test.mjs、tests/performance.test.mjs 各 1 项：按失败信息修（新模块归入系统、工具分组、性能——性能若只是负载导致超时，单独跑确认并报告）。
不改断言、不放宽。跑：上述文件 + CORE。报告 F:/dnd/logs/sessions/S3-R2-luna.final.txt；回复 ≤120 字。
