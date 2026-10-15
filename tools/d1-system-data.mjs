// D1 系统数据铺开：把设计数据并入 world/meta/rules.json（可重复运行，结果不变）。
//   rules.hazardClock                       ← world/design/seasonal-hazards.mjs
//   rules.questSources.publishers/funds/ledgers/commissions ← world/design/d1-system-data.mjs
// 用法：node tools/d1-system-data.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {hazardClockRules} from '../world/design/seasonal-hazards.mjs';
import {publishers,funds,ledgers,factionCommissions} from '../world/design/d1-system-data.mjs';

const file=path.resolve(import.meta.dirname,'../world/meta/rules.json');
export function applyD1(rules){
 const next=structuredClone(rules);
 next.hazardClock=structuredClone(hazardClockRules);
 next.questSources={...next.questSources,publishers:{...next.questSources.publishers,...publishers},funds:{...funds},ledgers:structuredClone(ledgers),commissions:structuredClone(factionCommissions)};
 return next;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const text=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),out=JSON.stringify(applyD1(JSON.parse(text)),null,2)+'\n';
 if(process.argv.includes('--check')){if(out!==text)throw Error('rules.json 与 D1 设计数据不一致，请运行 node tools/d1-system-data.mjs');console.log('D1 数据一致');}
 else{fs.writeFileSync(file,out);console.log('rules.json 已并入 D1 数据');}
}
