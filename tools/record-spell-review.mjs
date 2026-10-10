import fs from'node:fs/promises';
// These are manual judgements after reading the complete fixed sample.
const decisions={
    spell_fire_07:[[4,4,2,4,3,4],'熟练度写约一个时辰，标准应为60分钟且刻痕深浅不得延时。自动约束漏掉个字，已修正。'],
    spell_earth_06:[[4,4,3,4,3,4],'第一条已改成破坏网层，第二条仍是减轻冲刷的加固办法，没有两种反制。'],
    spell_fire_12:[[4,4,3,4,4,4],'补裂缝与反制具体，但施法过程不解释必耗树脂，新增断件绝不可接合比原骨架更窄，须统一材料和边界。'],
    spell_earth_07:[[4,4,4,4,4,4],'现场小石、直线加速与普通碰撞明确；十步在射程内，矿场/牧人/猎户的用途有区别。'],
    spell_fire_04:[[4,4,4,4,4,4],'10%上限与正常燃料不变，灶火和烟气有实际风险，登记与追偿并未冒充施法许可。'],
    spell_fire_08:[[4,4,4,4,4,4],'直线、可见露出部分和完整掩体限制一致，沙土处理点燃物是实际反制。'],
    spell_wind_07:[[4,4,4,4,4,4],'十米硬限、硬甲抵挡与软物切割一致，横风与旁侧布棚细节具体。'],
    spell_wind_10:[[4,4,2,4,3,4],'膜一面声称筛选周围空气并排浊气，一面无法补充；增加空气过滤能力且高级能减少固定树脂消耗。需明确封闭有限空气及固定材料。'],
    spell_water_07:[[4,4,3,4,4,4],'两升/两公斤一致，低熟练度短时可靠性可理解，但较高段始终只谈一分钟，固定60分钟时限没有明确落地。'],
    spell_water_08:[[4,4,4,4,4,4],'删除开发措辞，冷热环境、直线和单目标一致，高熟练度保形不表示取消热环境减伤。'],
};
const file='docs/内容审查/法术批1-抽样.json',report=JSON.parse(await fs.readFile(file,'utf8'));
if(report.catalogHash!=='ac153e1534b89f1abf0569a7bb5e729c98b8347e47ff4bd6e9d3287f62683cd0')throw new Error('这份手工评分只适用于已全文精读的版本；新版本必须重新阅读，不能复用旧评分');
const labels=['具体性','独特性','内在一致性','与世界的连接','可玩性','说明文字辨识度'];
for(const row of report.sample){
    const judgment=decisions[row.id];if(!judgment)throw new Error(`没有全文精读评分${row.id}`);
    row.scores=Object.fromEntries(labels.map((label,i)=>[label,judgment[0][i]]));
    row.average=judgment[0].reduce((sum,n)=>sum+n,0)/6;
    row.pass=row.average>=4&&judgment[0].every(n=>n>=3);row.notes=judgment[1];
}
report.approved=report.sample.every(row=>row.pass);
report.scope='最新草稿首批50条固定随机10条已全文精读；不合格整批重做，不发布';
await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({batch:report.batch,read:report.sample.length,approved:report.approved,failed:report.sample.filter(row=>!row.pass).map(row=>row.id)}));
