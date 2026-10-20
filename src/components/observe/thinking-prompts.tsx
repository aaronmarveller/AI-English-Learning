import { OBSERVE_CONTENT } from "@/content/observe";

/**
 * Display-only "看看视频，想一想 💭" card shown above the scene videos: a
 * soft-green card with three numbered questions to hold in mind while
 * watching. No buttons or links — it only frames the videos.
 */
export function ThinkingPrompts() {
  const { title, items } = OBSERVE_CONTENT.thinkingPrompts;
  return (
    <section
      data-testid="thinking-prompts"
      className="flex flex-col gap-3 rounded-card bg-accent-soft p-4"
    >
      <h2 className="flex items-center gap-1.5 text-body-lg font-bold text-foreground">
        {title}
        <span aria-hidden>💭</span>
      </h2>
      <ol className="flex flex-col gap-2.5">
        {items.map((item, index) => (
          <li key={item.zh} className="flex items-start gap-3 text-body text-foreground">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-body-sm font-bold text-white"
            >
              {index + 1}
            </span>
            <span>
              {"en" in item && item.en ? <span className="font-semibold">{item.en} </span> : null}
              {item.zh}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
