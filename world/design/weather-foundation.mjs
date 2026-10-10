// Mechanism parameters for guide 3.14. Initial climate values are D025,
// not assertions about geographic latitude already present in the source.
const hw = ['loc_hw','bld_hw_qingdeng','bld_hw_mill','bld_hw_council','bld_hw_riverhome','bld_hw_forge',
    'loc_hw_northwood','bld_hw_herbs','loc_hw_dock','loc_hw_fields','bld_hw_weaving','loc_hw_gate',
    'loc_hw_orchard','bld_hw_school','loc_hw_apiary','bld_hw_post','site_beilin_tower','bld_hw_altar'];
const effects = {
    clear: { name: '晴', humidity: 40, temperatureOffset: 2, walk: 1, horse: 1, cart: 1, boat: 1, hit: 0, crop: 0.9, mood: 1 },
    cloudy: { name: '阴', humidity: 65, temperatureOffset: 0, walk: 1, horse: 1, cart: 1, boat: 1, hit: 0, crop: 1, mood: 0 },
    rain: { name: '雨', humidity: 85, temperatureOffset: -2, walk: 1.2, horse: 1.25, cart: 1.4, boat: 1.1, hit: -0.05, crop: 1.1, mood: -1 },
    storm: { name: '暴雨', humidity: 95, temperatureOffset: -3, walk: 1.6, horse: 1.8, cart: 2, boat: 2, boatClosed: true, hit: -0.15, crop: 0.6, mood: -2 },
    snow: { name: '雪', humidity: 75, temperatureOffset: -4, walk: 1.5, horse: 1.6, cart: 1.8, boat: 1.5, hit: -0.1, crop: 0.5, mood: -1 },
    fog: { name: '雾', humidity: 90, temperatureOffset: -1, walk: 1.1, horse: 1.15, cart: 1.2, boat: 1.3, hit: -0.1, crop: 0.9, mood: 0 },
};
export const weatherFoundation = {
    version: 1, persistence: 0.45, annualReset: true, states: effects,
    seasonalWeights: [[25,25,30,5,0,15],[45,20,20,10,0,5],[35,25,20,5,0,15],[20,30,10,0,30,10]],
    cropSeasonFactors: [0.8,1.1,1.4,0.3],
    regions: [
        { id: 'climate_hw', locations: hw, indoor: hw.filter(id => id.startsWith('bld_')), latitude: 38, temperatures: [12,25,14,1] },
        { id: 'climate_bs', locations: ['loc_bs','bld_bs_shrine'], indoor: ['bld_bs_shrine'], latitude: 42, temperatures: [10,23,12,-2] },
        { id: 'climate_yandu', locations: ['loc_yandu'], indoor: [], latitude: 32, temperatures: [16,29,18,7] },
        { id: 'climate_capital', locations: ['loc_capital'], indoor: [], latitude: 47, temperatures: [8,21,10,-5] },
    ],
};
export function withWeatherRules(source) {
    const world = structuredClone(source);
    world.rules.weather = structuredClone(weatherFoundation);
    world.rules.calendar.tens = ['上旬','中旬','下旬'];
    world.rules.calendar.marketDays = [5,15,25];
    return world;
}
