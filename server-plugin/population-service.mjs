import {randomUUID} from 'node:crypto';
import {checkGeneratedProfile,profileBrief,MAX_PROFILE_FAILURES,PROFILE_FIELDS} from './population.mjs';
import {remotePeopleAt,remoteProfileBrief} from './remote-generation.mjs';

// First conversation with a seeded resident: draft once, check the hard
// constraints in code, self-check once, check again, then store through the
// campaign ledger. The identity assigned on arrival never changes; a failed
// attempt is recorded and no money, goods or new life history is issued.

const SYSTEM=`你为一个中文奇幻世界的战役起草一名普通居民的完整人物档。身份由代码分配，必须原样遵守：姓名、年龄、性别、物种、户籍成员与关系、住区、职业都不得改动或补充。
只输出一个 JSON 对象，字段仅限：personality{traits[2-3],values[1-2],flaws[1]}、voice{register,accent,habits[1-2],samples[2-3]}、background(不超过160字)、currentConcern(不超过60字)、goals[1-2]、fears[1]、knowledge{unknown[1-2]}、relationships[{with:同户成员id,relation:与给定关系相同,note}]、visibleFeature。
硬性要求：不写钱数、财物、技能或战斗能力；不写给定以外的亲属、婚姻、子女或住处；除给定年龄外不写任何“某某岁”；未成年人不得出现恋爱、婚约、亲密或相关暗示；不使用真实人物或已有作品中的专名；经历要朴素、与职业和住区相符，不制造大事件。`;

function parseJSON(response){
    const raw=response?.choices?.[0]?.message?.content??(typeof response==='string'?response:'');
    const text=String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'');
    return JSON.parse(text);
}
const clean=profile=>profile&&typeof profile==='object'?Object.fromEntries(Object.entries(profile).filter(([k])=>PROFILE_FIELDS[k])):profile;

export function draftRequest(brief){
    return {max_tokens:1100,temperature:0.7,response_format:{type:'json_object'},
        messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({task:'起草完整人物档',...brief})}]};
}
export function selfCheckRequest(brief,draft,codeErrors){
    return {max_tokens:1100,temperature:0.2,response_format:{type:'json_object'},
        messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({task:'自查',instruction:'逐条核对草稿与身份、硬性要求是否冲突（年龄与亲属、住址与户籍、职业、物种、未成年人边界、钱物）。输出 {"issues":[发现的问题],"profile":修正后的完整档}；没有问题时 issues 为空数组、profile 原样返回。',
            ...brief,draft,codeFindings:codeErrors})}]};
}

// Real entry: two model calls per person (draft, self-check).
export function modelProfileGenerator(client,{labelPrefix='population'}={}){
    return async function generate(brief,{template}={}){
        const draft=clean(parseJSON(await client.generate(draftRequest(brief),`${labelPrefix}-draft-${brief.identity.id}`)));
        const before=checkGeneratedProfile(identityFromBrief(brief),draft,{template});
        const review=parseJSON(await client.generate(selfCheckRequest(brief,draft,before),`${labelPrefix}-selfcheck-${brief.identity.id}`));
        return {profile:clean(review.profile??draft),selfCheck:{issues:Array.isArray(review.issues)?review.issues.slice(0,10).map(String):[],codeFindingsBeforeReview:before},calls:2,model:'deepseek-flash'};
    };
}
// The stored identity is what the checker compares against.
function identityFromBrief(brief){
    const i=brief.identity;
    return {id:i.id,name:i.name,age:i.age,sex:i.sex,...(i.species?{species:i.species}:{}),culture:i.culture,occupation:i.occupation,
        flags:{minor:i.minor,romanceable:!i.minor},kin:i.household.map(h=>({with:h.id,name:h.name,relation:h.relation,age:h.age})),
        home:{district:i.district,dwelling:i.dwelling},location:i.district,...(i.title?{title:i.title,keyPerson:true}:{})};
}

// People named in the player's words who are seeded residents of the current
// district and still have only a roster identity.
export function conversationCandidates(engine,document,query){
    const scoped=engine.scoped(document),s=document.state,mentioned=scoped.resolver.mentions(String(query??''),s.location);
    // T143: fixed people of a generated far county (outline key people, officials, shopkeepers).
    const remote=remotePeopleAt(scoped,document,mentioned).filter(id=>(s.remote[scoped.byId.get(id).county].profiles?.[id]?.failures??0)<MAX_PROFILE_FAILURES);
    return [...remote,...[...mentioned].filter(id=>{
        const e=s.created?.[id];if(e?.generated!=='population'||e.home?.district!==s.location||e.profileStatus==='full')return false;
        const status=s.population?.[e.settlement]?.profiles?.[id];
        return (status?.failures??0)<MAX_PROFILE_FAILURES;
    })].sort();
}

export async function ensurePopulationProfiles(store,campaignId,{engineFor,query,generator,limit=1}){
    if(typeof generator!=='function')return [];
    const outcomes=[];
    for(let i=0;i<limit;i++){
        const view=await store.read(campaignId),engine=await engineFor(view.document);
        const [person]=conversationCandidates(engine,view.document,query).filter(id=>!outcomes.some(o=>o.person===id));
        if(!person)break;
        const scoped=engine.scoped(view.document),remote=scoped.byId.get(person)?.generated==='remote';
        const brief=remote?remoteProfileBrief(scoped,view.document,person):profileBrief(view.document,person),template=remote?null:view.document.state.population[brief.settlement].template;
        let input;
        try{
            const generated=await generator(brief,{template});
            const errors=checkGeneratedProfile(remote?scoped.byId.get(person):view.document.state.created[person],generated?.profile,{template});
            input=errors.length?{type:'population_profile',person,outcome:'failed',reason:`硬约束未通过：${errors.join('；')}`}
                :{type:'population_profile',person,outcome:'accepted',profile:generated.profile,generator:{model:generated.model??'injected',calls:generated.calls??0}};
        }catch(error){input={type:'population_profile',person,outcome:'failed',reason:`生成失败：${String(error?.message??error).slice(0,200)}`};}
        const eventId=`population_profile_${person}_${randomUUID()}`;
        try{
            await store.transact(campaignId,{id:eventId,input:{...input,eventId},expectedSequence:view.reference.sequence},store.reducer);
            outcomes.push({person,status:input.outcome==='accepted'?'full':'failed',...(input.reason?{reason:input.reason}:{})});
        }catch(error){outcomes.push({person,status:'skipped',reason:String(error.message).slice(0,200)});break;}
    }
    return outcomes;
}
