import { expect, type Page, type Route } from "@playwright/test";

/**
 * Shared E2E helpers.
 *
 * This project's main test seam is a real browser driving the whole app
 * against a real `next build && next start` server. The only things ever
 * faked are the network and device boundaries a Call crosses: the Realtime
 * connection (WebRTC + microphone), the session route that mints its client
 * secret, and the summary route. Routing, the progress guard, localStorage
 * persistence and component behaviour all run real code, and the suite never
 * calls OpenAI or Anthropic.
 */

// --- Storage isolation --------------------------------------------------

/**
 * Clears this origin's localStorage and sessionStorage before every
 * navigation `page` makes from this point on (via an init script, so it
 * re-runs on every full navigation — page.goto(), page.reload() — but not
 * on client-side/SPA route transitions). Tests that need state to survive a
 * real reload seed storage manually instead (see navigation-spine.spec.ts).
 */
export async function resetStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

/**
 * Like {@link resetStorage}, but clears only on the first document the page
 * loads — so a later `page.reload()` keeps what the app stored. Use this to
 * prove state survives a reload.
 */
export async function resetStorageOnce(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("__e2e_cleared") === "1") return;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("__e2e_cleared", "1");
  });
}

// --- Generic network stub ------------------------------------------------

/**
 * Generic page.route()-based network stub: intercepts requests matching
 * `urlPattern` and fulfills them with `jsonResponse` instead of hitting a
 * real server.
 */
export async function mockApiRoute(
  page: Page,
  urlPattern: string | RegExp,
  jsonResponse: unknown,
  options: { status?: number } = {},
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: options.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(jsonResponse),
    });
  });
}

// --- Learning progress ------------------------------------------------------

const PROGRESS_STORAGE_KEY = "greeting-somebody:progress";

/**
 * Seeds the persisted learning progress (the steps the learner has completed)
 * before every navigation `page` makes, so a test can arrive mid-flow. This is
 * the only place in the suite that knows the storage key and JSON shape. Call
 * after {@link resetStorage} (init scripts run in order); it re-applies on a
 * reload, so a test that needs progress to survive a reload by itself should
 * use {@link resetStorageOnce} instead of resetStorage. With `{ once: true }` it
 * seeds only on the first document the page loads (pair it with resetStorageOnce),
 * so progress the app changes afterwards is not overwritten by a later navigation.
 */
export async function seedProgress(
  page: Page,
  steps: string[],
  options: { once?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ({ key, value, once }) => {
      if (once) {
        if (window.sessionStorage.getItem("__e2e_progress_seeded") === "1") return;
        window.sessionStorage.setItem("__e2e_progress_seeded", "1");
      }
      window.localStorage.setItem(key, JSON.stringify({ completed: value }));
    },
    { key: PROGRESS_STORAGE_KEY, value: steps, once: options.once === true },
  );
}

// --- Practice page --------------------------------------------------------

/** The Practice page's debug entry point: `?debug=1` bypasses the prerequisite of completing earlier steps. */
export const PRACTICE_URL = "/practice?debug=1";
export const REVIEW_URL = "/review?debug=1";

export const PRACTICE_STORAGE_KEY = "greeting-somebody:practice";

type PersistedLine = { id: string; role: "learner" | "emily"; text: string };
type PersistedCall = { id: string; lines: PersistedLine[]; ended: boolean };

export async function persistedCalls(page: Page): Promise<PersistedCall[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { calls: PersistedCall[] }).calls : [];
  }, PRACTICE_STORAGE_KEY);
}

/** Seeds the persisted Practice state directly (used to arrive at Review or at the Call limit). */
export async function seedPractice(page: Page, calls: PersistedCall[]): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify({ calls: value }));
    },
    { key: PRACTICE_STORAGE_KEY, value: calls },
  );
}

// --- Fake Realtime connection -------------------------------------------------

export const SESSION_ENDPOINT = "**/api/realtime/session";
export const SUMMARY_ENDPOINT = "**/api/realtime/summary";
const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/** What a test can observe of the fake connection, from inside the page. */
type FakeCallState = {
  /** Number of times the page asked for the microphone. */
  micRequests: number;
  /** The microphone track's current `enabled` flag (what the learner is heard through). */
  micEnabled: boolean;
  micStopped: boolean;
  connections: number;
  closed: number;
  /** Client events the page sent over the data channel. */
  sent: Array<Record<string, unknown>>;
  /** Delivers a server event to the page. */
  emit: (event: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    __fakeCall?: FakeCallState;
  }
}

export type FakeSummary =
  | "ok"
  | "fail"
  | { praise: string; highlights: string[]; suggestion: string; closing: string };

export const FAKE_SUMMARY = {
  praise: "你今天说得很棒，敢开口就是进步！",
  highlights: ['你用 "Hello." 自然地打了招呼。', '你说出了 "I\'m good."，回应得很清楚。'],
  suggestion: "下次试着把问题问回给 Emily，比如 \"How about you?\"。",
  closing: "继续加油，下次再来练习！",
};

export type FakeCallOptions = {
  /** What the summary route returns; default "ok" (FAKE_SUMMARY). */
  summary?: FakeSummary;
  /** Make the session route fail, so the Call never connects. */
  sessionFails?: boolean;
  /** Remove `navigator.mediaDevices`, as on a non-secure origin (plain http on a LAN IP). */
  insecureContext?: boolean;
};

export type NetworkLog = {
  /** Requests the page made to our own session and summary routes. */
  sessionRequests: number;
  summaryRequests: Array<{ calls: Array<{ lines: Array<{ role: string; text: string }> }> }>;
  /** Authorization header sent to OpenAI's Realtime endpoint. */
  openaiAuthorization: string[];
  /** Any request that would have reached OpenAI or Anthropic beyond the faked ones — must stay empty. */
  unexpectedRequests: string[];
};

/**
 * Replaces everything a Call touches with a fake, so the suite never calls
 * OpenAI or Anthropic: the microphone, `RTCPeerConnection` and its data
 * channel (driven from the test through `window.__fakeCall`), the session
 * route, OpenAI's SDP endpoint and the summary route. Call before `page.goto`.
 */
export async function installFakeCall(page: Page, options: FakeCallOptions = {}): Promise<NetworkLog> {
  const log: NetworkLog = {
    sessionRequests: 0,
    summaryRequests: [],
    openaiAuthorization: [],
    unexpectedRequests: [],
  };

  await page.addInitScript((insecure) => {
    const state: FakeCallState = {
      micRequests: 0,
      micEnabled: true,
      micStopped: false,
      connections: 0,
      closed: 0,
      sent: [],
      emit: () => {},
    };
    window.__fakeCall = state;

    if (insecure) {
      Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    } else {
      const track = {
        kind: "audio",
        get enabled() {
          return state.micEnabled;
        },
        set enabled(value: boolean) {
          state.micEnabled = value;
        },
        stop() {
          state.micStopped = true;
        },
      };
      const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            state.micRequests += 1;
            state.micEnabled = true;
            state.micStopped = false;
            return stream;
          },
        },
      });
    }

    class FakeDataChannel {
      readyState = "connecting";
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      send(message: string) {
        state.sent.push(JSON.parse(message));
      }
      close() {}
    }

    class FakePeerConnection {
      connectionState = "new";
      ontrack: unknown = null;
      onconnectionstatechange: (() => void) | null = null;
      private channel: FakeDataChannel | null = null;
      constructor() {
        state.connections += 1;
      }
      addTrack() {}
      createDataChannel() {
        this.channel = new FakeDataChannel();
        const channel = this.channel;
        state.emit = (event) => channel.onmessage?.({ data: JSON.stringify(event) });
        return channel;
      }
      async createOffer() {
        return { type: "offer", sdp: "fake-offer-sdp" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        // The data channel opens right after the SDP exchange.
        void Promise.resolve().then(() => {
          if (!this.channel) return;
          this.channel.readyState = "open";
          this.channel.onopen?.();
        });
      }
      close() {
        state.closed += 1;
      }
    }
    (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakePeerConnection;
  }, options.insecureContext === true);

  // Anything bound for the real providers that is not one of the faked
  // endpoints below is a bug in the test setup or the app.
  await page.route(/api\.(openai|anthropic)\.com/, async (route) => {
    log.unexpectedRequests.push(route.request().url());
    await route.abort();
  });

  await page.route(OPENAI_CALLS_URL, async (route: Route) => {
    log.openaiAuthorization.push((await route.request().headerValue("authorization")) ?? "");
    await route.fulfill({ status: 200, contentType: "application/sdp", body: "fake-answer-sdp" });
  });

  await page.route(SESSION_ENDPOINT, async (route) => {
    log.sessionRequests += 1;
    if (options.sessionFails) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "x" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ clientSecret: "ek_fake_client_secret" }),
    });
  });

  await page.route(SUMMARY_ENDPOINT, async (route) => {
    log.summaryRequests.push(route.request().postDataJSON());
    const summary = options.summary ?? "ok";
    if (summary === "fail") {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "x" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: summary === "ok" ? FAKE_SUMMARY : summary }),
    });
  });

  return log;
}

// --- Driving the fake Call -----------------------------------------------------

/** Delivers a server event to the page, as the Realtime data channel would. */
export async function emit(page: Page, event: Record<string, unknown>): Promise<void> {
  await page.evaluate((e) => window.__fakeCall?.emit(e), event);
}

/** Emily begins a line: the response starts, her audio starts, her transcript streams in. */
export async function emilyStartsSpeaking(page: Page, itemId: string, text: string): Promise<void> {
  await emit(page, { type: "response.created" });
  await emit(page, { type: "output_audio_buffer.started" });
  await emit(page, { type: "response.output_audio_transcript.delta", item_id: itemId, delta: text });
}

/** Emily's line ends: the response is done and her audio has finished playing. */
export async function emilyFinishesSpeaking(page: Page): Promise<void> {
  await emit(page, { type: "response.done" });
  await emit(page, { type: "output_audio_buffer.stopped" });
}

export async function emilySays(page: Page, itemId: string, text: string): Promise<void> {
  await emilyStartsSpeaking(page, itemId, text);
  await emilyFinishesSpeaking(page);
}

/** The learner speaks a whole Turn (speech detected, committed) and its transcript arrives. */
export async function learnerSpeaks(page: Page, itemId: string, transcript: string | null): Promise<void> {
  await emit(page, { type: "input_audio_buffer.speech_started", item_id: itemId });
  await emit(page, { type: "input_audio_buffer.speech_stopped", item_id: itemId });
  await emit(page, { type: "input_audio_buffer.committed", item_id: itemId });
  if (transcript !== null) {
    await emit(page, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: itemId,
      transcript,
    });
  }
}

export async function micIsOpen(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__fakeCall?.micEnabled ?? false);
}

export async function sentEvents(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => window.__fakeCall?.sent ?? []);
}

/** Taps 开始对话 and waits until the Call is live and Emily has been asked to open it. */
export async function startCall(page: Page): Promise<void> {
  await page.getByTestId("call-button").click();
  await expect(page.getByTestId("call-button")).toHaveAttribute("data-phase", "live");
  await expect.poll(async () => (await sentEvents(page)).length).toBeGreaterThan(0);
}

/** Starts a Call, plays Emily's opening line out and waits out the Handoff Gap. */
export async function startCallAndGreet(page: Page, greeting = "Hi! I'm Emily."): Promise<void> {
  await startCall(page);
  await emilySays(page, "emily-opening", greeting);
  await expect.poll(() => micIsOpen(page)).toBe(true);
}

/** Taps 挂断对话 and waits for the Call to be over. */
export async function hangUp(page: Page): Promise<void> {
  await page.getByTestId("call-button").click();
  await expect(page.getByTestId("call-button")).toHaveAttribute("data-phase", "idle");
}

/** One whole Call in which the learner says `learnerLine`, ended by hanging up. */
export async function makeCall(page: Page, learnerLine: string | null, callNumber = 1): Promise<void> {
  await startCallAndGreet(page, `Hi! This is call ${callNumber}.`);
  if (learnerLine !== null) {
    await learnerSpeaks(page, `learner-${callNumber}`, learnerLine);
    await expect(page.getByTestId("learner-message-bubble")).toHaveText(learnerLine);
  }
  await hangUp(page);
}
