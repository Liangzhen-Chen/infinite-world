# 卡 s4law-content：S4 司法程序数据与审理席位（经审批管线发布）

工作区 F:/dnd-wt/S4LAW（分支 t-s4law，基于 s4a 13aedd6f，已含 S4-01~08）。先读 docs/产品原则.md、docs/架构设计/05-统一模型.md §5.2.4/§5.2.7（证据评分、上诉、执行）、附录A §A.7、§A.18（占位数值惯例），以及 S4-07 交接 F:/dnd/logs/sessions/S407b-trial-handoff.txt 的「规范内容缺口」一节。只汇报与本卡相关的结论。

## 问题
S4-07 的新审理/复审/罚款收缴要读法典的程序数据，但已发布的 5 部法典（law_hw_property、law_yp_property、law_wt_property、law_lq_property、law_sb_property）都没有新 procedure 数据，所以在真实游戏里请求审理一律被拒；白石镇（含 bld_bs_watch 等）没有适用法典绑定；河湾原 appeal 指定原审同一人，不满足复审回避；已发布机构里没有可经任免链取得的审理席位。测试里用的是内存夹具（tests/helpers/trial-actions.mjs 的 nativeTrial），本卡把真实内容补上。

## 要做（世界内容只写 world/，经审批管线发布，照 world/design/s4-offices-approval.mjs 与 world/drafts/s4-law-bindings/ 的做法：草稿 → 审阅记录 → 发布 → 校验；不手改 dist/）
1. 五部法典补 procedure（主会话给的初始值，标注为待 BalSim/试玩标定的占位，与 §A.18 惯例一致；各法域可按其文化/已有条文微调，但要在草稿里写依据）：
   - evidence.weights：eyewitness 1（再乘证人可信度派生）、statement 0.5、confession 2、document 3（经核验真伪与完整度相乘）、mark 1；stanceDiscount 0.5（与当事人立场相关的证人折减）。
   - convictionThreshold 按罪重分档：轻（theft_attempt 等）2、中（theft、assault 等现有罪名表里的中档）3、重（伤害致残、杀人等）5；只为该法典现有罪名表里的罪名写，不新增罪名。
   - appealWindowMinutes 4320（3 天）；appealStaysExecution：criminal true、civil false；reversal 时按判决返还已缴罚款。
   - 复审回避：复审人不得是原审人；河湾 appeal 指向改为另一位有权职位（取自已有机构，不新造人物）。
   - 讼费 filingFee：沿用各法典现有程序费用条目；没有就 0，并在草稿注明。
2. 白石镇法域：查 world/ 现有的白石政府/镇衙/巡检等内容与 law bindings 草稿，判断白石应适用哪部法典或是否本就有自己的政体。若已有可依据的政体与条文来源，按其绑定（bld_bs_watch 等地点）；若世界里确实没有任何依据，**不要编造整部法典**：停在这一项，在汇报里写清缺什么，主会话登记为内容缺口。
3. 审理席位：设计决定 B——任免只走章程里明确的任免链。查各村/镇章程：若章程明确由头人/村长审判，则审理权就在该职位（玩家要当法官须真实取得该职位）；若已有镇衙等机构的章程允许设置佐理/典史类审理席位，按章程补该职位及其任免链。不新增人物，不为测试造职位；没有章程依据的地方不加。
4. 测试：新增 tests/s4-law-content.test.mjs：对已发布世界（loadWorld 读到的正式内容，不用内存夹具）跑真实的 报案 → NPC 经办人本人受理 → 递证 → 请求审理（NPC 法官依程序数据裁判）→ 缴罚入公库 → 上诉 → 另一位有权者复审 的完整闭环，至少在河湾一地；白石若绑定成功也跑一次。另：若第 3 项产生了可任命的审理席位，补"玩家经真实任免链任职后自行裁决"的正向测试（S4-07 未完成项）；做不到写原因。
5. 恢复 S4-07 因缺内容未恢复的 todo（tests/a3-owner-ding.test.mjs 的三个白石 N/O 罚款用例），前提须由真实动作产生；仍缺前提的保留 todo 并写原因。

## 锁
不改 server-plugin 的规则代码（本卡只补内容与测试；若发现规则代码缺陷，汇报，不修）；不改冻结语料、tests/probes、scorer；不改 docs/、dist/、PLAN/PROGRESS/CHANGELOG/当前状态。

## 验收
新测试与 a3-owner-ding、s4-trial、s4-filing、law、reputation-law、law-codes、a3-world-approval、a3-content-approval、s4-offices、npc-depth、arch-metrics、system-map、CORE 逐个单独进程全过（沙箱拦 spawn 用 --test-isolation=none）；发布校验命令（照 s4-offices-approval 的 --verify 用法）通过。
## 汇报（≤400 字）
每部法典写入了哪些程序数据（列关键数值）、白石的结论与依据、审理席位的结论与依据、新测试闭环覆盖了哪几步、恢复/未恢复的 todo、命令与 pass/fail、偏离与未解决。
