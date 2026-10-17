// S2a 持有写入点静态扫描（02 I5、10 §10.5“旧写入点漏写为 0”）：凡是写到持有来源所读旧字段的地方，
// 必须经 holdingSet / holdingRemove（或随后调用 syncHoldings / syncHoldingRecord / syncHoldingSource）双写；
// 新增的未登记写入点会被这里拦下。扫描是近似：只认得出字面量路径与模块内的记录路径辅助函数（rec / path / recordPath /
// contractPath / key）；经变量间接拼出的路径（[...actorPath(...), 'x']）不计，由运行期对账（holdings-reconcile、审计预加载）兜底。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {holdingRecordCategories,holdingPathWatched,holdingSources} from '../server-plugin/holding-sources.mjs';
import {holdingWriters} from '../server-plugin/holdings.mjs';
import '../server-plugin/engine.mjs';// 加载全部写入模块，它们在加载时声明持有写入者

const DIR=path.resolve(import.meta.dirname,'../server-plugin');
const OWN=new Set(['holdings.mjs','holding-kinds.mjs','holding-sources.mjs']);
const BS=String.fromCharCode(92);
function skipString(src,i){const q=src[i];i++;while(i<src.length&&src[i]!==q){if(src[i]===BS)i++;i++;}return i;}
function skipTemplate(src,i){i++;while(i<src.length&&src[i]!=='`'){if(src[i]===BS){i+=2;continue;}if(src[i]==='$'&&src[i+1]==='{'){i=close(src,i+1);continue;}i++;}return i;}
function close(src,open){
    const pair={'(':')','[':']','{':'}'},stack=[];
    for(let i=open;i<src.length;i++){
        const c=src[i];
        if(c==="'"||c==='"'){i=skipString(src,i);continue;}
        if(c==='`'){i=skipTemplate(src,i);continue;}
        if(pair[c]){stack.push(pair[c]);continue;}
        if(c===')'||c===']'||c==='}'){stack.pop();if(!stack.length)return i;}
    }
    return src.length;
}
const firstArg=(src,open)=>{// src[open]==='(' → text of the first argument
    let depth=0;
    for(let i=open+1;i<src.length;i++){const c=src[i];
        if(c==="'"||c==='"'){i=skipString(src,i);continue;}if(c==='`'){i=skipTemplate(src,i);continue;}
        if('([{'.includes(c))depth++;else if(')]}'.includes(c)){if(!depth)return src.slice(open+1,i);depth--;}
        else if(c===','&&!depth)return src.slice(open+1,i);}
    return '';
};
// 字面量数组路径 → 路径（非字面量元素记为 null：可匹配任意键）；不是字面量数组时返回 null。
function literalPath(arg){
    const t=arg.trim();if(!t.startsWith('[')||t.includes('...'))return null;
    return t.slice(1,-1).split(',').map(x=>x.trim()).map(x=>/^'[^']*'$/.test(x)?x.slice(1,-1):null);
}
const watchedLiteral=p=>{
    // 未知元素按“可能命中”处理：逐个以通配代入。
    if(p[0]!=='state'||p.length<2)return false;
    const probe=p.map(x=>x===null?'__any__':x);
    if(probe[1]==='records')return 'records';
    if(holdingPathWatched(probe))return 'path';
    // 未知元素出现在规则的字面量位置时仍可能命中（如 ['state','npcs',id,field]）：只在该位置未知时保守报出。
    if(p.some(x=>x===null)){for(const lit of ['residence','faith','certifications','owner','corpse','companions'])if(holdingPathWatched(p.map(x=>x===null?lit:x)))return 'path';}
    return false;
};
export function scanModule(file,src,categories=holdingRecordCategories()){
    const findings=[];
    const helpers=new Set([...src.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)\s*=\s*\(?\s*\w+\s*\)?\s*=>\s*\[\s*'state'\s*,\s*'records'/g)].map(m=>m[1]));
    const holdsCategories=[...categories].some(c=>new RegExp(`category:\\s*'${c}'|\`${c}:|'${c}:`).test(src));
    for(const m of src.matchAll(/(?<![\w$.])d\.(set|remove)\(/g)){
        const open=m.index+m[0].length-1,arg=firstArg(src,open),line=src.slice(0,m.index).split('\n').length;
        const lit=literalPath(arg);
        let kind=null;
        if(lit)kind=watchedLiteral(lit);
        else{const h=/^(?:\[\s*\.\.\.)?([A-Za-z_$][\w$]*)\(/.exec(arg.trim());if(h&&helpers.has(h[1]))kind='records';}
        if(kind==='records'&&!holdsCategories)continue;// 只写与持有无关的记录类别的模块
        if(kind)findings.push(`${file}:${line} ${m[1]}(${arg.trim().slice(0,80)})`);
    }
    return findings;
}

test('持有来源所读的旧字段只经包装写入：未包装的写入点为 0',()=>{
    const findings=[];
    for(const f of fs.readdirSync(DIR).filter(f=>f.endsWith('.mjs')&&!OWN.has(f)).sort())findings.push(...scanModule(f,fs.readFileSync(path.join(DIR,f),'utf8')));
    assert.deepEqual(findings,[],'以下写入点写了持有来源所读的旧字段却没有经 holdingSet / holdingRemove 双写');
});

test('调用持有写入包装或双写入口的模块都声明了持有写入者；声明的种类都已注册',()=>{
    const declared=holdingWriters(),missing=[];
    for(const f of fs.readdirSync(DIR).filter(f=>f.endsWith('.mjs')&&!OWN.has(f))){
        const src=fs.readFileSync(path.join(DIR,f),'utf8');
        const uses=/\b(holdingSet|holdingRemove|syncHoldings|syncHoldingRecord|syncHoldingSource)\(/.test(src);
        if(uses&&!/declareHoldingWriter\('/.test(src))missing.push(f);
        for(const m of src.matchAll(/(?<![\w$.])(holdingSet|holdingRemove)\(/g)){
            if(/function\s*$/.test(src.slice(0,m.index)))continue;
            const open=m.index+m[0].length-1,call=src.slice(open,close(src,open)+1),writer=/,\s*'([a-z][a-z0-9-]*)'\s*\)$/.exec(call)?.[1];
            if(writer&&!declared[writer])missing.push(`${f}: 写入者 ${writer} 未声明`);
        }
    }
    assert.deepEqual(missing,[]);
    assert.ok(Object.keys(declared).length>=40,'各写入模块已声明');
    assert.ok(holdingSources().length>=25,'旧来源已登记');
});

test('拦截新增写入点：一个未包装的记录写入或家庭写入会被报出，包装后不报',()=>{
    const bad=`const rec=id=>['state','records',id];\nexport function hire(d,e,w){d.set(rec(\`contract_\${w}\`),{category:'contract',kind:'workshop',worker:w,owner:'player',status:'有效'});}\n`+
        `export function wed(d,a,b){d.set(['state','family','marriages',a],{partners:[a,b],status:'在婚'});}\n`;
    const f=scanModule('new-module.mjs',bad);
    assert.equal(f.length,2,f.join('\n'));
    const good=bad.replace("d.set(rec(","holdingSet(d,e,rec(").replace("d.set(['state','family'","holdingSet(d,null,['state','family'");
    assert.deepEqual(scanModule('new-module.mjs',good),[]);
    // 与持有无关的记录（世界事件）不拦。
    assert.deepEqual(scanModule('m.mjs',`const rec=id=>['state','records',id];export const f=d=>d.set(rec('x'),{category:'world_event'});`),[]);
});
