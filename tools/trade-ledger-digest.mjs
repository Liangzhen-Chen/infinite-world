// 确定性诊断：同一种子推进 N 天，把每一步产生的全部补丁（含成交记录 market-trade:*、账本过账 ledger.*）按顺序做链式哈希，输出笔数与哈希。
// 用于证明性能改动不改变实际成交与账本：改前改后各跑一次，哈希与笔数必须完全相等。只用新旧版本都有的公开接口。
// 用法：node tools/trade-ledger-digest.mjs [天数=30] [--world full|farm] [--compare tools/trade-ledger-digest.baseline.json [--require-harvest]]
// 适用范围：基线只用来证明“FX7 改前（5b5d4589）与 t-fx7 结果相等”。合并分支（m2-6c）还含其他卡的行为改动（烧炭配方、饮品水分派生等），在其上做 --compare 本来就不会相等，不能当验收；世界行为变了就重新取基线。
// 收获发生检查：每天推进后统计全部 state.records['agriculture:*'].ledger.harvested 之和，输出 收获发生天数（当天和增加的天数）、收获总量、首个收获日（1 起）；基线里有这三项时一并比对，--require-harvest 时强制要求；220 天的“已覆盖收获”证据由这三项给出。
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
let harvestSum=0,harvestDays=0,firstHarvestDay=0;
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
 const harvested=Object.entries(document.state.records??{}).filter(([k])=>k.startsWith('agriculture:')).reduce((n,[,r])=>n+(r?.ledger?.harvested??0),0);
 if(harvested>harvestSum){harvestDays++;if(!firstHarvestDay)firstHarvestDay=day+1;}
 harvestSum=harvested;
}
const trades=Object.entries(document.state.records??{}).filter(([k,r])=>k.startsWith('market-trade:')||r?.category==='market_trade');
const tradeHash=hash(JSON.stringify(canon(trades))),ledgerHash=hash(JSON.stringify(canon({accounts:document.ledger?.accounts,flows:document.ledger?.flows,lots:document.ledger?.lots})));
const result={world:mode,days,finalMinute:document.state.minute,补丁总数:patchCount,成交补丁数:tradePatches,账本过账补丁数:ledgerPatches,成交记录数:trades.length,收获发生天数:harvestDays,收获总量:harvestSum,首个收获日:firstHarvestDay,补丁链哈希:chain,成交记录哈希:tradeHash,账本终态哈希:ledgerHash,耗时秒:Math.round((performance.now()-t0)/100)/10,推进步数:steps,游标写入次数_revision:revisions,输出补丁分组前两级:groups2,输出补丁分组含第三级:groups3,游标写入分组前两级:rev2,游标写入分组含第三级:rev3};
// 不参与比对：耗时秒、推进步数、游标写入次数与各分组统计（只作诊断）。
const ignored=['耗时秒','推进步数','游标写入次数_revision','输出补丁分组前两级','输出补丁分组含第三级','游标写入分组前两级','游标写入分组含第三级'];
console.log(JSON.stringify({...result,不参与比对:ignored},null,1));
const compareAt=args.indexOf('--compare');
if(compareAt>=0){
 const baseline=JSON.parse(await fs.readFile(args[compareAt+1],'utf8')),expected=(baseline[`${mode}-${days}`]??baseline[mode])?.期望;
 if(!expected){console.error(`基线里没有世界 ${mode}`);process.exit(2);}
 const harvestKeys=['收获发生天数','收获总量','首个收获日'],requireHarvest=args.includes('--require-harvest'),errors=[];
 // 字段集必须一致：基线有而结果没有、结果有而基线没有（不参与比对的诊断字段除外），都算错误。
 const resultKeys=Object.keys(result).filter(k=>!ignored.includes(k)),expectedKeys=Object.keys(expected);
 for(const k of expectedKeys)if(!(k in result))errors.push(`结果缺字段：${k}（基线有）`);
 for(const k of resultKeys)if(!(k in expected)&&!(harvestKeys.includes(k)&&!expectedKeys.some(x=>harvestKeys.includes(x))))errors.push(`基线缺字段：${k}（结果有）`);
 // 过渡状态“基线待补”：基线里一个收获计数都没有时（220 天基线尚未在原版与新版各跑一次补入），默认只警告、退出码仍为 0；
 // 补完基线后应一律加 --require-harvest，届时缺失即报错。上面的“多出字段报错”对这三项做了同样的过渡豁免，仅限三项全缺的情形。
 const harvestMissing=!expectedKeys.some(k=>harvestKeys.includes(k));
 if(harvestMissing&&!requireHarvest&&mode==='farm'&&days>=200)console.error('警告：基线缺收获计数（收获发生天数、收获总量、首个收获日），属“基线待补”过渡状态：收获证据尚未写入基线，需在原版与新版各跑一次后补入；补入后请用 --require-harvest。');
 // --require-harvest 断言：基线必须含全部三项收获计数；运行结果必须真发生收获（收获总量>0、收获发生天数>0）；
 // 运行结果的收获计数与基线逐项严格相等（基线有值时必须等于，上面的逐项比对已覆盖，值不等即不一致）。
 if(requireHarvest){
  for(const k of harvestKeys)if(!(k in expected))errors.push(`--require-harvest：基线缺收获计数 ${k}`);
  if(!(result.收获总量>0)||!(result.收获发生天数>0))errors.push(`--require-harvest：运行结果里没有发生收获（收获总量 ${result.收获总量}，收获发生天数 ${result.收获发生天数}）；天数不足或路径 state.records['agriculture:*'].ledger.harvested 不存在`);
 }
 const diffs=Object.entries(expected).filter(([k,v])=>k in result&&result[k]!==v).map(([k,v])=>`${k}: 期望 ${v}，实际 ${result[k]}`);
 if(errors.length||diffs.length){console.error(['与基线不一致：',...errors,...diffs].join(String.fromCharCode(10)));process.exit(1);}
 console.error('与基线一致');
}
