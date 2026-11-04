// 由基线 acceptance.json 生成 expected.json：K6 交付后应当变成 pass 的断言，以及仍应 blocked 的断言与缺的规律。
// 用法：node F:/dnd-tmp/k6-legality-acc/make-expected.mjs（只读 acceptance.json，不跑引擎）
import fs from 'node:fs/promises';
const D='F:/dnd-tmp/k6-legality-acc',base=JSON.parse(await fs.readFile(`${D}/acceptance.json`,'utf8'));
const NOTES={
  '1.3':'依赖 K7 的"从畜群牵出一只（个体化）"原语路径；K6 只负责拆掉进私宅与他人畜群的许可闸门并定罪',
  '1.5':'若交付后理由变为"作物尚未成熟"这类物理理由，这四条改判 blocked（季节前提），不算 K6 失败；届时应在成熟季复跑',
  'P2':'基线回答是"现有手段不能产生这种效果"（既非所有权也非物理），K6 后应给出搬不动、不可移动之类的物理理由；若主会话认为这属 AUDIT3 动作入口，可移出',
  'P4':'同 P2',
};
const followUps=['林穗的面包','铁匠的钱','任博的林木','进私宅','扣人'];
const exp=[];
for(const r of base.results){
  if(r.result==='control')continue;
  const e={id:r.id,group:r.group,phenomenon:r.phenomenon,baseline:r.result};
  const key=Object.keys(NOTES).find(k=>r.id===k||r.id.startsWith(k+'.'));if(key)e.note=NOTES[key];
  if(r.group.startsWith('七')){continue;}
  if(r.id==='1.4w'){e.expected='blocked';e.missingLaw='世界数据：没有他人所有、可伐的林木（不是 K6 规律缺口；"砍别人的树"由 1.4 采他人据点柴炭与 forest-water 测试里的私有林场形状代表）';}
  else if(r.group.startsWith('五 覆盖面')){
    if(r.evidence?.undecided){e.expected='excluded';e.note=r.evidence.undecided;}
    else if(r.evidence?.baseline==='被拒（社会许可）'){e.expected='pass';}
    else {e.expected='blocked';e.missingLaw=r.evidence?.why??'前提未成立';}
  }
  else e.expected='pass';
  exp.push(e);
}
for(const f of followUps)exp.push({id:`7.${f}`,group:'七 N 天内后续',phenomenon:`${f}：--days N 天内出现后续（案件推进、通缉、追索或声望变化）`,baseline:'blocked（行为没发生，"7" 一条）',expected:'pass',note:'动态生成：只有对应行为发生后才出现；本机 --days 1–3 冒烟，30 天正式跑在 Linux'});
const count=k=>exp.filter(e=>e.expected===k).length;
await fs.writeFile(`${D}/expected.json`,JSON.stringify({card:'K6 合法性是后果',baselineRepo:base.repo,baselineCommit:base.commit,generatedAt:new Date().toISOString(),
  summary:{pass:count('pass'),blocked:count('blocked'),excluded:count('excluded')},
  rule:'一、二、三、四、六组全部应 pass；覆盖面中基线"被拒（社会许可）"的点应 pass（发生+罪名）；取得路径或数据缺失导致 blocked 的点写明 missingLaw，不在 K6 期望内；待人判与构成性规则标 excluded。',
  expectations:exp},null,1));
console.log(JSON.stringify({pass:count('pass'),blocked:count('blocked'),excluded:count('excluded')}));
