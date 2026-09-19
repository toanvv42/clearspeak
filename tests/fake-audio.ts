import { vi } from "vitest";

/**
 * Minimal fake Web Audio / media environment for testing the real
 * usePcmRecorder hook in jsdom.
 */

export type FakeTrack = {
  stop: ReturnType<typeof vi.fn>;
  kind: string;
};

export type FakeAudioHarness = {
  contexts: Array<Record<string, unknown>>;
  nodes: Array<{
    port: { onmessage: ((event: { data: unknown }) => void) | null };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }>;
  tracks: FakeTrack[];
  sampleRate: number;
  getUserMediaImpl: (constraints: unknown) => Promise<unknown>;
  addModuleImpl: (...args: unknown[]) => Promise<void>;
  uninstall: () => void;
};

export function installFakeAudio(opts?: {
  sampleRate?: number;
  getUserMedia?: (constraints: unknown) => Promise<unknown>;
  addModule?: (...args: unknown[]) => Promise<void>;
}): FakeAudioHarness {
  const harness: FakeAudioHarness = {
    contexts: [],
    nodes: [],
    tracks: [],
    sampleRate: opts?.sampleRate ?? 48000,
    getUserMediaImpl:
      opts?.getUserMedia ??
      (async () => {
        const track: FakeTrack = { stop: vi.fn(), kind: "audio" };
        harness.tracks.push(track);
        return { getTracks: () => harness.tracks };
      }),
    addModuleImpl: opts?.addModule ?? (async () => {}),
    uninstall: () => {},
  };

  class FakeAudioContext {
    state = "running";
    destination = {};
    sampleRate: number;
    constructor() {
      this.sampleRate = harness.sampleRate;
      harness.contexts.push(this as unknown as Record<string, unknown>);
    }
    resume = vi.fn(async () => {});
    close = vi.fn(async () => {});
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
    createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }));
  }
  // audioWorklet lives on the prototype (like the real API) so the
  // `"audioWorklet" in AC.prototype` check behaves realistically.
  (FakeAudioContext.prototype as unknown as Record<string, unknown>).audioWorklet = {
    addModule: (...args: unknown[]) => harness.addModuleImpl(...args),
  };

  class FakeWorkletNode {
    port: { onmessage: ((event: { data: unknown }) => void) | null } = { onmessage: null };
    connect = vi.fn();
    disconnect = vi.fn();
    constructor(
      public ctx: unknown,
      public name: string,
    ) {
      harness.nodes.push(this);
    }
  }

  const w = window as unknown as Record<string, unknown>;
  const prevAC = w["AudioContext"];
  const prevNode = w["AudioWorkletNode"];
  w["AudioContext"] = FakeAudioContext;
  w["AudioWorkletNode"] = FakeWorkletNode;

  const prevMedia = Object.getOwnPropertyDescriptor(window.navigator, "mediaDevices");
  Object.defineProperty(window.navigator, "mediaDevices", {
    value: { getUserMedia: (c: unknown) => harness.getUserMediaImpl(c) },
    configurable: true,
  });

  const prevCreate = URL.createObjectURL;
  const prevRevoke = URL.revokeObjectURL;
  const urls: string[] = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:fake-${urls.length}`;
    urls.push(url);
    return url;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn(() => {}) as unknown as typeof URL.revokeObjectURL;

  harness.uninstall = () => {
    if (prevAC === undefined) delete w["AudioContext"];
    else w["AudioContext"] = prevAC;
    if (prevNode === undefined) delete w["AudioWorkletNode"];
    else w["AudioWorkletNode"] = prevNode;
    if (prevMedia) Object.defineProperty(window.navigator, "mediaDevices", prevMedia);
    else delete (window.navigator as unknown as Record<string, unknown>)["mediaDevices"];
    URL.createObjectURL = prevCreate;
    URL.revokeObjectURL = prevRevoke;
  };

  return harness;
}

export function pushChunk(harness: FakeAudioHarness, data: Float32Array) {
  const node = harness.nodes[harness.nodes.length - 1];
  node.port.onmessage?.({ data: { type: "chunk", chunk: data } });
}
