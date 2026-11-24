# 块 6 数据卡《人类阶段与生长（WHO）》只核（Claude Sonnet 5.5 中档，11-19）

对象：ds/b6-who，HEAD 1ad21bcb5。依据：李白 11-19 22:0x 第六批 ①；卷四 §4.4.5、:306/:307/:639/:640/:654–:659。

## 结论：必须改（一处）

foodFactor、sleepFactor 四行取卷文示例数违反"示例值不算出处"（李白 13:3x ③）。裁定 ① 只许老年起点 0.7 用卷文数标设定数；婴儿、少年、成年、老年的 foodFactor/sleepFactor 没有被授权用示例数。life.json 的 basis 自己承认"未找权威出处"。其余各点可封。

## 逐点

1. growthCurve：方法照裁定（0–5 岁 WHO 儿童标准体重中位、5–19 岁 BMI 中位×身高中位²、按各性别 19 岁体重归一、男女逐点平均）。手算复核：0 岁 (3.346/69.1554 + 3.232/57.0373)/2 = 0.05253 → 0.0525；1 岁 (9.646/69.1554 + 8.946/57.0373)/2 = 0.14817 → 0.1482，均与表一致；x=岁/19 对 22 点逐一对得上。WebFetch 抽查：WHO xlsx 为二进制，WebFetch 读不出 M 列，原始值未能独立核对（只核了自洽与手算）；GHO 婴儿定义原句核到。5 岁接缝与"乘积不等于体重中位"已在 basis 如实标注，可接受。
2. 婴儿界 0.0526 = 1/19：WHO 页原句"before reaching the age of one"属实（已 WebFetch 核）；成熟龄 19 取 WHO 青少年 10–19 岁，与 5–19 参考止于 19 一致，可接受。副作用：人类物种行 maturityYears 必须为 19，回报已报，归 6-23。
3. 违规：见结论。0.7 老年起点合规。modifiers 全空合规。可行改法：foodFactor 用 FAO/WHO/UNU 人体能量需要（按年龄每公斤或总量相对成人）；sleepFactor 用 AASM/NSF 按年龄推荐睡眠时长相对成人；有出处就写，取不到的行把 foodFactor/sleepFactor 退回未建（若加载器要求该字段，则按 E-LIFE-STAGES 现有校验决定能否缺省，需实现者查 life.mjs 后报）。
4. 测试期望：手算核对——9.5 岁 relMaturity 0.5 恰在 (0.4737,0.4516)(0.5263,0.5056) 中点 → 0.4786×70 = 33.502；0 岁 0.0525×70 = 3.675；19 岁 70；阶段界 0.99/1、18.9/19、41/42（42/60=0.7）按相对量手算，期望为字面量。无问题（注释"寿命钉 60"与锚 62 不同，是测试自造的寿命，无碍）。改 foodFactor 后若测试不碰该字段则无需动。
5. 卷四勘误 1119k20 未写：可接受，出处口径已在表行 basis；仅建议 registry.json 里 life 的 volume 说明（仍写 stages、growthCurve 登 unbuilt）下一张顺手改。
6. 亲跑：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 1145 / pass 1145 / fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass"（items 内 vol12.A12-4.5、S12-2、S12-3 三项 fail 为与本卡无关的既有项，不影响 verdict）。
