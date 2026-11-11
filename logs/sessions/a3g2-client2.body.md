续做 a3g2-client（同一工作区 F:/dnd-wt/A3G2，已合入最新 a3a：含 1/3 服务端门禁与 3/3 逐句断言审查）。你停下报告得对。主会话批准你提的最小接口，并授权你改 server-plugin/consistency-service.mjs 与 server-plugin/index.mjs（这两个文件现在没有其他卡在改）：
- 新增不封口的 review/gate：返回按知情裁剪的 facts/settlement、pending 状态、safeText、candidates；不封存 retrieval、不缓存最终结果、不改 sequence 校验规则。
- 客户端/runner 流程：工具阶段 → review/gate；若 pending 且非场外 → 按你的调研结论用强制工具调用（tool_choice required，补跑请求禁用 thinking，含显式“本回合无行动（纯闲聊/纯观察）”选项）补跑一次 → 唯一一次 review/reply 封口；保留原有 token/anchor/revision 与 sequence 校验。
然后按原卡完成其余内容（原卡全文 F:/dnd/logs/sessions/a3g2-client.body.md）：生成开始隐藏待审正文、待审稿隔离历史/索引/编年史、发布安全模板与可选候选、界面行动绑定异步叙述、runner 与客户端共用同一门禁/补跑模块、删 canCommit=false 仍用原稿的分支、三例离线回归。
另：合入 3/3 后 tests/m3-consistency-browser.test.mjs「浏览器 MESSAGE_RECEIVED 等待纯文字改写后再提交唯一尾注…」在沙箱外失败（某断言 actual false / expected true）。这条属于客户端发布流程，一并按新流程修（查清是新审查响应格式、门禁 pending 还是发布时机导致，修根因，不放宽断言；你在沙箱内无法运行浏览器，修完后列出需主会话补跑）。
验收（每个文件单独运行）：原卡所列文件 + tests/turn-gate.test.mjs、tests/claim-review.test.mjs；浏览器类列出交主会话。
最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3g2-client2.final.txt。不再启动其他会话或子代理。
