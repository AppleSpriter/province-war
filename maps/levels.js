// 按经济水平给的初始等级（凭常识粗分，1~3 级）。未列出的默认 1 级
window.ECON_LEVEL = {
  china: { 3: '北京,上海,广东,江苏,浙江,山东,香港,台湾', 2: '天津,河北,辽宁,福建,安徽,河南,湖北,湖南,四川,重庆,陕西,江西' },
  usa: { 3: 'California,Texas,New York,Florida,Illinois,Pennsylvania,Massachusetts,Washington', 2: 'Ohio,Georgia,North Carolina,Michigan,Virginia,Maryland,Arizona,Colorado,Minnesota,Tennessee,Indiana,Wisconsin,Missouri,Oregon' },
  japan: { 3: '長野,兵庫,静岡', 2: '栃木,千葉,広島,三重,長崎,北海道,石川' }, // 長野含東京，兵庫含大阪，静岡含愛知
  europe: { 3: 'Germany,France,United Kingdom,Italy,Netherlands,Switzerland', 2: 'Spain,Sweden,Poland,Denmark,Norway,Ireland,Finland,Czech Republic,Turkey,Hungary' },
  india: { 3: 'Maharashtra,Tamil Nadu,Gujarat,Karnataka,Uttar Pradesh', 2: 'West Bengal,Rajasthan,Andhra Pradesh,Kerala,Madhya Pradesh,Haryana,Punjab,Bihar,Goa' },
  brazil: { 3: '圣保罗,里约,米纳斯', 2: '南里奥,巴拉那,圣卡塔琳娜,巴伊亚,联邦区,戈亚斯,伯南布哥' },
  germany: { 3: '北威州,巴伐利亚,巴登-符腾堡', 2: '黑森,下萨克森,汉堡,莱法州,萨克森' },
  world: { 3: '美国,中国,日本,德国,英国,法国,印度,意大利,加拿大', 2: '巴西,俄罗斯,澳大利亚,西班牙,墨西哥,印尼,沙特,土耳其,瑞典,阿根廷,南非,伊朗,泰国,挪威,埃及,尼日利亚,菲律宾,巴基斯坦,哈萨克斯坦,匈牙利,智利,哥伦比亚,新西兰' },
};
