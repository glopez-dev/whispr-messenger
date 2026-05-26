import { Platform } from "react-native";

export type WebPermissionError =
  | "not-allowed"
  | "not-found"
  | "not-supported"
  | "unknown";

export interface WebPermissionResult {
  granted: boolean;
  error?: WebPermissionError;
  message?: string;
}

/**
 * Demande les permissions micro (et optionnellement caméra) au navigateur.
 * No-op sur natif — les permissions sont gérées par le système d'exploitation.
 *
 * À appeler avant de rejoindre une room LiveKit sur web pour éviter que
 * livekit-client plante silencieusement avec une NotAllowedError.
 */
export async function requestWebMediaPermissions(
  video: boolean,
): Promise<WebPermissionResult> {
  if (Platform.OS !== "web") {
    return { granted: true };
  }

  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return {
      granted: false,
      error: "not-supported",
      message: "Votre navigateur ne supporte pas l'accès aux médias.",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video,
    });
    // On arrête immédiatement les tracks — livekit-client ouvrira les siens.
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (err) {
    return classifyMediaError(err);
  }
}

function classifyMediaError(err: unknown): WebPermissionResult {
  const name = (err as { name?: string })?.name ?? "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      granted: false,
      error: "not-allowed",
      message:
        "Accès au micro/caméra refusé. Autorisez-les dans les paramètres de votre navigateur.",
    };
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      granted: false,
      error: "not-found",
      message: "Aucun micro ou caméra détecté sur cet appareil.",
    };
  }

  return {
    granted: false,
    error: "unknown",
    message: "Impossible d'accéder aux périphériques audio/vidéo.",
  };
}
