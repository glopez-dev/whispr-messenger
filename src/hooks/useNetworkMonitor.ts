/**
 * useNetworkMonitor — WHISPR-offline
 *
 * Listens to OS-level network reachability via NetInfo and nudges the
 * WebSocket to reconnect immediately when connectivity is restored,
 * instead of waiting for the exponential backoff timer to fire.
 *
 * This is the difference between "reconnects in up to 30 seconds" and
 * "reconnects in ~500ms after the network comes back."
 */

import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { getSharedSocket } from "@/services/messaging/websocket";
import { logger } from "@/utils/logger";

export function useNetworkMonitor(): void {
  // Track the previous reachability state so we only nudge on the
  // transition from offline → online (not on every poll event).
  const wasReachable = useRef<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline =
        state.isConnected === true && state.isInternetReachable !== false;

      if (!isOnline) {
        wasReachable.current = false;
        return;
      }

      if (wasReachable.current === false) {
        // Transition: offline → online. Kick the WebSocket immediately.
        logger.info("NetworkMonitor", "Network restored — nudging WebSocket");
        try {
          getSharedSocket().nudge();
        } catch {
          // Socket not initialised yet (unauthenticated state) — ignore.
        }
      }

      wasReachable.current = true;
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
