import fs from'node:fs/promises';
import path from'node:path';
import {pathToFileURL}from'node:url';
import {digest}from'../server-plugin/storage.mjs';

// Acceptance uses the installed host's real provider conversion, not an approximation.
export async function loadHostPromptProcessor(installation=path.resolve(import.meta.dirname,'../SillyTavern')){
    const file=path.join(installation,'src/prompt-converters.js');
    await fs.access(file);await fs.access(path.join(installation,'config.yaml'));
    const util=await import(pathToFileURL(path.join(installation,'src/util.js')).href);
    util.setConfigFilePath(path.join(installation,'config.yaml'));
    const host=await import(pathToFileURL(file).href);
    return {identity:{source:'SillyTavern/src/prompt-converters.js',sha256:digest(await fs.readFile(file,'utf8')),type:'semi_tools'},
        process(messages,bundle){
            const names={charName:bundle.card.data.name,userName:'试玩者',groupNames:[],startsWithGroupName:()=>false};
            const output=host.postProcessPrompt(structuredClone(messages),host.PROMPT_PROCESSING_TYPE.SEMI_TOOLS,names);
            host.addReasoningContentToToolCalls(output);return output;
        }};
}
