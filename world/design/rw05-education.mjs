// Original local assessment practices. Qualification records performance;
// existing appointment charters and profession rules still decide admission.
const practices=[
 ['river','垄渠乡课','乡试式','读粮约、核田界与水次'],
 ['civic','阶庭公课','乡试式','读公示、复核共同支出'],
 ['steppe','系绳议课','议席考核','口述见证、核绳记与轮牧约定'],
 ['canopy','架栖林课','议席考核','辨林界、说明采收与共用通道'],
 ['beast','砾耳共课','议席考核','辨来路、复述见证与分配约定'],
 ['coast','泊绳行课','行会考核','验货记、核泊位与承运账'],
 ['north','覆灯值课','乡试式','读轮值表、核冬储账'],
 ['salt','量影核课','行会考核','读计量记、核盐货交接'],
 ['forge','楔契验课','行会考核','读工序记、核材料收支'],
 ['reed','篆汀文课','门派考核','核抄本来源、辨公开与私密记载'],
 ['ms_tanjie','灰窟共课','议席考核','复述换物见证、核公共存粮'],
 ['ms_taideng','苔灯辨课','议席考核','辨已知与猜测、复述见证'],
 ['ms_yugen','榆根议课','议席考核','说明共居分工、核公共通路'],
 ['ms_lielu','裂炉验课','行会考核','验材料交接、核工序与公账'],
 ['far_orc','赭牙席课','议席考核','复述议事约定、核营中分配'],
 ['far_lignum','杉根联课','议席考核','辨共用林界、复述坡间约定'],
 ['ms_huixi','回汐认课','议席考核','辨岸标、核往来见证'],
 ['ms_huipeng','灰棚签课','行会考核','读交易明签、核共同账目'],
];
export const educationRules={version:1,minimumAge:6,maximumAge:17,
 examinations:practices.map(([suffix,name,form,task])=>({id:`exam_${suffix}`,culture:`culture_${suffix}`,name,form,task,
  skill:'skill_literacy',minimumProficiency:100,minutes:120,difficulty:15,
  text:`${name}采用${form}，以${task}检验识字与记事。报考须成年，识字熟练度至少100，实际考核120分钟，难度15。须由现任地方头人或在岗登记人当面主持，通过后记名。此凭据可随任职申请递交；既有公民、贡献、举荐、住户意见与上级审定条件继续生效，缺少已登记任命机构的地方只保留资格，不自行授官。行会及门派的职业资格另由现任合格导师依职业目录完成实际入职任务；入门守戒与仪式资格仍沿原规章办理。`}))};
export const entries=educationRules.examinations;
export const revision='rw05-education-v1';
export const draftFor=e=>({id:e.id,text:e.text});
