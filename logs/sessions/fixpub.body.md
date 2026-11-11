# 卡 FIXPUB：人物档案发布核验的两个漏检回归

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读，尤其"验收测试清单不自己挑"）。

## 事实（主会话二分）
master 上通过、s5a 上失败，报错相同"人物补丁冲突或原档已过期 npc_hw_luqing/relationships[3]"：
1. tests/npc-profile-publication.test.mjs：首败 f5edba19（s5a: merge t-k10b-public）。错误原文"已发布档案发生后续修改；深度补丁来源核验失败"。
2. tests/w1-villages-publish.test.mjs:59、:74：首败 6b704e70（s5a: merge t-w8e3-consumers）；当前报错同上（两次首败不同，请分别确认各自在首败提交上的原因，可能 W8E3 先引入一处、K10b 又引入一处）。

## 要做
查清是哪次合并改了 npc_hw_luqing 的已发布档案（relationships[3]）或改了核验口径：
- 若是某张卡直接改了已发布 world/ 人物数据而没走审批管线：已发布内容只能经审批管线（world/design/*-approval*.mjs，--l1/--review/--publish/--verify）改；把该改动改为走管线的形式，或者恢复原档、把需要的事实改由运行时状态派生。付费 L2 不要自己跑——需要时停下写明，主会话执行。
- 若是核验代码口径被改坏：修代码。
- 不手改 dist/，不放宽核验，不删用例。

## 并行边界
K15R4（INTEG）、PERFS7（PF7）、FIXK08（K08 集市回归）同时在做；你只改发布/核验与相关 world/ 内容文件。

## 验收
affected-tests2 清单（.base，WORKTREE，深度0）全过或注明 .base 对照；这 2 个文件全过；内容/发布类测试全过。汇报 ≤300 字：根因（文件:行、哪次合并）与修法；清单 N/通过/失败；是否需要主会话跑付费 L2。
