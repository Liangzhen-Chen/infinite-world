试点补卡 P-2b（规则表加载器）只核回报原文。只核者 claude-opus-5-5 medium，经 API（claude -p，CLI 2.1.326），与执行者不同会话；费用 $0.803，32 轮。档位：写代码的卡→Opus 只核（李白 11-17 只核档位新规）。主会话照录，不改字。对象：bf5f1a56、1565e5b4（master 上为 f93e15b9、1f31a68c）。

**结论：可放行。** 没有必须改的项。

**逐项核对**
1. **七字段：** 与卷二 :1497 原文一致，七个字段是表代号、文件、结构、类型、取值域、归属卷、multiSourceMerge，每键另带 packOverridable。E-RULES-UNREGISTERED 照卷文三种情形触发：没有登记行（取表口 `ruleTable`）、表里出现登记外的键、登记的文件不存在。加载器不认具体表名，只有 world.mjs 作为调用方写了 `kernelConstants`。
2. **删的 28 个文件：** 核了 programs、domain-rules、body、ecology、loot、targets、open-tagging、health、combat、transport。各卷正文都不把它们当规则表定义，只在素材包、快照或迁移表里出现。卷九 :1553 的 open-tagging 写的是"按代号重写或退役"，两种结局都不保留原文件，迁移从标签取，删掉合理。留下的 5 个都有卷文出处（卷六 :225、:234，卷一 :474、:475 等）。
3. **校验器改动：** 第 166 行起的报错路径没有改动，没有放宽原有判定。"不适用"按卷二 :152 的条件项判，另加了 byEnum，属同类条件，合理。material.test.mjs 只换了常数表的读法，不是为了凑过测试。
4. **unitValue：** 记了 designed，basis 非空，标了暂定，也注了整体经济验收。coin_civic 是现有资源 id，只写在说明文字里，不算自造单位。铁类 valueMult=10 与 material.json 相符。
5. **logs/ 与墙钟：** tools/ 属离线组，写 logs/ 是允许的；kernel 不读墙钟（grep 无 Date 之类）。
6. **矛盾抽核：** 抽了 4 条（卷六 :789、无铜单位 id、kernelConstants 代号卷文未给、卷九 :1553），都属实。

**建议改**
- `rules.mjs:91`：`take_min` / `take_max` 现在接受任何 enum。卷二十八 :280 只许"有序枚举"，无序枚举应报 E-PACK-RULEKEY。目前没有表用到，可以在汇报里记为未覆盖。
- currency、market、seed-keys、digest-exclude 四个文件没登记，留在磁盘上，加载器静默不读。建议在各自首卡写明"首卡前不得直接读这些文件"。

**跑的命令与结果**
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：62 项全过。
- `node tools/accept/commit-hook.mjs`：`pre_commit pass`。

（主会话注：两条建议改记入 docs/问题.md"P-2b 卷文矛盾与未写到之处"一节，不在本卡改。合入 master 后主会话本机 62/62。）
