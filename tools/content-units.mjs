// L1 单位冲突（只判能确定的）：骨架引用事实里的材料名本身以计量单位结尾（干直芦管束、软木薄片……），
// 该单位就是这件材料的目录计量单位。正文把「该材料全名 + 数词 + 另一个可数单位」（芦管束一根）
// 或「数词 + 另一个可数单位 + 该材料全名」（一根干直芦管束）连写，则单位与骨架不一致，必判错。
// 不判：材料名不以单位结尾（骨架没给计量单位，无法确定）；只写材料简称（匹配不到全名）；
// 数量多少（骨架 amount 是目录份数，与正文件数换算不确定）；「份」「个」不作冲突单位（份是目录份数通称，个太泛）。
const NAME_UNITS = '束片张团卷块捆包袋把串段';
const COUNT_UNITS = '根条块片张团束捆把颗枚只卷包袋串段';
const NUM = '(?:\\d+|[零〇一二两三四五六七八九十百]+)';
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function unitIssues(draft, entry = null, context = null) {
  if (!draft || typeof draft !== 'object' || !Array.isArray(context?.materials)) return [];
  const texts = Object.entries(draft).filter(([key, value]) => key !== 'id' && typeof value === 'string').map(([, value]) => value);
  const errors = [];
  for (const row of context.materials) {
    const name = row?.facts?.name;
    if (typeof name !== 'string' || name.length < 2) continue;
    const unit = name.at(-1);
    if (!NAME_UNITS.includes(unit)) continue;
    const other = COUNT_UNITS.split('').filter(c => c !== unit).join('');
    const after = new RegExp(`${escape(name)}(?:约)?(${NUM})([${other}])`, 'u');
    const before = new RegExp(`(${NUM})([${other}])${escape(name)}`, 'u');
    for (const text of texts) {
      const m = text.match(after) ?? text.match(before);
      if (m) errors.push(`材料「${name}」以「${unit}」计，正文却写成「${m[0]}」，单位与骨架不一致`);
    }
  }
  return [...new Set(errors)];
}
