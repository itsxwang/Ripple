# Ripple — spontaneous peer-to-peer video rooms

Ripple is a multi-peer WebRTC video app for meeting strangers or your own people.
Drop into a one-on-one match, start a party room for up to 6, or create a private
room for up to 8 — with group chat, private DMs, GIF reactions, screen sharing
and real moderation tools. No accounts, no downloads, no recordings.

## Features

### Before you join

- **Camera & mic check** — see yourself, watch your mic level, pick a camera or
  microphone, and toggle either one before you ever enter a room.
- **Profile pictures** — upload one photo and pick two crops: a square avatar
  plus a tall 3:4 poster that fills your tile whenever your camera is off. Your
  avatar follows you into every room and is visible to everyone.
- **Join policies** — create a room that anyone can enter, or one where new
  people must ask to be let in. The policy can be changed later from inside.

### In the call

- **Multi-peer calls over WebRTC** — one `RTCPeerConnection` per remote peer
  (full mesh), so 3+ people can see and hear each other directly.
- **Omegle-style instant matching** — get paired with a stranger automatically,
  with a **Next** button to skip to a fresh room at any time (previous rooms are
  remembered so you don't get bounced back to them).
- **Hosted party rooms** — up to 6 people can drop in and out. Open parties are
  listed in the lobby so people can join one with a click.
- **Private rooms** — 6-character invite codes and shareable `?room=CODE` links,
  up to 8 seats.
- **Group chat + DMs** — message everyone, or open a private conversation with a
  single participant. Unread badges, typing indicators and DM toasts included.
- **Reactions** — 48 emoji plus your own GIF/WebP/PNG uploads. Floating reactions
  use separate lanes so they never stack; each person can turn reactions (and
  reaction sounds) off for their own view.
- **Media controls** — mic, camera and screen share, using `replaceTrack` so
  toggling media never renegotiates the connection.
- **Per-viewer mute & focus** — mute one person's audio or hide their video for
  yourself without changing what anyone else sees. Pin/focus any participant to
  give them the big tile.
- **Screen-share policy** — party hosts choose whether everyone, only admins, or
  nobody can share. A host can also turn off screen sharing for one member.
- **Device switching & audio test** — change camera/microphone and test your
  speaker without leaving the call.
- **Keyboard shortcuts** — `M` mic, `V` camera, `S` screen, `H` hand, `C` chat,
  `P` people, `Esc` close. Ignored while typing in a text field.
- **Raise hand** — quietly signal that you want to speak.
- **Presence** — see how many people have Ripple open, including people already
  in calls, in both the lobby and the call header.
- **Polished UI** — animated tile layout that reflows as people join/leave,
  join toasts, speaking indicators, responsive layout down to 320px.

### Room moderation

The room creator becomes the **host**. The host can promote other people to
**admin**; admins can use the same controls. Every moderation action is applied
instantly for everyone in the room.

| Control | What it does |
| --- | --- |
| Force mute / allow mic | Restricts a member's microphone; they cannot unmute themselves until the restriction is lifted. |
| Camera off / allow camera | Restricts a member's camera (also stops their screen share). |
| Screen off / allow screen | Turns off screen sharing for one member in a party room. |
| Screen policy | Party rooms: allow screen sharing for everyone, admins only, or nobody. Hosts/admins can always share. |
| Mute everyone | Restricts every other member at once. |
| Lift restrictions | Clears all media restrictions in the room. |
| Remove from room | Kicks a member — they can rejoin if the room is open. |
| Ban… | Temporary (1 hour / 24 hours / 7 days) or permanent ban with an optional reason. |
| Banned list + Unban | Review current bans and let someone back in early. |
| Join requests | Approve or deny pending join requests when the room requires approval. |
| Join policy | Switch between "anyone" and "approval needed" at any time. |
| Make admin / Demote | Promote or demote other members. |
| Revoke all admin privileges | Removes every admin **including the host** and makes the room decentralized: nobody can moderate it afterwards. |

Bans and admins are tied to a stable anonymous identity stored in the browser,
so they survive reloads. A profile that opens the same room twice is evicted
from the older tab, which prevents ghost participants.

### Reliability

- **Late joiners receive existing media** — the answering peer attaches local
  tracks to the transceivers in the incoming offer, so a third+ participant gets
  everyone's audio *and* video instead of silence.
- **No self-echo** — the self tile is muted before its stream is attached.
- **Reconnect handling** — automatic socket reconnection and room rejoin.
- **Media auto-recovery** — if a mic or camera track dies (USB hiccup, another
  app grabbing the device, OS suspend), Ripple notices and reacquires it without
  renegotiating the call. "Reconnect mic & camera" in settings forces it.
- **Connection indicators** — each remote tile shows when a peer is still
  connecting or reconnecting.
- **Duplicate-session eviction** — one live session per profile per room.

## Tech stack

| Layer | Tech |
| --- | --- |
| Client | React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion |
| Media | WebRTC (full-mesh, STUN via Google/Twilio) |
| Signaling | Node.js, Express, Socket.IO |
| Persistence | SQLite via Node's built-in `node:sqlite` (no native build step) |

## Getting started

Requirements: Node.js 22+ (for `node:sqlite`) and a modern browser with
camera/mic access.

### 1. Signaling server

```bash
cd backend
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

Environment variables (`backend/.env`):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port the signaling server listens on |
| `DB_PATH` | `backend/data/ripple.sqlite` | SQLite database file (created automatically) |

### 2. Client

```bash
cd client
npm install
npm run dev        # http://localhost:5173
```

Environment variables (`client/.env`):

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_SOCKET_SERVER_URL` | `http://localhost:3000` | Signaling server URL |

Open <http://localhost:5173> in two or more tabs (or devices) to try it. For
camera/mic access on another device, serve the client over HTTPS or
`localhost`, and make sure the signaling URL is reachable from that device.

## How it works

```
        ┌──────────────┐
        │  Signaling   │   Socket.IO: rooms, SDP/ICE relay,
        │   server     │   chat, presence, reactions, moderation
        └──────┬───────┘
               │
   ┌───────────┼───────────┐
   │           │           │
┌──▼──┐     ┌──▼──┐     ┌──▼──┐
│Peer │◄───►│Peer │◄───►│Peer │   Audio/video/chat travel
│  A  │     │  B  │     │  C  │   directly between browsers
└─────┘     └─────┘     └─────┘
```

- The server keeps an in-memory map of live rooms and members and relays
  signaling messages (`offer`, `answer`, ICE candidates) only between members
  of the same room.
- When you join a room, you create an offer to every existing member and they
  answer. The media itself flows peer-to-peer; the server never touches it.
- Audio and video transceivers are created up front, so mic/camera/screen
  toggles use `replaceTrack` instead of renegotiation.
- Chat is sent over Socket.IO. Group messages are broadcast to the room and
  stored in SQLite; direct messages are delivered only to the sender and
  recipient (and are not persisted).
- Rooms, host/admin roles, bans, join policies and group chat history live in
  SQLite, so a restart does not lose a room's identity, moderation state or
  history. Abandoned rooms expire from the database after 30 days.

### Capacity

Mesh topology means each participant uploads their stream to every other
participant. Ripple caps rooms to keep that practical:

| Room type | Max people |
| --- | --- |
| Instant match (duo) | 2 |
| Party room | 6 |
| Private room | 8 |

Beyond those sizes, a selective-forwarding media server (SFU) would be needed.

## Project structure

```
backend/
  src/index.ts        Signaling server: rooms, signaling, chat, moderation, stats
  src/db.ts           SQLite schema/helpers: profiles, rooms, admins, bans, history
client/
  src/
    App.tsx           Lobby/call phase switch, profile + preference persistence
    types.ts          Shared client types
    hooks/
      useCall.ts      WebRTC mesh engine, media, signaling, chat, moderation
      useMediaPreview.ts  Pre-join camera/mic preview and device selection
      usePresence.ts  Live online / in-call counters
      useAudioLevel.ts  Microphone level metering
    components/
      Lobby.tsx       Landing page, profile, avatar, media test, mode selection
      CallRoom.tsx    Call layout, header, overlays, toasts, settings wiring
      VideoGrid.tsx   Animated responsive participant grid + waiting tile
      VideoTile.tsx   Remote/self video, camera-off poster, local-mute badges
      ControlBar.tsx  Mic, camera, screen share, reactions/GIFs, chat, leave
      Sidebar.tsx     Chat/people panel container with request badges
      ChatPanel.tsx   Group + DM conversations, typing, composer
      PeoplePanel.tsx Participants, admin actions, requests, bans, join policy
      RoomSettings.tsx  In-call media test, devices, reaction + host controls
      AvatarEditor.tsx  Dual crop editor: square avatar + tall camera-off poster
      MediaTest.tsx   Camera preview, mic meter, speaker test, device pickers
      ReactionsLayer.tsx  Lane-based floating emoji/GIF overlay
    lib/constants.ts  URLs, avatars, emoji list, gradients, formatting helpers
    lib/prefs.ts      Preference + anonymous identity persistence
    lib/media.ts      Device enumeration, file/image helpers
```

## Scripts

Client:

- `npm run dev` — start Vite dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint

Backend:

- `npm run dev` — start with nodemon
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run the compiled server

## Privacy

Audio, video and screen shares are peer-to-peer and are never recorded or
relayed through the server. The signaling server handles room membership,
connection metadata, moderation state and text chat. Group chat history is the
only message content stored (never DMs), and it is removed when a room expires.
Profile photos are stored as small compressed images so everyone can see them
in a room; they are not used for anything else.
