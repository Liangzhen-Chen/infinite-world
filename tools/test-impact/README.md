# 按覆盖率选测试

工具仅使用 Node 标准库和 Git，可把整个 `test-impact/` 目录复制到 `F:/dnd-tools/`。不修改游戏代码或游戏测试。

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
# 在沙箱外采集：默认遍历 tests/**/*.test.mjs，每文件独立 Node 进程
node tools/test-impact/collect.mjs --root F:/dnd-wt/TIA --jobs 2 --map F:/dnd-tools/tia-map.json
# 文件清单为 UTF-8 文本，每行一个相对工作区路径；支持空行、# 注释及 BOM
node tools/test-impact/collect.mjs --root F:/dnd-wt/TIA --files F:/dnd-tools/refresh.txt --map F:/dnd-tools/tia-map.json
# 也可直接传测试路径；指定清单或路径时仅更新这些测试，并替换旧覆盖边
node tools/test-impact/collect.mjs tests/engine.test.mjs --map F:/dnd-tools/tia-map.json
node tools/test-impact/select.mjs F:/dnd-wt/TIA master --map F:/dnd-tools/tia-map.json
node tools/test-impact/select.mjs F:/dnd-wt/TIA master --map F:/dnd-tools/tia-map.json --json
```

默认 map 是工作区根的 `test-impact-map.json`，选择时忽略该 map 自身的改动。建议将 map 放到工作区之外。`--jobs` 接受 1、2，使采集器加工作进程不超过三个 Node 进程。每个进程用独立临时覆盖目录，完成或失败后删除；测试输出不收集，stderr 仅报告测试路径、耗时、退出码。测试失败仍保存覆盖且命令退出码为 1，失败测试每次必选；进程启动失败或无覆盖数据时不覆盖原 map。

map v1 为 JSON：`commit/generatedAt` 是本次生成版本；`tests[路径]` 含 `commit/durationMs/exitCode/sources`；`sources[源码相对路径]` 含 `hash/normalizedHash/bytes/lineStarts/commits/stale/loadedBy/topLevel/functions`。函数条目为 `{start,end,name,tests}`，半开区间使用 **UTF-8 字节偏移**，已从 V8 的 UTF-16 偏移转换。`normalizedHash` 只归一 CRLF 为 LF，`lineStarts` 保留采集源码的真实字节行首，兼容 Windows Git 自动换行转换。保留未执行函数（tests 为空），匿名脚本顶层独立放在 `topLevel`，不算普通函数。`snapshots` 按内容哈希共享函数形状，测试记录仅保存哈希和执行键，供增量合并；不同源码版本混用时 `stale=true`，全部加载者刷新后恢复。

改动口径沿用旧工具：`base...HEAD`、`git diff HEAD` 和未跟踪文件的并集，重命名按删旧加新。以共同祖先的 diff 旧行号换算旧源码字节；改动完全在函数内时选其执行者，嵌套代码取最内层函数，未执行函数可返回空列表。

顶层、增删文件、world 数据、测试本身、无覆盖、偏移无法对齐、混合快照、源码在采集提交之后有过提交（即使后来撤回），均回退并输出原因。有加载记录时用加载者；无记录时用旧工具同口径的反向 import 闭包；world 数据追加旧工具的 load-world 消费者；仍无已知消费者时选全部已知测试。新增测试总入选。源码在采集提交之后提交过的改动也会回退，这是卡片要求的保守过期策略。Git 历史缺失或采集提交不是祖先同样视为过期。

默认 stdout 仅输出测试列表，回退原因去 stderr；`--json` 输出 `{tests,uncollected,decisions}`，每个决策包含模式、原因、函数区间和测试列表。存在改动时，工作区中尚未采集的测试也必选并单独注明，避免初次只采集部分文件后漏测。删除的测试不会出现在 CLI 最终列表中。collect 采集期间应保持工作区源码稳定。

独立验证（无 Git 或 Node 子进程，模拟 V8 JSON 和 Git 返回值）：

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node --test --test-isolation=none tools/test-impact/test/impact.test.mjs 2>&1 | Select-String -Pattern '^ℹ (pass|fail)|^✖|^not ok|(pass|fail) [0-9]+$' | Select-Object -First 40
```

最后一个过滤分支兼容 Windows PowerShell 对 Unicode 测试状态符的乱码。单测临时文件建在本测试目录并自动清理，不依赖沙箱外临时目录可写。真实采集及 Git 子进程集成需由主会话在沙箱外验证。
