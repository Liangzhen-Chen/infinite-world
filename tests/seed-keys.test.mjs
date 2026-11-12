import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {scanSource,scanSeedSites,loadSeedKeys,checkSeedKeys,validateSeedKeys,SEED_KEY_ROLES} from '../server-plugin/seed-keys.mjs';

const table=loadSeedKeys(),sites=scanSeedSites();
const clone=value=>structuredClone(value);

test('E-SEED-KEY：登记表与 server-plugin 代码逐项一致，加载校验通过',()=>{
 assert.deepEqual(checkSeedKeys(table,sites),[]);
 validateSeedKeys();
 assert.ok(table.entries.length>=70);
 assert.ok(table.entries.every(e=>SEED_KEY_ROLES.includes(e.role)&&e.purpose.trim()));
});

test('E-SEED-KEY：代码里有而表里没有 → 报错',()=>{
 const extra=[...sites,{file:'combat.mjs',kind:'sha256',expr:'`${document.randomSeed}:${eventId}:newroll`',line:1}];
 const errors=checkSeedKeys(table,extra);
 assert.equal(errors.length,1);assert.match(errors[0],/^E-SEED-KEY 代码里有而表里没有：combat\.mjs:1 sha256/);
});

test('E-SEED-KEY：表里有而代码里没有 → 报错；出现次数不符 → 报错',()=>{
 const phantom=clone(table);phantom.entries.push({file:'combat.mjs',kind:'sha256',expr:'`${seed}:gone`',count:1,prefix:'gone',role:'seed',purpose:'不存在的键'});
 const gone=checkSeedKeys(phantom,sites);
 assert.equal(gone.length,1);assert.match(gone[0],/表里有而代码里没有：combat\.mjs sha256/);
 const counted=clone(table);counted.entries.find(e=>e.count===2).count=3;
 assert.match(checkSeedKeys(counted,sites).join('\n'),/出现次数不符/);
});

test('E-SEED-KEY：真实源码里改一个种子前缀，两个方向各报一条',async()=>{
 const source=await fs.readFile('server-plugin/combat.mjs','utf8'),changed=source.replace(':combat`',':combat-v2`');
 assert.notEqual(source,changed);
 const rows=sites.filter(s=>s.file!=='combat.mjs').concat(scanSource(changed).map(s=>({file:'combat.mjs',...s})));
 const errors=checkSeedKeys(table,rows);
 assert.equal(errors.length,2);
 assert.ok(errors.some(e=>/代码里有而表里没有/.test(e)&&e.includes('combat-v2')));
 assert.ok(errors.some(e=>/表里有而代码里没有/.test(e)&&e.includes(':combat`')));
});

test('E-SEED-KEY：Math.random 只允许在 legacy/；登记项字段不全报错',()=>{
 const outside=checkSeedKeys(table,[...sites,{file:'engine.mjs',kind:'math-random',expr:'',line:9}]);
 assert.ok(outside.some(e=>/Math\.random 只允许在 legacy\//.test(e)));
 assert.ok(sites.some(s=>s.kind==='math-random'&&s.file.startsWith('legacy/')));
 const bad=clone(table);delete bad.entries[0].purpose;
 assert.match(checkSeedKeys(bad,sites)[0],/登记项字段不全或无效/);
 assert.match(checkSeedKeys({version:2,entries:[]},sites)[0],/格式无效/);
});

test('扫描：定义不计、调用计；模板种子与 stream/seededRandom 入参被识别',()=>{
 const rows=scanSource([
  "function stream(seed){return seed;}",
  "const a=stream(`${template.seed}:alpha:v${V}`);",
  "const b=seededRandom(createHash('sha256').update(`${s}:beta`).digest().readUInt32LE(0));",
  "const c=seededRandom(12);",
  "const rec={seed:`${s.name}:${s.id}`};",
  "const n=npc.memoryStream(1);"
 ].join('\n'));
 assert.deepEqual(rows.map(r=>[r.kind,r.expr]),[
  ['stream','`${template.seed}:alpha:v${V}`'],
  ['sha256','`${s}:beta`'],
  ['seededRandom','12'],
  ['seed-template','`${s.name}:${s.id}`']
 ]);
});

test('扫描器：注释不计；正则字面量与双引号、换行链式 createHash 正常处理',()=>{
 const rows=scanSource([
  "// stream(`${seed}:comment`) 与 Math.imul( 只在注释里",
  "/* seededRandom(1) */",
  "const ok=/['\"(]/.test(x);",
  "const h=createHash(\"sha256\")",
  "  .update(`${seed}:chain`).digest();",
  "const r=stream(`${seed}:real`);"
 ].join('\n'));
 assert.deepEqual(rows.map(r=>[r.kind,r.expr,r.line]),[['sha256','`${seed}:chain`',4],['stream','`${seed}:real`',6]]);
});

test('已知盲区（不造通配，仅记录）：变量持有的哈希对象、非 sha256 算法、不含种子名的手写 PRNG 不被扫描',()=>{
 assert.deepEqual(scanSource("const h=createHash('md5');h.update(`${seed}:x`);const v=Math.floor(Date.now()/7);"),[
  {kind:'seed-template',expr:'`${seed}:x`',line:1}
 ]);
});
