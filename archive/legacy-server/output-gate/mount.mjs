// outputGate 的装配入口（卷二 groupApi `output-gate/mount.mjs#mountOutput`，callerFiles index.mjs；通路表第 3 环"由 mountOutput 触发"；体检 K6-80、K6-81 装配一侧）。
// 块 6 调它，不调 mountNarration（aiGate 不建，卷二勘误 1119k3）。装配文件只交两个返回值：createRouterCaps 的 caps 与 mountKernel 的 kernel；
// 其余部件（显示语言名单、屏蔽词表、语言包、显示配置、替换记号、信封出口、显示闸）都在这里组装，装配文件不碰它们（卷二 :996 扫描规则）。
// 替换记号取卷二 ui_token 条目 `uitok_redacted` 的显示名（卷二十九 :1064、R29-7.6）；语言包里还没有这一条时按"缺译以代号本身显示并标未译"（R29-1.6 ③）出，
// 不在这里编一个记号字符。

import { registerComposer } from './reply-composer.mjs';
import { createEnvelopeExit } from './envelope-exit.mjs';
import { createRedactor } from './redact.mjs';
import { displayData } from './display-load.mjs';
import { labelText } from './templates.mjs';
import { FORM } from './enums.mjs';
import { labels } from '../textcore/labels.mjs';
import { loadDisplayBlocklist } from '../gate/load-blocklist.mjs';
import { displayLangs } from '../kernel/handles/display-lang.mjs';

const REDACT_MARK_CODE = 'uitok_redacted';

/**
 * 装配时调一次：显示语言名单取 kernelApi displayLangs（world/i18n/locales.json，卷二 :1075），每种语言加载屏蔽词表；
 * 回应组装器块 6 只服务名单第一种语言（请求头 locale 选语言随 6-21、回应组装器多语言化，卷二 :945）；
 * 加载语言包，造信封出口与显示闸，登记给回应通道的订阅函数（恰一次，二次装配由回应通道报 E-WIRE-REPLY）。
 * @param {{caps: {replyCap: {send: (handle: object, body: string) => unknown}}, kernel: {root: string}}} options caps 是 createRouterCaps 的返回值，kernel 是 mountKernel 的返回值
 * @returns {void}
 */
export function mountOutput(options) {
  const { caps, kernel } = options || {};
  const root = kernel.root;
  const langs = displayLangs(root);
  for (const each of langs) loadDisplayBlocklist(root, each);
  const lang = langs[0];
  const lb = labels(root, lang);
  const display = displayData(root);
  const mark = labelText(REDACT_MARK_CODE, FORM.label, { display, labels: lb.names, templates: lb.templates, seq: 0 });
  registerComposer({
    envelopeExit: createEnvelopeExit(caps.replyCap),
    redact: createRedactor(mark.text, lang),
    display,
    labels: lb.names,
    templates: lb.templates,
  });
}
