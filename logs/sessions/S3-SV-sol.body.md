卡 S3-SV（撤回对已发布人物档案的手工改动，改为派生）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3（分支 s3）。
问题：S3-E04 为让铁匠段炎能冶炼并教学，在 world/people/baseline.json 里给已审核发布的 npc_hw_duanyan 手工加了 services:["recipe_smelt_iron"]，并给他两段作息槽加了 "teach"。这改动了已发布人物档案，导致 tests/npc-profile-publication、npc-publication-increments、w1-village-profiles、w1-villages-publish 报“人物补丁冲突或原档已过期 npc_hw_duanyan/services[0]”；也违反“由状态决定的值一律派生，不写死”的原则。
任务：
1. 撤回 world/people/baseline.json 中对 npc_hw_duanyan 的这三处改动（恢复 master 原文）。
2. 在引擎里派生：人在其作息槽所在地点当班、该地点有某工位（如 smithing），且其技能满足配方的 skill/minimumProficiency 时，该工位对应的配方自动成为其可提供的服务（制作/代工），并可教学（若其技能达到教学门槛——找现有教学规则 education/teach 的门槛定义；没有就按配方 minimumProficiency 以上定义并写进规则数据 world/meta/rules.json）。查 server-plugin/shop.mjs（Derived shops 注释处）、crafting 与 education 相关模块的现有派生方式，沿用同一机制，不写一次性特判。
3. 确保 tests/probes/run-001/e04-scenarios.mjs、tests/s3-e04.test.mjs、tests/s3-run001.test.mjs（E04 5/5 不降）在派生下仍通过；四个发布测试通过；tests/holdings-writers.test.mjs（另有一处“未经 holdingSet/holdingRemove 双写的写入点”，按失败信息补包装）通过。
跑：上述测试 + tests/s3-*.test.mjs + CORE。报告 F:/dnd/logs/sessions/S3-SV-sol.final.txt；回复 ≤150 字。
