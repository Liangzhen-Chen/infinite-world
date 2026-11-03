续做 FIXPUB（正文见 F:/dnd/logs/sessions/fixpub.body.md，共同规则 s5law-common.md）。上一轮受工具阻塞提前停了，两处已由主会话修好：

1. **affected-tests2 在沙箱里可用了**：沙箱不能起 git 时，它自动用本树的 .base-index 与 .base-src/（主会话在沙箱外按 .base 写好）比较工作区。命令不变：`node F:/dnd-tools/affected-tests2.mjs . <.base 内容> WORKTREE 0`。若仍报错，把原文贴进汇报并继续做其余部分，不要停。
2. **测试摘要**：PowerShell 解码 ℹ 有问题，改用 TAP：`node --test --test-isolation=none --test-reporter=tap tests/<文件> 2>&1 | Select-String -Pattern '^# (pass|fail)|^not ok' | Select-Object -First 40`（设 TEMP/TMP=F:/dnd-tmp）。npc-profile-publication、w1-villages-publish 单文件约需数分钟，等它跑完。

上轮线索：K10b 合并在 world/people/baseline.json 给陆青新增"公事报修"关系，深度发布核验逐层比较当前人物与深度补丁结果。请继续：分别在首败提交上确认 W8E3（6b704e70）与 K10b（f5edba19）各自原因（你可以读 git 对象之外的文件；需要旧版本内容时在汇报里写明要主会话导出哪个提交的哪个文件，主会话会放到 F:/dnd-tmp/fixpub/ 下；已预先放好：两次首败提交前后的 world/people/baseline.json（baseline.<提交>.json / baseline.<提交>p1.json 为父提交）与各自改动文件列表 changed.<提交>.txt），修责任层，跑完验收清单。
