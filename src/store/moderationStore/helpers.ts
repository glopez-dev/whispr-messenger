import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { logger } from "../../utils/logger";

// expo-file-system v55 types don't fully match the runtime API — alias to avoid
// scattering `as any` across every call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FS = FileSystem as any;

/**
 * Copy the source image into FileSystem.cacheDirectory/blocked-appeals/ so the
 * file survives process restarts and can be replayed after the admin approves
 * the appeal (WHISPR-1133). Returns the local path, or the original URI if the
 * copy fails (best-effort).
 */
export async function copyAppealImageToCache(
  imageUri: string,
  messageTempId: string,
): Promise<string> {
  const cacheDir = FS.cacheDirectory as string | undefined;
  if (!cacheDir) return imageUri;

  const dir = `${cacheDir}blocked-appeals`;
  try {
    const info = await FS.getInfoAsync(dir);
    if (!info.exists) {
      await FS.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    try {
      await FS.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      /* ignore */
    }
  }

  const ext = imageUri.split(".").pop()?.split("?")[0] || "jpg";
  const localPath = `${dir}/${messageTempId}.${ext}`;
  try {
    await FS.copyAsync({ from: imageUri, to: localPath });
    return localPath;
  } catch (err) {
    logger.warn("moderation", "copyAsync failed — keeping original URI", err);
    return imageUri;
  }
}

/**
 * Delete the cached appeal image. Idempotent — never throws.
 */
export async function deleteAppealCacheFile(localUri: string): Promise<void> {
  try {
    await FS.deleteAsync(localUri, { idempotent: true });
  } catch {
    /* ignore */
  }
}

/**
 * Build the 150px @ q=0.3 thumbnail used as the evidence base64 payload.
 * Shrunk aggressively so the request stays under the backend body-size limit
 * even for complex scenes (previous 200px @ q=0.5 could exceed 100KB → 413).
 */
export async function buildAppealThumbnailBase64(
  imageUri: string,
): Promise<string | undefined> {
  const manipulated = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 150 } }],
    {
      compress: 0.3,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  return manipulated.base64;
}

/**
 * On web, blob: URIs are revoked at logout/reload, so we need a self-contained
 * copy of the original image. Build a full-size base64 data URI (resized to
 * max 1280px) that survives the session. Capped at ~5MB of base64 text to
 * keep AsyncStorage / IndexedDB responsive. Returns `undefined` on native
 * (where the file URI is already durable) or when the payload would exceed
 * the cap.
 */
export async function buildAppealWebDataUri(
  imageUri: string,
): Promise<string | undefined> {
  if (Platform.OS !== "web") return undefined;

  try {
    const fullsize = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 1280 } }],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!fullsize.base64) return undefined;

    const dataUri = `data:image/jpeg;base64,${fullsize.base64}`;
    if (dataUri.length <= 5 * 1024 * 1024) {
      return dataUri;
    }
    logger.warn(
      "moderation",
      "image too large for web persistence, skipping auto-retry payload",
      { size: dataUri.length },
    );
    return undefined;
  } catch (err) {
    logger.warn(
      "moderation",
      "failed to build web-safe data URI for appeal",
      err,
    );
    return undefined;
  }
}
