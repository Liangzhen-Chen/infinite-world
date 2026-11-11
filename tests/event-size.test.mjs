import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {CampaignStorage,digest,applyPatches} from '../server-plugin/storage.mjs';

test('新角色菜单等待180日：完整导出小于50MB，确定性导入和纯补丁重放同哈希',async t=>{
    const world=await loadWorld();
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,world,seed:'w8e10-event-size',consistencyEnabled:false});
    t.after(()=>server.close());
    const created=await server.api('create',{character:{name:'长候旅人'}}),id=created.reference.campaignId;
    const menu=await server.api('actions',{campaignId:id}),wait=menu.actions.find(a=>a.id==='core:time');
    assert.ok(wait);
    const start=created.document.state.minute;
    const advanced=await server.api('execute',{campaignId:id,tool:'world_act',args:{action:wait.id,slots:{...wait.fill,minutes:180*1440}},eventId:'season'});
    // One native time event is capped at 30 days: 180 / 30 = 6, and 180 × 1440 = 259200 minutes.
    assert.equal(advanced.result.segments,6);assert.equal(advanced.result.elapsed,259200);
    const original=(await server.api('read',{campaignId:id})).document;
    assert.equal(original.state.minute-start,259200);
    const bundle=await server.api('export',{campaignId:id}),text=JSON.stringify(bundle);
    // Decimal MB matches the product acceptance target and includes archived world definitions.
    assert.ok(Buffer.byteLength(text)<50_000_000,`export bytes: ${Buffer.byteLength(text)}`);
    assert.equal(bundle.events.length,6);
    const folded=bundle.events.reduce((document,event)=>applyPatches(document,event.patches),bundle.initial);
    assert.equal(digest(folded),bundle.documentHash);
    const imported=await server.api('import',{bundle:JSON.parse(text)});
    assert.equal(digest(imported.document),digest(original));
    const again=await server.api('export',{campaignId:imported.reference.campaignId});
    assert.equal(again.documentHash,bundle.documentHash);
    // No engine or snapshot can conceal incomplete event deltas on a disk reload.
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'event-size-'));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const store=new CampaignStorage(directory),restored=await store.import(bundle,'patch_only');
    assert.equal(digest(restored.document),bundle.documentHash);
});
