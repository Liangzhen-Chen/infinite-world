import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './probes/harness.mjs';
import {organization} from '../server-plugin/organizations.mjs';
test('旧版漏结的月费经 JSON 存档后在下一刻追平，短等待不继续漏账或重复扣款',async()=>{
 const S=setup({coins:180});let doc=S.doc;
 const created=await S.run(doc,'world_create',{type:'org',name:'月账互助会',data:{notes:'每期按章程缴款',occupation:'行会'}},'dues-found');doc=created.document;
 const id=created.result.organization;
 doc=(await S.run(doc,'world_settlement',{operation:'org_propose',org:id,action:'charter',coins:10},'dues-charter')).document;
 // Shape left by the master scheduler bug: time passed the due boundary,
 // but this existing payable has not been settled.
 doc.state.minute=organization(S.engine,doc.state,id).nextDues+5;
 doc=JSON.parse(JSON.stringify(doc));
 doc=(await S.run(doc,'world_time',{minutes:1},'dues-catchup')).document;
 assert.equal(doc.state.player.coins,170);assert.equal(organization(S.engine,doc.state,id).treasury,10);
 doc=(await S.run(doc,'world_time',{minutes:1},'dues-again')).document;
 assert.equal(doc.state.player.coins,170);assert.equal(organization(S.engine,doc.state,id).treasury,10);
 assert.equal(organization(S.engine,doc.state,id).ledger.filter(r=>r.kind==='会费').length,1);
});
