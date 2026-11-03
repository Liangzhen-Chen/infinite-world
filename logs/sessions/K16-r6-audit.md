# K16 R6 三十日审计

同工具、种子k16-audit；305/305已配置家户，加23个无户个体，共9840户日。未展开个体按来源未知计入，不展开远方。R6和R5逐户逐日shortfall完全相同。

|类别|户数|户日|基线缺粮→R5→R6|基线缺水→R5→R6|
|---|---:|---:|---|---|
|town|90|2700|1348→721→721|1350→0→0|
|public|142|4260|0→0→0|4258→30→30|
|monster|19|570|540→0→0|540→0→0|
|generated|54|1620|0→0→0|1439→30→30|
|mobile|23|690|677→60→60|690→60→60|

注意：原基线仅253/305个配置家户有进餐记录，外加23无户个体；不能把原来遗漏52户的缺口当作0。上表基线列是原可观测群体，R5/R6覆盖305户。以下另列严格同户日结果和新增统计群体。

同户日R6（days/hungry/thirsty）：`{"town": {"days": 1350, "hungry": 380, "thirsty": 0}, "public": {"days": 4260, "hungry": 0, "thirsty": 30}, "monster": {"days": 540, "hungry": 0, "thirsty": 0}, "generated": {"days": 1440, "hungry": 0, "thirsty": 0}, "mobile": {"days": 690, "hungry": 60, "thirsty": 60}}`。新增52户R6：`{"town": {"days": 1350, "hungry": 341, "thirsty": 0}, "monster": {"days": 30, "hungry": 0, "thirsty": 0}, "generated": {"days": 180, "hungry": 0, "thirsty": 30}}`。

较R5改变缺口行数：0；有限觅食库存残差Σ(initial+grown−harvested−reserve)：0。

城镇721个缺粮户日缺少可售粮食货架，保留给TOWNFOOD；没有为了跑分快速补粮或改市场代码。公仓30个缺水户日受照护劳力约束；远方30个缺水户日最近水源单程2882分钟，超出真实工时。

两个未展开个体npc_hc_yicen、npc_hc_liwang在county_xichui_huancheng，各30日来源未知，共60个缺粮/缺水户日，已纳入mobile；不因推进展开郡。Tongji、Zheya仅审计夹具主动到访展开。

早前55个遗漏名册家户：52户已纳入（45城镇、1裂炉、3Tongji、3Zheya）；另外3户属于已取消的非法推进展开产物，正确世界不生成。实际配置305户全部覆盖。

near-water从规则表30分钟往返阈值和15分钟汲水派生；真实耗水、有限来源、旱冻污盐、缺水后消耗存水的行为仍由机制测试覆盖。
