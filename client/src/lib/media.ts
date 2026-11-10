/* Small media helpers shared by the lobby preview, in-room settings and
   reaction sound effects. None of these touch the call itself. */

export interface DeviceList {
  audio: MediaDeviceInfo[];
  video: MediaDeviceInfo[];
}

export async function enumerateDevices(): Promise<DeviceList> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { audio: [], video: [] };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audio: devices.filter((device) => device.kind === "audioinput"),
      video: devices.filter((device) => device.kind === "videoinput"),
    };
  } catch {
    return { audio: [], video: [] };
  }
}

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!sharedContext) sharedContext = new AudioContext();
    if (sharedContext.state === "suspended") {
      void sharedContext.resume();
    }
    return sharedContext;
  } catch {
    return null;
  }
}

/** A short two-note chime so people can confirm their speakers work.
 *  Resolves once the tone has finished, so callers can keep the outgoing
 *  microphone muted for the whole test. */
export async function playTestTone(): Promise<void> {
  const ctx = getContext();
  if (!ctx) return;
  try {
    await ctx.resume();
    const now = ctx.currentTime;
    const tones = [660, 880];
    tones.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const start = now + index * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
    const duration = (tones.length - 1) * 0.18 + 0.18 + 0.08;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, duration * 1000);
    });
  } catch {
    /* audio output unavailable */
  }
}

/** A tiny, friendly pop when a reaction lands. */
export function playReactionPop(): void {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(900, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.14);
  } catch {
    /* ignore */
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that image."));
    image.src = src;
  });
}
