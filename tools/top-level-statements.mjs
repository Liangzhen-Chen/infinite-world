// 把 JS 源码切成顶层语句（括号深度为 0 且从行首（无缩进）开始的新语句）。
// 只做结构检查用，不是完整解析器：识别行注释、块注释、单双引号字符串、模板字符串（含 ${} 嵌套）、正则字面量（按前一个有效字符、=>、return/typeof 等关键字判断）。
// 行首以 } ) ] . ? : , && || + - * / = else catch finally 开头的行视为上一条语句的延续；
// 上一条是 if/for/while 头（以 ) 结尾且没有语句体）或以 else 结尾时，下一行并入同一条。
// 返回 [{text, line}]（line 为起始行号，从 1 起）；语句文本不含注释。
export function topLevelStatements(src) {
  const out = [];
  let depth = 0, i = 0, line = 1, cur = null, lastSig = '', col0 = true;
  const CONT = /^(?:[}\])?:,.+\-*\/=&|]|else\b|catch\b|finally\b)/;
  const flush = () => { if (cur) { out.push(cur); cur = null; } };
  // 正则字面量可出现的位置：前一个有效字符是运算符/开括号，或前一个记号是 =>，或前一个词是 return/typeof 等关键字（这些词之后的 / 起正则，不是除号）。
  const KW = /(?:^|[^\w$.])(?:return|typeof|case|of|in|else|yield|void|delete|throw|new|do|instanceof|await)$/;
  const regexOk = () => {
    if (lastSig === '' || '(,=:[!&|?{};'.includes(lastSig)) return true;
    const tail = cur ? cur.text.trimEnd().slice(-16) : '';
    return tail.endsWith('=>') || KW.test(tail);
  };
  const keep = t => { if (cur) cur.text += t; };
  const lines = t => (t.match(/\n/g) ?? []).length;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; col0 = true; keep(c); continue; }
    if (/\s/.test(c)) { col0 = false; keep(c); i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; col0 = false; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2), j = e < 0 ? src.length : e + 2; line += lines(src.slice(i, j)); i = j; col0 = false; continue; }
    if (col0 && depth === 0) {
      const prev = cur?.text.trim() ?? '';
      const header = /^(?:if|for|while)\b[^;{]*\)$/s.test(prev) || /\belse$/.test(prev);
      if (!(cur && (CONT.test(src.slice(i, i + 12)) || header))) flush();
    }
    col0 = false;
    if (!cur) cur = {text: '', line};
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      keep(src.slice(i, j + 1)); i = j + 1; lastSig = c; continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {            // 模板里的表达式：取到配平的 }（内含的嵌套模板按到下一个反引号粗略跳过）
          let d = 1; j += 2;
          while (j < src.length && d > 0) {
            if (src[j] === '{') d++;
            else if (src[j] === '}') d--;
            else if (src[j] === '`') { const k = src.indexOf('`', j + 1); j = k < 0 ? src.length : k; }
            j++;
          }
          continue;
        }
        j++;
      }
      const seg = src.slice(i, j + 1); line += lines(seg); keep(seg); i = j + 1; lastSig = '`'; continue;
    }
    if (c === '/' && regexOk()) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n' && (cls || src[j] !== '/')) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        j++;
      }
      keep(src.slice(i, j + 1)); i = j + 1; lastSig = '/'; continue;
    }
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth = Math.max(0, depth - 1);
    lastSig = c; keep(c); i++;
  }
  flush();
  return out;
}
