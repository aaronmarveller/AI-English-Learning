# 02 — 导航脊柱与 Progressive Learning 规则

**What to build:** 学习者能按固定顺序从 Home 走到 Review，每个学习页都知道自己在第几步、能一键回家；进度被记住；不能跳步。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 六个学习步骤各有独立地址，另有一个 Coming Soon 占位页
- [ ] 每个学习页顶部有返回 Home 的入口、课程名 `Greeting Somebody`、以及 5 个进度点
- [ ] 进度点高亮规则：Observe 第 1 个、Explore 第 2 个、Notice 第 3 个、Practice 第 4 个、Review 第 5 个（Home 不计步）
- [ ] 每页只有一个主操作按钮，点击进入流程的下一步
- [ ] 所有可点元素有按下反馈
- [ ] 学习进度写入本地存储，刷新页面后仍停留在同一步
- [ ] 未完成前序步骤时直接访问后续步骤的地址会被重定向回 Home
- [ ] 带调试参数访问时顶部出现步骤跳转条，可直达任意步骤（供演示时跳过前四页）
- [ ] 页面主体可上下滚动，不出现横向滚动
