// S1c 价格读账户的探针：作为 --import 预加载（PRICE_PROBE_LOG=<文件>）时，把每个价格输入点的
// 新旧两份读数登记下来，进程退出时汇总追加到日志（各点命中次数、开账命中次数、新旧不等的样本）。
// tests/ledger-price.test.mjs 用同一探针断言逐点相等；这里用来在既有测试上扫一遍有没有分叉。
import fs from 'node:fs';
import {probePriceReads} from '../../server-plugin/stock.mjs';

export function createPriceProbe(){
    const hits={},open={},mismatches=[];
    return {hits,open,mismatches,
        record({point,legacy,ledger,open:isOpen}){
            hits[point]=(hits[point]??0)+1;
            if(!isOpen)return;
            open[point]=(open[point]??0)+1;
            if(legacy!==ledger&&mismatches.length<50)mismatches.push({point,legacy,ledger});
        }};
}
const log=process.env.PRICE_PROBE_LOG;
if(log){
    const probe=createPriceProbe();probePriceReads(r=>probe.record(r));
    process.on('exit',()=>fs.appendFileSync(log,JSON.stringify({pid:process.pid,argv:process.argv.slice(1).join(' '),hits:probe.hits,open:probe.open,mismatches:probe.mismatches})+'\n'));
}
