# K16 R5 30日审计

固定种子k16-audit；显式预先到访展开同济和折牙两郡（工具目标loc_far_tongji/loc_far_duanqi），时间推进不展开远方。305/305名册家户全部覆盖，另含23无户组，共328组×30天。世界类型与r4同。

|类型|户/组数|R4缺粮/缺水户日|R5缺粮/缺水户日|
|---|---:|---:|---:|
|有公仓村|142|0/30|0/30|
|无公仓城镇|90|722/0|721/0|
|怪物聚落|19|0/0|0/0|
|远方已生成|54|0/30|0/30|
|无户/流动|23|60/60|60/60|

饮水优先真实可达水源，近水计家务、远水走实际班次；只有无法执行才用存水/记缺水。无公仓先扣私粮和已购、公仓实际份额，缺口才按现有栖地有限库存采集；早晨预占篮子仅在临时规划视图，实际库存与账本在执行才扣。

城镇721缺粮户日全无食品零售货架，未发现“有食品货架却不买”的新类别，留TOWNFOOD处理，不改市场/商店。公仓30缺水户日仍是照护劳力约束；远方30户日仍是水源往返2882分钟，超过一天可用工时。无户60/60全部来自2名未展开郡个体（环城），来源未知；其余21无户组常态足粮足水。既有折叠/统计层排除口径保留。

原遗漏55户的处理沿用r4：52名册家户已纳入（城镇45、裂炉1、同济3、折牙3），另3来自已撤回的违规展开，不再凭时间推进制造。当前名册未覆盖为0。未展开郡只有原2名个体，60日来源未知，未增加远方状态。

日计划按聚落一条，每户一天只决策一次，后续被采空/封路/病倒不回改计划。库存/公共份额仍按夜间实际兑现，缺口允许如实存在。所有类型缺粮/缺水户日均不比r4差。

有限觅食库存守恒差initial+grown−harvested−reserve=0；来源收据计数{"water": 9720, "forage": 5343, "unknown": 60}。城镇4079次觅食，总工时1698202分钟、往返1393122分钟，占82.04%。

缺口变动逐项（其余户日相同）：

[
  {
    "day": 4,
    "id": "house_bs_030",
    "kind": "town",
    "old": {
      "satiety": 180,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 4,
    "id": "house_bs_036",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 180,
      "hydration": 0
    }
  },
  {
    "day": 4,
    "id": "house_bs_060",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 4,
    "id": "house_bs_081",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 4,
    "id": "house_bs_084",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 4,
    "id": "house_bs_085",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 4,
    "id": "house_bs_088",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 4,
    "id": "house_bs_089",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_021",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_022",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_024",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_025",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_030",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_032",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_071",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_072",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_073",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_074",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_075",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_077",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_087",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_088",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_089",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 5,
    "id": "house_bs_090",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 6,
    "id": "house_bs_066",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 6,
    "id": "house_bs_078",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 8,
    "id": "house_bs_066",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 8,
    "id": "house_bs_080",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_008",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_009",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_015",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_016",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_017",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_018",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_022",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_023",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_027",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_028",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_032",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_033",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_061",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_062",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_067",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_068",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_069",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_070",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_071",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_072",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_073",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_074",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_075",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_077",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_078",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 90,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_079",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_080",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 90,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_081",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_082",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_083",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_084",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 9,
    "id": "house_bs_087",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_008",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_009",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_027",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_028",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_032",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_033",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_036",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_060",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_061",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_062",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_063",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_067",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_068",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_069",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_070",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_071",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_074",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_075",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_077",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_078",
    "kind": "town",
    "old": {
      "satiety": 90,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_079",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_080",
    "kind": "town",
    "old": {
      "satiety": 90,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_081",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_082",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_083",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_084",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_085",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_087",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_088",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_089",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 10,
    "id": "house_bs_090",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_006",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_007",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_008",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_009",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_010",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_011",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_012",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_013",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_015",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_016",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_017",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_018",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_019",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_020",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_022",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_023",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_024",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_025",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_027",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_028",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_029",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_031",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_032",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_033",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_034",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_035",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_036",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_061",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_065",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_066",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_067",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_068",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_069",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_070",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_071",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_075",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_080",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 90,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_082",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_083",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_084",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_085",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 11,
    "id": "house_bs_090",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_005",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_006",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_007",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_009",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_010",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_011",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_012",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_013",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 45,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_014",
    "kind": "town",
    "old": {
      "satiety": 45,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_018",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_019",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_020",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_021",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_023",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_024",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_025",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_026",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_028",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_029",
    "kind": "town",
    "old": {
      "satiety": 75,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_030",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 75,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_031",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_035",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_036",
    "kind": "town",
    "old": {
      "satiety": 30,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_067",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_068",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_078",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_079",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_080",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 90,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_081",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_083",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_085",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_086",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_087",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_088",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 15,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_089",
    "kind": "town",
    "old": {
      "satiety": 15,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 12,
    "id": "house_bs_090",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 13,
    "id": "house_bs_080",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 30,
      "hydration": 0
    }
  },
  {
    "day": 14,
    "id": "house_bs_079",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 17,
    "id": "house_bs_060",
    "kind": "town",
    "old": {
      "satiety": 180,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_061",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_062",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_066",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_067",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_072",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_073",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_075",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 90,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_077",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_082",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_083",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_085",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_086",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_088",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 18,
    "id": "house_bs_089",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_015",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 135,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_016",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_018",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_019",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_021",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_022",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_024",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_025",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_027",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_028",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_030",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_031",
    "kind": "town",
    "old": {
      "satiety": 105,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_032",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_033",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_034",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_035",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_061",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_062",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_064",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_065",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_066",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_067",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_069",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_070",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_071",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_072",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_075",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 90,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_077",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_079",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_080",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_081",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_082",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_084",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_085",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_087",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_089",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 19,
    "id": "house_bs_090",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 90,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_005",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_006",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_008",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_010",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_012",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_013",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_015",
    "kind": "town",
    "old": {
      "satiety": 135,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_016",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_017",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_019",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_021",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_022",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_024",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_025",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_027",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_028",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_030",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_031",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 105,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_033",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_034",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_036",
    "kind": "town",
    "old": {
      "satiety": 120,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_061",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_063",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_064",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_068",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_069",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_072",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_073",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_074",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_075",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 90,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_078",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_079",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_084",
    "kind": "town",
    "old": {
      "satiety": 60,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 20,
    "id": "house_bs_085",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 60,
      "hydration": 0
    }
  },
  {
    "day": 23,
    "id": "house_bs_021",
    "kind": "town",
    "old": {
      "satiety": 180,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 23,
    "id": "house_bs_022",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 180,
      "hydration": 0
    }
  },
  {
    "day": 23,
    "id": "house_bs_026",
    "kind": "town",
    "old": {
      "satiety": 180,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 23,
    "id": "house_bs_027",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 180,
      "hydration": 0
    }
  },
  {
    "day": 23,
    "id": "house_bs_031",
    "kind": "town",
    "old": {
      "satiety": 180,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 23,
    "id": "house_bs_032",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 180,
      "hydration": 0
    }
  },
  {
    "day": 23,
    "id": "house_bs_036",
    "kind": "town",
    "old": {
      "satiety": 180,
      "hydration": 0
    },
    "new": {
      "satiety": 0,
      "hydration": 0
    }
  },
  {
    "day": 23,
    "id": "house_bs_053",
    "kind": "town",
    "old": {
      "satiety": 0,
      "hydration": 0
    },
    "new": {
      "satiety": 120,
      "hydration": 0
    }
  }
]

原始K16-r5-after-30.json，摘要K16-r5-audit-summary.json；计算不更改任何生产行为、世界内容或保存原档。
