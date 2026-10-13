import type { ServerEvent } from "@/lib/call-engine";

/**
 * Browser transport for a Call: microphone <-> WebRTC <-> OpenAI Realtime API.
 * Audio flows over the peer connection; events travel as JSON on the
 * "oai-events" data channel. The rules of the Call itself live in
 * src/lib/call-engine.ts; this module only connects and relays.
 *
 * The OpenAI API key never reaches the browser: the page asks our own
 * /api/realtime/session route for a short-lived client secret and uses that
 * alone against OpenAI.
 */

/** A failure the learner can understand, with the message to show. */
export class CallConnectionError extends Error {}

export type RealtimeConnection = {
  setMicEnabled(enabled: boolean): void;
  send(event: Record<string, unknown>): void;
  /** Stops the microphone and closes the connection. Safe to call twice. */
  close(): void;
};

export type ConnectOptions = {
  /** The element Emily's voice plays through. */
  audio: HTMLAudioElement;
  /** The connection is up (SDP exchanged) — the Call counts from here. */
  onConnected(): void;
  /** The data channel is open: Emily can be asked to greet. */
  onOpen(): void;
  onEvent(event: ServerEvent): void;
  /** The connection dropped mid-Call. */
  onDropped(): void;
};

const INSECURE_CONTEXT_MESSAGE =
  "当前页面不是安全连接（http），浏览器不允许使用麦克风。请用 HTTPS 或 localhost 打开本页面。";

export async function connectRealtime(options: ConnectOptions): Promise<RealtimeConnection> {
  // Browsers expose mediaDevices only in a secure context: HTTPS or localhost.
  // Plain http://<LAN IP> from a phone gets nothing — say so instead of crashing.
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new CallConnectionError(INSECURE_CONTEXT_MESSAGE);
  }

  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new CallConnectionError("无法使用麦克风。请在浏览器设置里允许本页面使用麦克风后再试。");
  }
  const stopMic = () => mic.getTracks().forEach((track) => track.stop());

  let pc: RTCPeerConnection | null = null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    stopMic();
    options.audio.srcObject = null;
    pc?.close();
  };

  try {
    const sessionResponse = await fetch("/api/realtime/session", { method: "POST" });
    if (!sessionResponse.ok) throw new Error(`session ${sessionResponse.status}`);
    const { clientSecret } = (await sessionResponse.json()) as { clientSecret: string };

    pc = new RTCPeerConnection();
    const connection = pc;
    connection.ontrack = (e) => {
      options.audio.srcObject = e.streams[0];
      // iOS Safari may ignore autoPlay on a late srcObject; kick it explicitly.
      void options.audio.play().catch(() => {});
    };
    connection.onconnectionstatechange = () => {
      if (closed) return;
      if (connection.connectionState === "failed" || connection.connectionState === "disconnected") {
        options.onDropped();
      }
    };
    mic.getTracks().forEach((track) => connection.addTrack(track, mic));

    const channel = connection.createDataChannel("oai-events");
    channel.onopen = () => options.onOpen();
    channel.onmessage = (e) => {
      try {
        options.onEvent(JSON.parse(e.data as string) as ServerEvent);
      } catch {
        // Ignore a malformed event rather than dropping the Call.
      }
    };

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
    });
    if (!answer.ok) throw new Error(`calls ${answer.status}`);
    await connection.setRemoteDescription({ type: "answer", sdp: await answer.text() });

    options.onConnected();

    return {
      setMicEnabled(enabled) {
        mic.getAudioTracks().forEach((track) => {
          track.enabled = enabled;
        });
      },
      send(event) {
        if (channel.readyState === "open") channel.send(JSON.stringify(event));
      },
      close,
    };
  } catch (error) {
    close();
    if (error instanceof CallConnectionError) throw error;
    throw new CallConnectionError("连接失败了，请稍后再试。");
  }
}
