# Spec: AI English Learning MVP — Lesson `Greeting Somebody`

Status: ready-for-agent

---

## Problem Statement

中国成人英语初学者长期接受应试英语教育，能读懂、能做题，但**开不了口**。他们的具体处境是：

- 看得懂 "How are you?"，却不知道回答完之后该说什么，对话三秒就死
- 和真人说英语时紧张、怕出错、怕被纠正语法，于是干脆不开口
- 现有的英语学习产品要么在教单词和语法（回到了让他们开不了口的那套训练），要么直接把他们扔进开放式 AI 自由聊天（没有目标、没有边界，初学者不知道该说什么，挫败感更强）
- 想学的是旅游、日常、社交里真正用得上的话，不是课本对话

产品团队需要先验证四个假设，再决定要不要往下投：真实场景能否让表达更好理解、Chunk-based Learning 能否比逐字翻译更快建立表达、AI 对话能否真的降低开口压力、用户愿不愿意走完一节 5–10 分钟的完整课程。

目前这些假设**没有任何可运行的东西能验证**——只有三份文档（MVP PRD、UI 设计稿、AI Configuration）和一个空仓库。而且三份文档彼此存在冲突，无法直接施工。

## Solution

交付一个**手机端优先的网页 App**，包含 1 节完整课程 `Greeting Somebody`，走完固定的六步 Learning Flow：

```
Home → Observe → Explore → Notice → Practice → Review
```

设计理念是 **Context First, Language Second, Communication Last**：先用真实场景视频建立情境（Observe），再学成块的表达（Explore），再理解中美打招呼的文化差异（Notice），然后和 AI Conversation Partner「Emily」做一次真实对话练习（Practice），最后由 Emily 用中文复盘（Review）。

对学习者而言，这个产品的关键承诺是**低压力**：

- Emily 是友好的邻居，不是考试的老师——先鼓励再建议，每次最多提一条建议
- 判定标准是**沟通意图达成**，不是语法正确。说 "Yeah, doing alright" 和说 "I'm good" 一样算通过
- 卡住时随时可以点「中英字幕」看中文，或点「Ask in Chinese」用中文问，**都不会打断练习、不会推进对话状态、不会被判失败**
- 20 秒不说话，Emily 只会温柔地说一句 "Take your time."，不会替你回答，也不会自己往下走
- 全程只有 4 个对话步骤，每一步都在进度条上看得见，知道还剩多少

对产品团队而言，交付物是一个能拿去做用户测试和路演的可运行原型。

## User Stories

### Learning Flow 与全局

1. As a 英语初学者, I want 每个页面只有一个主操作按钮, so that 我不用做选择，专注完成当前这一步
2. As a 英语初学者, I want 按固定顺序走完六步、不能跳步, so that 我不会跳过铺垫直接掉进对话里被打懵
3. As a 英语初学者, I want 每个学习页顶部都显示当前进度, so that 我知道自己走到哪了、还剩几步
4. As a 英语初学者, I want 任何页面都能一键返回 Home, so that 我随时可以退出而不会迷路
5. As a 英语初学者, I want 所有可点元素按下去有反馈, so that 我确认自己点到了
6. As a 英语初学者, I want 页面之间切换有轻量过渡动画, so that 体验连贯不生硬
7. As a 英语初学者, I want 在手机上单手竖屏就能完成整节课, so that 我可以在通勤路上学
8. As a 英语初学者, I want 中途刷新或误关页面后进度还在, so that 我不用从头再来
9. As a 开了「减少动态效果」的用户, I want 动画自动降级, so that 我不会因为动效不适
10. As a 演示者, I want 有一个调试开关能直接跳到任意步骤, so that 路演时我可以只演示 Practice 而不用每次走完前四页

### Page 1 — Home

11. As a 学习者, I want 打开就看到按我当地时间变化的问候语, so that 产品感觉是为此刻的我准备的
12. As a 学习者, I want 首屏看到一句清楚的产品主张和每天只要 5 分钟的承诺, so that 我知道这不是又一个要投入大量时间的东西
13. As a 学习者, I want 看到 Today's Mission 卡片展示今天要学什么、要花多久, so that 我在开始前就知道要付出什么、得到什么
14. As a 学习者, I want 点卡片任意位置都能开始, so that 我不用精确瞄准那个按钮
15. As a 学习者, I want 点 Start Lesson 直接进入课程, so that 中间没有加载页或二次确认拖慢我
16. As a 学习者, I want 看到后续课程规划（点餐、问路、购物、酒店）, so that 我知道学完这节还有什么在等我
17. As a 学习者, I want 未开放的课程明确显示为锁定, so that 我不会点进去扑空

### Page 2 — Observe

18. As a 学习者, I want 在学任何表达之前先看一段真实场景视频, so that 我先建立「什么场合说这些话」的情境
19. As a 学习者, I want 视频默认显示封面、我点了才播, so that 页面不会自动出声吓到我
20. As a 学习者, I want 视频有标准播放控制（播放/暂停/进度/音量/全屏）, so that 我能反复看某一段
21. As a 学习者, I want 视频可以开英文字幕, so that 我听不清时能看
22. As a 学习者, I want 看到「Watch for」列出本节要留意的四个交流环节, so that 我带着目的去看而不是干看
23. As a 学习者, I want 不看完视频也能继续, so that 我不被强制停留

### Page 3 — Explore

24. As a 学习者, I want 学的是成块的表达而不是单词和语法点, so that 我能整句说出来而不是在脑子里现拼
25. As a 学习者, I want 表达按四个交流环节分组（打招呼/问候/回应/结束）, so that 我理解每句话在对话里的位置
26. As a 学习者, I want 每条表达都带一个 Tag 点出它的特点（最常用/正式一点/根据时间）, so that 我知道该在什么场合用哪句
27. As a 学习者, I want Hint 告诉我使用场景而不是中文翻译, so that 我建立的是语感不是查词习惯
28. As a 学习者, I want 每条表达都能点喇叭听发音、能反复听, so that 我可以跟读
29. As a 学习者, I want 默认只展开第一组、其余收起, so that 页面不会一进来就压垮我
30. As a 学习者, I want 可以同时展开多个分组, so that 我能对照着看
31. As a 学习者, I want 展开后的表达卡横向滑动浏览并自动吸附, so that 在手机窄屏上一次专注看一张
32. As a 学习者, I want 回应环节明确显示①②③三步顺序, so that 我知道这三句是要连起来说的、不是三选一
33. As a 学习者, I want 看到三步连读的完整组合句并能整句听, so that 我知道说出来是什么效果
34. As a 学习者, I want 不看完所有分组也能继续, so that 我按自己的节奏走

### Page 4 — Notice

35. As a 学习者, I want 理解美国人和中国人打招呼方式的差异, so that 我不会把中文习惯直译成英文
36. As a 学习者, I want 知道 "How are you?" 只是友好问候、不是真在问近况, so that 我不会认真汇报自己最近怎么样
37. As a 学习者, I want 知道英语里打完招呼通常还要再聊几句, so that 我不会应一声就冷场
38. As a 学习者, I want 知道美国人日常都聊什么话题（天气/今天怎么样/周末）, so that 我有话可接
39. As a 学习者, I want 每张知识卡都能展开看到「为什么」, so that 我理解背后的逻辑而不是死记
40. As a 学习者, I want 一次只展开一张卡、其余自动收起, so that 我一次只消化一件事
41. As a 学习者, I want 不展开所有卡也能开始练习, so that 我不被强制阅读

### Page 5 — Practice（核心）

42. As a 学习者, I want Emily 主动先开口打招呼, so that 我不用面对空白屏幕不知道从何说起
43. As a 学习者, I want Emily 用 A1–A2 的简单英语、每句不超过 20 词、一次只问一个问题, so that 我听得懂也答得上
44. As a 学习者, I want 用语音开口说, so that 我练的是嘴而不是手
45. As a 学习者, I want 看到我说的话被识别成了什么文字, so that 识别错的时候我知道是识别问题不是我说错了
46. As a 学习者, I want 也可以改用打字, so that 我在不方便出声的场合（地铁、办公室）也能练
47. As a 学习者, I want 麦克风不可用时自动切到打字并告诉我为什么, so that 我不会对着没反应的按钮反复点
48. As a 学习者, I want Emily 说话时字幕默认只显示英文, so that 我先尝试用耳朵听
49. As a 学习者, I want 第一句开场白默认就带中文, so that 我刚进来时不会立刻懵掉
50. As a 学习者, I want 点「中英字幕」展开当前这句的中文, so that 卡住时立刻有退路
51. As a 学习者, I want 每条新消息自动回到只显示英文, so that 我不会不知不觉一直依赖中文
52. As a 学习者, I want 能重播 Emily 刚说的话, so that 没听清可以再听一次
53. As a 学习者, I want 重播和字幕互不影响、都不推进对话, so that 我可以放心反复用
54. As a 学习者, I want 点「Ask in Chinese」用中文了解当前这句怎么用, so that 我不用为了求助而中断练习
55. As a 学习者, I want 中文帮助解释含义、说明什么时候用、给一个例子、再鼓励我用英语继续, so that 我拿到的是理解而不是标准答案
56. As a 学习者, I want 中文帮助不替我回答, so that 我还是得自己开口
57. As a 学习者, I want 用了中文帮助之后对话仍停在原来那一步, so that 求助不会被当成跳过
58. As a 学习者, I want 只要意思对就算通过、哪怕语法不完美, so that 我不会因为怕错而不敢说
59. As a 学习者, I want 说了不在标准答案里但意思对的话（如 "Yeah, doing alright"）也能通过, so that 我敢用自己的话表达
60. As a 学习者, I want 答得不对时 Emily 鼓励我再试一次并把我引回当前这步, so that 我不会因为一次失败就放弃
61. As a 学习者, I want 说跑题时 Emily 先接住我再温和地带回来, so that 我不觉得被否定
62. As a 学习者, I want 20 秒没说话时 Emily 只轻轻推一下、不催也不给答案, so that 我有时间组织语言
63. As a 学习者, I want 看到 Emily 在听/在想/在说的不同状态, so that 我知道现在该我说还是该等
64. As a 学习者, I want 看到四步对话进度并高亮当前步, so that 我知道还剩几步、心里有底
65. As a 学习者, I want 四步全部完成前「查看学习总结」是锁住的, so that 我不会半途退出错过反馈
66. As a 学习者, I want 完成后 Emily 给一句简短的鼓励并邀请我看总结, so that 结束有仪式感
67. As a 学习者, I want 能展开查看完整对话记录, so that 我可以回看整段对话说了什么
68. As a 学习者, I want 对话始终围绕本节主题、不跑成开放闲聊, so that 我练的是今天学的东西

### Page 6 — Review

69. As a 学习者, I want 复盘用中文, so that 我作为初学者真的看得懂自己得到了什么反馈
70. As a 学习者, I want 反馈里的英文例句保留原文, so that 我知道下次具体该说哪句
71. As a 学习者, I want Emily 先夸我, so that 我第一感受是被肯定
72. As a 学习者, I want 看到 2–3 条具体的学习亮点而不是笼统的「很棒」, so that 我知道自己到底哪里做对了
73. As a 学习者, I want 亮点反映我这次的真实表现, so that 反馈是给我的不是给所有人的
74. As a 学习者, I want 只收到一条改进建议, so that 我不会被一堆问题淹没
75. As a 学习者, I want 建议是「下次试试这个」而不是「你这里错了」, so that 我想继续而不是想逃
76. As a 学习者, I want 反馈一条一条出现、像真的在聊天, so that 有陪伴感而不是收到一份报告
77. As a 学习者, I want 反馈没显示完时按钮是锁住的, so that 我不会在 Emily 说完之前就点走
78. As a 学习者, I want 能重练这一课, so that 我可以再试一次
79. As a 学习者, I want 重练时对话是干净的重新开始, so that 上次的记录不会串进来
80. As a 学习者, I want 点「继续下一课」时明确告诉我还在开发中, so that 我不会以为是出 bug 了
81. As a 学习者, I want 不会看到分数、等级或详细数据统计, so that 我不会又回到被评判的感觉

### 开发与演示

82. As a 开发者, I want API Key 只存在于服务端、绝不出现在浏览器产物里, so that 演示部署后 Key 不会泄漏
83. As a 开发者, I want 语音识别、语音合成、大模型三处能力都封在适配层后面, so that 将来要换成中国大陆可达的方案时只改三个模块、页面代码不动
84. As a 开发者, I want 所有课程文案集中在一处, so that 换课程内容不用翻遍组件
85. As a 开发者, I want Emily 的固定台词能预生成成音频文件, so that 演示时音质统一、零延迟、不受演示机系统音色影响
86. As a 开发者, I want 没有 TTS key 时自动降级到浏览器合成, so that 素材没齐也能开工和演示
87. As a 开发者, I want 能用一张话术表打真实 API 验证判定质量, so that 我在演示前就知道模型判得准不准

## Implementation Decisions

> 以下决策由三份来源文档（MVP PRD / UI 设计稿 / AI Configuration）的冲突裁定而来，裁定过程见本 spec 末尾「文档冲突裁定记录」。

### 平台与形态

- **手机端是唯一设计基准**（375–430px 视口）。UI 设计稿是 1086px 宽屏，其布局需重新推导为竖屏：顶部横向导航收成「返回 + 步骤标识 + 进度点」；并排卡片组改为横向 Carousel；左右分栏的中美文化对比改为上下堆叠
- 桌面端不单独设计，只做定宽居中的手机壳容器
- **视觉语言严格照抄设计稿**：配色、字体、圆角、留白、插画风格不做自由发挥

### 技术架构

- Next.js App Router + TypeScript + Tailwind + 客户端状态库（带 localStorage 持久化）
- 服务端路由处理器作为大模型代理。**API Key 只存在于服务端环境变量**，任何情况下不进入客户端 bundle
- 页面本质是客户端 SPA，不引入服务端渲染数据流的复杂度

### 三个适配层（关键架构决策）

产品目标用户在中国大陆，但本期演示环境可科学上网。为避免将来落地时全栈重写，把三处外部能力封在窄接口后面：

| 能力 | 本期实现 | 将来替换方向 |
|---|---|---|
| 大模型 | Anthropic `claude-haiku-4-5-20251001` | 国内可达模型 |
| 语音识别 | 浏览器 Web Speech API | 云端实时 ASR（WebSocket） |
| 语音合成 | 预生成音频文件 + 浏览器合成兜底 | 云端 TTS |

替换时只改这三个模块，页面与业务逻辑零改动。

### 模块划分

- **课程内容模块** — 单一数据源，含 4 个 Conversation Chunk Section 的 12 条 Key Expression（Expression / Tag / Hint）、常见组合句、3 张 Cultural Insight Card、Conversation Script、每步的 Accepted Responses、Ask in Chinese 的四段预设文案、Feedback Template 模板库。组件只消费，不硬编码文案
- **Conversation 状态机模块** — 纯函数，不依赖网络与 UI
- **大模型代理路由** — 组装 system prompt、强制结构化输出、流式返回
- **Feedback 选择模块** — 纯函数，输入本次练习累积的表现标记，输出四段反馈
- **语音识别适配层 / 语音合成适配层** — 屏蔽浏览器能力差异，暴露能力探测接口
- **课程状态 store** — 持久化学习进度与练习表现标记

### Conversation State Machine

四态顺序推进，不可跳步，同一时刻只有一个状态激活。以下状态转移规则来自 AI Configuration §3，是本功能的核心契约：

```
Conversation Start → Greeting → Check-in → Response → Closing → Complete → Review

Validation Result 决定转移：
  accepted     → 推进到下一状态
  needs_retry  → 停留在当前状态，鼓励再试
  off_topic    → 停留在当前状态，接住后引导回主题

Support Requested（Ask in Chinese / 中英字幕 / 无响应提醒）
  → 一律停留在当前状态，不产生状态转移
```

### 大模型契约

**单次调用 + 强制结构化输出**（不做「先判定后生成」的两跳，口语练习对首字延迟极敏感）。模型每轮返回四个字段：

```
verdict:       "accepted" | "needs_retry" | "off_topic"
reply_en:      Emily 的英文回复，≤20 词
reply_zh:      对应中文翻译（供中英字幕使用）
highlight_key: 本轮表现标记，累积供 Review 选模板
```

前端先依据 `verdict` 决定状态机是否推进，再渲染消息。

System prompt 由两部分拼装：AI Configuration §1 的六条全局规则（Role / Personality / Speaking Style / Global Conversation Rules / Global Feedback Rules / Global Constraints）+ 当前 Conversation State 的 Learning Goal 与 Accepted Responses。

**判定以沟通意图为准，不以字面匹配为准**——白名单之外的自然表达必须能通过。这是本功能最关键的验收点。

### Practice 页交互模型

- **当前轮双气泡**：Emily 立绘占上半屏，其消息气泡浮在立绘上；学习者开口后下方实时出现识别文本气泡。进入下一轮时两条淡出替换
- **必须回显识别结果**。初学者发音不准时识别常出错，若不回显，学习者只会反复收到 "Could you try again?" 而无法归因，会当场卡死
- 完整对话记录收在可展开的抽屉里，不占主视觉
- **Avatar 三态用纯 CSS 实现**，只需一张静态立绘：Idle 为缓慢呼吸缩放；Talking 为轻微浮动 + 声波 + 发光环脉冲；Thinking 为降低不透明度 + 三点跳动。不做口型同步（PRD 明确不要求）
- **Ask in Chinese 不调用大模型**。AI Configuration §5.1 规定的四段内容对每个 Conversation State 都是固定的，写成预设文案即可——零延迟、零成本、结果可控。以底部 Sheet 呈现
- 无响应计时 15–20 秒触发一次鼓励语，不推进状态，不提供答案

### 语言口径

- **Practice 沉浸英语**：字幕默认纯英文，点「中英字幕」展开中文，**每条新消息重置回纯英文**。例外：第一条 Opening Message 默认展开中文，降低初次入场门槛
- **Review 全中文叙述 + 英文例句嵌入**。AI Configuration §6 的英文模板作为引用句嵌在中文里（如「下次试试看：I'm doing pretty good.」）。理由：A1 学习者看不懂英文反馈，复盘环节的目标是让人真的接收到信息

### 语音合成

Emily 的主线台词是**固定集合**：Opening 5 条、Check-in 3 条、Response 4 条、Closing 4 条、Final 3 条、Recovery 5 条，约 24 句；加上 Explore 页 16 条 Key Expression 发音，共约 40 条。这正是 PRD 所说的 Semi-generated Conversation——主线随机选，仅异常分支动态生成。

因此：**预生成这 40 条音频文件**，运行时直接播放（零延迟、音质统一、不受演示机系统音色影响）；仅当模型输出偏离模板时降级到浏览器语音合成。生成脚本厂商无关，无 key 时全程降级，不阻塞开发。

### Progressive Learning 约束

未完成前序步骤时直接访问后续步骤的地址会被重定向回 Home。附带一个调试开关，开启后顶部显示步骤跳转条，供演示时直达 Practice。

### 命名与内容修正

- 课程名统一为 **`Greeting Somebody`**（PRD 两处 + 设计稿 4/6 页为准）
- 进度点共 5 个（Home 不计步）：Observe=1 / Explore=2 / Notice=3 / Practice=4 / Review=5
- Explore 页的 Response Section **破例不用 Carousel**，改为竖向三步阶梯（左侧 ①②③ 竖线串联）+ 底部高亮的「常见组合」卡。理由：Carousel 会让学习者滑到②时看不见①③，「三句连起来说」的教学意图丢失

## Testing Decisions

### 什么是好测试

只测**外部可观察行为**，不测实现细节。判断标准：如果重构内部结构（改状态管理方式、拆分组件、换 CSS 方案）而行为不变，测试不应该失败。

具体到本功能：断言的对象是「学习者看到了什么、点了之后发生了什么」，不是「某个 store 字段变成了什么值」或「某个函数被调用了几次」。

### 接缝

本仓库是空仓库，无既有测试接缝可复用。按「尽可能高、尽可能少」的原则新建两个：

**接缝一（主）：浏览器 E2E。** 用真实浏览器驱动整个 App，**只 stub 两处真正的外部边界**：

1. 大模型代理路由的网络响应
2. Web Speech API（语音识别与语音合成）——需要真麦克风且结果不确定

其余全部走真实代码。这一个接缝即可覆盖：路由与 Progressive Learning 守卫、Conversation 状态机的全部转移、字幕 toggle 的「新消息重置」语义、按钮解锁门槛、表现标记累积 → Review 模板选择、localStorage 持久化、Retry 重置。

选择理由：这个 App 的全部风险面就是 UI 行为与状态转移，而验收标准本身就是用 UI 动作描述的。在更低的接缝（单测纯函数）上测，恰恰漏掉最容易坏的东西——守卫、门槛、重置、持久化都活在组件里。

**接缝二（辅）：判定质量 eval。** 一张「学习者话术 × 期望 verdict」的表，打**真实** API 逐条跑。手动执行，不进 CI（非确定性且产生费用）。

选择理由：接缝一里模型是被 stub 的，所以它**无法回答本 MVP 最大的技术风险**——haiku 究竟会不会把 "Yeah, doing alright" 判成 accepted。这是模型行为问题不是代码问题，只能打真实 API 验证。它同时充当 prompt 的回归保护：改了 system prompt 就重跑一次。

### 待覆盖的行为

E2E 至少覆盖：

| 场景 | 期望 |
|---|---|
| 六页顺序走通 | 进度点每页递进 |
| 直接访问后续步骤 | 重定向回 Home |
| 带调试开关访问 | 可直达 |
| 任意页刷新 | 进度不丢 |
| verdict=accepted | 状态推进，进度点前进 |
| verdict=needs_retry | 停在原步骤 |
| verdict=off_topic | 停在原步骤 |
| 静默超时 | 出现一条鼓励语，状态不变 |
| 点 Ask in Chinese | 弹出中文内容，状态不推进，关闭后仍在原步骤 |
| 点中英字幕 | 当前气泡出现中文；下一条消息自动恢复纯英文 |
| 四步未完成 | 查看学习总结保持禁用 |
| 语音识别不可用 | 自动切文字输入并给出说明 |
| Review 反馈播放中 | 两个按钮保持禁用 |
| Review 反馈播完 | 两个按钮解锁 |
| Retry Lesson | 回到 Practice 且对话已重置 |
| 继续下一课 | 进入 Coming Soon 占位 |

eval 至少覆盖：每个 Conversation State 的白名单内表达、白名单外但意图正确的自然表达、意图错误的表达、跑题表达。

### 手动验证

自动化之外仍需人工确认两类无法断言的东西：

- **视觉还原度** — 与 UI 设计稿逐页比对配色、字号、间距、圆角
- **真机语音链路** — Chrome Android 与 iOS Safari 各跑一遍 Practice，确认麦克风授权、识别可用性、音色

### 安全检查

构建产物中全文搜索 API Key 前缀，必须零命中。

### 先例

无——本仓库为空，这两个接缝即是先例。后续功能应复用接缝一，不要为新页面另起测试体系。

## Out of Scope

以下明确不做（PRD 已列，此处确认并补充）：

**功能层面**

- 多节课程 — 只做 `Greeting Somebody` 一节，其余显示 Coming Soon
- 用户系统 / 登录 / 注册 / User Profile
- 学习历史 / 长期学习记录 / 数据统计
- 成就系统 / 分数 / 等级
- 搜索 / 个性化推荐 / 社交功能
- 顶部导航中的 Progress 与 Profile 仅作占位，不实现对应页面
- 发音评分（Pronunciation Scoring）
- 复杂语法纠错（Complex Grammar Correction）
- 开放式自由聊天（Open-ended Free Chat）
- Notice 页的互动测验、收藏、标记
- 后台配置系统 — 所有课程内容为固定资源，不做 CMS

**技术层面**

- 中国大陆可达的模型与语音方案 — 本期演示环境可科学上网，仅通过适配层为将来预留
- 服务端数据库 — 状态只存 localStorage
- 视频字幕模块 — 使用原生播放器能力，只附英文字幕轨，不做双语字幕
- Avatar 口型同步与复杂表情
- 桌面端独立布局 — 只做居中手机壳
- 国际化 — 界面语言固定中英混排

## Further Notes

### 待用户提供的交付依赖

**图片素材 12 项**（存放路径见已批准的实施方案）：Emily 立绘、Emily 圆头像、客厅背景、Home Hero、任务缩略图、Coming Next 四图标、视频封面、Explore Hero、两张表达卡配图、Notice Hero。

Emily 立绘**建议提供透明背景版**——设计稿里 Emily 嵌在客厅实景中，但手机竖屏需重新构图（立绘只占上半屏约 45%），带背景的图裁剪后构图会散。

设计稿中的人物组、天气图标、Watch for 图标本就是 emoji，不需要提供。

素材到位前用同尺寸占位块开工，不阻塞。

**环境变量**：大模型 API Key（必需）；TTS 厂商与 Key（可选，仅预生成音频时使用）。

**已有资源**：18 秒场景视频一份。

### 文档冲突裁定记录

三份来源文档存在以下互相冲突之处，已逐条裁定：

| 冲突 | 出处 | 裁定 |
|---|---|---|
| 手机端 vs 1086px 宽屏稿 | 需求 vs UI 稿 | 手机优先，宽屏降级 |
| Practice 单浮动气泡 vs 聊天流逐条展示 | UI 稿 vs PRD | 当前轮双气泡 + 折叠记录抽屉 |
| Review 英文模板 vs 全中文反馈 | AI Cfg §6 vs UI 稿 | 中文叙述 + 英文例句嵌入 |
| 课程名 Greeting Someone vs Somebody | UI 稿 1,2 vs 其余 | 统一 Greeting Somebody |
| Explore 进度点亮 3 个 | UI 稿 3 | 应为 2，设计稿有误 |
| 四个 Section 共用 UI vs Response 有序三步 | PRD 自相矛盾 | Response 破例用竖向阶梯 |
| 对话 3–5 步 vs 锁死 4 步 | PRD vs AI Cfg §3 | 以 AI Cfg 为准，4 步 |

**一处曾被误判为冲突、实为误读**：UI 稿 Page 5 气泡内中英同显，并非与「默认纯英文」冲突——那画的是「中英字幕」按钮已点开的状态。

### 已识别的风险

1. **模型判定质量** — 若 haiku 无法稳定接受白名单外的自然表达，学习者会被反复卡在同一步，MVP 的核心假设直接证伪。由接缝二的 eval 在演示前验证；若不达标，退路是升级到更强模型
2. **语音识别准确率** — 中国学习者的 A1–A2 发音对浏览器识别是压力测试。缓解手段是强制回显识别文本 + 始终提供文字输入通道
3. **演示机语音音色** — Windows 上浏览器语音合成音色明显机械，会直接破坏「和真人对话」的沉浸感，进而影响假设验证。缓解手段是预生成 40 条音频
4. **素材分辨率** — 现有设计稿为 1086×1448 @1x 整页截图，非切图。若最终未能拿到独立高清素材，成品在 2x/3x 屏上会偏软
