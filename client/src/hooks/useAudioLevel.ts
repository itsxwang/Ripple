import { useEffect, useState } from "react";

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

    try {
      context = new AudioContext();
      source = context.createMediaStreamSource(new MediaStream([track]));
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const value = (data[i] - 128) / 128;
          sum += value * value;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
      }, 90);
    } catch {
      /* audio metering is optional */
    }

    return () => {
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
