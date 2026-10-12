// Frozen audit leaves; formal sources are unchanged. L2/L4 remain pending.
import base from '../drafts/w1/sb-depth/base.json' with {type:'json'};
export const revision='w1-sb-depth-v1';
export const incrementLimitYuan=3;
export const cohorts=[
  {
    "id": "sb-cohort-1",
    "participants": [
      "npc_sb_zhangluo",
      "npc_sb_yuanqing",
      "npc_sb_zhonglan",
      "npc_sb_tianmo"
    ],
    "sourceProblems": [
      "problem_sb_1",
      "problem_sb_2"
    ],
    "sharedMemoryIds": [
      "memory_sb_depth_shared_1",
      "memory_sb_depth_shared_2"
    ]
  },
  {
    "id": "sb-cohort-2",
    "participants": [
      "npc_sb_zhenyun",
      "npc_sb_gulu",
      "npc_sb_yexun",
      "npc_sb_zhuchai"
    ],
    "sourceProblems": [
      "problem_sb_3",
      "problem_sb_4"
    ],
    "sharedMemoryIds": [
      "memory_sb_depth_shared_3",
      "memory_sb_depth_shared_4"
    ]
  },
  {
    "id": "sb-cohort-3",
    "participants": [
      "npc_sb_panyao",
      "npc_sb_gaoshu",
      "npc_sb_zhouwei",
      "npc_sb_congsi"
    ],
    "sourceProblems": [
      "problem_sb_5"
    ],
    "sharedMemoryIds": [
      "memory_sb_depth_shared_5",
      "memory_sb_depth_shared_6"
    ]
  },
  {
    "id": "sb-cohort-4",
    "participants": [
      "npc_sb_maoli",
      "npc_sb_jiean",
      "npc_sb_baishu",
      "npc_sb_luwei"
    ],
    "sourceProblems": [],
    "sharedMemoryIds": [
      "memory_sb_depth_shared_7",
      "memory_sb_depth_shared_8"
    ]
  },
  {
    "id": "sb-cohort-5",
    "participants": [
      "npc_sb_shikui",
      "npc_sb_kongliu",
      "npc_sb_feiqing",
      "npc_sb_shangyun"
    ],
    "sourceProblems": [],
    "sharedMemoryIds": [
      "memory_sb_depth_shared_9",
      "memory_sb_depth_shared_10"
    ]
  },
  {
    "id": "sb-cohort-6",
    "participants": [
      "npc_sb_chishan",
      "npc_sb_chayue",
      "npc_sb_qinwan",
      "npc_sb_longfu"
    ],
    "sourceProblems": [],
    "sharedMemoryIds": [
      "memory_sb_depth_shared_11",
      "memory_sb_depth_shared_12"
    ]
  },
  {
    "id": "sb-cohort-7",
    "participants": [
      "npc_sb_zhuxian",
      "npc_sb_fuyu",
      "npc_sb_quanli"
    ],
    "sourceProblems": [],
    "sharedMemoryIds": [
      "memory_sb_depth_shared_13",
      "memory_sb_depth_shared_14"
    ]
  },
  {
    "id": "sb-cohort-8",
    "participants": [
      "npc_sb_yanjue",
      "npc_sb_xianghe",
      "npc_sb_diye"
    ],
    "sourceProblems": [],
    "sharedMemoryIds": [
      "memory_sb_depth_shared_14",
      "memory_sb_depth_shared_15"
    ]
  }
];
const rows=[
  {
    "id": "npc_sb_zhangluo",
    "baseHash": "20bbdaa3d847dae445e95ed3e820d586705302515251d085c0ea046f7a67fb8e",
    "issues": [
      {
        "id": "npc_sb_zhangluo",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhangluo",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "请缺席户补说过可用时间",
          "source": "npc_sb_zhangluo",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "张洛与袁卿在桑坡树地谈过修枝工与采叶工安排；张洛坚持已确认的轮次，袁卿希望先理枝，重排尚未商定。",
          "source": "npc_sb_zhangluo",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "袁卿希望先理的具体枝位会影响哪一户已确认的采叶轮次。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "缺席的换工户这次何时能出人，是否需要留人在家照顾。"
      },
      {
        "path": "voice.register",
        "value": "问工日时简短直接，改轮次时容易先追究是谁没讲清"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "先请袁卿指出需理枝的树，再圈出会受影响的采叶轮次。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "逐户问摘叶和理枝各能出人的时段，把未应答处留空。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下次排轮时请缺人的户先说明照护时段，再请本人复核记录。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_1",
          "event": "张洛与袁卿在桑坡树地谈过修枝工与采叶工安排；张洛坚持已确认的轮次，袁卿希望先理枝，重排尚未商定。",
          "location": "loc_sb_orchard",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhangluo",
            "npc_sb_yuanqing"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "张纭与张洛同住张洛户居处，在家中见面；母亲总说换工排错是别人没讲清。"
      },
      {
        "path": "relationships[1].note",
        "value": "严牧与张洛同住张洛户居处，在家中见面；饭时家里仍围着讨论工日的人。"
      },
      {
        "path": "relationships[2].note",
        "value": "何宛与张洛同住张洛户居处，在家中见面；记得旧换工规矩却没人耐心听。"
      }
    ]
  },
  {
    "id": "npc_sb_yuanqing",
    "baseHash": "882f820f2d4b3c5bbd4e69f75c3d9ae877d84a84956bd185e04ad3194130bb54",
    "issues": [
      {
        "id": "npc_sb_yuanqing",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "notes",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "personality.flaws[0]",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "personality.description",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_yuanqing",
        "field": "authoredFacts.flaw",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "剔过一枝明显枯枝",
          "source": "npc_sb_yuanqing",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "张洛与袁卿在桑坡树地谈过修枝工与采叶工安排；张洛坚持已确认的轮次，袁卿希望先理枝，重排尚未商定。",
          "source": "npc_sb_yuanqing",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "邻户希望自己何时修哪一处枝，才能让晾布边避开树影。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "张洛记录的采叶轮次中，哪一户愿意重议理枝先后。"
      },
      {
        "path": "voice.register",
        "value": "谈树势时语气稳，邻人质疑修枝便硬起来"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "陪晾布户到西晒处指出遮影的枝，先问物主接受哪种修法。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "在晒处比对不同时辰的树影，问邻户哪一段最妨碍日常晾布。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "改枝前说明对树势的顾虑，请邻人说清要保留的晾布边。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_1",
          "event": "张洛与袁卿在桑坡树地谈过修枝工与采叶工安排；张洛坚持已确认的轮次，袁卿希望先理枝，重排尚未商定。",
          "location": "loc_sb_orchard",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhangluo",
            "npc_sb_yuanqing"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "袁霁与袁卿同住袁卿户居处，在家中见面；想画树影给父亲看又怕被说多事。"
      },
      {
        "path": "relationships[1].note",
        "value": "楚倩与袁卿同住袁卿户居处，在家中见面；丈夫和晾布户吵时两边都来问她。"
      },
      {
        "path": "relationships[2].note",
        "value": "尤甘与袁卿同住袁卿户居处，在家中见面；露树根使自己出门要绕远。"
      },
      {
        "path": "notes",
        "value": "桑树修枝农户；桑枝遮住邻家晾布边；认定邻人不懂树，常拒听对方的修枝意见。"
      },
      {
        "path": "personality.flaws[0]",
        "value": "认定邻人不懂树，常拒听对方的修枝意见"
      },
      {
        "path": "personality.description",
        "value": "稳重，做事按树势和先后次序来，答应过的事会记在心上；执拗起来也难劝。毛病是认定邻人不懂树，常拒听对方的修枝意见，容易把商量的门关窄。"
      },
      {
        "path": "authoredFacts.flaw",
        "value": "认定邻人不懂树，常拒听对方的修枝意见"
      }
    ]
  },
  {
    "id": "npc_sb_zhonglan",
    "baseHash": "ab6b01fb6d12343e256dcc742586af6835674df307a7d84650741cc57e8bdc5a",
    "issues": [
      {
        "id": "npc_sb_zhonglan",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhonglan",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "向接料人说过里层仍湿",
          "source": "npc_sb_zhonglan",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "钟岚与田陌在桑坡树地争过采叶后的收工界线；钟岚要分清叶料，田陌希望采完就休息，分拣范围尚未商定。",
          "source": "npc_sb_zhonglan",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "田陌愿不愿把采下的叶料粗分后交接，愿意分到哪一种程度。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "里层仍湿的那堆叶何时能翻散，接料人是否愿意等到翻检后再接。"
      },
      {
        "path": "voice.register",
        "value": "交叶料时说得细，别人动过叶堆便追问个不停"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "逐堆翻看里层，把潮叶所在的位置与接料人核对。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "交叶时把表层与里层分别展示，请接料人复述看到的状态。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一次交接先说明仍湿处，再问接料人是否愿意接下。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_2",
          "event": "钟岚与田陌在桑坡树地争过采叶后的收工界线；钟岚要分清叶料，田陌希望采完就休息，分拣范围尚未商定。",
          "location": "loc_sb_orchard",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhonglan",
            "npc_sb_tianmo"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "钟苡与钟岚同住钟岚户居处，在家中见面；母亲说湿叶脏却不让她帮翻。"
      },
      {
        "path": "relationships[1].note",
        "value": "赫扬与钟岚同住钟岚户居处，在家中见面；妻子老怀疑别人碰过叶堆。"
      },
      {
        "path": "relationships[2].note",
        "value": "梁芬与钟岚同住钟岚户居处，在家中见面；女儿分拣后的碎叶放得太久。"
      }
    ]
  },
  {
    "id": "npc_sb_tianmo",
    "baseHash": "f39c633a0b7be6eb267b526f177f5efc2f36f40dee6f69dcb51bce3689cd8697",
    "issues": [
      {
        "id": "npc_sb_tianmo",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_tianmo",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "补做过赌约的地面清理",
          "source": "npc_sb_tianmo",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "钟岚与田陌在桑坡树地争过采叶后的收工界线；钟岚要分清叶料，田陌希望采完就休息，分拣范围尚未商定。",
          "source": "npc_sb_tianmo",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "钟岚认为叶料要分拣到哪一种程度才可以交接。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "雇他采叶的人愿不愿把细拣另约，还是要求采后当场分开细梗。"
      },
      {
        "path": "voice.register",
        "value": "说话快且爱逞能，被指出带梗时容易抢着辩解"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "放慢落手前的动作，先指给物主看自己要避开的细梗。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请分拣人查看一小束采叶，问夹梗从哪处落手造成。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "接下一次采叶活前说清能做到的粗分程度，请物主确认。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_2",
          "event": "钟岚与田陌在桑坡树地争过采叶后的收工界线；钟岚要分清叶料，田陌希望采完就休息，分拣范围尚未商定。",
          "location": "loc_sb_orchard",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhonglan",
            "npc_sb_tianmo"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "田柔与田陌同住田陌户居处，在家中见面；兄长拿采叶速度打赌让她担心。"
      },
      {
        "path": "relationships[1].note",
        "value": "占玉与田陌同住田陌户居处，在家中见面；儿子赌输后不想再替他解释。"
      },
      {
        "path": "relationships[2].note",
        "value": "韩宜与田陌同住田陌户居处，在家中见面；想跟舅舅采叶却被安排留在干路。"
      }
    ]
  },
  {
    "id": "npc_sb_zhenyun",
    "baseHash": "b9e7793576062e1dff5a36acef1a797148e490639f9d8c619064e682f9a3dc31",
    "issues": [
      {
        "id": "npc_sb_zhenyun",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhenyun",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "请后辈帮忙重排过旧记号",
          "source": "npc_sb_zhenyun",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "甄芸与顾露在桑坂换工屋谈过窗边亮处的使用；甄芸要辨壳，顾露要摊晒位原签，先后尚未商定。",
          "source": "npc_sb_zhenyun",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "顾露要在窗边核对哪一张晒位原签，需要多少时间。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "后辈看旧壳缺口时，究竟是记号认不清还是破口本身分不出。"
      },
      {
        "path": "voice.register",
        "value": "讲挑壳理由缓慢耐心，听见省事的说法便带责备"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "在亮处把易混的旧壳逐个摊开，指出自己能看清的破口。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请后辈说出两只近重旧壳的缺口差异，认不出的地方再示范。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "把一次挑看的理由口述给接手人，请对方复述哪些破口仍有疑问。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_3",
          "event": "甄芸与顾露在桑坂换工屋谈过窗边亮处的使用；甄芸要辨壳，顾露要摊晒位原签，先后尚未商定。",
          "location": "bld_sb_hall",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhenyun",
            "npc_sb_gulu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "甄梨与甄芸同住甄芸户居处，在家中见面；母亲挑壳慢了不肯承认眼花。"
      },
      {
        "path": "relationships[1].note",
        "value": "陈树与甄芸同住甄芸户居处，在家中见面；旧壳堆在窗边挡着开窗。"
      },
      {
        "path": "relationships[2].note",
        "value": "甄灏与甄芸同住甄芸户居处，在家中见面；想碰祖母的旧壳又怕压碎。"
      }
    ]
  },
  {
    "id": "npc_sb_gulu",
    "baseHash": "350df5ac2b1ff1cf99264694f57863c9dd2370f317664e17b7025b90b1b4e0fd",
    "issues": [
      {
        "id": "npc_sb_gulu",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_gulu",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_gulu",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_gulu",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_gulu",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_gulu",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_gulu",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_gulu",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_gulu",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_gulu",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_gulu",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_gulu",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "向一户收回过未经确认的口头答应",
          "source": "npc_sb_gulu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "甄芸与顾露在桑坂换工屋谈过窗边亮处的使用；甄芸要辨壳，顾露要摊晒位原签，先后尚未商定。",
          "source": "npc_sb_gulu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "甄芸辨哪一批壳最需要窗边亮处，何时愿意暂停一会。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "两户原签上的空架记号各指哪一段工时，是否包含收尾。"
      },
      {
        "path": "voice.register",
        "value": "报晒位时干脆冷淡，核对争签则逐项念原记号"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "请占同一空架的双方各带原记号，先读出各自记录的时段。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "把争签处指给双方看，各问一次是否同意所读时段。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一次有人来问空架，先问晒物与时段，再按待核对的记号回答。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_3",
          "event": "甄芸与顾露在桑坂换工屋谈过窗边亮处的使用；甄芸要辨壳，顾露要摊晒位原签，先后尚未商定。",
          "location": "bld_sb_hall",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhenyun",
            "npc_sb_gulu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "顾柚与顾露同住顾露户居处，在家中见面；母亲对生面孔过于冷淡。"
      },
      {
        "path": "relationships[1].note",
        "value": "怀亭与顾露同住顾露户居处，在家中见面；熟人借晒架都来家里讲情面。"
      },
      {
        "path": "relationships[2].note",
        "value": "年姝与顾露同住顾露户居处，在家中见面；女儿在家仍大声念空架工时。"
      }
    ]
  },
  {
    "id": "npc_sb_yexun",
    "baseHash": "982384af02ef267fc7cd4b4fc70e9ff1456742c5840d53c32c04ba0a6eb023d3",
    "issues": [
      {
        "id": "npc_sb_yexun",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_yexun",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_yexun",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_yexun",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_yexun",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yexun",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yexun",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yexun",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_yexun",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_yexun",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_yexun",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_yexun",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "重新说明过自己留下的浅划痕",
          "source": "npc_sb_yexun",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "叶荀与竺钗在梭架修整院争过留样木屑与入灶过道；叶荀想留比对样屑，竺钗怕木屑带进灶口，清理时点尚未商定。",
          "source": "npc_sb_yexun",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "竺钗认为灶口哪一段过道还会带进留样木屑。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "物主送来这只木梭时原先缺边在哪里，是否还记得缺边出现的时机。"
      },
      {
        "path": "voice.register",
        "value": "说物件时专注而尖刻，别人催粗活便讥讽物主"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "在物主面前翻看木梭，先圈出双方都看见的缺口。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "把自己的检看记录读给物主，未确认的旧痕单列询问。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下次接旧梭先让物主认原缺口，再说明自己的修整范围。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_4",
          "event": "叶荀与竺钗在梭架修整院争过留样木屑与入灶过道；叶荀想留比对样屑，竺钗怕木屑带进灶口，清理时点尚未商定。",
          "location": "bld_sb_yard",
          "salience": 3,
          "knownBy": [
            "npc_sb_yexun",
            "npc_sb_zhuchai"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "叶芝与叶荀同住叶荀户居处，在家中见面；父亲说别人的木梭笨让她不敢问。"
      },
      {
        "path": "relationships[1].note",
        "value": "姜茹与叶荀同住叶荀户居处，在家中见面；丈夫刻薄的话总要自己替他圆。"
      },
      {
        "path": "relationships[2].note",
        "value": "佘文与叶荀同住叶荀户居处，在家中见面；女婿做错仍嘴硬使他不愿搭话。"
      }
    ]
  },
  {
    "id": "npc_sb_zhuchai",
    "baseHash": "0fe8756a80b110870529f833376281a6a26bffc6407f007df7662951ef8c7ec2",
    "issues": [
      {
        "id": "npc_sb_zhuchai",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhuchai",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "向被抢活的帮工说明过缘由",
          "source": "npc_sb_zhuchai",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "叶荀与竺钗在梭架修整院争过留样木屑与入灶过道；叶荀想留比对样屑，竺钗怕木屑带进灶口，清理时点尚未商定。",
          "source": "npc_sb_zhuchai",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "叶荀哪一份样屑还需比对，何时愿意把其余过道清出来。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "被抢活的帮工愿不愿再搭手，想自己保留哪一道灶边工序。"
      },
      {
        "path": "voice.register",
        "value": "安排灶边活计说得急，看到慢动作容易抢着动手"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "先问帮工手上做到哪一步，让对方把这一段自行做完。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "把要空出的灶边位置指明，请帮工选择愿做的一步再开工。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "忙前问愿来搭手的人能承担哪些工序，把生熟容器摆放逐一说明。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_4",
          "event": "叶荀与竺钗在梭架修整院争过留样木屑与入灶过道；叶荀想留比对样屑，竺钗怕木屑带进灶口，清理时点尚未商定。",
          "location": "bld_sb_yard",
          "salience": 3,
          "knownBy": [
            "npc_sb_yexun",
            "npc_sb_zhuchai"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "竺梅与竺钗同住竺钗户居处，在家中见面；看母亲抢别人的活后怕上前帮忙。"
      },
      {
        "path": "relationships[1].note",
        "value": "卜贞与竺钗同住竺钗户居处，在家中见面；女儿总替自己做完轻活。"
      },
      {
        "path": "relationships[2].note",
        "value": "郜启与竺钗同住竺钗户居处，在家中见面；妻子嫌自己摆碗慢老要夺过去。"
      }
    ]
  },
  {
    "id": "npc_sb_panyao",
    "baseHash": "94b75ead4d4aa15cecb6de04a66c96f1d3596348bc51da0bfcd40ae410e039a4",
    "issues": [
      {
        "id": "npc_sb_panyao",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_panyao",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_panyao",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_panyao",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_panyao",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_panyao",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_panyao",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_panyao",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_panyao",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_panyao",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_panyao",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_panyao",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "向物主说明过不能保证不再裂",
          "source": "npc_sb_panyao",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "潘瑶与高枢在晒线缝补屋谈过补绣与摇架的工序；潘瑶要安静数针，高枢需摇架检看异响，避让时段尚未商定。",
          "source": "npc_sb_panyao",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "高枢检架必须摇动的那一段何时开始，自己哪段数针会受影响。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "物主愿不愿保留已经磨薄的旧纹，还是接受拆开局部重补。"
      },
      {
        "path": "voice.register",
        "value": "说针线时慢而细，为保体面容易把不能补的地方绕过去"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "与物主对光看磨薄衣纹，把可能再裂的位置逐处指出。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请物主分别确认能补的部分与无法保证不裂的部分。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下次接旧衣时先说明布底状况，再请物主决定是否保留原纹。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_5",
          "event": "潘瑶与高枢在晒线缝补屋谈过补绣与摇架的工序；潘瑶要安静数针，高枢需摇架检看异响，避让时段尚未商定。",
          "location": "bld_sb_workroom",
          "salience": 3,
          "knownBy": [
            "npc_sb_panyao",
            "npc_sb_gaoshu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "潘蕊与潘瑶同住潘瑶户居处，在家中见面；母亲不会的纹样也不愿明说。"
      },
      {
        "path": "relationships[1].note",
        "value": "胡丕与潘瑶同住潘瑶户居处，在家中见面；待补的衣物越来越占坐处。"
      },
      {
        "path": "relationships[2].note",
        "value": "潘昕与潘瑶同住潘瑶户居处，在家中见面；不懂布破了为何还要保住花纹。"
      }
    ]
  },
  {
    "id": "npc_sb_gaoshu",
    "baseHash": "51fdc6a49117a5454fe641c8b7dee2da301d3fe5f27f3450d46f1b282785fb61",
    "issues": [
      {
        "id": "npc_sb_gaoshu",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_gaoshu",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "重新说清过尚未确定的响源",
          "source": "npc_sb_gaoshu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "潘瑶与高枢在晒线缝补屋谈过补绣与摇架的工序；潘瑶要安静数针，高枢需摇架检看异响，避让时段尚未商定。",
          "source": "npc_sb_gaoshu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "潘瑶哪一段细纹正在数针，何时能避开摇架的检看。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "使用者所说的织架异响究竟出在哪一处接合，空架时能否重现。"
      },
      {
        "path": "voice.register",
        "value": "检架时说得谨慎，未亲查的结论总要反复追问"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "等空机时逐处摇查接合，把听到异响处与未发现处分别记下。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请使用者描述发响时的动作，再与空架检看结果逐项比较。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一次交还检看记录时把确定的松动和仍未查明的响源分开说明。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_5",
          "event": "潘瑶与高枢在晒线缝补屋谈过补绣与摇架的工序；潘瑶要安静数针，高枢需摇架检看异响，避让时段尚未商定。",
          "location": "bld_sb_workroom",
          "salience": 3,
          "knownBy": [
            "npc_sb_panyao",
            "npc_sb_gaoshu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "高槿与高枢同住高枢户居处，在家中见面；自己已检查的地方父亲总要重看。"
      },
      {
        "path": "relationships[1].note",
        "value": "施萝与高枢同住高枢户居处，在家中见面；丈夫听到异响就整顿饭想着架子。"
      },
      {
        "path": "relationships[2].note",
        "value": "敦瑜与高枢同住高枢户居处，在家中见面；屋里的窗常为木件检看敞开。"
      }
    ]
  },
  {
    "id": "npc_sb_zhouwei",
    "baseHash": "b9271064c2fcf97466e6f002d2b9136c2f2d81b506f79d2bc8393644e8d8c93e",
    "issues": [
      {
        "id": "npc_sb_zhouwei",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhouwei",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "坐在门边听过一次旧地名争论",
          "source": "npc_sb_zhouwei",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "周薇与丛思在桑坂村谈过门前视线与晾线位置；周薇要看得到路人，丛思想让线束避开穿行处，位置尚未商定。",
          "source": "npc_sb_zhouwei",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "丛思愿意把晾线位置挪到哪一边，才能同时避开穿行和门前视线。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "周芬觉得门前哪件晒物必须留下，何时方便一起调整遮眼处。"
      },
      {
        "path": "voice.register",
        "value": "说家门口的事亲切缓慢，被替自己安排坐处时固执"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "坐在惯常位置指给家人看哪件晒物挡住路，再问能挪哪一件。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请家人站在门前比较能看见行人的位置，让自己试坐后再议。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "邀路过的熟邻在门外说一会近况，若要改坐处则先说自己的选择。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_6",
          "event": "周薇与丛思在桑坂村谈过门前视线与晾线位置；周薇要看得到路人，丛思想让线束避开穿行处，位置尚未商定。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhouwei",
            "npc_sb_congsi"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "周芬与周薇同住周薇户居处，在家中见面；母亲门前坐处和晾物总要争空间。"
      },
      {
        "path": "relationships[1].note",
        "value": "厉乐与周薇同住周薇户居处，在家中见面；听祖母讲旧地名却记不全。"
      },
      {
        "path": "relationships[2].note",
        "value": "戎平与周薇同住周薇户居处，在家中见面；不想替妻子决定老人坐哪边。"
      }
    ]
  },
  {
    "id": "npc_sb_congsi",
    "baseHash": "66bcf41a3bf666c646c129fce756184c4f23633a13e7f720e972613f3ad59a62",
    "issues": [
      {
        "id": "npc_sb_congsi",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_congsi",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_congsi",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_congsi",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_congsi",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_congsi",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_congsi",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_congsi",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_congsi",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_congsi",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_congsi",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_congsi",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "向熟手演示过自己的结尾动作",
          "source": "npc_sb_congsi",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "周薇与丛思在桑坂村谈过门前视线与晾线位置；周薇要看得到路人，丛思想让线束避开穿行处，位置尚未商定。",
          "source": "npc_sb_congsi",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "周薇坐在门边看路时，哪一段晾线位置最遮眼。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "熟手看自己练习束的收尾手势后，认为回松原因在哪一处。"
      },
      {
        "path": "voice.register",
        "value": "解释绕束时说得细，出错时语气紧而爱辩解"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "拆开自己的回松练习束，先把结尾动作演给熟手看。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请熟手指出收尾手势中紧松变化的位置，再用自己的练习线试做。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "每次收束后先观察回弹，再把仍分不清的紧松处拿给熟手看。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_6",
          "event": "周薇与丛思在桑坂村谈过门前视线与晾线位置；周薇要看得到路人，丛思想让线束避开穿行处，位置尚未商定。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhouwei",
            "npc_sb_congsi"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "丛雅与丛思同住丛思户居处，在家中见面；女儿绕线乱了总说别人碰过。"
      },
      {
        "path": "relationships[1].note",
        "value": "常璐与丛思同住丛思户居处，在家中见面；想安慰同住者又怕说成教训。"
      },
      {
        "path": "relationships[2].note",
        "value": "丛祺与丛思同住丛思户居处，在家中见面；姐姐不让自己碰练习线束。"
      }
    ]
  },
  {
    "id": "npc_sb_maoli",
    "baseHash": "ba72d4f525121e2b2cfe5a2af5f756ca2ad82af876aa12a00a6158a4ff2af248",
    "issues": [
      {
        "id": "npc_sb_maoli",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_maoli",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_maoli",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_maoli",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_maoli",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_maoli",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_maoli",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_maoli",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_maoli",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_maoli",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_maoli",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_maoli",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "清回过被自己推走的叶泥",
          "source": "npc_sb_maoli",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "茅俪与解安在桑坡边沟田谈过清沟与空架暂放；茅俪催雨前清沟，解安要平整处检看空架，暂放位置尚未商定。",
          "source": "npc_sb_maoli",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "解安的空架哪一部分占到待清边沟，何时愿意重议暂放处。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "邻段沟口的积叶来自哪一处，邻户愿意先清哪一段。"
      },
      {
        "path": "voice.register",
        "value": "说排水直且急，雨前容易连续催邻户动手"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "沿沟指出堵水的积叶位置，请邻户到场看来源再商量先后。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "先说明自家叶泥要清回哪里，再请邻户说可一起清沟的时段。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "雨前提前问邻户可用工时，把沟口仍需共看的位置留下再议。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_7",
          "event": "茅俪与解安在桑坡边沟田谈过清沟与空架暂放；茅俪催雨前清沟，解安要平整处检看空架，暂放位置尚未商定。",
          "location": "loc_sb_fields",
          "salience": 3,
          "knownBy": [
            "npc_sb_maoli",
            "npc_sb_jiean"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "茅萱与茅俪同住茅俪户居处，在家中见面；母亲催邻人清沟的话太急。"
      },
      {
        "path": "relationships[1].note",
        "value": "赵锦与茅俪同住茅俪户居处，在家中见面；妻子雨前催自己也去争沟口。"
      },
      {
        "path": "relationships[2].note",
        "value": "温娜与茅俪同住茅俪户居处，在家中见面；想保留沟边旧坐石却挡清沟路。"
      }
    ]
  },
  {
    "id": "npc_sb_jiean",
    "baseHash": "82866ac72187dae8dc1c7cb3d9143c68326e9961a6a807ec6c01b76f0fd2a251",
    "issues": [
      {
        "id": "npc_sb_jiean",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_jiean",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_jiean",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_jiean",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_jiean",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_jiean",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_jiean",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_jiean",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_jiean",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_jiean",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_jiean",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_jiean",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "停下修补请物主重说过用法",
          "source": "npc_sb_jiean",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "茅俪与解安在桑坡边沟田谈过清沟与空架暂放；茅俪催雨前清沟，解安要平整处检看空架，暂放位置尚未商定。",
          "source": "npc_sb_jiean",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "茅俪清沟要先腾出哪一段，空架是否有能经双方同意的暂放处。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "使用者把湿盆放在架子的哪一边，是否愿意一起查看偏脚磨痕与摆盆方向。"
      },
      {
        "path": "voice.register",
        "value": "问用架方式简短少言，被催促时常沉默停住"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "空架时请使用者指摆盆方向，再对照偏脚磨痕。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "把能看见的磨痕指出给物主，问是否需要调整便于检看的摆法。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一次接架先问使用方式，再请物主看哪些磨损便于自行察觉。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_7",
          "event": "茅俪与解安在桑坡边沟田谈过清沟与空架暂放；茅俪催雨前清沟，解安要平整处检看空架，暂放位置尚未商定。",
          "location": "loc_sb_fields",
          "salience": 3,
          "knownBy": [
            "npc_sb_maoli",
            "npc_sb_jiean"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "解莹与解安同住解安户居处，在家中见面；丈夫修架沉默让送活人误会。"
      },
      {
        "path": "relationships[1].note",
        "value": "解骏与解安同住解安户居处，在家中见面；想看父亲的架脚却怕被叫远离。"
      },
      {
        "path": "relationships[2].note",
        "value": "伊苗与解安同住解安户居处，在家中见面；儿子工作不顺也不肯说缘由。"
      }
    ]
  },
  {
    "id": "npc_sb_baishu",
    "baseHash": "d45ced42a8b517aac7b2bdb8691a04069894416ee4da65dc47177b37ecec4712",
    "issues": [
      {
        "id": "npc_sb_baishu",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_baishu",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_baishu",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_baishu",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_baishu",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_baishu",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_baishu",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_baishu",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_baishu",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_baishu",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_baishu",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_baishu",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "对听过的人解释过没亲见",
          "source": "npc_sb_baishu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "白舒与鲁玮在桑坂村谈过晒布与搬架过道；白舒怕布被碰落，鲁玮说转弯要留宽处，过道宽度尚未商定。",
          "source": "npc_sb_baishu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "鲁玮抬架转弯必须留出哪一段过道，晾布边能否另留位置。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "听过自己猜话的人中，谁仍把未亲见的家事当成了确切消息。"
      },
      {
        "path": "voice.register",
        "value": "闲聊温和绕弯，常从布色引到别人家事"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "向听过猜话的人说明自己只是按布色猜的，再问对方听成什么。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "把亲见的晒布样子和自己猜的家事分开说，问听者有无误解。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "再次有人谈那家事时先指出自己没亲见，不再用布色作确证。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_8",
          "event": "白舒与鲁玮在桑坂村谈过晒布与搬架过道；白舒怕布被碰落，鲁玮说转弯要留宽处，过道宽度尚未商定。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_baishu",
            "npc_sb_luwei"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "白涵与白舒同住白舒户居处，在家中见面；母亲从晒布猜人家事让他难为情。"
      },
      {
        "path": "relationships[1].note",
        "value": "滕梓与白舒同住白舒户居处，在家中见面；妻子说闲话时不愿听自己劝。"
      },
      {
        "path": "relationships[2].note",
        "value": "白蓉与白舒同住白舒户居处，在家中见面；祖母的猜话为什么被人当真。"
      }
    ]
  },
  {
    "id": "npc_sb_luwei",
    "baseHash": "048b92cdd374d36349d679ee92713d5720eed9eaac10a874a466bad51020d6bc",
    "issues": [
      {
        "id": "npc_sb_luwei",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_luwei",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_luwei",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_luwei",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_luwei",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_luwei",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_luwei",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_luwei",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_luwei",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_luwei",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_luwei",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_luwei",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "被同伴指出过总挑轻头",
          "source": "npc_sb_luwei",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "白舒与鲁玮在桑坂村谈过晒布与搬架过道；白舒怕布被碰落，鲁玮说转弯要留宽处，过道宽度尚未商定。",
          "source": "npc_sb_luwei",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "白舒的哪一块晾布容易被转弯的架子碰落。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "搭工者愿意按哪一种次序轮换轻重两头，能否把不平路段也算进去。"
      },
      {
        "path": "voice.register",
        "value": "接搬架活时爽快，谈轮肩时会往自己省力处说"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "先和搭工者走一次转弯路线，标出路不平和需要换肩的位置。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "开抬前请搭工者确认第一段各站哪头，下一段如何轮替。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "再搭伙时请同伴指出上次分工不平处，重议自己承担的路段。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_8",
          "event": "白舒与鲁玮在桑坂村谈过晒布与搬架过道；白舒怕布被碰落，鲁玮说转弯要留宽处，过道宽度尚未商定。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_baishu",
            "npc_sb_luwei"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "鲁芸与鲁玮同住鲁玮户居处，在家中见面；丈夫挑轻活使她被邻人问起。"
      },
      {
        "path": "relationships[1].note",
        "value": "鲁欣与鲁玮同住鲁玮户居处，在家中见面；父亲抬架出门不让自己跟。"
      },
      {
        "path": "relationships[2].note",
        "value": "吴佳与鲁玮同住鲁玮户居处，在家中见面；明知儿子挑轻头仍想替他说话。"
      }
    ]
  },
  {
    "id": "npc_sb_shikui",
    "baseHash": "3d8805172d36e8a3a750a4090310d38e06ebf9cd80b0f1e0037021dfaf86503f",
    "issues": [
      {
        "id": "npc_sb_shikui",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_shikui",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_shikui",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_shikui",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_shikui",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_shikui",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_shikui",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_shikui",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_shikui",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_shikui",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_shikui",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_shikui",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "补写过未说明的清理工序",
          "source": "npc_sb_shikui",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "史葵与孔柳在桑坂换工屋谈过公共桌上的原契与描样；史葵要按人分放原契，孔柳需摊平转角纸样，桌面分用尚未商定。",
          "source": "npc_sb_shikui",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "孔柳摊平转角纸样需要哪一块桌面，是否会碰到分户的原契。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "工约双方说的帮忙究竟包含哪一道清理工序，何时算收尾。"
      },
      {
        "path": "voice.register",
        "value": "读约定平稳逐句，外乡人说得快便多追问几遍"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "请双方分别描述帮忙的实际动作，把含糊处圈出再读回。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "逐句问当事人原工事与清理工序是否都已说清，未应答处留待补说。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "给不识字的当事人读回约定，请对方用自己的话复述劳动范围。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_9",
          "event": "史葵与孔柳在桑坂换工屋谈过公共桌上的原契与描样；史葵要按人分放原契，孔柳需摊平转角纸样，桌面分用尚未商定。",
          "location": "bld_sb_hall",
          "salience": 3,
          "knownBy": [
            "npc_sb_shikui",
            "npc_sb_kongliu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "史兰与史葵同住史葵户居处，在家中见面；母亲总怀疑说快话的外乡人。"
      },
      {
        "path": "relationships[1].note",
        "value": "曾宜与史葵同住史葵户居处，在家中见面；家中常来人问约定字句。"
      },
      {
        "path": "relationships[2].note",
        "value": "傅槿与史葵同住史葵户居处，在家中见面；旧草契被当废纸使她舍不得。"
      }
    ]
  },
  {
    "id": "npc_sb_kongliu",
    "baseHash": "cc2e36cdc8366cc892a774211bd384fd4fdd0f6e7652ce67b581db1868024dd4",
    "issues": [
      {
        "id": "npc_sb_kongliu",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_kongliu",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "请缝补者指出过对不上处",
          "source": "npc_sb_kongliu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "史葵与孔柳在桑坂换工屋谈过公共桌上的原契与描样；史葵要按人分放原契，孔柳需摊平转角纸样，桌面分用尚未商定。",
          "source": "npc_sb_kongliu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "史葵要分户放开的原契占哪一处，自己的角边纸样何时能摊平。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "缝补者认为这张边样在哪一个转角接不上直边。"
      },
      {
        "path": "voice.register",
        "value": "问样线时爱比较且好强，描偏后语速会加快"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "在废纸上分开试描直边和角边，请缝补者指对不上的一处。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "将两段试样并排比较，逐处问转折需朝哪个方向。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "向缝补者解释自己试描的转折理由，再问按它裁缝是否仍接不上。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_9",
          "event": "史葵与孔柳在桑坂换工屋谈过公共桌上的原契与描样；史葵要按人分放原契，孔柳需摊平转角纸样，桌面分用尚未商定。",
          "location": "bld_sb_hall",
          "salience": 3,
          "knownBy": [
            "npc_sb_shikui",
            "npc_sb_kongliu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "孔芝与孔柳同住孔柳户居处，在家中见面；女儿描线偏了就要擦掉整张。"
      },
      {
        "path": "relationships[1].note",
        "value": "褚惠与孔柳同住孔柳户居处，在家中见面；想看懂女儿画的角边为什么不合。"
      },
      {
        "path": "relationships[2].note",
        "value": "孔琳与孔柳同住孔柳户居处，在家中见面；姐姐叫自己试描又嫌她太慢。"
      }
    ]
  },
  {
    "id": "npc_sb_feiqing",
    "baseHash": "3a7a194bab50c825f3348d76ac3d2a06d17dce1153f192f67db6fe894afaddfb",
    "issues": [
      {
        "id": "npc_sb_feiqing",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_feiqing",
        "field": "relationships[1].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "当面劝人放下梯子改日再用",
          "source": "npc_sb_feiqing",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "费清与商筠在桑坂村谈过旧梯停用与晾袋；费清坚持有疑问的梯先停用，商筠需要不借坏梯的晾位，替代位置尚未商定。",
          "source": "npc_sb_feiqing",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "商筠的湿袋能否用经物主同意的低处晾位，哪一处不需要旧梯。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "物主是否看见旧梯摇动的横档，何时愿意在场复查。"
      },
      {
        "path": "voice.register",
        "value": "劝停梯时严厉谨慎，谈梯脚落稳才愿继续说"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "请物主看松动横档，先说明在复查前停止转借的顾虑。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "对着原松档指出标记位置，请物主确认认得停用原因。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下次有人问借梯时先问是否见过松档标记，向物主转达借用请求。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_10",
          "event": "费清与商筠在桑坂村谈过旧梯停用与晾袋；费清坚持有疑问的梯先停用，商筠需要不借坏梯的晾位，替代位置尚未商定。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_feiqing",
            "npc_sb_shangyun"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "费玥与费清同住费清户居处，在家中见面；父亲总担心别人借走坏梯。"
      },
      {
        "path": "relationships[1].note",
        "value": "贺来与费清同住费清户居处，在家中见面；丈夫自己也踩旧梯却只责别人。"
      }
    ]
  },
  {
    "id": "npc_sb_shangyun",
    "baseHash": "be31165bbe093cb7604c2d0a05cf0a7cc559b81d5964d01e87c3cb7f93c83a65",
    "issues": [
      {
        "id": "npc_sb_shangyun",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_shangyun",
        "field": "relationships[2].note",
        "code": "relationship-note"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "向两户说明过认错可能",
          "source": "npc_sb_shangyun",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "费清与商筠在桑坂村谈过旧梯停用与晾袋；费清坚持有疑问的梯先停用，商筠需要不借坏梯的晾位，替代位置尚未商定。",
          "source": "npc_sb_shangyun",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "费清认为哪一架旧梯仍有疑问，低处哪些晾袋位置可以另问物主。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "两户认回褪记的袋时，各凭哪一段旧记号才能确认归属。"
      },
      {
        "path": "voice.register",
        "value": "说洗晾利落短促，难认的袋口记号常想留到稍后"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "把褪记袋分别晾开，逐户请物主认袋口，认不准的先留待核对。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "交袋前分别读出自己认得的旧记号，请物主复认而不按熟脸分袋。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "洗下一批袋前先询问记号能否重认，不能确认的部分留给物主处理。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_10",
          "event": "费清与商筠在桑坂村谈过旧梯停用与晾袋；费清坚持有疑问的梯先停用，商筠需要不借坏梯的晾位，替代位置尚未商定。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_feiqing",
            "npc_sb_shangyun"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "商雨与商筠同住商筠户居处，在家中见面；母亲袋上的旧字比书里难认。"
      },
      {
        "path": "relationships[1].note",
        "value": "苗冉与商筠同住商筠户居处，在家中见面；妻子把难认的湿袋越堆越多。"
      },
      {
        "path": "relationships[2].note",
        "value": "阙安与商筠同住商筠户居处，在家中见面；袋子晾到门边使进出不便。"
      }
    ]
  },
  {
    "id": "npc_sb_chishan",
    "baseHash": "693fd14385da4b79e08683843da4bd7e9e2c1243366c50fedd081ab9b6fcbe61",
    "issues": [
      {
        "id": "npc_sb_chishan",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_chishan",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_chishan",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_chishan",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_chishan",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_chishan",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_chishan",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_chishan",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_chishan",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_chishan",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_chishan",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_chishan",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_chishan",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_chishan",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "在根外试走过绕路",
          "source": "npc_sb_chishan",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "池杉与查悦在桑坂村谈过树下歇脚与候灶；池杉不愿树根反复受踩，查悦希望候灶人能听到叫名，候灶位置尚未商定。",
          "source": "npc_sb_chishan",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "查悦希望候灶人站在哪一边才能听清叫名，又不反复踏实树根。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "过路者愿意沿根外哪一条边绕行，自己能否保留篱边旧树。"
      },
      {
        "path": "voice.register",
        "value": "讲旧树慢而恋旧，别人要挪篱便带防备"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "陪过路者看突根，自己先试走根外路再问哪段难行。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请过路者指明便利的通行边，把护根顾虑说清后再议。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一次有人提砍树省路时先让对方看根外通路，询问能否保留树。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_11",
          "event": "池杉与查悦在桑坂村谈过树下歇脚与候灶；池杉不愿树根反复受踩，查悦希望候灶人能听到叫名，候灶位置尚未商定。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_chishan",
            "npc_sb_chayue"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "池芬与池杉同住池杉户居处，在家中见面；邻人问树根绕路总要她说服父亲。"
      },
      {
        "path": "relationships[1].note",
        "value": "颜博与池杉同住池杉户居处，在家中见面；丈夫嘴上说路好走自己也绕根。"
      },
      {
        "path": "relationships[2].note",
        "value": "池杉在桑坂村的日常往来中见过查悦，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "池杉在桑坂村的日常往来中见过查悦，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_chayue",
    "baseHash": "1dddada518f267e97437f1cedc0546ccaee929b8430fac8709c81f82788903b3",
    "issues": [
      {
        "id": "npc_sb_chayue",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_chayue",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_chayue",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_chayue",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_chayue",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_chayue",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_chayue",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_chayue",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_chayue",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_chayue",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_chayue",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_chayue",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_chayue",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_chayue",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "把清台也补入过记录",
          "source": "npc_sb_chayue",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "池杉与查悦在桑坂村谈过树下歇脚与候灶；池杉不愿树根反复受踩，查悦希望候灶人能听到叫名，候灶位置尚未商定。",
          "source": "npc_sb_chayue",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "池杉觉得候灶人在树下哪一段踩踏最伤根。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "争灶的两户各从何时开始计用灶时段，何时完成清台。"
      },
      {
        "path": "voice.register",
        "value": "记灶次时清楚而尖锐，争时段便翻出对方旧错"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "请争灶双方分别说开始与清台经过，先核对记录中未写清的部分。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "读回包含清台的候选时段，请双方说明仍不接受的起止点。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一轮登记前先问收尾需要多久，再让本人确认轮次。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_11",
          "event": "池杉与查悦在桑坂村谈过树下歇脚与候灶；池杉不愿树根反复受踩，查悦希望候灶人能听到叫名，候灶位置尚未商定。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_chishan",
            "npc_sb_chayue"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "查琳与查悦同住查悦户居处，在家中见面；母亲记灶次总翻别人的旧错。"
      },
      {
        "path": "relationships[1].note",
        "value": "舒琪与查悦同住查悦户居处，在家中见面；家里晚饭常因妻子处理灶争延后。"
      },
      {
        "path": "relationships[2].note",
        "value": "查悦在桑坂村的日常往来中见过秦婉，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "查悦在桑坂村的日常往来中见过秦婉，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_qinwan",
    "baseHash": "8ecc240aebdd6217034f9edb7327d3ddf1e80ae4b88dfdd222b0667dabbe7dfc",
    "issues": [
      {
        "id": "npc_sb_qinwan",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_qinwan",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "向亲属解释过不能插到前面",
          "source": "npc_sb_qinwan",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "秦婉与龙芙在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "source": "npc_sb_qinwan",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "催改衣的两位物主各希望何时拿回，哪件已先得到自己的答应。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "来催衣的亲属愿不愿等先答应的衣服做完后再来收自己的衣服。"
      },
      {
        "path": "voice.register",
        "value": "问衣服受紧处细致，亲属催活时语气容易放软"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "把两件衣各自的物主和先答应的顺序核对清楚，再分别说明能做的时段。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请亲属确认接受排在已有约定之后，未点头前不插入原顺序。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一次应下裁改前先查手上工序，再告诉物主自己能承诺的时间。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_12",
          "event": "秦婉与龙芙在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_qinwan",
            "npc_sb_longfu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "秦娴与秦婉同住秦婉户居处，在家中见面；亲属来催衣总请自己帮说情。"
      },
      {
        "path": "relationships[1].note",
        "value": "屠本与秦婉同住秦婉户居处，在家中见面；妻子多答应活又得熬夜收尾。"
      },
      {
        "path": "relationships[2].note",
        "value": "秦婉在桑坂村的日常往来中见过龙芙，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "秦婉在桑坂村的日常往来中见过龙芙，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_longfu",
    "baseHash": "cede1ddfa7aeb1d3e3846676985670501fc03f7f2222b764316e2353808a0fd5",
    "issues": [
      {
        "id": "npc_sb_longfu",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_longfu",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_longfu",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_longfu",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_longfu",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_longfu",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_longfu",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_longfu",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_longfu",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_longfu",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_longfu",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_longfu",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_longfu",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_longfu",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "取回过故意挡人的湿布",
          "source": "npc_sb_longfu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "秦婉与龙芙在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "source": "npc_sb_longfu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "用水者愿不愿先看自己已分好的苗，再朝避开苗位的一边转身。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "龙瑜觉得自己讲的旧例究竟在哪一步不适合眼前育苗。"
      },
      {
        "path": "voice.register",
        "value": "说育苗耐心但爱争理，别人不听便反复举旧例"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "先指出被溅倒的那一排苗，请用水者试站后再议转身方向。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请用水者复述自己要保留的苗位，双方各提一种避溅的转身动作。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下次分苗交手前先检查根系松开处，再向接手人说明不能压回的位置。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_12",
          "event": "秦婉与龙芙在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_qinwan",
            "npc_sb_longfu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "龙瑜与龙芙同住龙芙户居处，在家中见面；母亲反复说同一例子使他不耐烦。"
      },
      {
        "path": "relationships[1].note",
        "value": "雷思与龙芙同住龙芙户居处，在家中见面；妻子和用水户又因转身方向争执。"
      },
      {
        "path": "relationships[2].note",
        "value": "龙芙在桑坂村的日常往来中见过诸弦，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "龙芙在桑坂村的日常往来中见过诸弦，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_zhuxian",
    "baseHash": "ade1f8561e3e480b36037d4c0ad5035f88a28dc3917878c526b03d38ce0c78e7",
    "issues": [
      {
        "id": "npc_sb_zhuxian",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_zhuxian",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "找到实际搬动者后道了歉",
          "source": "npc_sb_zhuxian",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "诸弦与扶瑜在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "source": "npc_sb_zhuxian",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "实际搬板的人为什么把修好和待修木板堆到一起，愿不愿改暂放位置。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "毕祺觉得哪一处家中放料最碍洗晒，何时方便一起分开。"
      },
      {
        "path": "voice.register",
        "value": "谈木板直而急躁，发现乱放会抬高声音"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "先把两堆木板各指给搬动者看，问对方能否分开放待修与修好板。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "向下一道工序的人说明暂放边界，请其复认哪堆仍有毛刺。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "发现木料混放先问实际搬动者，再说明工序状态，避免指责路过的人。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_13",
          "event": "诸弦与扶瑜在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhuxian",
            "npc_sb_fuyu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "诸润与诸弦同住诸弦户居处，在家中见面；父亲大声斥责时她不敢靠近。"
      },
      {
        "path": "relationships[1].note",
        "value": "毕祺与诸弦同住诸弦户居处，在家中见面；丈夫错骂人后不好意思道歉。"
      },
      {
        "path": "relationships[2].note",
        "value": "诸弦在桑坂村的日常往来中见过扶瑜，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "诸弦在桑坂村的日常往来中见过扶瑜，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_fuyu",
    "baseHash": "439c9a0ae62d16547a7b7502fc3928f8af58886c5536bc7665575edce91612d9",
    "issues": [
      {
        "id": "npc_sb_fuyu",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_fuyu",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "请家人暂留下过一包作念想",
          "source": "npc_sb_fuyu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "诸弦与扶瑜在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "source": "npc_sb_fuyu",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "扶菁想先清掉桌上哪一部分旧叶，愿不愿留下自己指定的一小包。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "家中留下的干叶中哪一撮已变质，是否还值得继续分拣。"
      },
      {
        "path": "voice.register",
        "value": "讲旧叶温和平缓，谈清走旧物时仍坚持自己挑"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "把发霉的旧叶挑开给家人看，说明要留的那一小包只是念想。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "请家人把想清的叶分别指出，自己逐撮查是否已霉变。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "和家人约清轻活的范围，让自己先挑留念的旧叶再议清走其余。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_13",
          "event": "诸弦与扶瑜在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_zhuxian",
            "npc_sb_fuyu"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "扶菁与扶瑜同住扶瑜户居处，在家中见面；母亲反复拣旧叶占着家里桌面。"
      },
      {
        "path": "relationships[1].note",
        "value": "水雅与扶瑜同住扶瑜户居处，在家中见面；外祖母留下的小包旧叶有什么用。"
      },
      {
        "path": "relationships[2].note",
        "value": "扶瑜在桑坂村的日常往来中见过全立，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "扶瑜在桑坂村的日常往来中见过全立，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_quanli",
    "baseHash": "00b9a0c94d274ac6095b7211cfbe47fbce10b0d3d41837cda7ae0afcef847642",
    "issues": [
      {
        "id": "npc_sb_quanli",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_quanli",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_quanli",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_quanli",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_quanli",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_quanli",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_quanli",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_quanli",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_quanli",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_quanli",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_quanli",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_quanli",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_quanli",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_quanli",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "重画过园外的转弯记号",
          "source": "npc_sb_quanli",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "全立与晏珏在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "source": "npc_sb_quanli",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "园主愿不愿整理被垂枝遮住的路记，哪些枝位可以动。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "问路者究竟要到哪一处，是否误把自己指公路的话听成能进私园采叶。"
      },
      {
        "path": "voice.register",
        "value": "指路时简短含糊，谈私园入口才会多解释一句"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "陪问路者指认园外的转弯处，先说公共路走向再问其目的地。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "向有权者指出被遮的原路记，询问可整理的范围后再动手。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下次指路让来人复述转弯点，若误听成采叶许可就当面解释。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_14",
          "event": "全立与晏珏在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_quanli",
            "npc_sb_yanjue"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "全云与全立同住全立户居处，在家中见面；丈夫指路太省话被当作可进私园。"
      },
      {
        "path": "relationships[1].note",
        "value": "全成与全立同住全立户居处，在家中见面；路记像图画却被父亲说不能乱添。"
      },
      {
        "path": "relationships[2].note",
        "value": "全立在桑坂村的日常往来中见过晏珏，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "全立在桑坂村的日常往来中见过晏珏，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_yanjue",
    "baseHash": "cbcc5604728469f7ff8c8b1a72ccd4972c6222ee314dfd5b3cabb6f7e047cc14",
    "issues": [
      {
        "id": "npc_sb_yanjue",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_yanjue",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "用空格标过未认出的字",
          "source": "npc_sb_yanjue",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "全立与晏珏在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "source": "npc_sb_yanjue",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "原写者能否一起核对两张旧签，指出哪一个字不同以及各自读法。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "原写者何时能来复认旧签，自己留下的空格究竟对应哪个偏旁。"
      },
      {
        "path": "voice.register",
        "value": "念签时认真拘谨，认不全的字常停顿不肯问"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "把两张旧签并排给原写者看，逐字念自己已看清的部分。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "将不能确认的一字留空，请原写者说清后再核对两张旧签。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一次记丝束签先复读名字给本人，不认得的字直接问原写者。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_14",
          "event": "全立与晏珏在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_quanli",
            "npc_sb_yanjue"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "晏君与晏珏同住晏珏户居处，在家中见面；女儿认不出字还拖着不肯问。"
      },
      {
        "path": "relationships[1].note",
        "value": "容茹与晏珏同住晏珏户居处，在家中见面；想跟女儿认清自家签上的名字。"
      },
      {
        "path": "relationships[2].note",
        "value": "晏珏在桑坂村的日常往来中见过向荷，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "晏珏在桑坂村的日常往来中见过向荷，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_xianghe",
    "baseHash": "65c733d75c9763b38c198b91e13c073073da5329e0751dfa31082dd62ddaaf51",
    "issues": [
      {
        "id": "npc_sb_xianghe",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_xianghe",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "重新问过各人的空闲",
          "source": "npc_sb_xianghe",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "向荷与邸叶在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "source": "npc_sb_xianghe",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "展露愿意承担哪一段值日，休息日哪一时段不愿被安排。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "向妍愿意在何时自己说家务分配的顾虑，能否当面重议重活轮次。"
      },
      {
        "path": "voice.register",
        "value": "安排家务热心且强势，列谁在家时总想先作决定"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "请同住者各说今日能承担的一项家务，先留出尚未答应的活。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "逐人问休息日愿意做哪一段，原来被拒的安排不再当作同意。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一轮分家务让每个同住者自己选可承担的部分，再议无人愿做的重活。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_15",
          "event": "向荷与邸叶在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_xianghe",
            "npc_sb_diye"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "向妍与向荷同住向荷户居处，在家中见面；母亲替自己安排休息日家务。"
      },
      {
        "path": "relationships[1].note",
        "value": "展露与向荷同住向荷户居处，在家中见面；不愿让同住者替自己决定值日。"
      },
      {
        "path": "relationships[2].note",
        "value": "向荷在桑坂村的日常往来中见过邸叶，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "向荷在桑坂村的日常往来中见过邸叶，认得这位同村住户。"
      }
    ]
  },
  {
    "id": "npc_sb_diye",
    "baseHash": "9c748b659e02161810e864fcc7a1b4d1f34963ca27878916a8768a55d9472640",
    "issues": [
      {
        "id": "npc_sb_diye",
        "field": "knowledge.known",
        "code": "known-count"
      },
      {
        "id": "npc_sb_diye",
        "field": "knowledge.known",
        "code": "known-other"
      },
      {
        "id": "npc_sb_diye",
        "field": "knowledge.unknown[0]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_diye",
        "field": "knowledge.unknown[1]",
        "code": "unknown-specific"
      },
      {
        "id": "npc_sb_diye",
        "field": "goals.short[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_diye",
        "field": "goals.mid[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_diye",
        "field": "goals.long[0].steps[0].content",
        "code": "goal-steps"
      },
      {
        "id": "npc_sb_diye",
        "field": "voice.register",
        "code": "voice-register"
      },
      {
        "id": "npc_sb_diye",
        "field": "memorySeeds",
        "code": "memory-shared"
      },
      {
        "id": "npc_sb_diye",
        "field": "relationships[0].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_diye",
        "field": "relationships[1].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_diye",
        "field": "relationships[2].note",
        "code": "relationship-note"
      },
      {
        "id": "npc_sb_diye",
        "field": "relationships[2].note",
        "code": "rule-wording"
      },
      {
        "id": "npc_sb_diye",
        "field": "opinions.neighbors[2].view",
        "code": "rule-wording"
      }
    ],
    "patches": [
      {
        "path": "knowledge.known[1]",
        "value": {
          "fact": "被同伴叫回清过地面",
          "source": "npc_sb_diye",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.known[2]",
        "value": {
          "fact": "向荷与邸叶在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "source": "npc_sb_diye",
          "reliability": "亲历"
        }
      },
      {
        "path": "knowledge.unknown[0]",
        "value": "同伴希望先清哪一片断篾头，何时方便一起检查过道。"
      },
      {
        "path": "knowledge.unknown[1]",
        "value": "邸汐觉得自己收工后还有哪一项归拢没做，明早要用的筐应先收哪里。"
      },
      {
        "path": "voice.register",
        "value": "谈篾条时专注，收尾被问到便想岔回细活"
      },
      {
        "path": "goals.short[0].steps[0].content",
        "value": "先捡当天落地的断头，再请同伴看仍会扎鞋底的过道位置。"
      },
      {
        "path": "goals.mid[0].steps[0].content",
        "value": "细活收手后先检查工位和过道，向同伴说明仍未清完的地方。"
      },
      {
        "path": "goals.long[0].steps[0].content",
        "value": "下一次搭伙整理篾条前约清收尾范围，请同伴指出自己漏掉的归拢工序。"
      },
      {
        "path": "memorySeeds[2]",
        "value": {
          "id": "memory_sb_depth_shared_15",
          "event": "向荷与邸叶在桑坂村的公共路上见过面，认得对方是同村住户；这次见面只相互招呼，没有商定工事。",
          "location": "loc_bs_sangban",
          "salience": 3,
          "knownBy": [
            "npc_sb_xianghe",
            "npc_sb_diye"
          ],
          "reliability": "亲历"
        }
      },
      {
        "path": "relationships[0].note",
        "value": "邸汐与邸叶同住邸叶户居处，在家中见面；丈夫只夸自己的细活不提收尾。"
      },
      {
        "path": "relationships[1].note",
        "value": "邸泉与邸叶同住邸叶户居处，在家中见面；想摸父亲的篾片又怕扎手。"
      },
      {
        "path": "relationships[2].note",
        "value": "邸叶在桑坂村的日常往来中见过张洛，认得这位同村住户。"
      },
      {
        "path": "opinions.neighbors[2].view",
        "value": "邸叶在桑坂村的日常往来中见过张洛，认得这位同村住户。"
      }
    ]
  }
];
export const patchRows=rows.map(row=>({...row,before:base.find(n=>n.id===row.id)}));
