// Guide 3.7 specifies repair costs and limits; D021 records these reversible initial values.
export const repairFoundation=[
    {id:'repair_tool_handle_trim',name:'木柄修整',item:'item_tool_handle',skill:'skill_life_6_core',attribute:'敏捷',minimumProficiency:0,
        tools:['item_whittling_knife'],materials:[],workstation:'woodworking',minutes:20,difficulty:10,toolWear:1,restore:20,maxLoss:1},
    {id:'repair_staff_trim',name:'木杖修整',item:'item_staff',skill:'skill_life_6_core',attribute:'敏捷',minimumProficiency:0,
        tools:['item_whittling_knife'],materials:[],workstation:'woodworking',minutes:20,difficulty:10,toolWear:1,restore:20,maxLoss:1},
];
