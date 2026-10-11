import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

let cached;
// Reuse the host's installed tokenizer library and already downloaded model.
// No downloads, server credentials, new tokenizer package, or byte estimates.
export async function loadHistoryTokenizer(installation=path.resolve(import.meta.dirname,'../SillyTavern')){
 if(cached?.installation===installation)return cached.promise;
 const promise=(async()=>{
  const require=createRequire(path.join(installation,'package.json'));
  const {Tokenizer}=await import(pathToFileURL(require.resolve('@agnai/web-tokenizers')).href);
  const file=path.join(installation,'data/_cache/deepseek.json');
  let bytes;try{bytes=await fs.readFile(file);}catch(error){if(error.code==='ENOENT')throw Error('宿主尚无 DeepSeek tokenizer 缓存，不能进行历史窗口验收');throw error;}
  const tokenizer=await Tokenizer.fromJSON(bytes),counts=new Map();
  return text=>{text=String(text);if(!counts.has(text)){if(counts.size>=4096)counts.delete(counts.keys().next().value);counts.set(text,tokenizer.encode(text).length);}return counts.get(text);};
 })();cached={installation,promise};return promise;
}
