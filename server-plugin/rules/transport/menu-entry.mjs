// 菜单入口（卷二 :976、:1010、:1012、:1028、:1114；卷二十九 :319 R29-3.14；S1-3b）：menu 路由的入口处理函数。
// 落位勘误同 router-caps.mjs（卷二 kernel/transport/menu-entry.mjs → rules/transport/menu-entry.mjs，主会话裁定草案 §1 kernel 落位 A）。
// 请求体按 schema:wire-up-menu-v1 收窄（失败 rejected + E-WIRE-ENVELOPE），再按载荷顶层判别字段 payload（menu_payload 三值，数据在 world/schema/wire-v1.json，裁定 Q3；字段名 kind 改 payload 见开发.md）分流：
//   act 且带 save（save_op 二值）：存档调 world.save（kernel/save.mjs#writeSlot），读档调 kernel/load/save.mjs#readSlot 后经 mountKernel 复演换局（卷二 :1012）；
//   act 不带 save：交 handleAct（动作处理函数，日后心跳推进请求也投进它，卷二 :1028）；
//   report：错误码交 report，回 received（卷二 :1010）；ui：界面命令纯读，不提交、不推进、不进日志（卷二十九 :319）。
// 每条返回路径恰调一次 postReply（卷二 :1010）；「当前世界」引用是 mountMenuEntry 的闭包局部，不放模块顶层。

import { KernelError, REGISTERED_CODES, report, codeOf } from '../../kernel/errors.mjs';
import { T, markersOf } from '../../kernel/handles.mjs';
import { readSlot } from '../../kernel/load/save.mjs';
import { mountKernel } from '../load/mount.mjs';

/** @typedef {{affordances: unknown, visible: readonly string[]}} MenuView 菜单投影与观察者可见集（S1-3a 的 world.menu） */
/** @typedef {{slot: number} & Record<string, unknown>} SaveInfo 存档清单（回应只取 slot 与 clockMinute，卷二 :1014） */
/** @typedef {{ok: boolean, seq?: number, advancedMinutes?: number, code?: string}} ActResult 动作执行入口的结果（S1-3 接口草案 §2.2） */
/** @typedef {{act: string, slots: Record<string, number>, numbers: Record<string, number>}} ActIntent 交动作执行入口的意图（槽位与数值已按 wire schema 收窄） */
/** @typedef {{engine: {docData: {wire: import('./router-caps.mjs').WireDoc}}, save: (slot: number) => SaveInfo, act?: (intent: ActIntent) => ActResult, menu?: (subjectId: string | undefined) => MenuView}} World 一局（mountKernel 的返回值；act、menu 由 S1-3a 加） */
/** @typedef {{world: World}} Session 菜单会话：当前这一局（init 或读档复演的结果） */
/**
 * 按 schema:wire-up-menu-v1 收窄后的载荷（字段与类型见 world/schema/wire-v1.json；三种变体的字段并在一起，按 payload 只出现其一的那些）。
 * @typedef {{payload: string, act?: string, slots?: Record<string, number>, numbers?: Record<string, number>, save?: string, saveSlot?: number, code?: string, fields?: Record<string, number | string | boolean>, command?: string, panel?: string, subject?: string}} Body
 */
/** @typedef {import('./router-caps.mjs').ReplyResult} Reply */

/**
 * 动作处理函数（卷二 :1028：收窄请求体之后调用的那一个；无 ReplyHandle）：把动作载荷交本局的动作执行入口 world.act（S1-3a，草案 §4、§5 冻结接口），
 * 执行入口内经 resolveIntent → submitProposal 结算；提交成功回 ok 带事件序号与推进分钟数，被拒回 rejected 加拒收代号。
 * @param {Session} session @param {Body} body
 * @returns {Reply}
 */
export function handleAct(session, body) {
  const R = T.code_enum.reply_result;
  let r;
  try {
    r = session.world.act({ act: body.act, slots: body.slots ?? {}, numbers: body.numbers ?? {} });
  } catch (e) {
    const code = codeOf(e);
    if (code === null) throw e;
    return { result: R.rejected, code };
  }
  if (!r.ok) return { result: R.rejected, code: r.code };
  return { result: R.ok, events: { from: r.seq, to: r.seq }, advancedMinutes: r.advancedMinutes };
}

/**
 * mountMenuEntry（卷二 :1033；kernelApi 只对 index.mjs 开放）：在 requestCap 上挂 menu 路由。
 * @param {{on: (route: string, handler: import('./router-caps.mjs').EntryHandler) => void, narrow: (wire: import('./router-caps.mjs').WireDoc, name: string, raw: unknown) => Body}} requestCap
 * @param {{postReply: (reply: import('./router-caps.mjs').ReplyHandle, result: import('./router-caps.mjs').ReplyResult) => void}} replyCap
 * @param {{world: World, caps: Parameters<typeof mountKernel>[1]}} boot 开局的这一局与装配层注入能力（读档复演 mountKernel(docData, caps, loaded) 用同一份 caps）
 */
export function mountMenuEntry(requestCap, replyCap, boot) {
  /** @type {Session} */
  const session = { world: boot.world };
  const wire = boot.world.engine.docData.wire;
  const payload = markersOf('menu_payload', wire.enums.menu_payload);
  const saveOp = markersOf('save_op', wire.enums.save_op);
  const R = T.code_enum.reply_result;

  /** 存读档两个操作（卷二 :1012）：都返回清单，回应只带 {slot, clockMinute}（卷二 :1014）。 @type {Record<string, (slot: number) => SaveInfo>} */
  const saveOps = {
    [saveOp.save]: (/** @type {number} */ slot) => session.world.save(slot),
    [saveOp.load]: (/** @type {number} */ slot) => {
      const loaded = readSlot(session.world.engine, slot);
      session.world = mountKernel(loaded.docData, boot.caps, loaded);
      return loaded.manifest;
    },
  };
  /** @param {Body} body @returns {Reply} */
  const onSave = (body) => {
    try {
      const m = saveOps[body.save](body.saveSlot);
      return { result: R.ok, save: { slot: m.slot, clockMinute: m.clockMinute } };
    } catch (e) {
      const code = codeOf(e);
      if (code === null) throw e;
      return { result: R.rejected, code };
    }
  };
  // 动作载荷二选一：带 save（存读档，须有 saveSlot，不带动作字段）或带 act（动作，不带存读档字段）。
  /** @param {Body} body @returns {Reply} */
  const onAct = (body) => {
    const isSave = body.save !== undefined;
    const shapeOk = isSave
      ? body.saveSlot !== undefined && body.act === undefined && body.slots === undefined && body.numbers === undefined
      : body.act !== undefined && body.saveSlot === undefined;
    if (!shapeOk) return { result: R.rejected, code: 'E-WIRE-ENVELOPE' };
    return isSave ? onSave(body) : handleAct(session, body);
  };
  /** 错误上报（卷二 :1010）：码须是登记码，交 report，回 received。 @param {Body} body @returns {Reply} */
  const onReport = (body) => {
    if (!REGISTERED_CODES.has(body.code)) return { result: R.rejected, code: 'E-WIRE-ENVELOPE' };
    report(codeOf(body), body.fields ?? {});
    return { result: R.received };
  };
  /**
   * 界面命令 view（卷二十九 :319、R29-3.14、:617 R29-3.7）：纯读。菜单投影与可见集都取本局的 world.menu(subjectId) → {affordances, visible}（S1-3a 提供，主会话裁定）；
   * subject 不在可见集即 E-DISPLAY-SUBJECT（对存在与不存在的 id 回应同形）。S1-3a 合入前本局还没有 world.menu：无观察者、可见集为空，
   * 凡给 subject 一律 E-DISPLAY-SUBJECT，回应不带 menu（阶段性缺环，见开发.md；3a 合入后此判断恒走有 menu 的一支）。
   * @param {Body} body @returns {Reply}
   */
  const onUi = (body) => {
    const screen = body.panel === undefined ? {} : { panel: body.panel };
    const view = session.world.menu === undefined ? { affordances: undefined, visible: [] } : session.world.menu(body.subject);
    if (body.subject !== undefined && !view.visible.includes(body.subject)) return { result: R.rejected, code: 'E-DISPLAY-SUBJECT' };
    const shown = body.subject === undefined ? screen : { ...screen, subject: body.subject };
    return view.affordances === undefined ? { result: R.ok, screen: shown } : { result: R.ok, screen: shown, menu: view.affordances };
  };
  /** @type {Record<string, (body: Body) => Reply>} */
  const byPayload = { [payload.act]: onAct, [payload.report]: onReport, [payload.ui]: onUi };

  requestCap.on(T.code_enum.wire_route.menu, (/** @type {unknown} */ raw, /** @type {object} */ reply) => {
    /** @type {Reply} */
    let result;
    try {
      const body = requestCap.narrow(wire, 'wire-up-menu-v1', raw);
      result = byPayload[body.payload](body);
    } catch (e) {
      if (!(e instanceof KernelError) || e.code !== 'E-WIRE-ENVELOPE') throw e;
      result = { result: R.rejected, code: e.code };
    }
    replyCap.postReply(reply, result);
  });
}
