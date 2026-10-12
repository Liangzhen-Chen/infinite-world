import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { CampaignStorage, applyPatches, digest } from '../server-plugin/storage.mjs';

const fixture = async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'infinite-fields-test-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new CampaignStorage(directory, { snapshotEvery: 3, segmentSize: 4, reducer: deduct });
    await store.create({ id: 'test', worldVersion: 'baseline-1', document: { state: { coins: 180 }, memories: {} } });
    return { directory, store };
};
const deduct = (document, input) => {
    const coins = document.state.coins - input.cost;
    if (coins < 0) throw new Error('余额不足');
    return { patches: [{ op: 'set', path: ['state', 'coins'], value: coins }], result: { cost: input.cost, balance: coins } };
};

test('新回执JSON规范化后首次/重复/缓存/落盘/重启/导入保持同一哈希，回滚不重复扣款',async t=>{
    const {directory,store}=await fixture(t);
    const reducer=(doc,input)=>({...deduct(doc,input),result:{cost:input.cost,status:undefined,teacher:undefined,nested:{missing:undefined},list:[undefined,NaN,Infinity]}});
    const request={id:'normalized',anchor:'a',input:{cost:6}};
    const first=await store.transact('test',request,reducer),expected={cost:6,nested:{},list:[null,null,null]};
    assert.deepEqual(first.result,expected);
    assert.deepEqual((await store.transact('test',request,reducer)).result,expected);
    const bundle=await store.export('test'),persisted=JSON.parse((await fs.readFile(path.join(directory,'test/events/00000000.jsonl'),'utf8')).trim());
    assert.deepEqual(bundle.events[0],persisted);assert.deepEqual(persisted.result,first.result);
    const {hash,...body}=persisted;assert.equal(digest(body),hash);
    const fresh=new CampaignStorage(directory,{reducer:deduct});
    assert.deepEqual(await fresh.export('test'),bundle);
    assert.deepEqual((await fresh.transact('test',request,reducer)).result,expected);
    assert.equal((await fresh.read('test')).document.state.coins,174);
    const imported=await fresh.import(JSON.parse(JSON.stringify(bundle)),'normalized_copy');
    assert.equal(imported.document.state.coins,174);
    assert.deepEqual((await fresh.export('normalized_copy')).events,bundle.events);
    assert.deepEqual((await fresh.transact('normalized_copy',request,reducer)).result,expected);
    await fresh.reconcile('test',[]);
    await fresh.transact('test',{...request,input:{cost:3}},reducer);
    assert.equal((await new CampaignStorage(directory,{reducer:deduct}).read('test')).document.state.coins,177);
});

test('result/patches/previous/sequence/checksum/documentHash篡改导入均零写；坏磁盘链不修复',async t=>{
    const {directory,store}=await fixture(t);
    await store.transact('test',{id:'original',input:{cost:6}},deduct);
    const valid=await store.export('test'),entries=await fs.readdir(directory),before=await fs.readFile(path.join(directory,'test/events/00000000.jsonl'),'utf8');
    for(const [index,edit]of [b=>b.events[0].result.balance++,b=>b.events[0].patches[0].value++,b=>b.events[0].previous='tampered',b=>b.events[0].sequence++,b=>b.checksum='tampered',b=>b.documentHash='tampered'].entries()){
        const broken=structuredClone(valid);edit(broken);
        await assert.rejects(store.import(broken,`tampered_${index}`),/校验|重放/);
        assert.deepEqual(await fs.readdir(directory),entries);
        assert.deepEqual(await store.export('test'),valid);
        assert.equal(await fs.readFile(path.join(directory,'test/events/00000000.jsonl'),'utf8'),before);
    }
    const event=structuredClone(valid.events[0]);event.result.balance++;
    const corrupt=JSON.stringify(event)+'\n';await fs.writeFile(path.join(directory,'test/events/00000000.jsonl'),corrupt);
    await assert.rejects(new CampaignStorage(directory,{reducer:deduct}).read('test'),/事件1校验失败/);
    assert.equal(await fs.readFile(path.join(directory,'test/events/00000000.jsonl'),'utf8'),corrupt);
    // A historical undefined-key hash that did not survive JSON is a bad chain.
    const {hash,...payload}=valid.events[0],old={...payload,result:{...payload.result,status:undefined}};
    const malformed={...valid,events:[{...old,hash:digest(old)}],checksum:digest(old)};
    await assert.rejects(store.import(JSON.parse(JSON.stringify(malformed)),'bad_old_chain'),/事件校验/);
    assert.deepEqual(await fs.readdir(directory),entries);
});

test('反馈：拒绝与重复不生成卡片，撤销后重算后续余额，重启保持一致',async t=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fields-feedback-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const reducer=(doc,input)=>{const value=deduct(doc,input);value.result.notices=[{type:'coins',text:`剩余${value.result.balance}`}];return value;};
    const store=new CampaignStorage(directory,{reducer});await store.create({id:'feedback',worldVersion:'test',document:{state:{coins:180}}});
    const first={id:'a',anchor:'a',input:{cost:6}},second={id:'b',anchor:'b',input:{cost:6}};
    await store.transact('feedback',first,reducer);await store.transact('feedback',second,reducer);
    assert.deepEqual((await store.feedback('feedback')).events.map(e=>e.notices[0].text),['剩余174','剩余168']);
    await store.transact('feedback',second,reducer);
    await assert.rejects(store.transact('feedback',{id:'bad',anchor:'b',input:{cost:1000}},reducer),/余额不足/);
    assert.equal((await store.feedback('feedback')).events.length,2);
    await store.reconcile('feedback',['b']);
    const feedback=await store.feedback('feedback');assert.equal(feedback.events.length,1);assert.equal(feedback.events[0].notices[0].text,'剩余174');
    assert.deepEqual(await new CampaignStorage(directory,{reducer}).feedback('feedback'),feedback);
    await store.transact('feedback',{id:'c',anchor:'c',input:{cost:4}},reducer);
    assert.equal((await store.feedback('feedback')).events[1].notices[0].text,'剩余170');
    await store.reconcile('feedback',[]);assert.deepEqual((await store.feedback('feedback')).events,[]);
});
test('存储：幂等、拒绝原子性、并发顺序、键序与事件守恒', async t => {
    const { directory, store } = await fixture(t);
    const before = await store.export('test');
    await assert.rejects(store.transact('test', { id: 'bad', input: { cost: 1000 } }, deduct), /不足/);
    assert.deepEqual(await store.export('test'), before);
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.transact('test', { id: `event_${i}`, input: { cost: 6, reason: '住宿' }, anchor: `a${i}` }, deduct)));
    const result = await store.transact('test', { id: 'event_0', input: { reason: '住宿', cost: 6 } }, deduct);
    assert.equal(result.duplicate, true);
    await assert.rejects(store.transact('test', { id: 'event_0', input: { cost: 7 } }, deduct), /同一事件/);
    const fresh = new CampaignStorage(directory, { reducer: deduct });
    assert.equal((await fresh.read('test')).document.state.coins, 120);
    assert.equal((await fresh.export('test')).events.length, 10);
    assert.equal((await fs.readdir(path.join(directory, 'test', 'events'))).length, 3);
});
test('存储：世界种子不参与对账，重启/删除/导出导入保持一致', async t => {
    const { directory, store } = await fixture(t);
    for (let i = 0; i < 8; i++) await store.transact('test', { id: `e${i}`, input: { cost: 6 }, anchor: `a${i}` }, deduct);
    const reconciled = await store.reconcile('test', ['a0', 'a1', 'a2', 'a3'], 'a3');
    assert.equal(reconciled.document.state.coins, 162);
    const reloaded = await new CampaignStorage(directory, { reducer: deduct }).read('test');
    assert.deepEqual(reloaded.document, reconciled.document);
    const bundle = await store.export('test');
    const imported = await store.import(bundle, 'imported');
    assert.deepEqual(imported.document, reloaded.document);
    assert.equal(imported.worldVersion, 'baseline-1');
});
test('存储：编辑后旧事务编号可重用，新状态不能被旧分支带回', async t => {
    const { directory, store } = await fixture(t);
    await store.transact('test', { id: 'rent', input: { cost: 6 }, anchor: 'edited' }, deduct);
    await store.reconcile('test', [], null);
    await store.transact('test', { id: 'rent', input: { cost: 3 }, anchor: 'edited2' }, deduct);
    assert.equal((await new CampaignStorage(directory, { reducer: deduct }).read('test')).document.state.coins, 177);
});
test('存储：拒绝目录逃逸、不安全补丁和损坏日志，保留原件', async t => {
    const { directory, store } = await fixture(t);
    await assert.rejects(store.read('../outside'), /编号/);
    const document = { state: { coins: 180 } };
    assert.throws(() => applyPatches(document, [{ op: 'set', path: ['__proto__', 'bad'], value: true }]));
    assert.deepEqual(document, { state: { coins: 180 } });
    await store.transact('test', { id: 'e1', input: { cost: 6 } }, deduct);
    const file = path.join(directory, 'test', 'events', '00000000.jsonl');
    await fs.appendFile(file, '{broken');
    await assert.rejects(new CampaignStorage(directory).read('test'), /不完整/);
    assert.ok((await fs.readFile(file, 'utf8')).endsWith('{broken'));
});
test('补丁性质：重放确定性与源文档不变', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 40 }), values => {
        const initial = { state: { coins: 180, nested: { stable: true } }, memories: {} };
        let a = initial, b = structuredClone(initial);
        for (const value of values) {
            const patches = [{ op: 'set', path: ['state', 'coins'], value }];
            a = applyPatches(a, patches); b = applyPatches(b, patches);
        }
        assert.equal(digest(a), digest(b)); assert.equal(initial.state.coins, 180);
    }), { numRuns: 100, seed: 20261010 });
});
test('补丁：同一新增分区的多个字段都保留', () => {
    assert.deepEqual(applyPatches({ state: {} }, [
        { op: 'set', path: ['state', 'added', 'x'], value: 1 },
        { op: 'set', path: ['state', 'added', 'y'], value: 2 },
    ]), { state: { added: { x: 1, y: 2 } } });
});
test('重放：删除较早交易后，后续交易从新余额重新结算', async t => {
    const { directory, store } = await fixture(t);
    await store.transact('test', { id: 'first', input: { cost: 6 }, anchor: 'a' }, deduct);
    await store.transact('test', { id: 'second', input: { cost: 12 }, anchor: 'b' }, deduct);
    const result = await store.reconcile('test', ['b']);
    assert.equal(result.document.state.coins, 168);
    assert.equal((await new CampaignStorage(directory, { reducer: deduct }).read('test')).document.state.coins, 168);
    assert.equal((await store.import(await store.export('test'), 'copy')).document.state.coins, 168);
});

test('补丁：替换、删除父分区后的嵌套写入按顺序保留，原文档不变',()=>{
    const initial={state:{player:{coins:180,old:true}},stable:{value:7}};
    const result=applyPatches(initial,[
        {op:'set',path:['state'],value:{player:{coins:100,new:true}}},
        {op:'set',path:['state','player','coins'],value:94},
        {op:'delete',path:['state','player']},
        {op:'set',path:['state','player','name'],value:'旅人'},
    ]);
    assert.deepEqual(result.state,{player:{name:'旅人'}});
    assert.deepEqual(initial.state,{player:{coins:180,old:true}});
    assert.equal(result.stable,initial.stable);
});

test('快照：分支元数据损坏被拒绝，不使用遗漏事件的快照',async t=>{
    const {directory,store}=await fixture(t);
    for(let i=0;i<3;i++)await store.transact('test',{id:`e${i}`,input:{cost:6},anchor:`a${i}`},deduct);
    const file=path.join(directory,'test','snapshots','0000000003-0.json');
    const snapshot=JSON.parse(await fs.readFile(file,'utf8'));
    snapshot.activeSequences=[];
    // Even a recomputed envelope cannot hide disagreement with the event chain.
    const {envelopeHash,...data}=snapshot;snapshot.envelopeHash=digest(data);
    await fs.writeFile(file,JSON.stringify(snapshot));
    await assert.rejects(new CampaignStorage(directory,{reducer:deduct}).read('test'),/快照分支/);
    assert.equal((await store.read('test')).document.state.coins,162);
});
