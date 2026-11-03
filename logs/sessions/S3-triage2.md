## holdings-writers
✖ failing tests:
✖ 持有来源所读的旧字段只经包装写入：未包装的写入点为 0 
      1 expected: [],
      1 actual: [Array],
      1 AssertionError [ERR_ASSERTION]: 以下写入点写了持有来源所读的旧字段却没有经 holdingSet / holdingRemove 双写
      1 + actual - expected

## npc-profile-publication
✖ failing tests:
✖ tests\npc-profile-publication.test.mjs 
      1 [cause]: Error: 人物补丁冲突或原档已过期 npc_hw_duanyan/services[0]
      1 Error: 已发布档案发生后续修改；深度补丁来源核验失败：人物补丁冲突或原档已过期 npc_hw_duanyan/services[0]

## npc-publication-increments
✖ failing tests:
✖ 真实正式世界prepare保留四项教学、17人特征和钱物，直接纯函数仍须有效凭证 
      1 ✔ 根目录缺少来源、伪造学习映射、错导师和审核hash漂移均拒绝 (462.8067ms)
      1 ✔ 原人物L2事实审核记录篡改仍在合并前被拒绝 (88.1441ms)
      1 ✔ 删除、替换、额外服务技能、顺序和技能表示变化仍拒绝 (646.5744ms)
      1 ✔ 候选确已审核但正式法术、技能或导师关系缺失和同ID值冲突仍拒绝 (481.4145ms)
      1 [cause]: Error: 人物补丁冲突或原档已过期 npc_hw_duanyan/services[0]
      1 Error: 已发布档案发生后续修改；深度补丁来源核验失败：人物补丁冲突或原档已过期 npc_hw_duanyan/services[0]

## w1-village-profiles
✖ failing tests:
✖ 聚落档案出版保留人物补充，重复零写入，篡改 details 被拒绝 
      2 ✖ 聚落档案出版保留人物补充，重复零写入，篡改 details 被拒绝 (16777.7145ms)
      1 Error: 人物补丁冲突或原档已过期 npc_hw_duanyan/services[0]

## w1-villages-publish
✖ failing tests:
✖ 四村原已审补充重发保留后续记忆和运行财物，原记忆篡改仍拒绝 
✖ 四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝 
      2 ✖ 四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝 (1822.9358ms)
      2 ✖ 四村原已审补充重发保留后续记忆和运行财物，原记忆篡改仍拒绝 (1777.8853ms)
      2 Error: 人物补丁冲突或原档已过期 npc_hw_duanyan/services[0]
      1 ✔ 同编号正式事实冲突拒绝覆盖，非四村目录不随合并改变 (75.8014ms)

