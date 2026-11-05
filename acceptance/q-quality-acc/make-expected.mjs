// 由基线 acceptance.json 的断言清单生成 expected.json：卡 Q 交付后全部断言都应为 pass。
import fs from 'node:fs';
const src=process.argv[2]??'acceptance.json';
const j=JSON.parse(fs.readFileSync(new URL(src,import.meta.url),'utf8'));
const out={card:'Q 手艺档位与品质链',baseline:j.tree,generatedFrom:src,
  note:'卡 Q 交付后每条都应为 pass。材料族与配方由被测树数据推出；若交付后某族因世界取得路径（买不到、采不到）变成 blocked，该族单条可暂缓，但 Q1*–Q5* 覆盖断言（≥3 族全过）必须 pass。',
  expected:Object.fromEntries(j.results.map(r=>[r.id,{expect:'pass',baseline:r.status}]))};
for(const id of Object.keys(out.expected).filter(k=>/\.Q5a /.test(k))){const pre=id.split('.Q5a')[0];if(!Object.keys(out.expected).some(k=>k.startsWith(pre+'.Q5b')))out.expected[pre+'.Q5b 卖给 NPC 的成交价随实例品质变化']={expect:'pass',baseline:'blocked'};}
fs.writeFileSync(new URL('expected.json',import.meta.url),JSON.stringify(out,null,1));
console.log(Object.keys(out.expected).length,'条');
