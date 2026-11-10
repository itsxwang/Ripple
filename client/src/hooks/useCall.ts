import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_URL,
  randomAvatar,
  randomColor,
  roleFor,
} from "../lib/constants";
import { enumerateDevices, playReactionPop, type DeviceList } from "../lib/media";
import { isDmBlocked } from "../lib/dm";
import { getUserId } from "../lib/prefs";
import type {
  AdminActionPayload,
  ChatMessage,
  ChatReply,
  DmBlock,
  DmBlockScope,
  JoinIntent,
  JoinPolicy,
  LocalMute,
  MediaState,
  Member,
  MemberRole,
  Prefs,
  Presence,
  Profile,
  Reaction,
  Restriction,
  RoomInfo,
  Toast,
  TypingMap,
} from "../types";

interface RoomJoinedPayload {
  room: RoomInfo;
  self: Member;
  members: Member[];
  history: ChatMessage[];
  role: MemberRole;
}

interface SignalData {
  type?: "offer" | "answer" | "ice";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface SignalPayload {
  from: string;
  data: SignalData;
}

interface TypingPayload {
  from: string;
  userId?: string;
  name: string;
  to?: string;
  ts: number;
}

type ConnectionState = "connecting" | "online" | "lost";

const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:global.stun.twilio.com:3478",
    ],
  },
];

const EMPTY_MEDIA: MediaState = { micOn: false, camOn: false, screenOn: false };
const NO_RESTRICTION: Restriction = { mic: false, cam: false, screen: false };

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function mediaConstraints(prefs: Prefs): MediaStreamConstraints {
  return {
    audio: {
      ...(prefs.audioDeviceId
        ? { deviceId: { exact: prefs.audioDeviceId } }
        : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: {
      ...(prefs.videoDeviceId
        ? { deviceId: { exact: prefs.videoDeviceId } }
        : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
  };
}

function mediaPatch(media: MediaState): Partial<MediaState> {
  return {
    micOn: media.micOn,
    camOn: media.camOn,
    screenOn: media.screenOn,
  };
}

export function useCall(
  profile: Profile,
  intent: JoinIntent,
  prefs: Prefs,
  onPrefsChange: (patch: Partial<Prefs>) => void,
  onExit: (message?: string) => void,
) {
  const userIdRef = useRef(getUserId());
  const userId = userIdRef.current;

  /* ----------------------------- state ----------------------------- */
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [self, setSelf] = useState<Member>({
    id: "self",
    userId,
    name: profile.name,
    avatar: profile.avatar || randomAvatar(),
    photo: profile.photo,
    photoFull: profile.photoFull,
    color: profile.color || randomColor(),
    media: EMPTY_MEDIA,
    isSelf: true,
    role: "member",
    handRaised: false,
    restricted: NO_RESTRICTION,
  });
  const [selfId, setSelfId] = useState("");
  const [others, setOthers] = useState<Member[]>([]);
  const othersRef = useRef<Member[]>([]);
  othersRef.current = others;
  /* Snapshots of members who left, so DM history stays readable and labelled. */
  const [departed, setDeparted] = useState<Member[]>([]);
  const departedRef = useRef<Member[]>([]);
  departedRef.current = departed;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [selfMedia, setSelfMedia] = useState<MediaState>(EMPTY_MEDIA);
  const [localMutes, setLocalMutes] = useState<Record<string, LocalMute>>({});
  const [peerStates, setPeerStates] = useState<
    Record<string, RTCPeerConnectionState>
  >({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<TypingMap>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [speaking, setSpeaking] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [pending, setPending] = useState<{
    roomId: string;
    room: RoomInfo;
  } | null>(null);
  const [presence, setPresence] = useState<Presence>({
    online: 0,
    totalUsers: 0,
    rooms: 0,
    waiting: 0,
    inCalls: 0,
  });
  const [devices, setDevices] = useState<DeviceList>({ audio: [], video: [] });

  /* ------------------------------ refs ----------------------------- */
  const mountedRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<RoomInfo | null>(null);
  const pendingRef = useRef<string | null>(null);
  const selfIdRef = useRef("");
  const selfRef = useRef(self);
  selfRef.current = self;
  const selfMediaRef = useRef<MediaState>(EMPTY_MEDIA);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const leavingRef = useRef(false);
  const rejoinRef = useRef(false);
  const ignoreRoomsRef = useRef<string[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recoveringRef = useRef<Set<string>>(new Set());
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const laneRef = useRef(0);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const analysersRef = useRef<
    Map<
      string,
      {
        analyser: AnalyserNode;
        source: MediaStreamAudioSourceNode;
        data: Uint8Array<ArrayBuffer>;
      }
    >
  >(new Map());

  /* --------------------------- audio level ------------------------- */
  const ensureAudioContext = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const attachAnalyser = useCallback(
    (id: string, stream: MediaStream) => {
      const track = stream.getAudioTracks()[0];
      if (!track) return;
      const ctx = ensureAudioContext();
      if (!ctx) return;
      try {
        const previous = analysersRef.current.get(id);
        if (previous) previous.source.disconnect();
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.55;
        source.connect(analyser);
        analysersRef.current.set(id, {
          analyser,
          source,
          data: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
        });
      } catch {
        /* analyser is optional */
      }
    },
    [ensureAudioContext],
  );

  const detachAnalyser = useCallback((id: string) => {
    const entry = analysersRef.current.get(id);
    if (entry) {
      try {
        entry.source.disconnect();
      } catch {
        /* noop */
      }
      analysersRef.current.delete(id);
    }
  }, []);

  /* ---------------------------- toasts ----------------------------- */
  const notify = useCallback(
    (
      kind: Toast["kind"],
      title: string,
      subtitle?: string,
      avatar?: string,
      color?: string,
      photo?: string,
      action?: Toast["action"],
    ) => {
      const toast: Toast = {
        id: uid(),
        kind,
        title,
        subtitle,
        avatar,
        color,
        photo,
        action,
      };
      setToasts((prev) => [...prev.slice(-3), toast]);
      window.setTimeout(() => {
        if (mountedRef.current) {
          setToasts((prev) => prev.filter((item) => item.id !== toast.id));
        }
      }, 3800);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  /* ---------------------------- peers ------------------------------ */
  const resetPeers = useCallback(() => {
    peersRef.current.forEach((pc, id) => {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        /* noop */
      }
      detachAnalyser(id);
    });
    peersRef.current.clear();
    pendingIceRef.current.clear();
    remoteStreamsRef.current = {};
    setRemoteStreams({});
    setPeerStates({});
  }, [detachAnalyser]);

  const closePeer = useCallback(
    (id: string) => {
      const pc = peersRef.current.get(id);
      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.close();
        } catch {
          /* noop */
        }
        peersRef.current.delete(id);
      }
      pendingIceRef.current.delete(id);
      detachAnalyser(id);
      const nextStreams = { ...remoteStreamsRef.current };
      delete nextStreams[id];
      remoteStreamsRef.current = nextStreams;
      setRemoteStreams(nextStreams);
      setPeerStates((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [detachAnalyser],
  );

  const findSender = useCallback(
    (pc: RTCPeerConnection, kind: "audio" | "video") => {
      const transceiver = pc
        .getTransceivers()
        .find(
          (item) =>
            item.sender.track?.kind === kind ||
            item.receiver.track.kind === kind,
        );
      return transceiver?.sender ?? null;
    },
    [],
  );

  const replaceOutgoing = useCallback(
    async (kind: "audio" | "video", track: MediaStreamTrack | null) => {
      const jobs: Promise<void>[] = [];
      peersRef.current.forEach((pc) => {
        const sender = findSender(pc, kind);
        if (sender) {
          jobs.push(
            sender.replaceTrack(track).catch(() => {
              /* noop */
            }),
          );
        }
      });
      await Promise.all(jobs);
    },
    [findSender],
  );

  const currentVideoTrack = useCallback(
    () => screenTrackRef.current ?? cameraTrackRef.current ?? null,
    [],
  );

  /**
   * Grab one fresh track, retrying without a saved device id and then with
   * browser defaults. A stale saved id used to make camera/mic silently
   * fail even though the user had switched them on.
   */
  const acquireTrack = useCallback(
    async (kind: "audio" | "video"): Promise<MediaStreamTrack | null> => {
      const current = { ...prefsRef.current };
      const build = (useSaved: boolean): MediaStreamConstraints =>
        kind === "audio"
          ? {
              audio: {
                ...(useSaved && current.audioDeviceId
                  ? { deviceId: { exact: current.audioDeviceId } }
                  : {}),
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            }
          : {
              video: {
                ...(useSaved && current.videoDeviceId
                  ? { deviceId: { exact: current.videoDeviceId } }
                  : {}),
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
              },
            };
      const attempt = async (constraints: MediaStreamConstraints) => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          return { track: stream.getTracks()[0] ?? null, error: null as unknown };
        } catch (error) {
          return { track: null, error };
        }
      };

      let result = await attempt(build(true));
      if (!result.track) {
        const name = (result.error as DOMException | undefined)?.name;
        if (
          name === "OverconstrainedError" ||
          name === "NotFoundError" ||
          name === "NotReadableError"
        ) {
          const saved =
            kind === "audio" ? current.audioDeviceId : current.videoDeviceId;
          if (saved) {
            onPrefsChange(
              kind === "audio"
                ? { audioDeviceId: undefined }
                : { videoDeviceId: undefined },
            );
          }
        }
        result = await attempt(build(false));
      }
      if (!result.track) {
        result = await attempt(kind === "audio" ? { audio: true } : { video: true });
      }
      return result.track;
    },
    [onPrefsChange],
  );

  /**
   * The answerer must NOT pre-create transceivers: the offer already
   * defines the m-lines. Once the remote description is applied we
   * attach local tracks to those transceivers. Fixes late joiners not
   * receiving the existing members' audio/video.
   */
  const attachLocalToTransceivers = useCallback(async (pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    const audio = stream?.getAudioTracks()[0] ?? null;
    const video = currentVideoTrack();
    await Promise.all(
      pc.getTransceivers().map(async (transceiver) => {
        const kind = transceiver.receiver.track.kind;
        if (kind !== "audio" && kind !== "video") return;
        const track = kind === "audio" ? audio : video;
        try {
          transceiver.direction = "sendrecv";
          await transceiver.sender.replaceTrack(track);
        } catch {
          /* transceiver may be stopped */
        }
      }),
    );
  }, [currentVideoTrack]);

  const createPeer = useCallback(
    (remoteId: string, initiator: boolean) => {
      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(remoteId, pc);
      setPeerStates((prev) => ({ ...prev, [remoteId]: "new" }));

      if (initiator) {
        const audioTx = pc.addTransceiver("audio", { direction: "sendrecv" });
        const videoTx = pc.addTransceiver("video", { direction: "sendrecv" });
        const stream = localStreamRef.current;
        const audioTrack = stream?.getAudioTracks()[0] ?? null;
        const videoTrack = currentVideoTrack();
        if (audioTrack) void audioTx.sender.replaceTrack(audioTrack);
        if (videoTrack) void videoTx.sender.replaceTrack(videoTrack);
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("signal", {
            to: remoteId,
            data: { type: "ice", candidate: event.candidate.toJSON() },
          });
        }
      };

      pc.ontrack = (event) => {
        let next = remoteStreamsRef.current[remoteId];
        if (!next) next = new MediaStream();
        const duplicate = next
          .getTracks()
          .find((track) => track.id === event.track.id);
        if (!duplicate) {
          const sameKind = next
            .getTracks()
            .find((track) => track.kind === event.track.kind);
          if (sameKind) next.removeTrack(sameKind);
          next.addTrack(event.track);
        }
        remoteStreamsRef.current = {
          ...remoteStreamsRef.current,
          [remoteId]: next,
        };
        setRemoteStreams(remoteStreamsRef.current);
        if (event.track.kind === "audio") attachAnalyser(remoteId, next);
        event.track.onunmute = () => {
          /* keep the tile alive when a sender re-enables a track */
        };
      };

      pc.onconnectionstatechange = () => {
        setPeerStates((prev) => {
          if (prev[remoteId] === pc.connectionState) return prev;
          return { ...prev, [remoteId]: pc.connectionState };
        });
        if (pc.connectionState === "failed") {
          try {
            pc.restartIce();
          } catch {
            /* noop */
          }
        }
      };

      return pc;
    },
    [attachAnalyser, currentVideoTrack],
  );

  /* ------------------------- local media --------------------------- */
  const addLocalTrack = useCallback((track: MediaStreamTrack) => {
    let stream = localStreamRef.current;
    if (!stream) {
      stream = new MediaStream();
      localStreamRef.current = stream;
    }
    const sameKind = stream
      .getTracks()
      .find((existing) => existing.kind === track.kind);
    if (sameKind && sameKind.id !== track.id) {
      sameKind.onended = null;
      stream.removeTrack(sameKind);
      try {
        sameKind.stop();
      } catch {
        /* noop */
      }
    }
    stream.addTrack(track);
    setLocalStream(new MediaStream(stream.getTracks()));
  }, []);

  /**
   * A device can disappear (unplugged, OS revokes it, another app grabs
   * it). Reacquire transparently so the call keeps working instead of
   * showing a permanently frozen tile.
   */
  const recoverDevice = useCallback(
    async (kind: "audio" | "video", announce = true, force = false) => {
      if (!mountedRef.current || leavingRef.current) return;
      if (recoveringRef.current.has(kind)) return;
      const media = selfMediaRef.current;
      if (!force && (kind === "audio" ? !media.micOn : !media.camOn)) return;
      if (kind === "audio" && selfRef.current.restricted.mic) return;
      if (kind === "video" && selfRef.current.restricted.cam) return;
      if (kind === "video" && screenTrackRef.current) return;
      recoveringRef.current.add(kind);
      try {
        const track = await acquireTrack(kind);
        if (!track) {
          if (announce) {
            notify(
              "error",
              kind === "audio"
                ? "Microphone disconnected"
                : "Camera disconnected",
              "Reconnect it or check your browser permissions, then retry in settings.",
            );
          }
          return;
        }
        track.enabled = true;
        if (kind === "audio") {
          addLocalTrack(track);
          attachAnalyser("self", localStreamRef.current ?? new MediaStream([track]));
          await replaceOutgoing("audio", track);
          const next = { ...selfMediaRef.current, micOn: true };
          selfMediaRef.current = next;
          setSelfMedia(next);
        } else {
          cameraTrackRef.current = track;
          addLocalTrack(track);
          await replaceOutgoing("video", track);
          const next = { ...selfMediaRef.current, camOn: true };
          selfMediaRef.current = next;
          setSelfMedia(next);
        }
        track.onended = () => {
          if (track.readyState === "ended") void recoverDevice(kind);
        };
        if (announce) {
          notify(
            "info",
            kind === "audio" ? "Microphone restored" : "Camera restored",
            "Your device reconnected automatically.",
          );
        }
      } finally {
        recoveringRef.current.delete(kind);
      }
    },
    [
      acquireTrack,
      addLocalTrack,
      attachAnalyser,
      notify,
      replaceOutgoing,
    ],
  );

  const watchTrack = useCallback(
    (track: MediaStreamTrack) => {
      track.onended = () => {
        if (track.readyState === "ended") {
          void recoverDevice(track.kind as "audio" | "video");
        }
      };
    },
    [recoverDevice],
  );

  const adoptStream = useCallback(
    (incoming: MediaStream) => {
      const previous = localStreamRef.current;
      previous?.getTracks().forEach((track) => {
        if (!incoming.getTracks().includes(track)) track.onended = null;
      });
      const audio = incoming.getAudioTracks()[0];
      const video = incoming.getVideoTracks()[0];
      if (audio) audio.enabled = prefsRef.current.micOn;
      if (video) video.enabled = prefsRef.current.camOn;
      const stream = new MediaStream();
      if (audio) {
        stream.addTrack(audio);
        watchTrack(audio);
      }
      if (video) {
        stream.addTrack(video);
        watchTrack(video);
      }
      localStreamRef.current = stream;
      cameraTrackRef.current = video ?? null;
      setLocalStream(stream);
      const nextMedia: MediaState = {
        micOn: Boolean(audio?.enabled),
        camOn: Boolean(video?.enabled),
        screenOn: false,
      };
      selfMediaRef.current = nextMedia;
      setSelfMedia(nextMedia);
      if (audio) attachAnalyser("self", stream);
      ensureAudioContext();
    },
    [attachAnalyser, ensureAudioContext, watchTrack],
  );

  const acquireMedia = useCallback(async () => {
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
      mediaConstraints(current).audio as MediaTrackConstraints;

    let result = await attempt({
      audio: audioConstraints(),
      video: mediaConstraints(current).video,
    });

    // A device saved in a previous session can disappear (unplugged, or the
    // browser rotated ids). Drop the saved ids and retry with defaults.
    if (!result.stream) {
      const name = (result.error as DOMException | undefined)?.name;
      if (name === "OverconstrainedError" || name === "NotFoundError") {
        const patch: Partial<Prefs> = {};
        if (current.audioDeviceId) patch.audioDeviceId = undefined;
        if (current.videoDeviceId) patch.videoDeviceId = undefined;
        if (Object.keys(patch).length > 0) onPrefsChange(patch);
        current.audioDeviceId = undefined;
        current.videoDeviceId = undefined;
      }
      result = await attempt({ audio: audioConstraints(), video: true });
    }

    if (!result.stream) {
      // Last resort: ask for audio and video separately so one busy device
      // doesn't take the other down with it.
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
    }

    const stream = result.stream;
    if (!stream) {
      if (mountedRef.current) {
        notify(
          "error",
          "Camera & mic are blocked",
          "Check your browser permissions — you can still chat.",
        );
      }
      return;
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    adoptStream(stream);

    const hasAudio = stream.getAudioTracks().length > 0;
    const hasVideo = stream.getVideoTracks().length > 0;
    if (!hasVideo && prefsRef.current.camOn) {
      notify(
        "info",
        "Camera unavailable",
        "You joined with audio only. You can turn video on anytime.",
      );
    } else if (!hasAudio && prefsRef.current.micOn) {
      notify(
        "info",
        "Microphone unavailable",
        "You joined without audio. You can still use text chat.",
      );
    }
  }, [adoptStream, notify, onPrefsChange]);

  /* --------------------------- actions ----------------------------- */
  const toggleMic = useCallback(() => {
    ensureAudioContext();
    if (selfRef.current.restricted.mic) {
      notify(
        "error",
        "Muted by a host",
        "Only the host or an admin can let you speak again.",
      );
      return;
    }
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track && track.readyState === "live") {
      const nextEnabled = !track.enabled;
      track.enabled = nextEnabled;
      const next = { ...selfMediaRef.current, micOn: nextEnabled };
      selfMediaRef.current = next;
      setSelfMedia(next);
      /* Some OS/driver combinations leave a live track "muted" without
         firing `ended`. If turning it back on doesn't restore audio,
         reacquire the device shortly afterwards. */
      if (nextEnabled && track.muted) {
        window.setTimeout(() => {
          if (track.muted && track.enabled) {
            void recoverDevice("audio", false, true);
          }
        }, 600);
      }
      return;
    }
    void (async () => {
      const nextTrack = await acquireTrack("audio");
      if (!nextTrack) {
        notify(
          "error",
          "Microphone unavailable",
          "Allow microphone access in your browser, then try again.",
        );
        return;
      }
      nextTrack.enabled = true;
      addLocalTrack(nextTrack);
      watchTrack(nextTrack);
      attachAnalyser(
        "self",
        localStreamRef.current ?? new MediaStream([nextTrack]),
      );
      await replaceOutgoing("audio", nextTrack);
      const next = { ...selfMediaRef.current, micOn: true };
      selfMediaRef.current = next;
      setSelfMedia(next);
    })();
  }, [
    acquireTrack,
    addLocalTrack,
    attachAnalyser,
    ensureAudioContext,
    notify,
    recoverDevice,
    replaceOutgoing,
    watchTrack,
  ]);

  const toggleCam = useCallback(() => {
    ensureAudioContext();
    if (selfRef.current.restricted.cam) {
      notify(
        "error",
        "Camera locked by a host",
        "Only the host or an admin can turn it back on.",
      );
      return;
    }
    if (screenTrackRef.current) {
      notify(
        "info",
        "You're sharing your screen",
        "Stop sharing before toggling your camera.",
      );
      return;
    }
    const track = cameraTrackRef.current;
    if (track && track.readyState === "live") {
      const nextEnabled = !track.enabled;
      track.enabled = nextEnabled;
      const next = { ...selfMediaRef.current, camOn: nextEnabled };
      selfMediaRef.current = next;
      setSelfMedia(next);
      if (nextEnabled && track.muted) {
        window.setTimeout(() => {
          if (track.muted && track.enabled) {
            void recoverDevice("video", false, true);
          }
        }, 600);
      }
      return;
    }
    void (async () => {
      const nextTrack = await acquireTrack("video");
      if (!nextTrack) {
        notify(
          "error",
          "Camera unavailable",
          "Allow camera access in your browser, then try again.",
        );
        return;
      }
      nextTrack.enabled = true;
      cameraTrackRef.current = nextTrack;
      addLocalTrack(nextTrack);
      watchTrack(nextTrack);
      await replaceOutgoing("video", nextTrack);
      const next = { ...selfMediaRef.current, camOn: true };
      selfMediaRef.current = next;
      setSelfMedia(next);
    })();
  }, [
    acquireTrack,
    addLocalTrack,
    ensureAudioContext,
    notify,
    recoverDevice,
    replaceOutgoing,
    watchTrack,
  ]);

  const stopScreenShare = useCallback(() => {
    const track = screenTrackRef.current;
    screenTrackRef.current = null;
    screenStreamRef.current = null;
    setScreenStream(null);
    if (track) {
      track.onended = null;
      try {
        track.stop();
      } catch {
        /* noop */
      }
    }
    const camera = cameraTrackRef.current;
    void replaceOutgoing(
      "video",
      camera && camera.enabled && camera.readyState === "live" ? camera : null,
    );
    const next = { ...selfMediaRef.current, screenOn: false };
    selfMediaRef.current = next;
    setSelfMedia(next);
  }, [replaceOutgoing]);

  const screenAllowed = useCallback(() => {
    const currentRoom = roomRef.current;
    const me = selfRef.current;
    if (me.restricted.cam) {
      return {
        allowed: false,
        message: "A host restricted your camera in this room.",
      };
    }
    if (me.restricted.screen) {
      return {
        allowed: false,
        message: "A host turned off screen sharing for you.",
      };
    }
    if (!currentRoom || me.role !== "member" || currentRoom.kind !== "party") {
      return { allowed: true, message: "" };
    }
    if (currentRoom.screenShare === "off") {
      return {
        allowed: false,
        message: "Screen sharing is turned off in this room.",
      };
    }
    if (currentRoom.screenShare === "admins") {
      return {
        allowed: false,
        message: "Only hosts and admins can share their screen here.",
      };
    }
    return { allowed: true, message: "" };
  }, []);

  const toggleScreen = useCallback(() => {
    ensureAudioContext();
    if (selfRef.current.restricted.cam) {
      notify(
        "error",
        "Screen sharing is locked",
        "A host restricted your camera in this room.",
      );
      return;
    }
    if (screenTrackRef.current) {
      stopScreenShare();
      return;
    }
    const permission = screenAllowed();
    if (!permission.allowed) {
      notify("error", "Screen sharing unavailable", permission.message);
      return;
    }
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false,
        });
        const track = stream.getVideoTracks()[0];
        if (!track) return;
        screenTrackRef.current = track;
        screenStreamRef.current = stream;
        setScreenStream(stream);
        await replaceOutgoing("video", track);
        track.onended = () => stopScreenShare();
        const next = { ...selfMediaRef.current, screenOn: true };
        selfMediaRef.current = next;
        setSelfMedia(next);
      } catch {
        /* user cancelled */
      }
    })();
  }, [
    ensureAudioContext,
    notify,
    replaceOutgoing,
    screenAllowed,
    stopScreenShare,
  ]);

  const toggleHand = useCallback(() => {
    socketRef.current?.emit("hand:raise");
  }, []);

  const profilePayload = useCallback(
    () => ({
      name: profileRef.current.name,
      avatar: profileRef.current.avatar,
      photo: profileRef.current.photo,
      photoFull: profileRef.current.photoFull,
      color: profileRef.current.color,
      media: selfMediaRef.current,
    }),
    [],
  );

  const next = useCallback(() => {
    if (intent.type !== "random") return;
    const socket = socketRef.current;
    const previousRoom = roomRef.current?.id;
    if (previousRoom) {
      ignoreRoomsRef.current = [
        ...ignoreRoomsRef.current.slice(-8),
        previousRoom,
      ];
    }
    setMatching(true);
    setRoom(null);
    roomRef.current = null;
    setOthers([]);
    setDeparted([]);
    setMessages([]);
    setTyping({});
    setReactions([]);
    setPending(null);
    pendingRef.current = null;
    setSpeaking((prev) => prev.filter((id) => id === "self"));
    selfIdRef.current = "";
    setSelfId("");
    resetPeers();
    socket?.emit("room:leave");
    socket?.emit("room:random", {
      userId: userIdRef.current,
      profile: profilePayload(),
      mode: intent.mode,
      ignoreRooms: ignoreRoomsRef.current,
    });
  }, [intent, profilePayload, resetPeers]);

  const exitToLobby = useCallback(
    (message?: string) => {
      leavingRef.current = true;
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      resetPeers();
      onExit(message);
    },
    [onExit, resetPeers],
  );

  const leave = useCallback(
    (message?: string) => {
      const socket = socketRef.current;
      socket?.emit("room:leave");
      exitToLobby(message);
    },
    [exitToLobby],
  );

  const sendMessage = useCallback(
    (text: string, to?: string, replyTo?: ChatReply) => {
      const clean = text.trim();
      if (!clean) return;
      socketRef.current?.emit("chat:send", {
        text: clean,
        to: to ?? null,
        replyTo: replyTo ?? null,
      });
    },
    [],
  );

  const sendTyping = useCallback((to?: string) => {
    socketRef.current?.emit("chat:typing", { to: to ?? null });
  }, []);

  const sendReaction = useCallback(
    (payload: { emoji?: string; gif?: string }) => {
      ensureAudioContext();
      socketRef.current?.emit("reaction", payload);
    },
    [ensureAudioContext],
  );

  const adminAction = useCallback((payload: AdminActionPayload) => {
    socketRef.current?.emit("admin:action", payload);
  }, []);

  const toggleLocalMute = useCallback(
    (targetUserId: string, kind: "audio" | "video") => {
      setLocalMutes((prev) => {
        const current = prev[targetUserId] ?? { audio: false, video: false };
        return {
          ...prev,
          [targetUserId]: { ...current, [kind]: !current[kind] },
        };
      });
    },
    [],
  );

  const retryMedia = useCallback(() => {
    const media = selfMediaRef.current;
    const audio = localStreamRef.current?.getAudioTracks()[0];
    const video = cameraTrackRef.current;
    /* Explicit reconnect should also rescue a track that failed to start,
       even if that left the mic/camera state at "off". */
    if (media.micOn || !audio) void recoverDevice("audio", false, !media.micOn);
    if (media.camOn || !video) void recoverDevice("video", false, !media.camOn);
  }, [recoverDevice]);

  const setJoinPolicy = useCallback((policy: JoinPolicy) => {
    socketRef.current?.emit("admin:action", {
      action: "setPolicy",
      policy,
    });
  }, []);

  const approveRequest = useCallback((targetUserId: string) => {
    socketRef.current?.emit("admin:action", {
      action: "approve",
      targetUserId,
    });
  }, []);

  const denyRequest = useCallback((targetUserId: string) => {
    socketRef.current?.emit("admin:action", {
      action: "deny",
      targetUserId,
    });
  }, []);

  const unban = useCallback((targetUserId: string) => {
    socketRef.current?.emit("admin:action", {
      action: "unban",
      targetUserId,
    });
  }, []);

  const updatePrefs = useCallback(
    (patch: Partial<Prefs>) => onPrefsChange(patch),
    [onPrefsChange],
  );

  /** Remember a DM block and immediately drop any of that member's DMs. */
  const blockDm = useCallback(
    (member: Member, scope: DmBlockScope) => {
      const block: DmBlock = {
        userId: member.userId,
        name: member.name,
        avatar: member.avatar,
        photo: member.photo,
        color: member.color,
        scope,
        roomId: scope === "room" ? roomRef.current?.id : undefined,
        ts: Date.now(),
      };
      const dmBlocks = { ...prefsRef.current.dmBlocks, [member.userId]: block };
      /* Update the ref right away so DMs that arrive before the next render
         are already filtered. */
      prefsRef.current = { ...prefsRef.current, dmBlocks };
      onPrefsChange({ dmBlocks });

      const selfId = selfIdRef.current;
      setMessages((prev) =>
        prev.filter(
          (message) =>
            !(
              message.to === selfId &&
              (message.fromUserId === member.userId ||
                message.from === member.id)
            ),
        ),
      );
      setTyping((prev) => {
        const next = { ...prev };
        for (const [key, entry] of Object.entries(next)) {
          if (
            entry.to === selfId &&
            (entry.userId === member.userId || entry.from === member.id)
          ) {
            delete next[key];
          }
        }
        return next;
      });
    },
    [onPrefsChange],
  );

  const unblockDm = useCallback(
    (targetUserId: string) => {
      if (!prefsRef.current.dmBlocks[targetUserId]) return;
      const dmBlocks = { ...prefsRef.current.dmBlocks };
      delete dmBlocks[targetUserId];
      prefsRef.current = { ...prefsRef.current, dmBlocks };
      onPrefsChange({ dmBlocks });
    },
    [onPrefsChange],
  );

  const refreshDevices = useCallback(async () => {
    const list = await enumerateDevices();
    setDevices(list);
  }, []);

  const switchDevice = useCallback(
    async (kind: "audio" | "video", deviceId: string) => {
      onPrefsChange(
        kind === "audio"
          ? { audioDeviceId: deviceId }
          : { videoDeviceId: deviceId },
      );
      try {
        const constraints: MediaStreamConstraints =
          kind === "audio"
            ? {
                audio: {
                  deviceId: { exact: deviceId },
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
              }
            : {
                video: {
                  deviceId: { exact: deviceId },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: "user",
                },
              };
        const replacement = await navigator.mediaDevices.getUserMedia(
          constraints,
        );
        const nextTrack = replacement.getTracks()[0];
        if (!nextTrack) return;
        if (kind === "audio") {
          nextTrack.enabled = selfMediaRef.current.micOn;
          addLocalTrack(nextTrack);
          attachAnalyser("self", localStreamRef.current ?? replacement);
          await replaceOutgoing("audio", nextTrack);
        } else {
          nextTrack.enabled = selfMediaRef.current.camOn;
          cameraTrackRef.current = nextTrack;
          addLocalTrack(nextTrack);
          if (!screenTrackRef.current) {
            await replaceOutgoing("video", nextTrack);
          }
        }
        notify(
          "info",
          kind === "audio" ? "Microphone switched" : "Camera switched",
        );
        void refreshDevices();
      } catch {
        notify(
          "error",
          "Could not switch that device",
          "It may be in use by another app.",
        );
      }
    },
    [
      addLocalTrack,
      attachAnalyser,
      notify,
      onPrefsChange,
      refreshDevices,
      replaceOutgoing,
    ],
  );

  /* --------------------- self media broadcasting ------------------- */
  useEffect(() => {
    selfMediaRef.current = selfMedia;
    setSelf((prev) => ({ ...prev, media: selfMedia }));
    socketRef.current?.emit("media:update", mediaPatch(selfMedia));
  }, [selfMedia]);

  /* ------------------ host media restrictions --------------------- */
  useEffect(() => {
    const restriction = self.restricted;
    if (restriction.mic) {
      const track = localStreamRef.current?.getAudioTracks()[0];
      if (track && track.enabled) track.enabled = false;
      if (selfMediaRef.current.micOn) {
        const next = { ...selfMediaRef.current, micOn: false };
        selfMediaRef.current = next;
        setSelfMedia(next);
      }
    }
    if (restriction.cam) {
      const track = cameraTrackRef.current;
      if (track && track.enabled) track.enabled = false;
      if (screenTrackRef.current) {
        stopScreenShare();
      }
      if (selfMediaRef.current.camOn || selfMediaRef.current.screenOn) {
        const next = {
          ...selfMediaRef.current,
          camOn: false,
          screenOn: false,
        };
        selfMediaRef.current = next;
        setSelfMedia(next);
      }
    }
    if (restriction.screen && screenTrackRef.current) {
      stopScreenShare();
    }
  }, [self.restricted, stopScreenShare]);

  /* --------------------- speaking detection loop ------------------- */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const active: string[] = [];
      analysersRef.current.forEach((entry, id) => {
        entry.analyser.getByteTimeDomainData(entry.data);
        let sum = 0;
        for (let i = 0; i < entry.data.length; i += 1) {
          const value = (entry.data[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / entry.data.length);
        if (rms > 0.038) active.push(id);
      });
      setSpeaking((prev) => {
        if (
          prev.length === active.length &&
          prev.every((id, index) => id === active[index])
        ) {
          return prev;
        }
        return active;
      });
    }, 140);
    return () => window.clearInterval(timer);
  }, []);

  /* ----------------------- typing expiry --------------------------- */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        let changed = false;
        const next: TypingMap = {};
        Object.entries(prev).forEach(([id, entry]) => {
          if (now - entry.ts < 3200) {
            next[id] = entry;
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  /* ----------------------- device changes ------------------------- */
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const healthCheck = () => {
      if (leavingRef.current) return;
      const audio = localStreamRef.current?.getAudioTracks()[0];
      const video = cameraTrackRef.current;
      if (
        selfMediaRef.current.micOn &&
        (!audio || audio.readyState !== "live")
      ) {
        void recoverDevice("audio", false);
      }
      if (
        selfMediaRef.current.camOn &&
        !screenTrackRef.current &&
        (!video || video.readyState !== "live")
      ) {
        void recoverDevice("video", false);
      }
    };
    const handler = () => {
      void refreshDevices();
      healthCheck();
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      healthCheck();
    };
    // Some devices go silent without firing `ended` (USB hiccups, OS
    // suspending the camera, another app grabbing it). A light poll keeps
    // mic/camera alive instead of leaving a dead track behind.
    const timer = window.setInterval(healthCheck, 1800);
    navigator.mediaDevices.addEventListener("devicechange", handler);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      navigator.mediaDevices.removeEventListener("devicechange", handler);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [recoverDevice, refreshDevices]);

  /* --------------------------- lifecycle --------------------------- */
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let hasConnectedOnce = false;

    const handleSignal = async ({ from, data }: SignalPayload) => {
      const socket = socketRef.current;
      if (!socket) return;
      let pc = peersRef.current.get(from);
      if (!pc) pc = createPeer(from, false);
      if (!pc) return;

      try {
        if (data.type === "offer" && data.sdp) {
          if (pc.signalingState === "have-local-offer") {
            await pc.setLocalDescription({
              type: "rollback",
            } as RTCSessionDescriptionInit);
          }
          await pc.setRemoteDescription(data.sdp);
          await attachLocalToTransceivers(pc);
          const queued = pendingIceRef.current.get(from);
          if (queued) {
            pendingIceRef.current.delete(from);
            for (const candidate of queued) {
              try {
                await pc.addIceCandidate(candidate);
              } catch {
                /* noop */
              }
            }
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("signal", {
            to: from,
            data: { type: "answer", sdp: pc.localDescription },
          });
        } else if (data.type === "answer" && data.sdp) {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(data.sdp);
            const queued = pendingIceRef.current.get(from);
            if (queued) {
              pendingIceRef.current.delete(from);
              for (const candidate of queued) {
                try {
                  await pc.addIceCandidate(candidate);
                } catch {
                  /* noop */
                }
              }
            }
          }
        } else if (data.type === "ice" && data.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(data.candidate);
          } else {
            const queue = pendingIceRef.current.get(from) ?? [];
            queue.push(data.candidate);
            pendingIceRef.current.set(from, queue);
          }
        }
      } catch (signalError) {
        console.error("[signal] failed", signalError);
      }
    };

    const initiateOffer = async (remoteId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      const pc = createPeer(remoteId, true);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("signal", {
          to: remoteId,
          data: { type: "offer", sdp: pc.localDescription },
        });
      } catch (offerError) {
        console.error("[offer] failed", offerError);
      }
    };

    const sendJoin = () => {
      const socket = socketRef.current;
      if (!socket) return;
      const payload = {
        userId: userIdRef.current,
        profile: profilePayload(),
      };
      if (intent.type === "create") {
        socket.emit("room:create", {
          ...payload,
          kind: intent.kind ?? "private",
          joinPolicy: intent.joinPolicy ?? "open",
        });
      } else if (intent.type === "join") {
        socket.emit("room:join", {
          ...payload,
          roomId: intent.roomId.trim().toUpperCase(),
        });
      } else {
        socket.emit("room:random", {
          ...payload,
          mode: intent.mode,
          ignoreRooms: ignoreRoomsRef.current,
        });
      }
    };

    const connect = () => {
      const socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 700,
        timeout: 12000,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (!mountedRef.current) return;
        setConnection("online");
        void refreshDevices();
        if (!hasConnectedOnce) {
          hasConnectedOnce = true;
          sendJoin();
          return;
        }
        resetPeers();
        setOthers([]);
        setDeparted([]);
        setMatching(false);
        if (roomRef.current) {
          rejoinRef.current = true;
          socket.emit("room:join", {
            userId: userIdRef.current,
            profile: profilePayload(),
            roomId: roomRef.current.id,
          });
        } else if (pendingRef.current) {
          rejoinRef.current = true;
          socket.emit("room:join", {
            userId: userIdRef.current,
            profile: profilePayload(),
            roomId: pendingRef.current,
          });
        } else {
          sendJoin();
        }
      });

      socket.on("disconnect", () => {
        if (!mountedRef.current || leavingRef.current) return;
        setConnection("lost");
      });

      socket.on("connect_error", () => {
        if (!mountedRef.current || leavingRef.current) return;
        setConnection("lost");
      });

      socket.on("room:joined", (payload: RoomJoinedPayload) => {
        if (!mountedRef.current) return;
        rejoinRef.current = false;
        setConnection("online");
        setMatching(false);
        setError(null);
        setPending(null);
        pendingRef.current = null;
        roomRef.current = payload.room;
        setRoom(payload.room);
        selfIdRef.current = payload.self.id;
        setSelfId(payload.self.id);
        setSelf({
          ...payload.self,
          id: "self",
          media: selfMediaRef.current,
          isSelf: true,
          restricted: payload.self.restricted ?? NO_RESTRICTION,
        });
        resetPeers();
        setOthers(payload.members);
        setDeparted([]);
        setMessages(payload.history ?? []);
        setTyping({});
        setReactions([]);
        setLocalMutes({});
        void refreshDevices();
        socket.emit("media:update", mediaPatch(selfMediaRef.current));
        payload.members.forEach((member) => {
          void initiateOffer(member.id);
        });
      });

      socket.on("member:joined", ({ member }: { member: Member }) => {
        if (!mountedRef.current) return;
        /* If this profile is rejoining after leaving, keep their DM history
           attached by moving it from the old member id to the new one. */
        const returning = departedRef.current.find(
          (item) => item.userId === member.userId && item.id !== member.id,
        );
        if (returning) {
          const previousId = returning.id;
          setMessages((prev) =>
            prev.map((message) => {
              if (message.from === previousId) {
                return { ...message, from: member.id };
              }
              if (message.to === previousId) {
                return { ...message, to: member.id };
              }
              return message;
            }),
          );
        }
        setOthers((prev) => [
          ...prev.filter((item) => item.userId !== member.userId),
          member,
        ]);
        /* Rejoining clears the "left" snapshot for this profile. */
        setDeparted((prev) =>
          prev.filter((item) => item.userId !== member.userId),
        );
        notify(
          "join",
          member.name,
          "joined the room",
          member.avatar,
          member.color,
          member.photo,
        );
      });

      socket.on("member:left", ({ id, name }: { id: string; name: string }) => {
        if (!mountedRef.current) return;
        const leaving = othersRef.current.find((member) => member.id === id);
        if (leaving) {
          setDeparted((prev) => [
            ...prev.filter((member) => member.userId !== leaving.userId),
            {
              ...leaving,
              media: EMPTY_MEDIA,
              handRaised: false,
              restricted: NO_RESTRICTION,
            },
          ]);
        }
        setOthers((prev) => prev.filter((member) => member.id !== id));
        closePeer(id);
        setTyping((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        notify("leave", name, "left the room");
      });

      socket.on(
        "member:updated",
        ({
          id,
          userId: memberUserId,
          media,
          handRaised,
          restricted,
        }: {
          id: string;
          userId?: string;
          media: MediaState;
          handRaised?: boolean;
          restricted?: Restriction;
        }) => {
          if (!mountedRef.current) return;
          if (id === selfIdRef.current) {
            setSelf((prev) => ({
              ...prev,
              media,
              handRaised: handRaised ?? prev.handRaised,
              restricted: restricted ?? prev.restricted,
            }));
            return;
          }
          setOthers((prev) =>
            prev.map((member) =>
              member.id === id
                ? {
                    ...member,
                    media,
                    userId: memberUserId ?? member.userId,
                    handRaised: handRaised ?? member.handRaised,
                    restricted: restricted ?? member.restricted,
                  }
                : member,
            ),
          );
        },
      );

      socket.on("room:updated", ({ room: nextRoom }: { room: RoomInfo }) => {
        if (!mountedRef.current) return;
        roomRef.current = nextRoom;
        setRoom(nextRoom);
        const myRole = roleFor(
          nextRoom.hostId,
          nextRoom.admins,
          userIdRef.current,
        );
        setSelf((prev) => ({ ...prev, role: myRole }));
        setOthers((prev) =>
          prev.map((member) => ({
            ...member,
            role: roleFor(
              nextRoom.hostId,
              nextRoom.admins,
              member.userId,
            ),
          })),
        );
      });

      socket.on("restriction:updated", (payload: Restriction & { userId: string }) => {
        if (!mountedRef.current) return;
        if (payload.userId === userIdRef.current) {
          setSelf((prev) => ({
            ...prev,
            restricted: {
              mic: payload.mic,
              cam: payload.cam,
              screen: Boolean(payload.screen),
            },
          }));
          return;
        }
        setOthers((prev) =>
          prev.map((member) =>
            member.userId === payload.userId
              ? {
                  ...member,
                  restricted: {
                    mic: payload.mic,
                    cam: payload.cam,
                    screen: Boolean(payload.screen),
                  },
                }
              : member,
          ),
        );
      });

      socket.on(
        "restriction",
        (payload: Restriction & { by?: string }) => {
          if (!mountedRef.current) return;
          setSelf((prev) => ({
            ...prev,
            restricted: {
              mic: payload.mic,
              cam: payload.cam,
              screen: Boolean(payload.screen),
            },
          }));
          if (payload.mic) {
            notify(
              "error",
              "Muted by a host",
              `${payload.by ?? "A host"} restricted your microphone.`,
            );
          }
          if (payload.cam) {
            notify(
              "error",
              "Camera locked",
              `${payload.by ?? "A host"} turned off your camera.`,
            );
          }
          if (payload.screen) {
            notify(
              "error",
              "Screen sharing locked",
              `${payload.by ?? "A host"} turned off screen sharing for you.`,
            );
          }
        },
      );

      socket.on("screen:stop", ({ message }: { message?: string }) => {
        if (!mountedRef.current) return;
        stopScreenShare();
        notify(
          "info",
          "Screen share stopped",
          message ?? "Screen sharing is no longer available.",
        );
      });

      socket.on(
        "hand:updated",
        ({ id, raised }: { id: string; raised: boolean }) => {
          if (!mountedRef.current) return;
          if (id === selfIdRef.current) {
            setSelf((prev) => ({ ...prev, handRaised: raised }));
            return;
          }
          setOthers((prev) =>
            prev.map((member) =>
              member.id === id ? { ...member, handRaised: raised } : member,
            ),
          );
        },
      );

      socket.on("chat:new", (message: ChatMessage) => {
        if (!mountedRef.current) return;
        const selfId = selfIdRef.current;
        const senderUserId =
          message.fromUserId ??
          (message.from === selfId
            ? userIdRef.current
            : othersRef.current.find((member) => member.id === message.from)
                ?.userId);
        /* Blocking is viewer-side: the server still routes the DM, but it
           never reaches this member's message list, unread count or toasts. */
        if (
          message.to &&
          message.to === selfId &&
          senderUserId &&
          isDmBlocked(
            prefsRef.current.dmBlocks[senderUserId],
            roomRef.current?.id,
          )
        ) {
          return;
        }
        setMessages((prev) => {
          if (prev.some((item) => item.id === message.id)) return prev;
          return [
            ...prev,
            { ...message, receivedAt: Date.now() },
          ].slice(-220);
        });
      });

      socket.on("chat:typing", (entry: TypingPayload) => {
        if (!mountedRef.current) return;
        const selfId = selfIdRef.current;
        const senderUserId =
          entry.userId ??
          (entry.from === selfId
            ? userIdRef.current
            : othersRef.current.find((member) => member.id === entry.from)
                ?.userId);
        if (
          entry.to &&
          entry.to === selfId &&
          senderUserId &&
          isDmBlocked(
            prefsRef.current.dmBlocks[senderUserId],
            roomRef.current?.id,
          )
        ) {
          return;
        }
        setTyping((prev) => ({
          ...prev,
          [entry.from]: {
            from: entry.from,
            userId: entry.userId,
            name: entry.name,
            to: entry.to,
            ts: entry.ts,
          },
        }));
      });

      socket.on("reaction", (reaction: Reaction) => {
        if (!mountedRef.current) return;
        const lane = laneRef.current % 8;
        laneRef.current += 1;
        const withLane = { ...reaction, lane };
        setReactions((prev) => [...prev.slice(-24), withLane]);
        if (
          prefsRef.current.reactionSounds &&
          reaction.userId !== userIdRef.current
        ) {
          playReactionPop();
        }
        window.setTimeout(() => {
          if (mountedRef.current) {
            setReactions((prev) =>
              prev.filter((item) => item.id !== reaction.id),
            );
          }
        }, 3800);
      });

      socket.on("presence", (data: Partial<Presence>) => {
        if (!mountedRef.current) return;
        setPresence((prev) => ({ ...prev, ...data }));
      });

      socket.on(
        "join:pending",
        (payload: { roomId: string; room: RoomInfo }) => {
          if (!mountedRef.current) return;
          setPending(payload);
          pendingRef.current = payload.roomId;
          setMatching(false);
          setConnection("online");
          setError(null);
        },
      );

      socket.on(
        "join:denied",
        (payload: { message?: string; roomId: string }) => {
          if (!mountedRef.current) return;
          setPending(null);
          pendingRef.current = null;
          setError(payload.message ?? "The host didn't let you in.");
        },
      );

      socket.on(
        "join:request",
        ({ request }: { request: { name: string } }) => {
          if (!mountedRef.current) return;
          notify(
            "info",
            `${request.name} wants to join`,
            "Open People → Requests to let them in.",
          );
        },
      );

      socket.on("admin:error", ({ message }: { message?: string }) => {
        if (!mountedRef.current) return;
        notify("error", "Action not allowed", message);
      });

      socket.on(
        "room:error",
        (payload: { message?: string; code?: string }) => {
          if (!mountedRef.current) return;
          if (rejoinRef.current && intent.type === "random") {
            rejoinRef.current = false;
            socket.emit("room:random", {
              userId: userIdRef.current,
              profile: profilePayload(),
              mode: intent.mode,
              ignoreRooms: ignoreRoomsRef.current,
            });
            return;
          }
          const message = payload.message ?? "Something went wrong.";
          setError(message);
          setMatching(false);
          setPending(null);
          pendingRef.current = null;
          setConnection("online");
          notify("error", "Couldn't join", message);
        },
      );

      socket.on("session:replaced", ({ message }: { message?: string }) => {
        if (!mountedRef.current) return;
        exitToLobby(
          message ?? "This profile joined from another tab.",
        );
      });

      socket.on("room:kicked", ({ message }: { message?: string }) => {
        if (!mountedRef.current) return;
        exitToLobby(message ?? "You were removed from the room.");
      });

      socket.on("room:banned", ({ message }: { message?: string }) => {
        if (!mountedRef.current) return;
        exitToLobby(message ?? "You were banned from the room.");
      });

      socket.on("signal", (payload: SignalPayload) => {
        void handleSignal(payload);
      });
    };

    const start = async () => {
      await acquireMedia();
      if (cancelled || !mountedRef.current) return;
      connect();
    };

    void start();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      resetPeers();
      const stream = localStreamRef.current;
      stream?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* noop */
        }
      });
      localStreamRef.current = null;
      const screen = screenTrackRef.current;
      if (screen) {
        screen.onended = null;
        try {
          screen.stop();
        } catch {
          /* noop */
        }
      }
      screenTrackRef.current = null;
      screenStreamRef.current = null;
      analysersRef.current.forEach((entry) => {
        try {
          entry.source.disconnect();
        } catch {
          /* noop */
        }
      });
      analysersRef.current.clear();
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => undefined);
        audioCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connection,
    room,
    self,
    selfId,
    userId,
    others,
    departed,
    localStream,
    screenStream,
    remoteStreams,
    selfMedia,
    localMutes,
    peerStates,
    messages,
    typing,
    reactions,
    toasts,
    speaking,
    error,
    matching,
    pending,
    presence,
    devices,
    prefs,
    toggleMic,
    toggleCam,
    toggleScreen,
    toggleHand,
    next,
    leave,
    sendMessage,
    sendTyping,
    sendReaction,
    notify,
    dismissToast,
    adminAction,
    setJoinPolicy,
    approveRequest,
    denyRequest,
    unban,
    updatePrefs,
    switchDevice,
    refreshDevices,
    toggleLocalMute,
    retryMedia,
    blockDm,
    unblockDm,
  };
}

export type CallEngine = ReturnType<typeof useCall>;
