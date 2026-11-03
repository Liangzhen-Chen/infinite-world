# 卡 unify-inventory：规则归一——盘点清单（只读，不改代码）

工作区 F:/dnd-wt/S4A（只读；产出只写 F:/dnd/logs/sessions/unify-inventory.final.md 与 unify-inventory.json）。

## 背景
用户 10-24 决定：规则只保留一版，不做旧存档向后兼容（"不需要管什么旧存档 这是你自己给自己的限制"）。开发期为旧存档复演加了大量版本标记（结果字段 xxxVersion，如 educationVersion、legalFilingVersion、organizationConsentVersion、nativePrimitiveVersion、obligationSigningVersion 等）以及"无标记时走旧行为"的分支。另：真实游戏服务器（server-plugin/index.mjs）装原生运行时，旧派发路径对玩家不可达。仍须保留：同一版规则下存档读取后重放结果一致（确定性），以及重放时读已记录结果（判决、同意、签约事实）这种为同版本确定性服务的机制。

## 要产出（只盘点，不改）
1. 全部版本标记清单：标记名、写入处（文件:行）、读取/分支处、旧分支删掉后保留哪条行为（现行规则）。
2. 旧派发/兼容路径清单：例如 primitiveActionRuntime() 为空时的旧分支、compat/ 下模块、legacy-* 模块、"replayResult?.xxxVersion===1" 判断等；标注哪些是死代码（生产不可达）、哪些仍被生产使用。
3. 测试清单：只为跨版本兼容存在的测试/断言（文件:用例名:断言要点）——这些将删除，主会话先给用户过目；以及需要改写（去掉版本前提）但保留其规则意图的测试。
4. 删除顺序与拆卡建议（文件互斥、可并行组），每卡预估改动量；风险（确定性、存档往返、静态提示、性能）。
5. 粗估可删代码行数与喂给模型的回执字段减少量。

汇报：unify-inventory.final.md（≤2500 字）+ unify-inventory.json（结构化清单）；last 消息一句摘要。
