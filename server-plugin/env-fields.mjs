// 环境场的读写模块 env-fields.mjs（卷二十 §4.7.2：`fields.*.*` 与 `fieldCells.*.*.*` 的唯一写者；格子迁移 G14）。
// 现在只是状态声明里登记的写者身份（world/ontology/state-owners.json 的 fields、fieldCells 写者）；本文件没有可调用的入口。
// 地点层步进、泡内细格写者、收起折算（foldBubbleFields）、读法（envAt 的 env.fieldIntensity）、propagate 由 G14 后三张卡在本文件与 field-step.mjs 上建；
// 规则表 fields、light、sound、env 的读口连同它的第一个真实调用者在那几张卡里一起做（李白 Q-11：写了没人用的入口不留；第一轮核建议 6）。
export {};
