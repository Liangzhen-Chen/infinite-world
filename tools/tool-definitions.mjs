import fs from 'node:fs/promises';
import {parseTurn}from'../extension/turn.mjs';
export async function toolDefinitions(){
    const definitions=[];
    const context={registerFunctionTool:definition=>definitions.push({type:'function',function:{name:definition.name,description:definition.description,parameters:definition.parameters}}),
        eventSource:{on(){}},eventTypes:new Proxy({},{get:(_,key)=>key})};
    const source=(await fs.readFile(new URL('../extension/runtime.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
    const fakeWindow={fetch:async()=>{throw new Error('定义提取不发送请求');}};
    new Function('getContext','parseTurn','window','location',source)(()=>context,parseTurn,fakeWindow,{origin:'http://127.0.0.1'});
    return definitions;
}
