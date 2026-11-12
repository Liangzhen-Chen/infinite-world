// 世界里“可按编号查到的实体行”的全集：WorldEngine 的 byId 与公开聚落资料的最小 reader 用同一份，物种表（monsters、bosses 等）不会残缺。
// 无任何导入，任何模块都可直接引用而不引入导入环。
export const worldEntityRows=world=>[...world.npcs,...world.residents??[],...world.locations,...world.items,...world.professions,...world.skills,...world.spells,...world.recipes??[],...world.monsters??[],...world.bosses??[],...world.cultures??[],...world.deities??[],...world.factions??[],...world.history??[],...world.factionPeople??[],...world.eras??[],...world.regions??[],...world.festivals??[]];
