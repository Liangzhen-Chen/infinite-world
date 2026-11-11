tools/gate/：R=runner.mjs，P=reporter.mjs，C=test-impact/collect.mjs。
P1 R:202 父退孙持管道，仍挂宿主；关闭管道并收后代。
P1 C:116 FAIL/exit0漏选；失败码归一非零。
P1 R:257 坏行、缺计数仍PASS；损坏即INCOMPLETE。
P1 R:238 PID复用首杀未验身份；218空时间仍强杀；均须核验。
P2 P:13/R:19 深对象同指纹、移行异指纹；完整摘要与稳定定位。
心跳/恢复未发现。上述缺回归例。纯测TEMP目录EPERM；runner-host、collect-host待补跑。
