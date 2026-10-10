import {spellBlueprints} from './spell-blueprints.mjs';
// Mechanical candidates only. Existing generated descriptions require new L1/L2/L4.
export const objectSpellCandidates=spellBlueprints().filter(s=>['ignite','fuel'].includes(s.mechanism)).map(s=>({...s,
 effectSpec:{kind:'object',operation:s.mechanism,power:s.mechanism==='ignite'?5000:100},
 objectRequirements:s.mechanism==='ignite'?'已登记非活体火绒；干燥、未燃、实际燃料最多5000毫克':'已登记且正在燃烧的炉具；节燃上限100千分比，持续30分钟；仍实际耗尽有限燃料'
}));
export const objectMappingLimits={
 warm:'未映射：旧骨架是持续30分钟的暖掌与触碰传热；本次heat是对已登记非活体的一次有限热输入，不能假称暖掌已实现。',
 sense_heat:'未映射：本次只能接触读整体温度；旧骨架要求实际炭线显示器壁温差，仍缺空间表面温差与炭线物料规则。',
 mark:'未映射：尚无表面改变、签记媒介与可识别痕迹处理器，不以装饰状态代替。',
 dry:'旧衣物dry保持原接口；object.dry仅处理登记的物件含水质量并按每毫克3焦耳计蒸发代价，未扩大旧法术目标。'
};
