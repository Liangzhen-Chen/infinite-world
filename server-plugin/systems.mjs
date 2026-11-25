// 规则层对装配文件开放的入口桩（L-15，docs/gemini/kickoff-1125.md:493；Gemini 裁定 msg_82485b7f7ab7）。
// 新骨架的规则层尚未落地：清单为空，空清单即通过。各系统首次上线时在清单里加一行登记，并写该系统自己的校验。
// 不引任何归档文件。

/** 已上线的规则系统清单；新骨架起步时为空。 */
export const SYSTEMS = Object.freeze([]);

/**
 * 核对规则系统清单。清单为空时通过；非数组拒收。
 * @param {unknown} systems
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateSystems(systems = SYSTEMS) {
  if (!Array.isArray(systems)) return { ok: false, errors: ['systems must be an array'] };
  return { ok: true, errors: [] };
}
