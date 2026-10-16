// S1c：价格读账户之后，测试夹具若在两次归约之间直接改旧字段（库存、粮仓、公库、现钱……），账本就和旧字段分叉，
// 价格会按账户里的旧数算。夹具改完旧字段后调这个函数，把账本按旧字段重新开账（账户、批次、流水计数都重算），
// 其余断言不变。只给测试用；运行期的写入点一律经 transfer 双写，不会分叉。
import {openLedger} from '../../server-plugin/ledger.mjs';
export function resyncBooks(engine,document){
    if(document.ledger)document.ledger=openLedger(engine,document);
    return document;
}
