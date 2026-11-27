// 摆放（S1-4 草案 §3.2；卷二十九 R29-7.1 前端只做三件事）：按 layout.json 的块与行把 view 回复摆成画面，把点选变成代号与候选编号上行。
// 不含规则、不做判定、不拼文字、不缓存菜单与世界状态：每次动作之后重发 view 整页重画；唯一的内存是本次打开页面以来的回复记录（只用来显示）。
// 本文件不碰宿主全局（window、document、fetch 只在 bootstrap.mjs，卷二:1035）；字面量只有 wire 结构键与枚举值、layout 的 kind、DOM 标签名与类名。
// 显示名一律经 labels.mjs#labelOf；DOM 元素挂 data-code（代号）与 data-value（数值、候选编号）。

import { loadLabels } from './labels.mjs';

/** @typedef {{wireBody: string | null, bytes: Uint8Array}} RawReply */
/** @typedef {{post: (route: string, body: unknown) => Promise<RawReply>, getJson: (path: string) => Promise<any>, decode: (bytes: Uint8Array) => string}} Net */
/** @typedef {{root: () => any, el: (tag: string) => any, setTitle: (text: string) => void}} Dom */
/** @typedef {{download: (name: string, bytes: Uint8Array) => void, pick: () => Promise<string | null>}} Files */
/** @typedef {{net: Net, dom: Dom, files: Files}} Caps */

const WIRE_BODY_BYTES = 'bytes';
const UNTRANSLATED = 'untranslated';
const ENUM_SEP = '.';

/** 按点分路径取值；途中缺即 undefined。 @param {any} obj @param {string} path */
function at(obj, path) {
  return path.split(ENUM_SEP).reduce((v, k) => (v !== null && v !== undefined && typeof v === 'object' ? v[k] : undefined), obj);
}

/** @param {Caps} caps */
export async function mount(caps) {
  const { net, dom, files } = caps;
  const layout = await net.getJson('layout.json');
  const labels = await loadLabels(net, layout.i18n);
  /** @type {Array<Record<string, unknown>>} 本次打开页面以来的回复记录（只显示，不回传、不存） */
  const log = [];

  /** 一个元素：标签名、类名、代号与数值属性。 @param {string} tag @param {{cls?: string, code?: string, value?: string | number}} [o] */
  const el = (tag, o = {}) => {
    const e = dom.el(tag);
    if (o.cls !== undefined) e.className = o.cls;
    if (o.code !== undefined) e.dataset.code = o.code;
    if (o.value !== undefined) e.dataset.value = String(o.value);
    return e;
  };
  /** 显示名节点：查不到即显示代号并挂未译类（卷二十九 R29-1.6）。 @param {string} tag @param {string} code */
  const named = (tag, code) => {
    const shown = labels.labelOf(code);
    const e = el(tag, { code, cls: shown.translated ? undefined : UNTRANSLATED });
    e.textContent = shown.text;
    return e;
  };
  /** 数值节点。 @param {string} tag @param {number} n */
  const num = (tag, n) => {
    const e = el(tag, { value: n });
    e.textContent = String(n);
    return e;
  };
  /** 封闭枚举值的显示名键（卷二十九:244「枚举名.值」；枚举名取 layout.enumKeys）。 @param {string} which @param {string} value */
  const enumCode = (which, value) => [layout.enumKeys[which], value].join(ENUM_SEP);

  // 外壳：页头（图标与提示）+ 三栏，每块一个容器，id 与 data-code 都是块代号。
  const root = dom.root();
  root.replaceChildren();
  dom.setTitle(labels.labelOf(layout.title).text);
  const head = el('header');
  const logo = el('img', { cls: 'logo' });
  logo.src = layout.logo;
  logo.alt = '';
  const notice = el('span', { cls: 'notice' });
  head.append(logo, named('h1', layout.title), notice);
  root.append(head);
  const main = el('main');
  root.append(main);
  /** @type {Record<string, any>} */
  const bodies = {};
  const blockOf = Object.fromEntries(layout.blocks.map((/** @type {any} */ b) => [b.block, b]));
  for (const col of layout.columns) {
    const c = el('div', { cls: 'col' });
    for (const code of col) {
      const section = el('section', { cls: 'block', code });
      section.id = code;
      const body = el('div', { cls: 'body' });
      section.append(named('h2', code), body);
      c.append(section);
      bodies[code] = body;
    }
    main.append(c);
  }

  /** 页头提示（R29-7.8 四条之一，或清空）。 @param {string | null} key */
  const setNotice = (key) => {
    notice.replaceChildren(...(key === null ? [] : [named('span', layout.notices[key])]));
    root.dataset.state = key ?? '';
  };

  /** 发一条上行并解出回复；连不上返回 null 并亮「连不上」。 @param {string} route @param {unknown} body */
  const send = async (route, body) => {
    setNotice('waiting');
    try {
      const raw = await net.post(layout.routes[route], body);
      setNotice(null);
      return raw;
    } catch {
      setNotice('offline');
      return null;
    }
  };
  /** 信封回复（JSON 文本）→ 对象。 @param {RawReply} raw */
  const json = (raw) => JSON.parse(net.decode(raw.bytes));

  /** 记一条回复（结果码、拒收码、事件区间、推进分钟数、存档）并重画记录栏。 @param {string} op 发起的动作或操作代号 @param {any} reply */
  const record = (op, reply) => {
    log.unshift({ op, ...reply });
    renderLog();
  };

  // ---- 各种块的画法（kind 来自 layout.json） ----
  /** @type {Record<string, (block: any, view: any) => void>} */
  const draw = {
    fields(block, view) {
      const list = el('dl');
      for (const row of block.rows) {
        const v = at(view, row.path);
        const dd = el('dd', { code: row.token });
        dd.dataset.path = row.path;
        if (row.kind === 'int' && typeof v === 'number') dd.append(num('span', v));
        else if (row.kind === 'code' && typeof v === 'string') dd.append(named('span', v));
        else if (row.kind === 'codeList' && Array.isArray(v)) dd.append(...v.map((c) => named('span', c)));
        list.append(named('dt', row.token), dd);
      }
      bodies[block.block].replaceChildren(list);
    },
    chain(block, view) {
      const ol = el('ol');
      const ids = at(view, block.path);
      for (const id of Array.isArray(ids) ? ids : []) {
        const li = named('li', id);
        ol.append(li);
      }
      bodies[block.block].replaceChildren(ol);
    },
    table(block, view) {
      const out = [];
      for (const t of block.tables) {
        const rows = at(view, t.path);
        const ul = el('ul', { code: t.token });
        for (const r of Array.isArray(rows) ? rows : []) {
          const li = el('li', { code: String(at(r, t.key[0])) });
          for (const col of t.cols) {
            const v = col.paths.map((/** @type {string} */ p) => at(r, p)).find((/** @type {unknown} */ x) => x !== null && x !== undefined);
            if (col.kind === 'int' && typeof v === 'number') li.append(num('span', v));
            else if (col.kind === 'code' && typeof v === 'string') li.append(named('span', v));
          }
          ul.append(li);
        }
        out.push(named('h3', t.token), ul);
      }
      bodies[block.block].replaceChildren(...out);
    },
    menu(block, view) {
      const cards = [];
      const rows = at(view, block.path);
      for (const a of Array.isArray(rows) ? rows : []) {
        const card = el('form', { cls: 'card', code: a.act });
        card.append(named('h3', a.act));
        /** @type {Array<() => [string, number]>} */
        const slotReads = [];
        for (const [slot, cands] of Object.entries(a.slots)) {
          const label = el('label', { code: slot });
          const select = el('select', { code: slot });
          cands.forEach((/** @type {string} */ id, /** @type {number} */ i) => {
            const opt = named('option', id);
            opt.value = String(i);
            opt.dataset.value = String(i);
            select.append(opt);
          });
          label.append(named('span', slot), select);
          card.append(label);
          slotReads.push(() => [slot, Number(select.value)]);
        }
        /** @type {Array<() => [string, number]>} */
        const numReads = [];
        for (const [name, spec] of Object.entries(a.numbers)) {
          const label = el('label', { code: name });
          const input = el('input', { code: name });
          input.type = 'number';
          input.min = String(spec.min);
          input.max = String(spec.max);
          input.step = String(1);
          input.value = String(spec.min);
          label.append(named('span', name), input, named('span', spec.unit));
          card.append(label);
          numReads.push(() => [name, Number(input.value)]);
        }
        const submit = named('button', block.submit);
        submit.type = 'submit';
        card.append(submit);
        card.addEventListener('submit', async (/** @type {any} */ ev) => {
          ev.preventDefault();
          const body = { payload: 'act', act: a.act, slots: Object.fromEntries(slotReads.map((f) => f())), numbers: Object.fromEntries(numReads.map((f) => f())) };
          const raw = await send('menu', body);
          if (raw === null) return;
          record(a.act, json(raw));
          await refresh();
        });
        cards.push(card);
      }
      bodies[block.block].replaceChildren(...cards);
    },
    save(block) {
      if (bodies[block.block].childElementCount > 0) return;
      const label = el('label', { code: block.slotToken });
      const select = el('select', { code: block.slotToken });
      for (const n of block.slots) {
        const opt = el('option', { value: n });
        opt.value = String(n);
        opt.textContent = String(n);
        select.append(opt);
      }
      label.append(named('span', block.slotToken), select);
      const slot = () => Number(select.value);
      /** @param {string} token @param {() => Promise<void>} fn */
      const button = (token, fn) => {
        const b = named('button', token);
        b.type = 'button';
        b.addEventListener('click', fn);
        return b;
      };
      /** 存档、读档走 menu 路由的 act 载荷（卷二 :1012），按钮键即 save_op 值。 @param {string} op */
      const saveOp = (op) => async () => {
        const raw = await send('menu', { payload: 'act', save: op, saveSlot: slot() });
        if (raw === null) return;
        record(enumCode('save', op), json(raw));
        await refresh();
      };
      const doExport = async () => {
        const raw = await send('export', { slot: slot() });
        if (raw === null) return;
        if (raw.wireBody === WIRE_BODY_BYTES) {
          files.download([block.exportName.prefix, slot(), block.exportName.suffix].join(''), raw.bytes);
          record(block.buttons.export, { result: null, save: { slot: slot() } });
        } else record(block.buttons.export, json(raw));
      };
      const doImport = async () => {
        const bytes = await files.pick();
        if (bytes === null) return;
        const raw = await send('import', { slot: slot(), bytes });
        if (raw === null) return;
        record(block.buttons.import, json(raw));
        await refresh();
      };
      const b = block.buttons;
      bodies[block.block].replaceChildren(label, button(b.save, saveOp('save')), button(b.load, saveOp('load')), button(b.export, doExport), button(b.import, doImport));
    },
    log() {},
  };

  const logBlock = layout.blocks.find((/** @type {any} */ b) => b.kind === 'log');
  /** 记录栏（Q8：结果码名、拒收码名、事件区间、推进分钟数、存档槽与时钟）。 */
  const renderLog = () => {
    if (logBlock === undefined) return;
    const ul = el('ul');
    for (const r of log) {
      const li = el('li', { code: String(r.op) });
      li.append(named('span', String(r.op)));
      if (typeof r.result === 'string') li.append(named('span', enumCode('result', r.result)));
      if (typeof r.code === 'string') li.append(named('span', r.code));
      const ev = /** @type {any} */ (r.events);
      if (ev) li.append(num('span', ev.from), num('span', ev.to));
      if (typeof r.advancedMinutes === 'number') li.append(num('span', r.advancedMinutes));
      const sv = /** @type {any} */ (r.save);
      if (sv) {
        li.append(num('span', sv.slot));
        if (typeof sv.clockMinute === 'number') li.append(num('span', sv.clockMinute));
      }
      ul.append(li);
    }
    bodies[logBlock.block].replaceChildren(ul);
  };

  /** 重发 view，按 layout 整页重画（不缓存上一次的回复）。 */
  const refresh = async () => {
    const raw = await send('menu', { payload: 'ui', command: 'view' });
    if (raw === null) return;
    const view = json(raw);
    if (view.result !== 'ok') {
      record(layout.title, view);
      return;
    }
    for (const b of layout.blocks) draw[b.kind](b, view);
  };

  for (const b of layout.blocks) if (b.kind === 'save') draw.save(b, null);
  await refresh();
}
