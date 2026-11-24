# gate-me Sonnet 只核（11-19）

对象：分支 ds/gate-me，提交 ceb6ca76；依据李白 11-19 10:4x 裁定①、卷六:398、卷十八:337。

## 结论：可封（附两条非阻塞提示）

1. 判据（path_access.mjs isForeignRow）：照"行出自哪张表"认。
   - 豁免须同时满足三条：链根变量绑定到本文件函数；该函数体读词表记录（.family 与 .entry）；函数体与调用实参均不碰 economyResources（含 const 字符串别名）。
   - 这不是按字段名认，也不是按字段形状认。
   - 追不到来源的（参数、解构、跨文件函数、非 const 绑定）一律照计。宁报勿漏成立，单测 param.mjs 与 mixed.mjs 覆盖。
   - 非阻塞提示 A：判据是"证明是词表行才豁免"的反向证明，不是"从 economyResources 派生才算资源行"的正向追踪。能漏报的情形只有一种：本文件函数体恰好读 .family 与 .entry，同时经另一层包装或非 const 变量取资源种类行。这要刻意构造。真实代码里这类函数是词表索引读取，属正常。现不改，将来若出现再收紧。
   - 非阻塞提示 B：path_access.mjs 新增一行 `const cond =params` 少一个空格，纯格式。
2. 特例：grep path_access.mjs 无 holdings 或任何文件名/路径；豁免只经 readerSystems 参数启用，没给 holdings.mjs 开白名单，没把它加成读者。
3. 夹具：
   - module_edge-35 在 economyResources 取行后读 transferable，必报。
   - module_edge-43 经本地 kindRow 取词表条目，必不报。
   - 两者的区分只在行来源，不在字段名。
   - 测试 A6-1.1 新增单测把 kind/res/param/mixed 四种并列，能区分对错。
   - cases.json 新增两条用例，addedAtRev 20，只增不删。
4. 共用检测器：criteria.json diff 只增不删。cross_write、display_read、version_fork、dual_write 各只新增一条 rev 记录并加指纹 rev+1，module_edge 为 rev 20；旧修订记录一条未删。
5. 实跑结果：
   - `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 671，pass 671，fail 0。
   - `node tools/accept/run.mjs pre_commit`：failed 只有 vol12.A12-4.5、vol12.S12-2、vol12.S12-3，不含 vol6.A6-1.1.a。
6. 测试先行：夹具与单测一并随同一提交入库，单次提交无法从历史证明先后。写者的回报声称测试先行；本核只按"测试能区分对错"判，不阻塞。

核者：Claude Sonnet 5.5 中档（只读，仅提交本文件）。
