# 判定质量 eval — 基线运行记录（ticket 12）

**运行时间：** 2026-08-04
**模型：** `claude-haiku-4-5-20251001`（当前 Claude 系列中最便宜的档位）
**命令：** `npm run eval:judgment`
**System Prompt 版本：** 对应 `src/content/practice.ts` 在本次运行时的内容（`GLOBAL_SYSTEM_RULES` + 各状态 `PRACTICE_SCRIPT`）——之后改动 system prompt 需重跑本 eval，并与下面的结果对照。

**结果：14/16 通过（87.5%）**

各用例均以单轮独立调用（`history: []`）针对该状态判定，不串联真实上下文——这是当前 eval 的设计边界，见下方「已知局限」。

## 逐条结果

| 状态 | 类别 | 学习者话术 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| greeting | whitelist | "Hi!" | accepted | accepted | PASS |
| greeting | natural-paraphrase | "Well hello there!" | accepted | accepted | PASS |
| greeting | wrong-intent | "Umm, what should I say?" | needs_retry | needs_retry | PASS |
| greeting | off-topic | "Do you like pizza?" | off_topic | off_topic | PASS |
| checkin | whitelist | "How are you?" | accepted | accepted | PASS |
| checkin | natural-paraphrase | **"Yeah, doing alright"** | accepted | **needs_retry** | **FAIL** |
| checkin | wrong-intent | "I don't understand the question." | needs_retry | needs_retry | PASS |
| checkin | off-topic | "What's the capital of France?" | off_topic | off_topic | PASS |
| response | whitelist | "Good, thanks! And you? I'm doing pretty good, just heading to work." | accepted | accepted | PASS |
| response | natural-paraphrase | "Pretty good! You? Just running some errands." | accepted | accepted | PASS |
| response | wrong-intent | "Yes." | needs_retry | needs_retry | PASS |
| response | off-topic | "What time does the store open?" | off_topic | off_topic | PASS |
| closing | whitelist | "Have a good one!" | accepted | accepted | PASS |
| closing | natural-paraphrase | "Catch you later!" | accepted | accepted | PASS |
| closing | wrong-intent | "Wait, one more thing..." | needs_retry | off_topic | FAIL |
| closing | off-topic | "What's your favorite movie?" | off_topic | off_topic | PASS |

## 失败项分析

### 1. checkin/natural-paraphrase — "Yeah, doing alright" 判成 needs_retry（本 MVP 最大技术风险命中）

这正是 ticket 12 和 spec.md 明确点名的核心风险用例（spec.md: "haiku 究竟会不会把 'Yeah, doing alright' 判成 accepted"）。**结果是：不会。**

Emily 的实际回复是 "Good! But I have a question for you — how are you doing?"，`highlight_key` 为 `needs-more-practice`。对照 `PRACTICE_SCRIPT.checkin.learningGoal`："The learner's job this turn is to acknowledge that and/or ask a check-in question back to you" —— "and/or" 意味着单纯的 acknowledge 应该就够。但模型的行为显示它倾向于要求"确认 + 反问"两件事都做到，只做了 acknowledge 判了不通过。

这不是 eval 工具的问题，是 system prompt 对 "and/or" 语义的传达不够强——模型没有把"只确认、不反问"当作合格答案。下次调整 `src/content/practice.ts` 里 checkin 状态的 `learningGoal` 或 `Global Conversation Rules` 时，应重点验证这一条是否能转为 PASS。

### 2. closing/wrong-intent — "Wait, one more thing..." 判成 off_topic 而非 needs_retry

严重程度低于第 1 条，更可能是本次 eval 用例设计本身处于 needs_retry/off_topic 的模糊地带：模型把"等一下，我还有件事"理解为一次新话题的岔开（`stayed-on-topic-after-detour`），而不是一次"没能说再见"的失败尝试——这个解读并非不合理。后续如果这条持续失败，应优先怀疑测试用例本身的期望标注，而不是 prompt。

## 已知局限

- 每条用例都是孤立单轮调用（`history: []`），不包含该状态之前的真实对话历史。生产环境里 `history` 会带上 Emily 前一句的原话，模型或许能更准确地锚定语境——第 1 条失败是否会因为带上真实历史而改观，本次基线未验证（为控制成本，没有为诊断额外加调用）。若未来迭代 prompt 后这条持续失败，可以考虑把该用例改造成"带最小必要历史"的版本再对照一次。

## 如何使用本文件

修改 `src/content/practice.ts` 的 system prompt 内容后：

1. 确认 `.env.local` 中已配置 `ANTHROPIC_API_KEY`
2. 运行 `npm run eval:judgment`
3. 对照上表——通过率是否提升，尤其关注 checkin/natural-paraphrase 这一条是否转为 PASS
4. 更新本文件为新的基线记录
