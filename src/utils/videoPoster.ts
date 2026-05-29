/**
 * Video poster extraction
 *
 * WHISPR-fix-video-preview-hevc-ios : iOS enregistre les vidéos en HEVC/H.265
 * `.mov`. Une fois déchiffrées côté client (blob: URI), AVPlayerItem échoue
 * avec `-11828` (AVErrorFileFormatNotRecognized) quand on essaye de les
 * utiliser en thumbnail dans la liste de conv. Pour éviter ça, on extrait
 * un poster JPEG du premier frame côté émetteur, AVANT chiffrement et
 * upload, et on le stocke comme thumbnail séparé (chiffré séparément aussi
 * en E2EE).
 *
 * Pendant les tests Jest, `expo-video-thumbnails` est mock-able.
 * Sur web, l'API native n'existe pas — on retourne null et l'appelant
 * gère un fallback gracieux (placeholder côté receveur).
 */

import { NativeModules, Platform } from "react-native";
import { logger } from "@/utils/logger";

type ExpoVideoThumbnailsModule = {
  getThumbnailAsync: (
    uri: string,
    options: { time?: number; quality?: number },
  ) => Promise<{ uri: string; width?: number; height?: number }>;
};

function loadVideoThumbnails(): ExpoVideoThumbnailsModule | null {
  if (Platform.OS === "web") return null;
  if (process.env.NODE_ENV === "test") {
    try {
      return require("expo-video-thumbnails") as ExpoVideoThumbnailsModule;
    } catch {
      return null;
    }
  }
  const native = NativeModules as Record<string, unknown>;
  if (!native?.ExpoVideoThumbnails) return null;
  try {
    return require("expo-video-thumbnails") as ExpoVideoThumbnailsModule;
  } catch {
    return null;
  }
}

export interface VideoPosterResult {
  uri: string;
  mimeType: "image/jpeg";
  filename: string;
}

/**
 * Extrait le premier frame d'une vidéo et le retourne sous forme de JPEG.
 *
 * - Sur web : retourne null (module natif indisponible).
 * - Sur natif sans le module : retourne null (dev client incomplet).
 * - Sur extraction échouée : retourne null. L'appelant doit upload sans
 *   poster et accepter le fallback placeholder côté receveur.
 *
 * @param videoUri  URI locale de la vidéo (file://, content://, etc).
 * @param baseFilename Nom de fichier d'origine, pour dériver un nom de poster.
 * @returns Le poster extrait, ou null si non disponible.
 */
export async function extractVideoPoster(
  videoUri: string,
  baseFilename: string,
): Promise<VideoPosterResult | null> {
  const videoThumbnails = loadVideoThumbnails();
  if (!videoThumbnails) {
    logger.debug(
      "videoPoster",
      "expo-video-thumbnails unavailable, skipping poster extraction",
    );
    return null;
  }

  try {
    const thumb = await videoThumbnails.getThumbnailAsync(videoUri, {
      time: 0,
      quality: 0.8,
    });
    if (!thumb?.uri) return null;
    const posterFilename = baseFilename
      .replace(/\.(mov|mp4|m4v|avi|mkv|webm)$/i, "")
      .concat(".poster.jpg");
    return {
      uri: thumb.uri,
      mimeType: "image/jpeg",
      filename: posterFilename || "poster.jpg",
    };
  } catch (err) {
    logger.warn("videoPoster", "Poster extraction failed", err);
    return null;
  }
}
