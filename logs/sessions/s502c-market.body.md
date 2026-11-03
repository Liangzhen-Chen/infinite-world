# 续卡 s502c-market：S5-02 第 3 会话

接着你的第 2 会话（未提交；独立金额锚点已补、取整与议价精度已修、净资产接市场 value）。按你交接的顺序：
1. 商户口粮保留：商户自用与家庭口粮从可售量扣除（按 world 中的口粮/人口数据派生，不写死天数以外的常数）；补数字锚点测试。
2. 审批管线：world/design/s5-market-content-approval.mjs 跑完 L2 审阅（需要 DeepSeek 内容审阅，属用户已授权的 DeepSeek 额度；本卡上限 0.3 元，超出立即停止并汇报），然后 --publish、--verify 通过。若沙箱环境拿不到 DEEPSEEK_API_KEY，停在这一步写明，主会话外跑。
3. 继续迁移价格调用（docs/S5-02-价格迁移.md）：区域价、补货、NPC 自治中的定价。
4. 剩余 affected 文件对照 master（你的 matrix/pending 清单），把能跑的跑完，报 pass/fail 与 master 对比；沙箱拦的列给主会话。
约束同前（手算锚点、不加版本标记、不放宽）。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s502c-market.final.md），含 DeepSeek 实际花费。
