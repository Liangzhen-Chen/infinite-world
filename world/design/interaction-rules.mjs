// K2 interaction table ("chemistry"): an agent (element or action) meets the
// derived traits of a target (server-plugin/traits.mjs). Elements change
// material state and each other; materials never change one another directly.
// Rules name tags only, never entity ids. Consumers: interactions.mjs.
//   agent  element/action, or '*' for any combat tactic
//   when   all/any/none tag lists, or affinity:'weak'|'resist' (explicit nature)
//   effect multiplier (combat), add/remove (state tags), mark (surface trace),
//          minutes (how long an added state lasts), moistureMg (water added)
export const interactionRules=Object.freeze({version:1,rules:[
 // Explicit species nature (creature-nature.mjs) overrides tag-derived combat rules.
 {id:'nature-weak',agent:'*',when:{affinity:'weak'},effect:{multiplier:1.5,override:true}},
 {id:'nature-resist',agent:'*',when:{affinity:'resist'},effect:{multiplier:0.5,override:true}},
 // Element versus body: every creature carries body tags, so all species take part.
 {id:'fire-flammable-body',agent:'fire',when:{all:['creature'],any:['plant','resin','wax','bark']},effect:{multiplier:1.5}},
 {id:'fire-frost-body',agent:'fire',when:{all:['creature','frost']},effect:{multiplier:1.5}},
 {id:'fire-ember-body',agent:'fire',when:{all:['creature'],any:['ember']},effect:{multiplier:0.5}},
 {id:'fire-wet-body',agent:'fire',when:{all:['creature'],any:['aquatic','wet']},effect:{multiplier:0.5}},
 {id:'fire-scale-guard',agent:'fire',when:{all:['creature','scale']},effect:{multiplier:0.75}},
 {id:'cold-thick-coat',agent:'cold',when:{all:['creature'],any:['fur','hide']},effect:{multiplier:0.75}},
 {id:'cold-frost-body',agent:'cold',when:{all:['creature','frost']},effect:{multiplier:0.5}},
 {id:'cold-cold-blooded',agent:'cold',when:{all:['creature'],any:['reptile','amphibian','insect','ember']},effect:{multiplier:1.5}},
 {id:'lightning-conductor',agent:'lightning',when:{all:['creature','conductive']},effect:{multiplier:1.5}},
 {id:'earth-hard-shell',agent:'earth',when:{all:['creature'],any:['stone','shell']},effect:{multiplier:0.5}},
 {id:'wind-light-flyer',agent:'wind',when:{all:['creature'],any:['feather','mist']},effect:{multiplier:1.5}},
 {id:'light-undead',agent:'light',when:{all:['creature','undead']},effect:{multiplier:1.5}},
 {id:'water-ember-body',agent:'water',when:{all:['creature','ember']},effect:{multiplier:1.5}},
 // Element versus material state (items and place features).
 {id:'fire-ignite',agent:'fire',when:{all:['flammable'],none:['creature','burning','wet','frozen']},effect:{add:['burning']}},
 {id:'fire-char',agent:'fire',when:{any:['wood','paper','cloth','fiber','grass','leather'],none:['creature','wet']},effect:{mark:'char'}},
 {id:'fire-temper-metal',agent:'fire',when:{all:['metal'],none:['creature']},effect:{mark:'temper'}},
 {id:'fire-thaw',agent:'fire',when:{all:['frozen']},effect:{remove:['frozen']}},
 {id:'water-douse',agent:'water',when:{all:['burning']},effect:{remove:['burning'],add:['wet']}},
 {id:'rain-douse',agent:'rain',when:{all:['burning'],none:['indoor']},effect:{remove:['burning'],add:['wet'],moistureMg:1000}},
 {id:'cold-freeze-water',agent:'cold',when:{all:['water'],none:['creature','frozen','burning']},effect:{add:['frozen'],minutes:120}},
 {id:'cold-quench',agent:'cold',when:{all:['burning']},effect:{remove:['burning']}},
 {id:'ink-stain-paper',agent:'ink',when:{all:['paper'],none:['wet']},effect:{mark:'stain'}},
]});
