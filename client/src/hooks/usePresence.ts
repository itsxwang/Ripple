import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../lib/constants";
import type { Presence } from "../types";

const EMPTY: Presence = {
  online: 0,
  totalUsers: 0,
  rooms: 0,
  waiting: 0,
  inCalls: 0,
};

/** Live "people with Ripple open" counter while sitting in the lobby. */
export function usePresence(): Presence {
  const [presence, setPresence] = useState<Presence>(EMPTY);

  useEffect(() => {
    let active = true;
    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1200,
      timeout: 10000,
    });

    socket.on("presence", (data: Partial<Presence>) => {
      if (!active) return;
      setPresence((prev) => ({ ...prev, ...data }));
    });

    const load = async () => {
      try {
        const base = SOCKET_URL.replace(/\/$/, "");
        const response = await fetch(`${base}/stats`);
        if (!response.ok) return;
        const data = (await response.json()) as Partial<Presence>;
        if (active) setPresence((prev) => ({ ...prev, ...data }));
      } catch {
        /* server may still be booting */
      }
    };
    void load();
    const timer = window.setInterval(load, 15000);

    return () => {
      active = false;
      window.clearInterval(timer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return presence;
}
