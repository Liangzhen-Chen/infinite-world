// 确定性诊断：同一种子推进 N 天，把每一步产生的全部补丁（含成交记录 market-trade:*、账本过账 ledger.*）按顺序做链式哈希，输出笔数与哈希。
// 用于证明性能改动不改变实际成交与账本：改前改后各跑一次，哈希与笔数必须完全相等。只用新旧版本都有的公开接口。
// 用法：node tools/trade-ledger-digest.mjs [天数=30] [--world full|farm] [--compare tools/trade-ledger-digest.baseline.json]
// --compare：与基线文件里该世界的“期望”逐项比对（耗时等不参与），不一致退出码 1；基线与复现命令见 trade-ledger-digest.baseline.json。   （farm：farm-pests 夹具世界，覆盖作物生长与收获）
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,PatchCursor} from '../server-plugin/storage.mjs';

const args=process.argv.slice(2),days=Number(args.find(a=>/^\d+$/.test(a))??30),mode=args.includes('--world')?args[args.indexOf('--world')+1]:'full';
const t0=performance.now(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
let engine,document;
if(mode==='farm'){
 const {withFarmPests}=await import('../world/design/farm-pests-foundation.mjs');
 const source=await loadWorld();delete source.rules.wildlife.farmPests;
 engine=new WorldEngine(withFarmPests(source));document=engine.createCharacter(legacy,{},'trade-ledger-digest-farm');
}else{
 const w=structuredClone(await loadWorld()),host='npc_hw_linsui',inn='bld_hw_qingdeng';
 for(const npc of w.npcs.filter(n=>n.id===host))npc.schedule={default:[{start:0,end:1440,location:inn,activity:'营业',services:['trade']}]};
 engine=new WorldEngine(w);document=engine.createCharacter(legacy,{},'trade-ledger-digest');
 document.state.minute=600;document.state.location=inn;document.state.player.coins=2000;
 Object.assign(document.state.npcs[host],{location:inn,activity:'营业',status:'正常'});
}
// 键序规范化，避免对象插入顺序差异影响哈希；数组保持原序。
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
let chain='',patchCount=0,tradePatches=0,ledgerPatches=0,steps=0;const groups2={},groups3={};const bump=(o,k)=>{o[k]=(o[k]??0)+1;};
const group=(g2,g3,path)=>{
 bump(g2,path.slice(0,2).join('.'));
 bump(g3,path.slice(0,2).join('.')+(path[2]===undefined?'':'.'+(path[1]==='records'||path[1]==='obligations'?String(path[2]).split(':')[0].replace(/[0-9_-]+$/,''):path[0]==='state'&&path[1]==='npcs'?'<npc>.'+String(path[3]??''):path[1]==='family'||path[1]==='settlements'?path[2]:'*')));
};
// 游标写入次数 = 状态版本（revision）数：每次 PatchCursor.apply 使 revision 加一，按补丁路径分组。
let revisions=0;const rev2={},rev3={};
const applyOrig=PatchCursor.prototype.apply;
PatchCursor.prototype.apply=function(patch,...rest){revisions++;group(rev2,rev3,patch.path);return applyOrig.call(this,patch,...rest);};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
for(let day=0;day<days;day++){
 const output=await engine.reduce(document,{tool:'world_time',args:{minutes:1440},eventId:`digest_day_${day}`});
 for(const p of output.patches){
  patchCount++;
  const path=p.path.join('.');
  if(path.startsWith('state.records.market-trade:'))tradePatches++;
  if(p.path[0]==='ledger')ledgerPatches++;
  chain=hash(chain+JSON.stringify(canon(p)));
  // 路径分组：前两级；第三级对 records 取键名冒号前的前缀（记录类别），其余取原第三级。用于比较不同版本多出的写入来自哪里。
  group(groups2,groups3,p.path);
 }
 document=applyPatches(document,output.patches);steps++;
}
const trades=Object.entries(document.state.records??{}).filter(([k,r])=>k.startsWith('market-trade:')||r?.category==='market_trade');
const tradeHash=hash(JSON.stringify(canon(trades))),ledgerHash=hash(JSON.stringify(canon({accounts:document.ledger?.accounts,flows:document.ledger?.flows,lots:document.ledger?.lots})));
const result={world:mode,days,finalMinute:document.state.minute,补丁总数:patchCount,成交补丁数:tradePatches,账本过账补丁数:ledgerPatches,成交记录数:trades.length,补丁链哈希:chain,成交记录哈希:tradeHash,账本终态哈希:ledgerHash,耗时秒:Math.round((performance.now()-t0)/100)/10,推进步数:steps,游标写入次数_revision:revisions,输出补丁分组前两级:groups2,输出补丁分组含第三级:groups3,游标写入分组前两级:rev2,游标写入分组含第三级:rev3};
// 不参与比对：耗时秒、推进步数、游标写入次数与各分组统计（只作诊断）。
const ignored=['耗时秒','推进步数','游标写入次数_revision','输出补丁分组前两级','输出补丁分组含第三级','游标写入分组前两级','游标写入分组含第三级'];
console.log(JSON.stringify({...result,不参与比对:ignored},null,1));
const compareAt=args.indexOf('--compare');
if(compareAt>=0){
 const baseline=JSON.parse(await fs.readFile(args[compareAt+1],'utf8')),expected=baseline[mode]?.期望;
 if(!expected){console.error(`基线里没有世界 ${mode}`);process.exit(2);}
 const diffs=Object.entries(expected).filter(([k,v])=>result[k]!==v).map(([k,v])=>`${k}: 期望 ${v}，实际 ${result[k]}`);
 if(diffs.length){console.error(['与基线不一致：',...diffs].join(String.fromCharCode(10)));process.exit(1);}
 console.error('与基线一致');
}
