// S0 动作清单：docs/actions.json 由 tools/export-actions.mjs 从 extension/tools.mjs 自动导出，且与 resolveToolCall 一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {exportActions,render,OUTPUT} from '../tools/export-actions.mjs';
import {toolDefinitions,resolveToolCall,modelToolCall} from '../extension/tools.mjs';

const actions=exportActions();

test('actions.json 是最新导出（改工具枚举后须重新运行 node tools/export-actions.mjs）',()=>{
 assert.equal(fs.readFileSync(OUTPUT,'utf8'),render(actions));
});

test('动作数 = 全部公开 operation 枚举 + 无子操作工具，id 唯一且带 core 命名空间',()=>{
 const defs=toolDefinitions();
 const expected=defs.reduce((n,d)=>n+(d.function.parameters.properties.operation?.enum?.length??1),0);
 assert.equal(actions.length,expected);
 assert.equal(new Set(actions.map(a=>a.id)).size,actions.length);
 assert.ok(actions.every(a=>a.id.startsWith('core:')));
 assert.ok(actions.length>=221);
});

test('每个动作经 resolveToolCall 落到登记的内部工具与操作，modelToolCall 能映射回公开工具',()=>{
 for(const a of actions){
  if(!a.operation){assert.equal(resolveToolCall(a.tool,{}).tool,a.internalTool,a.id);continue;}
  const args={operation:a.operation,...Object.fromEntries(a.required.map(k=>[k,'x']))};
  const r=resolveToolCall(a.tool,args);
  assert.equal(r.tool,a.internalTool,a.id);assert.equal(r.args.operation,a.internalOperation,a.id);
  const back=modelToolCall(a.internalTool,{operation:a.internalOperation});
  assert.equal(back.tool,a.tool,a.id);assert.equal(back.args.operation,a.operation,a.id);
 }
});

test('每个动作都定位到处理器（文件:行存在）',()=>{
 for(const a of actions){
  assert.ok(a.handler,`${a.id} 无处理器`);
  const lines=fs.readFileSync(a.handler.file,'utf8').split('\n');
  assert.ok(a.handler.line>=1&&a.handler.line<=lines.length,a.id);
  assert.ok(a.participants[0]==='player');
 }
});
