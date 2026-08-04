/**
 * Content for the Notice page (ticket 07): 3 Cultural Insight Cards
 * contrasting US and China greeting norms. Single data source so
 * components stay presentational — see spec.md "模块划分" > "课程内容模块"
 * ("组件只消费，不硬编码文案").
 *
 * The three cards map directly onto spec.md's user stories 35-41 for this
 * page: who this kind of casual greeting is normally used with (35/36),
 * whether the chat continues past the greeting itself (37), and what people
 * actually talk about once it does (38) — including why "How are you?"
 * isn't a real question about your wellbeing (36). Each card's `why` field
 * exists because user story 39 asks for the *reasoning* behind the
 * difference, not just the difference itself — the goal is understanding
 * real communication, not memorizing phrases (see the ticket's own "目标是
 * 理解真实交流方式，不是记忆语言形式").
 */

export type CulturalInsightCard = {
  /** Stable id, also used to derive data-testid hooks for E2E. */
  id: string;
  /** Chinese card title — the question this card answers. */
  title: string;
  /** English gloss, shown as a secondary label. */
  subtitle: string;
  us: {
    label: string;
    description: string;
  };
  china: {
    label: string;
    description: string;
  };
  /** The "why" explanation behind the difference — never just stated as fact. */
  why: string;
};

export const CULTURAL_INSIGHT_CARDS: CulturalInsightCard[] = [
  {
    id: "who-greets",
    title: "会和谁这样打招呼",
    subtitle: "Who You Greet This Way",
    us: {
      label: "🇺🇸 In the US",
      description:
        "\"Hi!\"、\"Hey there!\" 这类随意的招呼，对谁都能用——邻居、便利店店员、电梯里擦肩而过的陌生人，都可能对你说一句 Hi 或点头微笑。这不代表关系亲近，只是一种基本的社交礼貌。",
    },
    china: {
      label: "🇨🇳 在中国",
      description:
        "主动跟不熟的人打招呼的情况少很多。对陌生人、店员通常不会开口问候；主动打招呼更多留给认识的人——朋友、同事、邻居里已经熟络的那种。",
    },
    why: "为什么：在美国这类文化里，简短的问候被当作维持公共空间友好氛围的礼仪动作，不代表要建立关系，不回应反而显得冷淡。而在中文语境里，主动问候通常意味着「我们认识」，所以对陌生人开口的门槛更高——这不是谁更热情或更冷漠，只是问候承载的意思不一样。",
  },
  {
    id: "keep-chatting",
    title: "打完招呼会继续聊吗",
    // Deliberately not "...Continue?" — e2e/navigation-spine.spec.ts and
    // e2e/notice.spec.ts both scope their Continue-button query by the
    // accessible-name substring "Continue" and assume it's unique on the
    // page; this card's own header button would otherwise match too.
    subtitle: "Does the Chat Go On?",
    us: {
      label: "🇺🇸 In the US",
      description:
        "打完招呼后，通常还会再聊几句才自然结束——哪怕只是聊两三句寒暄，而不是说完 \"Hi\" 就沉默走开。哪怕是偶遇的邻居，也常常会顺嘴接一句才道别。",
    },
    china: {
      label: "🇨🇳 在中国",
      description:
        "打招呼本身就可以是完整的社交动作——说一声「你好」或点头示意，然后各走各的路，是完全正常、不会显得冷淡的收尾方式。",
    },
    why: "为什么：英语打招呼后接着聊几句，是为了避免「话说一半突然安静」的尴尬——很多英语使用者把突然沉默当成不自然的信号，于是用几句小话题填一下再道别。中文语境里，礼貌到位就可以结束，继续追问反而可能显得没话找话。",
  },
  {
    id: "small-talk-topics",
    title: "通常会聊什么",
    subtitle: "What They Talk About",
    us: {
      label: "🇺🇸 In the US",
      description:
        "\"How are you?\" 是打招呼流程的一部分，不是真的在问你最近过得怎么样——多数人只是随口回一句 \"Good, thanks!\" 就算完成了礼节，没人期待你认真汇报近况。真要接着聊，常聊的是天气、今天过得怎么样、周末打算做什么这类不涉及隐私的小话题。",
    },
    china: {
      label: "🇨🇳 在中国",
      description:
        "问候更多是「吃了吗」「去哪儿呀」这类具体问题，同样也未必是真想知道细节。接着聊的话题往往更贴近具体生活——最近工作忙不忙、孩子怎么样、家里人身体好不好。",
    },
    why: "为什么：这类寒暄话题的作用都是打开一个安全、无压力的开场，让对话能往下走而不冒犯任何人——两边文化选的都是「安全话题」这个功能，只是具体聊什么不一样。知道这一点，就不用再纠结要不要认真回答 \"How are you?\"，接一句 \"Good, thanks! And you?\" 就够了。",
  },
];
