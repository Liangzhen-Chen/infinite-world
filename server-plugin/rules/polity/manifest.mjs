// polity 域的装配登记（S2-SH 草案 §3；S2-TP1）：本域现在只有开局统治边（rules/polity/govern.mjs，由开局一步 rules/gen/worldgen-writeback.mjs#runOpening 直调），
// 没有终止清理、建档实例化、推进钩子与原语写者交给 mount；统治者变更动作、R8-5.6 统治者变更事件等由后续卷八卡在此登记。
export const POLITY_MANIFEST = Object.freeze({
  domain: 'polity',
});
