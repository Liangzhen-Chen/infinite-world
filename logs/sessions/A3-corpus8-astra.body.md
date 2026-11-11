你是 A3 意图语料的原出题者（续）。工作区 F:/dnd-wt/A3CORPUS（只读参考，已切到最新 a3a），不读 server-plugin/ 与 extension/。执行侧报告：F:/dnd/logs/sessions/A3C-r8.final.txt（逐题段与“待主会话裁定的依据”）、A3B-r10.final.txt（001/040/047 路由裁定、020）、A3E-jia3.final.txt（权属缺口）。逐条结果 a3-score-v2r.json。主会话的裁定与交给你复核的事项：
1. 029、114：expected 把两种资源合成一笔 transfer——账本按资源分别记账（01 §1.6，签名是多重集），拆成逐资源 transfer。
2. 027：原生修理方案 repair_staff_trim 不耗材料，expected 却要求耗料——按原文判断：原文明说用了材料则保留并在记录中注明世界数据缺口；否则改 expected。
3. 113、115、117、118：执行侧称提案输入明确请求了 transfer、而 expected 未列（或反之）——逐条核对 input 与 expected 是否一致，按原文改正其一。
4. 001、040、047 路由：执行侧主张 001 应为 core:eat.meal（自备干粮，非 wildlife.eat 的煮鱼）、040 应为 open:waive_debt（债权人免债，非约定取消）、047 应为 core:dialogue.guide_request（未定地点只问意愿）——按设计 06 §6.3、§6.8、§6.9.2 复核，同意则改 expected.route。
5. 063、065、071：原意是会该法术并能施放一次，现 mp 上限 8 而法术耗 15/28。“已会该法术”蕴含角色具备相应修为——用现有结构化字段（body.level 或 abilities 的境界/属性等，依 world/ 与附录 A 的派生规则）把角色设为能合法达到所需上限的最低水平；不得直接写超上限的当前值。
6. 场景自建物件的权属（064 066 085 087 088 120）：执行侧称语料未声明这些物件/建筑的 owner 或其历史来源，加载器无法派生管理者——按原文补 owner/历史事件（原文未提的，按场景常识选世界中真实存在的主体并记录理由；确无主的写 owner:null 并说明）。
7. 020：执行侧称当地没有合格考官（登记员只能转交）。查 world/ 是否有该职业的真实考官；没有则把场景移到有考官的地点（不改 intent 原话意思）或记录为世界内容缺口。
直接改 F:/dnd/logs/sessions/a3-intents-v2.json 与 a3-intents-v2.md（复审记录逐条写依据）；不改 id 与 intent 原文。回复 ≤100 字。
