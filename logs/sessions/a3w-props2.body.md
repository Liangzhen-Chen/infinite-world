续做 a3w-props（同一工作区 F:/dnd-wt/A3W，接着未提交改动）。主会话已审脚本：复用共享管线、标签写在本批数据里、词表合理，同意。授权重跑一次 L2：本次最多 40 次调用，含上一轮 0.10223952 元在内累计不超过 1 元；上轮失败回执保留，如实记账（预算台账不清零、不另开空账）。
重跑前先用 1 个条目试审，确认响应符合 contradictions JSON 结构后再跑全批；若试审仍失败，停下报告原因，不再烧调用。
L2 全批通过后执行 --publish 写正式 items.json 与词表，再跑闸门测试；有 manual/未通过的条目不发布该条（发布脚本若要求全批通过，就把未通过条目移出本批并在报告列出）。
验收：node --test --test-isolation=none tests/a3-world-approval.test.mjs tests/a3-content-approval.test.mjs tests/a3-daily.test.mjs tests/daily-b2-mechanisms.test.mjs tests/a3w-props-approval.test.mjs
最后回复不超过 10 行：调用次数与金额（本次/累计）、通过/未通过条目、发布的标签→物品、验收结果、未解决问题；同样写到 F:/dnd/logs/sessions/a3w-props2.final.txt。不再启动其他会话或子代理。
