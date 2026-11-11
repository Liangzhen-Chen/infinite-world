# 续卡 s5a-ledgerprice：S5-05 合入后 ledger-price 的真回归（在集成工作区）

工作区 F:/dnd-wt/S5A（s5a，没有其他执行者在用）。tests/ledger-price.test.mjs 在 S5-05 分支扫描为 10/2、合入 s5a 后 11/1，失败报 E-BODY-FACT（你上一会话判断为"既有夹具倒拨时间"）。主会话核实：S5-02 合入、S5-05 合入前，s5a 上该文件 12/0，所以这是 S5-05 带入的回归，不是既有失败。
请找出根因并修复：若 S5-05 的身体/资源事实写入使得测试夹具里"把时间往回拨"的前提不再合法，按真实动作或 applyIntentSetup 重建前提（不倒拨时间、不直接改 state），保留原断言意图；若是实现缺陷修实现。不放宽断言。
复跑 ledger-price（约 100 秒）、ledger-stock、s5-05、CORE。汇报 ≤200 字（UTF-8，F:/dnd/logs/sessions/s5a-ledgerprice.final.md）。
