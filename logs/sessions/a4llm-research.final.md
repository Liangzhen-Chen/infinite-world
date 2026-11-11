# a4llm-research（零模型费）

## 来源
- [DeepSeek工具](https://api-docs.deepseek.com/guides/tool_calls/)：非思考支持auto/none/required/指定函数；Beta全函数strict、全字段required、additionalProperties:false；JSON模式不保schema，strict不保语义。
- [缓存](https://api-docs.deepseek.com/guides/kv_cache/)：自动硬盘前缀缓存；续写不等于缓存。
- [价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)：Flash峰值命中/未命中/输出每百万0.04/2/8元，谷时减半。
- [SillyTavern](https://docs.sillytavern.app/for-contributors/function-calling/)：支持DeepSeek和动态工具。
- [LangGraph](https://github.com/langchain-ai/langgraph)：借鉴调用前裁历史，不引框架。
- [ReAct](https://react-lm.github.io/)：借鉴判断→行动→观察示例，不加规划调用。

## 推荐：先解析再确认
现状：构造器有槽位/缺项；首次auto、pending才required且含no_action；历史85%才裁、保8轮，投影仅去重。

先只读解析，给3–5候选及“查更多/澄清/开放提案”，强制strict选择函数；引擎保存参数，模型只选引用、补缺槽。唯一候选也须确认，不匹配走开放路径。保留权限、知情、资源、时序与幂等；no_action不能裁决行动请求。

裁决后叙述，自由文本仍独立逐句审查；模板免付费审查。审查失败发模板，取消重写再审；未执行参数错仅修一次。旧审查schema开放对象不能直接套strict。

只带最近4完整回合并限token；引擎摘要含可知状态、义务、回执、待答问题，旧事查原文。保留coverage、回滚、工具配对及原聊天。回执留状态、效果、成本、拒因、缺槽、来源，不删参数语义。稳定提示/工具在前、动态信息在后，静态≤10593；动态enum可能损缓存。

宿主/beta透传tools，json_schema仅JSON模式；直连端点须同步Beta，两端共用非思考编排。

## 测算
contract2：89/131；51回合235调用7.855元含评分1.638元，非纯在线成本。80–90%是修复42条失败中40–70%的假设，非实测、不降门槛。
预算假设：选择/叙述/审查3调用，输入3k/13k/4k、总输出1200；14k命中+6k未命中，峰价费用=(14000×.04+6000×2+1200×8)/百万=0.02216元，全冷0.0496元。≤0.03是暖缓存目标，非保证；硬上限须最坏价预留，超限模板/待选择。复杂链须实测。风险：短史丢指代、少候选漏意图、模板降文采。

## 拆卡草案
S=server-plugin，E=extension，T=tools；{}内均.mjs。
1.A3：S/{action-constructor,action-affordances,consistency-service}，E/{turn-contract,tools,generation}、E/runtime.js，T/{deepseek-client,playtest-runner,build-card}，prompt/{constitution,examples}.md：候选确认、strict、判断示例。
2.A3：E/{history-window,turn,prompt}、S/consistency-evidence及卡1接点：历史/摘要；串行。
3.A4：S/{consistency-review,consistency-service}、T/playtest-budget：审查瘦身、取消重写、分项计费；学习路由另留A4。
各卡补机制测试，相关文件及CORE逐个跑，宿主外部验收；旧题冻结、另测未见表达。本卡未跑测试；A3仍须真实试玩。

## constitution草稿
简体中文主持《无限原野》，依次：
①“（场外）”或“(场外)”开头只读核实简答，不扮演、写入或带尾注。场内分问事实/请求决定/尝试行动；只做本轮原意，不代发言、接任务、分属性。
②账本/事件＞场景＞纲要＞聊天。冲突查原文；未知编号查名/目录，不拼名。库存查人物，栏目超限不证缺货；私密只沿知情渠道，未知留白。
③核对候选对象、手段、数量、时间；缺槽查询或澄清。无匹配查world_actions，再提交open:proposal；留痕也须真实材料与裁决。候选不等于授权或成功，不以无行动代替行动拒绝。
④工具独立调用，价格/许可/同意由引擎决定；检定不代交易、伤害、制造。参数拒绝且未执行才纠正；已耗时扣费不重跑。委托发布人是托付方，玩家承接并当面交付。承诺核地点/期限/资源；保密不建会面。司法据法典证据走world_law，约定不代办案。
⑤成功、失败、局部结果及成本均保留；无来源的新决定不发布。只问带路→查并答，不出发；修理→选物件/方式、提交、凭回执；再等一小时→完整60分，不扣前耗时。许可到期仍可离宅，不缩时续许可。新实体先登记，途中不算全程。NPC守财物私域；未成年禁恋爱亲密。
⑥正文仅叙述/对话及尾注，不露工具字段；人物ID限对话/尾注。时间按turnClock.minute换算，以分钟/小时表达；路程查路线并注明条件。尾注<回合 额外="5分" 地点="地点编号" 在场="人物编号"/>据账本，不移人；额外只计未入账对话，等待已计通常0，问答5–20分，即时观察可0，缺尾注10分。
