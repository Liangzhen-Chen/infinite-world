// Original procedural audio. No samples, speech, network or model calls.
export const MUSIC = {
    town: {label:'村镇白天',notes:[60,64,67,69,67,64,62,60],beat:0.5},
    tavern: {label:'夜晚酒馆',notes:[57,60,64,67,64,60,59,55],beat:0.75},
    wild: {label:'野外',notes:[62,69,65,72,69,65,64,62],beat:1},
    dungeon: {label:'地下城',notes:[45,52,46,57,52,46,48,45],beat:1},
    battle: {label:'战斗',notes:[50,50,57,53,50,60,57,53],beat:0.25},
};
const AMBIENCE = ['wind','river','birds','insects','market','fire','rain','storm','snow','fog','room','cave'];
export const AUDIO_TRACKS = [...AMBIENCE,...Object.keys(MUSIC).map(key=>`music:${key}`)];

export function selectSoundscape(overview={},place={},combat=false){
    const text=`${place.name??overview.locationPath?.at(-1)??''} ${place.description??''}`;
    const daylight=overview.date?.daylight!==false,indoors=overview.weather?.indoors??place.id?.startsWith('bld_')??false;
    const underground=/地下|洞穴|洞窟|地牢|墓穴|矿洞/.test(text);
    let biome='plain';
    if(/河|溪|湖|水岸|码头|渡口/.test(text))biome='river';
    if(/林|桑园|树林/.test(text))biome='forest';
    if(/芦|沼|湿地/.test(text))biome='marsh';
    if(/山|岭|岩|石坡/.test(text))biome='mountain';
    const settled=/村|镇|集市|街|广场|酒馆|客栈/.test(text);
    const layers=new Set();
    if(underground)layers.add('cave');
    else if(indoors){layers.add('room');if(/酒馆|客栈|厨房|灶|炉|锻/.test(text))layers.add('fire');}
    else{
        layers.add('wind');
        if(['river','marsh'].includes(biome))layers.add('river');
        if(biome!=='mountain')layers.add(daylight?'birds':'insects');
        if(settled&&daylight)layers.add('market');
    }
    const weather=overview.weather?.name??'';
    if(/雨|雷|风暴|雪/.test(weather)){layers.delete('birds');layers.delete('insects');}
    // Outside weather remains muffled through walls; underground has no rain.
    if(!underground){
        if(/暴雨|雷|风暴/.test(weather))layers.add('storm');
        else if(/雨/.test(weather))layers.add('rain');
        else if(/雪/.test(weather))layers.add('snow');
        else if(/雾/.test(weather))layers.add('fog');
    }
    const music=combat?'battle':underground?'dungeon':!daylight&&indoors&&/酒馆|客栈/.test(text)?'tavern':settled&&daylight?'town':'wild';
    return {biome,daylight,indoors,weather,music,tracks:[...layers].map(id=>({id,level:indoors&&['rain','storm','snow','fog'].includes(id)?0.12:id==='wind'&&/阴|多云/.test(weather)?0.45:0.35})).concat({id:`music:${music}`,level:0.32})};
}

// Deterministic loops allow offline listening and reuse one buffer per track.
export function synthesizeLoop(id,sampleRate=22050){
    if(!AUDIO_TRACKS.includes(id))throw Error('未知声音素材');
    const music=MUSIC[id.slice(6)],seconds=music?music.beat*music.notes.length*4:8,length=Math.round(sampleRate*seconds),samples=new Float32Array(length);
    let seed=[...id].reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0)|0,83),low=0;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296*2-1;};
    for(let i=0;i<length;i++){
        const t=i/sampleRate,noise=random();low+=0.035*(noise-low);
        const pulse=(period,width)=>Math.exp(-Math.pow((t%period-period*0.3)/width,2));
        let value=0;
        if(music){
            const index=Math.floor(t/music.beat),age=t%music.beat,note=music.notes[index%music.notes.length];
            const frequency=440*2**((note-69)/12),envelope=Math.min(age/0.025,1)*Math.exp(-age/(music.beat*0.32));
            value=(Math.sin(2*Math.PI*frequency*age)+0.25*Math.sin(4*Math.PI*frequency*age))*envelope*0.18;
            if(id==='music:battle')value+=low*pulse(0.5,0.055)*0.55;
        }else switch(id){
            case 'wind':value=low*(0.9+0.5*Math.sin(2*Math.PI*t/8));break;
            case 'river':value=low*1.8+noise*0.045*(1+0.3*Math.sin(2*Math.PI*t));break;
            case 'rain':value=noise*0.13+low*0.4;break;
            case 'storm':value=noise*0.13+low*2.5*pulse(8,0.7);break;
            case 'snow':value=low*0.6;break;
            case 'fog':value=low*0.4+Math.sin(2*Math.PI*82*t)*0.02;break;
            case 'birds':value=Math.sin(2*Math.PI*(1800*t+90*Math.sin(2*Math.PI*t*3)))*pulse(2,0.07)*0.15;break;
            case 'insects':value=Math.sin(2*Math.PI*3200*t)*Math.max(0,Math.sin(2*Math.PI*8*t))*0.045;break;
            // Nonverbal formant-like murmur; no intelligible words or voices.
            case 'market':value=(Math.sin(2*Math.PI*180*t)+Math.sin(2*Math.PI*260*t))*pulse(2,0.4)*0.035+low*0.6;break;
            case 'fire':value=low*1.1+(noise>0.992?noise*0.22:0);break;
            case 'room':value=low*0.35+Math.sin(2*Math.PI*55*t)*0.015;break;
            case 'cave':value=low*0.65+Math.sin(2*Math.PI*41*t)*0.03+pulse(4,0.015)*Math.sin(2*Math.PI*920*t)*0.09;break;
        }
        // A short endpoint envelope prevents clicks at loop boundaries.
        const edge=Math.min(1,t/0.035,(seconds-t)/0.035);
        samples[i]=value*Math.max(0,edge);
    }
    return {samples,sampleRate,seconds};
}

export class AmbientAudio{
    constructor({createContext=()=>new (globalThis.AudioContext??globalThis.webkitAudioContext)(),fadeSeconds=1.2,onStatus=()=>{}}={}){
        this.createContext=createContext;this.fadeSeconds=fadeSeconds;this.onStatus=onStatus;
        this.context=null;this.master=null;this.buffers=new Map();this.voices=new Map();this.retiring=new Set();
        this.settings={volume:60,muted:false};this.scene=null;this.session=null;this.unlocked=false;this.combat=false;
    }
    status(text){this.message=text;this.onStatus(text);}
    async unlock(){
        try{
            // Called synchronously inside a trusted click, including the parent start page.
            if(!this.context){this.context=this.createContext();this.master=this.context.createGain();this.master.connect(this.context.destination);}
            this.applySettings(this.settings);
            await this.context.resume();
            if(this.context.state!=='running')throw Error('浏览器尚未允许播放');
            this.unlocked=true;this.sync();this.status('声音已开启');return true;
        }catch{this.unlocked=false;this.stopVoices();this.status('声音未能开启，请点击“开启声音”重试');return false;}
    }
    applySettings(settings){
        this.settings={...settings};
        if(this.master){
            const gain=this.master.gain,now=this.context.currentTime,value=settings.muted?0:Math.max(0,Math.min(100,settings.volume))/100;
            gain.cancelScheduledValues(now);
            if(value===0||this.context.state!=='running')gain.setValueAtTime(value,now);else gain.setTargetAtTime(value,now,0.02);
        }
    }
    setScene(session,overview,place){
        if(this.session!==session){this.stop();this.session=session;}
        if(this.scene?.place?.id!==place?.id)this.combat=false;
        this.scene={overview,place};this.sync();
    }
    noteAction(result,player,tool){
        // Tail-note settlement is bookkeeping, not the end of a fight.
        if(tool==='world_turn')return;
        this.combat=result?.actionScope?.kind==='combat_exchange'&&result.targetHp>0&&player?.hp>0;
        this.sync();
    }
    buffer(id){
        if(!this.buffers.has(id)){
            const loop=synthesizeLoop(id),buffer=this.context.createBuffer(1,loop.samples.length,loop.sampleRate);
            buffer.copyToChannel(loop.samples,0);this.buffers.set(id,buffer);
        }
        return this.buffers.get(id);
    }
    dispose(voice){
        voice.source.onended=null;try{voice.source.stop();}catch{/* A scheduled source may have ended already. */}
        voice.source.disconnect();voice.gain.disconnect();this.retiring.delete(voice);
    }
    sync(){
        if(!this.unlocked||!this.scene)return;
        const soundscape=selectSoundscape(this.scene.overview,this.scene.place,this.combat),wanted=new Map(soundscape.tracks.map(track=>[track.id,track.level]));
        const signature=JSON.stringify([...wanted]);if(signature===this.signature)return;this.signature=signature;
        const now=this.context.currentTime,fade=this.fadeSeconds;
        // Dispose the previous transition before starting another, bounding live sources.
        for(const voice of [...this.retiring])this.dispose(voice);
        for(const [id,voice]of this.voices)if(!wanted.has(id)){
            const elapsed=now-voice.started,current=voice.level*Math.min(1,elapsed/fade);
            voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setValueAtTime(current,now);voice.gain.gain.linearRampToValueAtTime(0,now+fade);
            this.voices.delete(id);this.retiring.add(voice);
            voice.source.onended=()=>{voice.source.disconnect();voice.gain.disconnect();this.retiring.delete(voice);};voice.source.stop(now+fade);
        }
        for(const [id,level]of wanted){
            const existing=this.voices.get(id);
            if(existing){if(existing.level!==level){existing.gain.gain.cancelScheduledValues(now);existing.gain.gain.setValueAtTime(existing.gain.gain.value,now);existing.gain.gain.linearRampToValueAtTime(level,now+fade);existing.level=level;}continue;}
            const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.buffer(id);source.loop=true;source.connect(gain);gain.connect(this.master);
            gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+fade);source.start();this.voices.set(id,{source,gain,level,started:now});
        }
    }
    stopVoices(){for(const voice of [...this.voices.values(),...this.retiring])this.dispose(voice);this.voices.clear();this.signature=null;}
    stop(){this.stopVoices();this.scene=null;this.session=null;this.combat=false;}
    async close(){this.stop();const context=this.context;this.context=null;this.master=null;this.buffers.clear();this.unlocked=false;await context?.close();}
}

export const ambientAudio=new AmbientAudio();
export function registerUI({registerSettingsSection}){
    registerSettingsSection({id:'audio',title:'环境音与音乐',render(container){
        const doc=container.ownerDocument,button=doc.createElement('button'),status=doc.createElement('p');
        button.type='button';button.textContent='开启声音';button.onclick=async()=>{await ambientAudio.unlock();status.textContent=ambientAudio.message;};
        status.textContent=ambientAudio.message??'点击进入游戏或开启声音后播放。音量与静音使用上方设置。';status.dataset.fieldsAudioStatus='';status.setAttribute('role','status');container.append(button,status);
    }});
}
