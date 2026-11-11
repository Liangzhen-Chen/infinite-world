# FIXT164 交接

40 铜没有漏转：`npc-life.mjs:525` 将死者 40 铜记入遗产，`transition.mjs:955` 分配阶段把 40 铜全额转给邵禾。之后 FXM 共用田间分钟推导出农忙播种缺工，`labor-market.mjs:130-136` 生成邵禾雇工合同；流水 `workshop:labor:labor:farm:loc_hw:npc_hw_shaohe:农忙播种:20160:21180` 记录向 `npc_a3_apprentice_uncle` 支付 27 铜。合同日薪 30，通勤后实际工时 432/480 分钟，按 `ceil(30×432/480)=27`，余额 40−27=13。

仅更新 `tests/npc-life-t164.test.mjs:203-204` 手算锚点；保留遗产 40 铜及全额分配断言，并断言之后余额 13。无生产代码或金快照改动；数值摘要所涉持久化数据未改。动作目录已重导，生成内容无文本差异。

验收：affected-tests2 清单 32 个文件，31 个通过。CORE、同步四件套、目标测试及其余相关测试均通过。`tests/overfit-guard.test.mjs` 因 `spawnSync('git show master:world/actions/core.json')` 返回 `status:null` 失败；需主会话在沙箱外补跑。未改禁区文件，无临时调试文件。
