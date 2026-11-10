import { useCallback, useEffect, useRef, useState } from "react";
import { enumerateDevices, type DeviceList } from "../lib/media";
import type { Prefs } from "../types";

type Kind = "audio" | "video";

function constraintsFor(kind: Kind, deviceId?: string): MediaStreamConstraints {
  if (kind === "audio") {
    return {
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
  }
  return {
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
  };
}

function mediaErrorMessage(error: unknown): string {
  const name = (error as DOMException | undefined)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera and mic access is blocked. Allow it from the browser's address bar, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera or microphone was found. Plug one in and try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your camera or mic is busy in another app. Close it and try again.";
    case "OverconstrainedError":
      return "That device is no longer available. Pick another one below.";
    default:
      return "Couldn't start your camera and mic. Check browser permissions and try again.";
  }
}

function cameraErrorMessage(error: unknown): string {
  const name = (error as DOMException | undefined)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow it from the address bar, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found. Plug one in, then try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your camera is busy in another app. Close it, then try again.";
  }
  return "We couldn't start your camera. Check that it's connected and not in use, then try again.";
}

export interface MediaPreview {
  stream: MediaStream | null;
  devices: DeviceList;
  level: number;
  error: string | null;
  ready: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  retry: () => void;
  setDevice: (kind: Kind, deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
}

/**
 * Camera/mic preview used before joining a room. Acquires both tracks
 * once, then toggles `track.enabled` so switching is instant.
 */
export function useMediaPreview(
  prefs: Prefs,
  onPrefsChange: (patch: Partial<Prefs>) => void,
): MediaPreview {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<DeviceList>({
    audio: [],
    video: [],
  });
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const prefsChangeRef = useRef(onPrefsChange);
  prefsChangeRef.current = onPrefsChange;

  const publish = useCallback((next: MediaStream) => {
    streamRef.current = next;
    setStream(next);
  }, []);

  const refreshDevices = useCallback(async () => {
    const list = await enumerateDevices();
    setDevices(list);
    const audioTrack = streamRef.current?.getAudioTracks()[0];
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    const detectedAudio = audioTrack?.getSettings().deviceId;
    const detectedVideo = videoTrack?.getSettings().deviceId;
    const patch: Partial<Prefs> = {};
    if (!prefsRef.current.audioDeviceId && detectedAudio) {
      patch.audioDeviceId = detectedAudio;
    }
    if (!prefsRef.current.videoDeviceId && detectedVideo) {
      patch.videoDeviceId = detectedVideo;
    }
    if (Object.keys(patch).length > 0) prefsChangeRef.current(patch);
  }, []);

  const acquire = useCallback(async () => {
    const current = { ...prefsRef.current };
    const attempt = async (constraints: MediaStreamConstraints) => {
      try {
        return {
          stream: await navigator.mediaDevices.getUserMedia(constraints),
          error: null as unknown,
        };
      } catch (error) {
        return { stream: null, error };
      }
    };
    const audioConstraints = () =>
      constraintsFor("audio", current.audioDeviceId).audio;

    let result = await attempt({
      audio: audioConstraints(),
      video: constraintsFor("video", current.videoDeviceId).video,
    });

    // A saved device id can go stale between sessions (unplugged, or the
    // browser rotated ids). Drop the saved ids and retry with defaults.
    if (!result.stream) {
      const name = (result.error as DOMException | undefined)?.name;
      if (name === "OverconstrainedError" || name === "NotFoundError") {
        const patch: Partial<Prefs> = {};
        if (current.audioDeviceId) patch.audioDeviceId = undefined;
        if (current.videoDeviceId) patch.videoDeviceId = undefined;
        if (Object.keys(patch).length > 0) prefsChangeRef.current(patch);
        current.audioDeviceId = undefined;
        current.videoDeviceId = undefined;
      }
      result = await attempt({ audio: audioConstraints(), video: true });
    }

    let cameraError: unknown = null;
    if (!result.stream) {
      // Last resort: ask for audio and video separately so a busy camera
      // doesn't take the microphone down with it.
      const audioOnly = await attempt({ audio: audioConstraints() });
      const videoOnly = await attempt({ video: true });
      const tracks = [
        ...(audioOnly.stream?.getAudioTracks() ?? []),
        ...(videoOnly.stream?.getVideoTracks() ?? []),
      ];
      if (tracks.length > 0) {
        result = {
          stream: new MediaStream(tracks),
          error: audioOnly.error ?? videoOnly.error,
        };
      }
      if (!videoOnly.stream) cameraError = videoOnly.error;
    }

    const next = result.stream;
    if (!next) {
      setError(mediaErrorMessage(result.error));
      setReady(true);
      return;
    }

    const previous = streamRef.current;
    if (previous && previous !== next) {
      previous.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
    }

    const audioTrack = next.getAudioTracks()[0];
    const videoTrack = next.getVideoTracks()[0];
    if (audioTrack) audioTrack.enabled = prefsRef.current.micOn;
    if (videoTrack) videoTrack.enabled = prefsRef.current.camOn;
    publish(next);
    setReady(true);
    void refreshDevices();

    if (!videoTrack && prefsRef.current.camOn) {
      setError(cameraErrorMessage(cameraError ?? result.error));
    } else {
      setError(null);
    }
  }, [publish, refreshDevices]);

  const retry = useCallback(() => {
    setError(null);
    setReady(false);
    void acquire();
  }, [acquire]);

  /* Keep the preview tracks in sync when another surface (the media
     test buttons) changes the saved prefs. */
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const audio = stream.getAudioTracks()[0];
    if (audio) audio.enabled = prefs.micOn;
    const video = stream.getVideoTracks()[0];
    if (video) video.enabled = prefs.camOn;
  }, [prefs.micOn, prefs.camOn]);

  /* If someone switches a device back on after it was unavailable,
     try acquiring it again. Only react to an actual off → on toggle so
     a failed camera doesn't retry on every render. */
  const previousPrefsRef = useRef({
    micOn: prefs.micOn,
    camOn: prefs.camOn,
  });
  useEffect(() => {
    const previous = previousPrefsRef.current;
    previousPrefsRef.current = { micOn: prefs.micOn, camOn: prefs.camOn };
    if (!ready) return;
    const turnedOn =
      (prefs.micOn && !previous.micOn) || (prefs.camOn && !previous.camOn);
    if (!turnedOn) return;
    const stream = streamRef.current;
    const needAudio = prefs.micOn && !stream?.getAudioTracks().length;
    const needVideo = prefs.camOn && !stream?.getVideoTracks().length;
    if (needAudio || needVideo) void acquire();
  }, [prefs.micOn, prefs.camOn, ready, acquire]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser doesn't expose camera or microphone access.");
        setReady(true);
        return;
      }
      await acquire();
      if (cancelled) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
      }
    };
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      streamRef.current = null;
    };
  }, [acquire]);

  /* Mic level meter */
  useEffect(() => {
    if (!stream) {
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
        if (context.state === "suspended") await context.resume();
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
          const target = Math.max(0, Math.min(1, (rms - 0.012) * 7));
          smoothed =
            target > smoothed
              ? smoothed + (target - smoothed) * 0.6
              : smoothed * 0.82;
          if (smoothed < 0.01) smoothed = 0;
          setLevel(smoothed);
        }, 90);
      } catch {
        /* meter is optional */
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      void context?.close().catch(() => undefined);
    };
  }, [stream]);

  const toggleMic = useCallback(() => {
    const next = !prefsRef.current.micOn;
    prefsChangeRef.current({ micOn: next });
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) track.enabled = next;
    if (!track && next) void acquire();
  }, [acquire]);

  const toggleCam = useCallback(() => {
    const next = !prefsRef.current.camOn;
    prefsChangeRef.current({ camOn: next });
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) track.enabled = next;
    if (!track && next) void acquire();
  }, [acquire]);

  const setDevice = useCallback(
    async (kind: Kind, deviceId: string) => {
      prefsChangeRef.current(
        kind === "audio" ? { audioDeviceId: deviceId } : { videoDeviceId: deviceId },
      );
      try {
        const replacement = await navigator.mediaDevices.getUserMedia(
          constraintsFor(kind, deviceId),
        );
        const newTrack = replacement.getTracks()[0];
        if (!newTrack) return;
        newTrack.enabled =
          kind === "audio"
            ? prefsRef.current.micOn
            : prefsRef.current.camOn;
        const current = streamRef.current ?? new MediaStream();
        current
          .getTracks()
          .filter((track) => track.kind === kind)
          .forEach((track) => {
            try {
              track.stop();
            } catch {
              /* ignore */
            }
            current.removeTrack(track);
          });
        current.addTrack(newTrack);
        publish(new MediaStream(current.getTracks()));
        setError(null);
        void refreshDevices();
      } catch {
        setError("Could not switch that device. It may be busy or unplugged.");
      }
    },
    [publish, refreshDevices],
  );

  return {
    stream,
    devices,
    level,
    error,
    ready,
    toggleMic,
    toggleCam,
    retry,
    setDevice,
    refreshDevices,
  };
}
