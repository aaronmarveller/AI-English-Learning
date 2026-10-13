"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Minimal realtime voice demo: browser mic <-> WebRTC <-> OpenAI Realtime API.
 * Audio flows over the peer connection; transcripts arrive as JSON events on
 * the "oai-events" data channel. Each call is capped at CALL_SECONDS, and
 * when it ends the transcript goes to /api/realtime/summary for a Chinese
 * recap of what the learner said.
 */

const CALL_SECONDS = 45;
/** Grace period after the mic stops, so the last utterance's transcript can still arrive. */
const TRANSCRIPT_GRACE_MS = 1500;

/**
 * Only English and Chinese are supported. The transcription model can't be
 * restricted to two languages (a `prompt` hint had no effect in testing), so
 * flag transcripts written in a script that is clearly neither. Latin-script
 * languages such as Spanish slip through here; Emily's instructions cover them.
 */
const UNSUPPORTED_SCRIPT =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Greek}\p{Script=Hebrew}]/u;

type Status ="idle" | "connecting" | "live" | "summarizing" | "done" | "error";
type Line = { id: string; role: "user" | "assistant"; text: string };

const STATUS_LABEL: Record<Status, string> = {
  idle: "未开始",
  connecting: "连接中",
  live: "通话中",
  summarizing: "正在总结",
  done: "已结束",
  error: "出错",
};

function isUnsupported(line: Line) {
  return line.role === "user" && UNSUPPORTED_SCRIPT.test(line.text);
}

export default function RealtimeDemoPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [remaining, setRemaining] = useState(CALL_SECONDS);
  const [summary, setSummary] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const linesRef = useRef<Line[]>([]);
  const endingRef = useRef(false);

  function updateLines(update: (prev: Line[]) => Line[]) {
    linesRef.current = update(linesRef.current);
    setLines(linesRef.current);
  }

  function upsertLine(id: string, role: Line["role"], update: (prev: string) => string) {
    updateLines((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i === -1) return [...prev, { id, role, text: update("") }];
      const next = [...prev];
      next[i] = { ...next[i], text: update(next[i].text) };
      return next;
    });
  }

  function handleEvent(event: { type: string; [k: string]: unknown }) {
    switch (event.type) {
      // Reserve the learner's bubble as soon as their turn is committed, so it
      // sits before Emily's reply even though its transcript arrives later.
      case "input_audio_buffer.committed":
        upsertLine(String(event.item_id), "user", (t) => t);
        break;
      case "conversation.item.input_audio_transcription.completed":
        upsertLine(String(event.item_id), "user", () => String(event.transcript ?? ""));
        break;
      case "response.output_audio_transcript.delta":
        upsertLine(String(event.item_id), "assistant", (t) => t + String(event.delta ?? ""));
        break;
      case "error":
        setError(JSON.stringify(event.error));
        break;
    }
  }

  function teardown() {
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }

  async function start() {
    setStatus("connecting");
    setError(null);
    setSummary(null);
    updateLines(() => []);
    setRemaining(CALL_SECONDS);
    endingRef.current = false;
    try {
      // Safari (and every browser) only exposes mediaDevices in a secure
      // context: HTTPS or localhost. Plain http://<LAN IP> from a phone fails.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("当前页面不是安全上下文，无法使用麦克风。请用 HTTPS 打开（npm run dev:https）。");
      }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;

      const res = await fetch("/api/realtime/session", { method: "POST" });
      if (!res.ok) throw new Error(`session ${res.status}: ${await res.text()}`);
      const { clientSecret } = (await res.json()) as { clientSecret: string };

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.srcObject = e.streams[0];
        // iOS Safari may ignore autoPlay on a late srcObject; kick it explicitly.
        void audio.play().catch(() => {});
      };

      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = (e) => handleEvent(JSON.parse(e.data));
      // Emily opens the conversation (the session instructions tell her to greet first).
      dc.onopen = () => dc.send(JSON.stringify({ type: "response.create" }));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw new Error(`calls ${sdpRes.status}: ${await sdpRes.text()}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

      setStatus("live");
    } catch (e) {
      teardown();
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function endCall() {
    if (endingRef.current) return;
    endingRef.current = true;
    setStatus("summarizing");

    // Stop the mic and Emily's audio now; keep the data channel briefly open
    // for any transcript still in flight.
    micRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    await new Promise((r) => setTimeout(r, TRANSCRIPT_GRACE_MS));
    teardown();

    try {
      const res = await fetch("/api/realtime/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: linesRef.current
            .filter((l) => !isUnsupported(l))
            .map(({ role, text }) => ({ role, text })),
        }),
      });
      if (!res.ok) throw new Error(`summary ${res.status}: ${await res.text()}`);
      setSummary(((await res.json()) as { summary: string }).summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setStatus("done");
  }

  // 45-second cap: count down while live, hang up at zero.
  useEffect(() => {
    if (status !== "live") return;
    const endsAt = Date.now() + CALL_SECONDS * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) void endCall();
    }, 250);
    return () => clearInterval(timer);
    // endCall only touches refs and setters, so it's safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Release the mic if the page unmounts mid-call.
  useEffect(() => teardown, []);

  const live = status === "live";
  const busy = status === "connecting" || status === "summarizing";
  const userLines = lines.filter((l) => l.role === "user" && l.text.trim() && !isUnsupported(l));

  return (
    <main className="flex min-h-full flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Realtime 语音对话 Demo</h1>
      <p className="text-sm opacity-70">
        练习主题：打招呼 / 今天怎么样 / 说再见。可以随时用中文提问。
      </p>
      <div className="flex items-center justify-between text-sm">
        <span>状态：{STATUS_LABEL[status]}</span>
        {live && <span className="font-mono text-base font-semibold">{remaining}s</span>}
      </div>

      <button
        type="button"
        onClick={live ? () => void endCall() : start}
        disabled={busy}
        className="rounded-full bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        {live ? "挂断" : busy ? `${STATUS_LABEL[status]}…` : status === "done" ? "再来一次" : "开始对话"}
      </button>

      {error && <pre className="whitespace-pre-wrap text-xs text-red-600">{error}</pre>}

      <ul className="flex flex-col gap-2">
        {lines.map((l) => (
          <li
            key={l.id}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              l.role === "user" ? "self-end bg-blue-100" : "self-start bg-gray-100"
            }`}
          >
            {isUnsupported(l) ? (
              <span className="text-amber-700">⚠️ 只支持中文或英文</span>
            ) : (
              l.text || "…"
            )}
          </li>
        ))}
      </ul>

      {status === "done" && (
        <section className="flex flex-col gap-2 rounded-2xl border border-gray-200 p-4">
          <h2 className="font-semibold">本次总结</h2>
          {summary ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
          ) : (
            <p className="text-sm opacity-70">总结生成失败，下面是你说过的话：</p>
          )}
          {!summary && (
            <ul className="list-disc pl-5 text-sm">
              {userLines.length ? userLines.map((l) => <li key={l.id}>{l.text}</li>) : <li>（没有识别到你的发言）</li>}
            </ul>
          )}
        </section>
      )}

      <audio ref={audioRef} autoPlay playsInline />
    </main>
  );
}
