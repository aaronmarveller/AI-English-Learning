# 04 — Home 页

**What to build:** 学习者打开应用就知道今天学什么、要花多久、后面还有什么，一次点击即可开始。

素材未到位时使用同尺寸占位块，不阻塞。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 顶部问候语按用户本地时间在早/午/晚三种之间自动切换
- [ ] 展示产品主张与「每天 5 分钟」的承诺
- [ ] Today's Mission 卡片展示课程名 `Greeting Somebody`、中文名、场景缩略图、预计时长与分类
- [ ] 点击 Today's Mission 卡片的任意区域进入 Observe，效果与主按钮一致
- [ ] 点击主按钮直接进入 Observe，不出现加载页或二次确认
- [ ] Coming Next 展示四个后续课程（点餐、询问信息、购物、酒店入住），均为锁定态且点击无响应
- [ ] 「More coming soon」仅作展示，不可交互
- [ ] 顶部的 Progress 与 Profile 仅作占位，点击不产生导航
- [ ] E2E 覆盖：时段问候随时间切换、卡片整体可点、锁定项不可点
