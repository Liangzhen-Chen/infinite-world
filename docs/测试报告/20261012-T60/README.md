# T60：T17-B 正式新轮

本目录独立保存当前完整 world、bundle、宿主转换输入及逐文件源码/hash。沿原十场正常 HTTP 重跑零模型来源预检，原断言保留；这些回放不计真实有效 N。旧 T17 与 T56 报告和未知预留不修改。

payment-proof.mjs 每次发送前刷新主目录全部内容预算、持久 run 及用量日志。旧 spent、未知 reserved 和 legacy 费用全部保守计入；共享内容整波次预占20元，新轮全额预占8元。历史110笔归属仍未知，金额1.41941680已包含；budgetUpperSafe 与 historyAttributionComplete 单列。旧格式无 reserved 字段仅按现有 content-budget 的无 cards/requests 语义读取为0，原文件/hash和解释写进 proof；缺 spent、无效金额/hash和超额拒发。

新 run t17-m2-20261012-02 关联旧 run 和 user-reopen-20261012-01。先以正常 HTTP 首回合检验正式源和账本，全部原请求、responseId、usage与费用核验后自动继续本次已授权累计8元轮次；首回合不计十场有效 N。每次新请求预留前保留完整全局 proof，任何预算拒发停止后续发送；真实 provider 或来源失败保留未知预留，不退款。所有角色共用一个持久账。

用户酒馆和原存档未修改。全量、release/final 与部署均不在本执行卡范围。真实结果以本目录真实试玩.json和持久新账为准；通过率不足或来源拒发均保留实测结果。
