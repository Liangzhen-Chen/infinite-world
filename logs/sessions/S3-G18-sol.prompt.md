【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。本轮限时 60 分钟：到 50 分钟停手写交接。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 S3-G18（E18 两项功能缺口）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3（分支 s3）。依据 F:/dnd/logs/sessions/S3-sol-replan.md 第 2.1 节 E18-1、E18-4 两行与题面 docs/probes/run-001/（E18）。
1. E18-1 股东有限/无限责任：入股（finance-assets.mjs:assetTrade invest）时把责任形式作为可核验的条款写入记录（有限：以出资为限；无限：可追及个人财产），商号停工/资不抵债时由法律执行（law.mjs:lawAction、工资优先已有）沿条款认定股东责任并实际扣划，守恒。
2. E18-4 商号会籍与信誉：让商号（business，现为 thing）能以“会员”身份加入商会——按 S2a 持有注册表新增或扩展持有种类（例如 member_of 允许 business 主体，或新增 business_member_of；须在 world/ontology/holdings.json 注册并过 holdings-registry/writers 测试），会籍有代表人与会费账户；商号信誉经事件/传闻进入商会判断，商会可除名商号。
更新 tests/probes/run-001/e18.mjs 对应两条判据为驱动真实引擎的检查（与原题预期一致）。跑：tests/s3-run001.test.mjs（报 E18 各判据）、tests/holdings-*.test.mjs、tests/finance-*.test.mjs、organizations 相关测试、CORE。不改其他断言。
报告 F:/dnd/logs/sessions/S3-G18-sol.final.txt；回复 ≤150 字。
