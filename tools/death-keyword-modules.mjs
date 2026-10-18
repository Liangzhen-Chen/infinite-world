// Count literal lifecycle vocabulary, including comments and user-facing text.
// Capture once before editing; the working tree includes new modules.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const pattern=/死亡|\b(?:dead|died|deceased|killed)\b/i;
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.mjs')?[path.relative(root,path.join(dir,e.name)).replaceAll('\\','/')]:[]);}
export function deathKeywordModules(){
 const after=files(path.join(root,'server-plugin')).filter(f=>pattern.test(fs.readFileSync(path.join(root,f),'utf8'))).sort();
 const baseline=new URL('../tests/metrics/death-keyword-modules.baseline.json',import.meta.url);
 if(process.argv.includes('--capture'))fs.writeFileSync(baseline,JSON.stringify({count:after.length,modules:after},null,2)+'\n');
 const before=JSON.parse(fs.readFileSync(baseline,'utf8'));
 return {scope:'server-plugin/**/*.mjs, literal text including comments/messages',before,after:{count:after.length,modules:after},targetMet:after.length<10};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(deathKeywordModules(),null,2));
