# M4 首个机制小步

`magic-primitives.mjs` 提供 `validateEffectSpec(spec)`、`resolveVitalityPrimitive({spec,hp,maxHp,defense,resistance,multiplier})`、`applyProtectionPrimitive(d,{spec,target,spell,duration},eventId)` 和 `consumeMagicProtection(d,target,amount,damageType='physical')`。伤害、治疗处理器只计算数值，目标、权限、成本与死亡/经验副作用仍由调用方负责。防护处理器修改 `state.effects` 的剩余额度，`magic.mjs` 已接入法术路径；未改共享活动文件。

防护配置为 `{kind:'protection',power:10,damageTypes:['fire'],stacking:'strongest'}`，配合正整数 `duration`。每次伤害仅取适用防护中剩余额度最多的一层，消耗后才能继续抵扣后续攻击；相同额度依到期时间与编号确定选择。不是把多层额度相加，也不保留最低一点穿透伤害。必须先处理原始伤害的吸收，再将生命钳制为零，不能先把过量伤害裁成当前生命。

主会话需在 `activities.mjs` 导入 `consumeMagicProtection`。`combat` 中算出 `attack.damage` 后、计算 `remaining` 前，用 `consumeMagicProtection(d,target,intent==='shove'?(attack.hit?1:0):attack.damage,'physical')`，以返回 `damage` 计算对手生命。反击循环中对每次 `strike(...).damage` 分别调用 `consumeMagicProtection(d,'player',hit.damage,'physical')` 再累计 `received`，不能先合并多次攻击再只抵扣一层。结果建议增加双方 absorbed 数值；暴力记录仍保留攻击行为，即使净伤害为零。物理交锋接入后新增定向集成测试。

主会话需在 `schemas/world.schema.json` 的 spell.effectSpec.kind 增加 `protection`，damageType 增加 `physical`，增加唯一非空 `damageTypes` 数组，其枚举为 physical/fire/cold/wind/earth/light/shadow/mind；stacking 仅允许 strongest。按 kind 限制字段由 validateMagicCatalog/validateEffectSpec 同时执行，不能靠 additionalProperties 放过无处理器字段。未接入这些目录结构前，不发布使用新防护的正式内容。

已有效果到期清理沿用引擎 effects.expires 机制；本步防护耗尽时保留 remaining:0 到自然到期，不新建永久记录。定向检查为 `node --test tests/magic-primitives.test.mjs tests/magic.test.mjs tests/magic-status.test.mjs tests/environment.test.mjs tests/bosses.test.mjs`，38 项通过；其中现有首领平衡测试仍达原目标。未运行全量测试，未提交或部署。DeepSeek 本步未调用。
