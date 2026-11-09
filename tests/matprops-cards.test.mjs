// D12 材料属性两张审批卡（D12-MATPROPS 与 D12-CONDIMENT）按显式范围划分：D 卡条目 = D 卡已冻结批次的 ids 并集，调味卡 = 其余。
import test from 'node:test';
import assert from 'node:assert/strict';
import {entriesFor, cardIdsOf, splitByCard, dEntries, condimentEntries, frozenDBatches, verifyAll, loadMoved, checkMoved} from '../world/design/matprops-approval.mjs';

const fake=ids=>ids.map(id=>({id}));
const batches=[{ids:['a','b']},{ids:['c','item_garlic']}];

test('分卡是纯函数、可注入批次：D 卡 = 批次 ids 并集，调味卡 = 其余，互不重叠', async () => {
 const all=fake(['a','b','c','item_garlic','n1','n2']);
 assert.deepEqual([...cardIdsOf(batches)].sort(),['a','b','c','item_garlic']);
 const s=splitByCard(all,cardIdsOf(batches));
 assert.deepEqual(s.d.map(e=>e.id),['a','b','c','item_garlic']);
 assert.deepEqual(s.condiment.map(e=>e.id),['n1','n2']);
 assert.deepEqual((await dEntries(all,{batches})).map(e=>e.id),s.d.map(e=>e.id));
 assert.deepEqual((await condimentEntries(all,{batches})).map(e=>e.id),['n1','n2']);
});

test('garlic 记录被归档（记录文件不在）后仍属 D 卡：归属只看冻结批次，不看记录文件', async () => {
 // 注入的批次里有 item_garlic，不提供任何记录文件，等同归档后的状态
 const all=fake(['item_garlic','n1']);
 assert.deepEqual((await dEntries(all,{batches})).map(e=>e.id),['item_garlic']);
 assert.deepEqual((await condimentEntries(all,{batches})).map(e=>e.id),['n1']);
});

test('误跑 D 卡 --review/--retry-garlic/--rejudge 的条目来源（dEntries）不含任何调味卡条目；真实数据 32 + 13 = 全部条目', async () => {
 const all=await entriesFor(),d=await dEntries(),c=await condimentEntries();
 const frozen=cardIdsOf(await frozenDBatches());
 assert.ok(d.every(e=>frozen.has(e.id))&&c.every(e=>!frozen.has(e.id)));
 assert.equal(d.length+c.length,all.length);
 assert.ok(d.some(e=>e.id==='item_garlic'));
 assert.ok(c.length>0&&c.every(e=>!d.some(x=>x.id===e.id)));
});

test('全表校验：两卡分别校验后合并结论，未决条目标明属于哪张卡；两卡都过才 ok', async () => {
 const card=(name,ids)=>({name,entries:async()=>fake(ids)});
 const cards={d:card('D12-MATPROPS',['a']),condiment:card('D12-CONDIMENT',['n1','n2'])};
 const okAll=await verifyAll({cards,verify:async c=>({total:c.name.length})});
 assert.equal(okAll.ok,true);assert.deepEqual(okAll.unresolved,[]);
 const verify=async c=>{if(c.name==='D12-CONDIMENT')throw Object.assign(Error('尚有条目既未通过 L2 也无人工核定'),{unresolved:['n1','n2']});return {total:1};};
 const mixed=await verifyAll({cards,verify});
 assert.equal(mixed.ok,false);
 assert.equal(mixed.cards.d.ok,true);assert.equal(mixed.cards.condiment.ok,false);
 assert.deepEqual(mixed.unresolved,[{id:'n1',card:'D12-CONDIMENT'},{id:'n2',card:'D12-CONDIMENT'}]);
});

test('移交条目：指纹因类别行改动而变的 D 卡条目改在调味卡重审，D 卡其余不动；移交须真的改了指纹', async () => {
 const all=fake(['a','b','c','item_garlic','n1']);
 const moved=['b'];
 assert.deepEqual((await dEntries(all,{batches,moved})).map(e=>e.id),['a','c','item_garlic']);
 assert.deepEqual((await condimentEntries(all,{batches,moved})).map(e=>e.id),['b','n1']);
 // checkMoved：现指纹与记录的旧指纹相同则报错（不该移交），不同才通过
 const doc={entries:[{id:'b',oldFingerprint:'old'}]};
 await assert.rejects(checkMoved(all,doc,async()=>'old'),/指纹没变/);
 assert.deepEqual(await checkMoved(all,doc,async()=>'new'),['b']);
 // 真实数据：移交文件里的条目都真的改了指纹，且都在 D 卡冻结批次里、现在归调味卡
 const real=await entriesFor(),ids=await loadMoved(),frozen=cardIdsOf(await frozenDBatches()),c=await condimentEntries();
 assert.ok(ids.length>0&&ids.every(id=>frozen.has(id)&&c.some(e=>e.id===id)));
 assert.ok(!(await dEntries()).some(e=>ids.includes(e.id)));
 assert.ok(real.length>0);
});
