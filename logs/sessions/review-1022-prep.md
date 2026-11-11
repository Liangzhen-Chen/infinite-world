# 10-22 11:00 审查准备（主会话，0 AI）

## 审查范围
- master..a3a：228 个源码/数据文件改动，+23571/−515 行（server-plugin、extension、tools、world、schemas）。
- 另有未合入的半成品分支：a3c(P)、a3e(V)、a3f(X)、a3b(R2)，各有一个 “WIP … interrupted by Codex usage limit” 提交。

## 已知仍未解决（重跑扫描 sweep-a3a-v3a.tsv，对照 sweep-master-bedb5078.tsv）
- 新回归：tests/performance.test.mjs（a3a 2/1，master 3/0）、tests/population-publication.test.mjs（a3a 3/3，master 6/0）。
- 预期内：a3-acceptance（阶段门槛，A3 未收口）；actions-catalog 1 败在 master 上同样存在。
- 超时（master 同样超时）：agriculture、farm-pests-clock、farm-pests-hunt、ledger-price、playtest-lifecycle、seasonal-migration——收口时两边用长时限对比。
- A3 题集：旧 99 题全过；新 111 题全过 40；A3V2-130 回退（期望拒绝，现为澄清，算越界未拦截）。

## 审查重点（Codex 执行、主会话介入少的典型风险）
1. 按测试集/报错文本打补丁（如曾出现的正则词表）、对语料或判分口径的迎合。
2. 绕过设计：直接往 state 写结论、手改发布物、重复实现已有接点、L0→L1 依赖倒置。
3. 性能与内存：每次调用新建读取器/整份克隆、无界增长的记录、缓存失效条件。
4. 测试：被放宽或改写的断言（逐处核对依据）、读活语料的机制测试、TODO 当证据。
5. 静态提示与工具面：基线 10593 未上涨，新增参数只进动作目录。
