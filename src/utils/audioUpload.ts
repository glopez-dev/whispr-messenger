import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { canonicalizeMimeType } from "./mime";

/**
 * Force a neutral audio identity for upload: iOS may emit
 * `audio/x-m4a` for `.m4a` filenames on multipart parts. We rename to
 * `.mp4` + `audio/mp4` so the part MIME inference stays audio/mp4 on
 * the backend.
 */
export function forceAudioUploadIdentity(
  filename: string,
  mimeType: string,
): { filename: string; mimeType: string } {
  const normalizedMime = canonicalizeMimeType(mimeType);
  if (!normalizedMime.startsWith("audio/")) {
    return { filename, mimeType: normalizedMime };
  }
  const baseName = filename.replace(/\.[^/.]+$/, "");
  return {
    filename: `${baseName || "recording"}-${Date.now()}.mp4`,
    mimeType: "audio/mp4",
  };
}

/**
 * If the upload URI is a `file://` recording with a non-`.mp4`
 * extension, copy it to a `.mp4` filename inside the cache directory
 * so the upload part filename matches the chosen MIME. Returns the
 * original URI when remapping is not needed or fails.
 */
export async function remapAudioUploadUri(
  uri: string,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (Platform.OS === "web") {
    return uri;
  }
  if (canonicalizeMimeType(mimeType) !== "audio/mp4") {
    return uri;
  }
  if (!uri.startsWith("file://")) {
    return uri;
  }
  if (/\.mp4$/i.test(uri)) {
    return uri;
  }

  const cacheRoot =
    (FileSystem as unknown as { cacheDirectory?: string }).cacheDirectory ||
    (FileSystem as unknown as { documentDirectory?: string })
      .documentDirectory ||
    "";
  if (!cacheRoot) {
    return uri;
  }

  const targetUri = `${cacheRoot}${filename}`;
  try {
    await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(
      () => {},
    );
    await FileSystem.copyAsync({ from: uri, to: targetUri });
    return targetUri;
  } catch (error) {
    console.warn("[audioUpload] Failed to remap audio upload URI:", error);
    return uri;
  }
}
