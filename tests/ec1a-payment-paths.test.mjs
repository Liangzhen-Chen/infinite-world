// EC-1a 付款收口：NPC 付款（本人钱袋不够时先从户池补足）。金融原语的行为由 ec1a-finance-pool.test.mjs 测；
// 这里守住“绕过金融原语、直接 moveCoins 付款”的 NPC 路径：每一笔 NPC 当事人出钱的 moveCoins 之前（同一语句块内）必须有 householdPoolTopUp，
// 且付款前的“钱够不够”判断读的是户池现金（householdCash），不是本人钱袋字段。
// 不在此列（有意不补）：玩家付款、柜台/基金/组织/遗产类账户出钱、盗窃（受害人被抢，不是付款）、悬赏认捐（受害人自愿按自己钱袋的一定比例）、
// 监护代管开支（family-law 的 ward 是继承人财产，属遗产类账户）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=f=>fs.readFile(new URL(`../server-plugin/${f}`,import.meta.url),'utf8');
// [文件, 付款人出钱的 moveCoins 片段] —— 片段必须在文件里恰好出现，且其前 360 个字符内有 householdPoolTopUp。
const PAYMENTS=[
 ['npc-labor.mjs',"moveCoins(d,{from:purse(e,a.keeper),to:purse(e,who),amount:quote.totalCoins"],
 ['npc-labor.mjs',"rows.forEach((r,i)=>{\n  const q=quotes[i],eventId=`${id}${part}:${r.item}`;\n  transferItems(d,e,keeper,who,r.item,r.quantity);\n  moveCoins(d,{from:purse(e,who),to:purse(e,keeper)"],
 ['npc-labor.mjs',"moveCoins(d,{from:purse(e,who),to:sink('export','travel'),amount:a.travelCoins"],
 ['npc-autonomy.mjs',"moveCoins(d,{from:purse(null,id),to:station.owner?.startsWith('npc_')"],
 ['npc-autonomy.mjs',"moveCoins(d,{from:purse(null,id),to:purse(null,action.seller),amount:cost"],
 ['festival.mjs',"moveCoins(d,{from:purse(null,row.host),to:purse(null,row.supplier)"],
 ['building-maintenance.mjs',"moveCoins(d,{from:purse(e,who),to:sink('export','travel'),amount:a.travelCoins"],
 ['building-maintenance.mjs',"moveCoins(d,{from:purse(e,who),to:purse(e,a.supplier),amount:q.totalCoins"],
 ['npc-crime.mjs',"moveCoins(d,{from:purse(null,actor),to:sink('export','travel'),amount:cost"],
 ['npc-crime.mjs',"moveCoins(d,{from:purse(null,row.offender),to:fundAccount(`legal_treasury:${row.law}`)"],
 ['family-law.mjs',"moveCoins(d,{from:purse(e,row.offender),to:purse(e,row.victim),amount"]
];

test('every NPC payment that calls moveCoins directly first tops up from the household pool', async () => {
 for(const [file,snippet] of PAYMENTS){
  const text=await read(file),at=text.indexOf(snippet);
  assert.ok(at>=0,`${file}: payment site not found: ${snippet.slice(0,60)}`);
  assert.equal(text.indexOf(snippet,at+1),-1,`${file}: payment site is not unique: ${snippet.slice(0,60)}`);
  const before=text.slice(Math.max(0,at-360),at);
  assert.ok(before.includes('householdPoolTopUp('),`${file}: no householdPoolTopUp before: ${snippet.slice(0,60)}`);
 }
});

test('affordability checks before those payments read the household pool, not the payer purse alone', async () => {
 const CHECKS=[
  ['npc-labor.mjs',"quote.totalCoins>householdCash(d,e,a.keeper)"],
  ['npc-labor.mjs',"total>householdCash(d,e,who)"],
  ['npc-labor.mjs',"a.travelCoins+(a.coins??0)+(a.fee??0)>householdCash(d,e,who)"],
  ['npc-autonomy.mjs',"householdCash(d,engine,id)<fee"],
  ['npc-autonomy.mjs',"householdCash(d,engine,id)<tradeQuote("],
  ['festival.mjs',"householdCash(d,engine,row.host)<row.cost"],
  ['building-maintenance.mjs',"a.travelCoins>householdCash(d,e,who)"],
  ['building-maintenance.mjs',"total>householdCash(d,e,who)"],
  ['npc-crime.mjs',"householdCash(d,e,row.offender)>=fine+compensation"],
  ['npc-crime.mjs',"(route.cost??0)<=householdCash(d,e,actor)"],
  ['family-law.mjs',"available=householdCash(d,e,row.offender)"]
 ];
 for(const [file,snippet] of CHECKS)assert.ok((await read(file)).includes(snippet),`${file}: affordability check does not read the household pool: ${snippet}`);
});
