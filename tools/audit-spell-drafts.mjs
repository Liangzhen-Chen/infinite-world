import fs from 'node:fs/promises';
import {createHash}from'node:crypto';
import Ajv from'ajv';
import {spellBlueprints}from'../world/design/spell-blueprints.mjs';
import {loreConstraintErrors}from'./spell-lore-constraints.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const schema=await read('schemas/spell-lore.schema.json'),validate=new Ajv({allErrors:true}).compile(schema);
const catalog=await read('world/drafts/spells/catalog.json'),errors=[],warnings=[],bones=new Map(spellBlueprints().map(row=>[row.id,row]));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=['theory','casting','failure','socialConsequences','counters','proficiencyEffects'];
const corpus=row=>fields.flatMap(field=>row[field]??[]).join('');
const grams=value=>{const clean=value.replace(/[^\p{L}]/gu,'');return new Set(Array.from({length:Math.max(0,clean.length-1)},(_,i)=>clean.slice(i,i+2)));};
const jaccard=(a,b)=>{let overlap=0;for(const gram of a)if(b.has(gram))overlap++;return overlap/(a.size+b.size-overlap||1);};
const records=catalog.spells,sets=records.map(row=>grams(corpus(row)));
for(let i=0;i<records.length;i++){
    const row=records[i],bone=bones.get(row.id);
    const lore=Object.fromEntries(['id',...fields,'law'].map(field=>[field,row[field]]));
    if(!validate({spells:[lore]}))errors.push({id:row.id,type:'schema',errors:structuredClone(validate.errors)});
    if(!bone||['river','city','port'].some(region=>row.law[region]!==bone.law[region]))errors.push({id:row.id,type:'law'});
    for(const message of loreConstraintErrors(row,bone))warnings.push({id:row.id,type:'loreConstraint',message});
    if(/主持人|玩家不能|不要让|提示词|任务列表|禁止/.test(corpus(row)))warnings.push({id:row.id,type:'ruleLanguage'});
    let nearest=-1,similarity=0;
    for(let j=0;j<records.length;j++)if(i!==j){const score=jaccard(sets[i],sets[j]);if(score>similarity){similarity=score;nearest=j;}}
    if(similarity>=0.35)errors.push({id:row.id,type:'similarity',nearest:records[nearest].id,similarity});
    row.audit={hash:digest(row),nearest:nearest<0?null:records[nearest].id,similarity};
}
// Reproducible sampling fixed independently of model text and acceptance.
function shuffle(values,seed){let x=seed>>>0;const out=[...values];for(let i=out.length-1;i>0;i--){x^=x<<13;x^=x>>>17;x^=x<<5;const j=(x>>>0)%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
await fs.mkdir('docs/内容审查',{recursive:true});
for(let offset=0;offset<records.length;offset+=50){
    const batch=Math.floor(offset/50)+1,rows=records.slice(offset,offset+50),sample=shuffle(rows,20261010+batch).slice(0,10);
    const existing=`docs/内容审查/法术批${batch}-抽样.json`;
    const report={batch,seed:20261010+batch,scope:'待人工精读打分，生成抽样不等于通过',catalogHash:digest(catalog),count:rows.length,sample:sample.map(row=>({id:row.id,hash:row.audit.hash,scores:null,notes:null})),approved:false};
    // Keep any prior manual judgement intact, regenerate only for new hashes.
    let prior=null;try{prior=await read(existing);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!prior||prior.catalogHash!==report.catalogHash){
        if(prior){await fs.mkdir('docs/内容审查/历史',{recursive:true});await fs.writeFile(`docs/内容审查/历史/法术批${batch}-${prior.catalogHash}.json`,JSON.stringify(prior,null,2)+'\n');}
        await fs.writeFile(existing,JSON.stringify(report,null,2)+'\n');
    }
}
const report={scope:'结构、机制合法性、规则措辞与二元切词相似度；不代替人工内容验收',count:records.length,errors,warnings,
    maxSimilarity:Math.max(...records.map(row=>row.audit.similarity)),manualApproved:false};
await fs.writeFile('docs/内容审查/法术自动审查.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({count:records.length,errors:errors.length,warnings:warnings.length,maxSimilarity:report.maxSimilarity,manualApproved:false}));
if(errors.length)process.exitCode=1;
