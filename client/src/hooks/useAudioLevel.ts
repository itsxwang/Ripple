import { useEffect, useState } from "react";

const NOISE_FLOOR = 0.012;
const GAIN = 7;
const ATTACK = 0.6;
const RELEASE = 0.82;

/**
 * Normalised (0–1) microphone level for an existing stream. Used by the
 * in-room audio settings panel; the lobby preview has its own hook.
 */
export function useAudioLevel(
  stream: MediaStream | null,
  enabled: boolean,
): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || !enabled) {
      setLevel(0);
      return;
    }
    const track = stream.getAudioTracks()[0];
    if (!track) {
      setLevel(0);
      return;
    }

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let timer: number | null = null;
    let cancelled = false;
    let smoothed = 0;

    const start = async () => {
      try {
        context = new AudioContext();
        /* A context created outside a gesture can start suspended, which
           leaves the analyser reading silence forever. */
        if (context.state === "suspended") {
          await context.resume();
        }
        if (cancelled) {
          void context.close().catch(() => undefined);
          return;
        }
        source = context.createMediaStreamSource(new MediaStream([track]));
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

        timer = window.setInterval(() => {
          /* A muted/ended clone must show silence, not whatever the last
             buffer happened to contain. */
          if (track.readyState !== "live" || !track.enabled) {
            smoothed = 0;
            setLevel(0);
            return;
          }
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const value = (data[i] - 128) / 128;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / data.length);
          const target = Math.max(
            0,
            Math.min(1, (rms - NOISE_FLOOR) * GAIN),
          );
          /* Smooth attack/release so a noisy auto-gain stage doesn't make
             the meter bounce between 0 and 100. */
          smoothed =
            target > smoothed
              ? smoothed + (target - smoothed) * ATTACK
              : smoothed * RELEASE;
          if (smoothed < 0.01) smoothed = 0;
          setLevel(smoothed);
        }, 90);
      } catch {
        /* audio metering is optional */
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      try {
        source?.disconnect();
      } catch {
        /* noop */
      }
      void context?.close().catch(() => undefined);
    };
  }, [stream, enabled]);

  return level;
}
