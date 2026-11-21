// 足迹种类的判据（卷五 §4.1 规则 2；卷二 §1.9 代码内封闭枚举 footprint_kind、§1.2 必填写法 byFootprint 的判据）。
// 唯一一处：加载期校验（validate/rows.mjs 的 byFootprint 条件）、运行期读（place.mjs）、足迹划分（footprint.mjs）都从这里取，不各写一遍。
// 只看组件类，不看 id、不看显示名；本文件不 import 别的模块（validate 组与 footprint.mjs 都要 import 它，避开环）。

// 值不带前缀：region、building、room、volume，依次是区域、建筑、房间、体积足迹。
export const FOOTPRINT_KIND = Object.freeze({ region: 'region', building: 'building', room: 'room', volume: 'volume' });
// 足迹种类按这四个组件类判（卷五 §4.1 规则 2，次序固定）；组件类在卷五 §2.1 组件类一段登记。
const CLASS = Object.freeze({ facility: 'comp_facility', zone: 'comp_zone', volume: 'comp_volume', layerRoot: 'comp_layer_root' });

/**
 * 足迹种类（卷五 §4.1 规则 2）：挂 comp_facility 的是建筑；挂 comp_zone 且有挂 comp_facility 的祖先的是房间；挂 comp_volume 的是体积；
 * 挂 comp_layer_root 的是它那个格空间的全域区域足迹；其余各行是区域足迹。
 * @param {Set<string>} classes 本行组件类全集（已沿词表上位展开） @param {Iterable<Set<string>>} ancestorClassSets 各祖先的组件类全集
 * @returns {string} FOOTPRINT_KIND 之一
 */
export function footprintKindOf(classes, ancestorClassSets) {
  if (classes.has(CLASS.facility)) return FOOTPRINT_KIND.building;
  if (classes.has(CLASS.zone)) {
    for (const a of ancestorClassSets) if (a.has(CLASS.facility)) return FOOTPRINT_KIND.room;
  }
  if (classes.has(CLASS.volume)) return FOOTPRINT_KIND.volume;
  return FOOTPRINT_KIND.region;
}

/** 本行是不是层根（开格空间的行）。@param {Set<string>} classes @returns {boolean} */
export const isLayerRootClasses = (classes) => classes.has(CLASS.layerRoot);
