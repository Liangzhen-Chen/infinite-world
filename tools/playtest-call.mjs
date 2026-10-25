import {translateCall} from '../server-plugin/action-gateway.mjs';
import {resolveToolCall} from '../extension/tools.mjs';

// Follow the same catalog translation and legacy grouping as /execute.
// Keep raw calls in reports so assertions on the public entry still work.
export function resolvePlaytestCall(tool,args){
    const translated=tool==='world_act'?translateCall(tool,args):{tool,args};
    return resolveToolCall(translated.tool,translated.args);
}
