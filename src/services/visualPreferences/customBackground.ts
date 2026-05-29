import * as FileSystem from "expo-file-system/legacy";
import { detectImageFormatFromUri } from "@/utils/imageCompression";
import { TokenService } from "@/services/TokenService";
import { getApiBaseUrl } from "@/services/apiBase";

export const CUSTOM_BACKGROUND_DIR = "whispr-backgrounds";
export const CUSTOM_BACKGROUND_BASENAME = "current-background";
export const CUSTOM_BACKGROUND_VARIANTS = [
  "jpg",
  "gif",
  "png",
  "webp",
  "heic",
  "heif",
];

export function getCustomBackgroundTargetUri(extension = "jpg") {
  const root = FileSystem.documentDirectory as string | undefined;
  if (!root) {
    throw new Error("No persistent file-system directory available");
  }
  return `${root}${CUSTOM_BACKGROUND_DIR}/${CUSTOM_BACKGROUND_BASENAME}.${extension}`;
}

export async function deleteAllCustomBackgroundVariants() {
  await Promise.all(
    CUSTOM_BACKGROUND_VARIANTS.map((ext) =>
      FileSystem.deleteAsync(getCustomBackgroundTargetUri(ext), {
        idempotent: true,
      }).catch(() => {}),
    ),
  );
}

export async function findExistingCustomBackgroundUri(): Promise<
  string | null
> {
  for (const ext of CUSTOM_BACKGROUND_VARIANTS) {
    const candidate = getCustomBackgroundTargetUri(ext);
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      if (info.exists) return candidate;
    } catch {
      // Ignore a single variant probe and keep scanning the others.
    }
  }
  return null;
}

export function getFileMimeType(uri: string) {
  const format = detectImageFormatFromUri(uri);
  switch (format) {
    case "gif":
      return "image/gif";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

export function buildRemoteBackgroundBlobUrl(mediaId: string) {
  return `${getApiBaseUrl()}/media/v1/${encodeURIComponent(mediaId)}/blob`;
}

export function sanitizeRemoteUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const wrappers: Array<[string, string]> = [
    ["`", "`"],
    ['"', '"'],
    ["'", "'"],
  ];
  for (const [start, end] of wrappers) {
    if (
      trimmed.startsWith(start) &&
      trimmed.endsWith(end) &&
      trimmed.length > 2
    )
      return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function ensureMediaServiceStreamUrl(value: string): string {
  if (!value.includes("/media/v1/")) return value;
  if (!value.includes("/blob") && !value.includes("/thumbnail")) return value;
  if (/([?&])stream=1(&|$)/.test(value)) return value;
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}stream=1`;
}

export async function downloadRemoteBackgroundToLocal(
  mediaId: string | null | undefined,
  remoteUrl: string | null | undefined,
): Promise<string | null> {
  const cleanedRemoteUrl = sanitizeRemoteUrl(remoteUrl);
  const sourceUrlRaw =
    cleanedRemoteUrl ||
    (mediaId ? buildRemoteBackgroundBlobUrl(mediaId) : null);
  const sourceUrl = sourceUrlRaw
    ? ensureMediaServiceStreamUrl(sourceUrlRaw)
    : null;
  mediaId ? buildRemoteBackgroundBlobUrl(mediaId) : null;
  if (!sourceUrl) return null;

  const extension = mediaId ? "jpg" : "jpg";
  const targetUri = getCustomBackgroundTargetUri(extension);
  const tmpUri = `${targetUri}.tmp`;
  const token = await TokenService.getAccessToken().catch(() => null);
  const targetDir = targetUri.slice(0, targetUri.lastIndexOf("/"));

  await FileSystem.makeDirectoryAsync(targetDir, {
    intermediates: true,
  }).catch(() => {});

  try {
    await FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
    await FileSystem.downloadAsync(sourceUrl, tmpUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    await deleteAllCustomBackgroundVariants();
    await FileSystem.moveAsync({ from: tmpUri, to: targetUri });
    return targetUri;
  } catch (error) {
    await FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
    console.warn(
      "Failed to restore custom background from remote media",
      error,
    );
    return null;
  }
}
