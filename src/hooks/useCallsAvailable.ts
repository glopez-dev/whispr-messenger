/**
 * useCallsAvailable — Détection centralisée du support des appels.
 *
 * Sur natif (iOS/Android) : repose sur @livekit/react-native + WebRTC native.
 * Sur web : repose sur livekit-client + WebRTC navigateur (getUserMedia).
 * Les deux chemins sont supportés ; ce hook ne bloque plus sur Platform.OS="web"
 * tant que le navigateur expose navigator.mediaDevices.getUserMedia.
 */

import { useMemo } from "react";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

export type CallsUnavailableReason = "expo-go" | "no-webrtc" | "web-no-webrtc";

export interface CallsAvailability {
  available: boolean;
  reason: CallsUnavailableReason | null;
}

function detectIsExpoGo(): boolean {
  const executionEnvironment = (Constants as any)?.executionEnvironment;
  const appOwnership = (Constants as any)?.appOwnership;
  return executionEnvironment === "storeClient" || appOwnership === "expo";
}

function detectHasWebRtcNative(): boolean {
  const native = NativeModules as Record<string, unknown>;
  return Boolean(native?.WebRTCModule || native?.LivekitReactNativeWebRTC);
}

/**
 * Vérifie que le navigateur expose getUserMedia (Chrome, Firefox, Safari 16.4+).
 * Retourne false en SSR ou dans un contexte sans accès aux APIs navigateur.
 */
function detectBrowserWebRtc(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function getCallsAvailability(): CallsAvailability {
  if (Platform.OS === "web") {
    // Sur web, on s'appuie sur le WebRTC natif du navigateur via livekit-client.
    // Si getUserMedia est absent (vieux navigateur, contexte non-HTTPS), on bloque.
    if (!detectBrowserWebRtc()) {
      return { available: false, reason: "web-no-webrtc" };
    }
    return { available: true, reason: null };
  }
  if (detectIsExpoGo()) {
    return { available: false, reason: "expo-go" };
  }
  if (!detectHasWebRtcNative()) {
    return { available: false, reason: "no-webrtc" };
  }
  return { available: true, reason: null };
}

export function isCallsAvailable(): boolean {
  return getCallsAvailability().available;
}

export function isExpoGo(): boolean {
  return detectIsExpoGo();
}

export function getCallsUnavailableMessage(
  reason: CallsUnavailableReason | null,
): string {
  switch (reason) {
    case "expo-go":
      return "Les appels ne sont pas disponibles dans Expo Go. Utilisez un build de développement.";
    case "no-webrtc":
      return "Les appels nécessitent une reconstruction de l'application (module WebRTC manquant).";
    case "web-no-webrtc":
      return "Votre navigateur ne supporte pas les appels. Utilisez Chrome, Firefox ou Safari 16.4+.";
    default:
      return "Les appels ne sont pas disponibles sur cet appareil.";
  }
}

export function useCallsAvailable(): CallsAvailability {
  return useMemo(getCallsAvailability, []);
}
