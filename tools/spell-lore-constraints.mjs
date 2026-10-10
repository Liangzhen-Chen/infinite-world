function numeral(value){
    if(/^\d+(?:\.\d+)?$/.test(value))return Number(value);
    if(value==='半')return 0.5;
    const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
    for(const[unit,multiplier]of[['千',1000],['百',100],['十',10]]){
        const at=value.indexOf(unit);if(at>=0)return(at?numeral(value.slice(0,at)):1)*multiplier+(at===value.length-1?0:numeral(value.slice(at+1)));
    }
    return value.split('').reduce((total,char)=>total*10+(digits[char]??NaN),0);
}
function mentionsDuration(text,minutes){
    return [...text.matchAll(/([零一二三四五六七八九十百千万两半\d.]+)(?:个)?(分钟|小时|秒|天)/g)]
        .some(([,number,unit])=>numeral(number)*({分钟:1,小时:60,秒:1/60,天:1440}[unit])===minutes);
}
export function loreConstraintErrors(row,bone=null){
    const fields=['theory','casting','failure','socialConsequences','counters','proficiencyEffects'];
    const errors=[];
    for(const field of fields){
        const text=Array.isArray(row[field])?row[field].join(''):row[field]??'';
        if(/主持人|玩家不能|不要让|提示词|任务列表|骨架|schema|JSON|duration|rangeMeters/.test(text))errors.push(`${field}出现开发措辞`);
        if(/(?:[一二三四五六七八九十百千万两半\d]+)(?:个)?\s*(?:时辰|息)(?!肉)/.test(text))errors.push(`${field}使用含糊时间单位，须用分钟或秒且遵守固定上限`);
    }
    if(bone?.duration>0&&!mentionsDuration(`${row.theory??''}${row.proficiencyEffects?.at(-1)??''}`,bone.duration))errors.push(`持续效果须明确${bone.duration}分钟上限，等值中文数字或小时允许，不接受其他时长`);
    if(bone?.mechanism==='air_bubble'&&/筛选|过滤|净化|再生氧气|补充氧气|换气/.test(row.theory??''))errors.push('气囊仅封闭已有空气，不附带过滤或氧气再生');
    return errors;
}
