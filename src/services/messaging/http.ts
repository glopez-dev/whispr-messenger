import { AuthService } from "../AuthService";
import { TokenService } from "../TokenService";
import { getApiBaseUrl } from "../apiBase";
import { snakecaseKeys } from "../../utils/caseTransform";
import { isReachableUrl } from "../../utils";

export const API_BASE_URL = `${getApiBaseUrl()}/messaging/api/v1`;

export function extractMediaIdFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/media\/v1\/([^/]+)\/(?:blob|thumbnail)(?:\?|$)/i);
  return match?.[1];
}

/**
 * Normalise a backend attachment payload into the MessageAttachment shape the
 * app consumes. The backend returns { file_url, file_name, file_size, mime_type,
 * media_id, metadata, ... } while the app expects { media_type, metadata: {...} }.
 * Prefers media_id-based blob URLs over stored file_url (which may be an expired
 * presigned S3/MinIO URL).
 */
export const mapBackendAttachment = (att: any, fallbackMessageId?: string) => {
  const fileType = att?.file_type || "";
  const mime = att?.mime_type || "";
  let media_type: "audio" | "video" | "image" | "file" = (
    ["audio", "video", "image", "file"] as const
  ).includes(fileType)
    ? fileType
    : "file";
  if (!fileType || fileType === "file") {
    if (mime.startsWith("image/")) media_type = "image";
    else if (mime.startsWith("video/")) media_type = "video";
    else if (mime.startsWith("audio/")) media_type = "audio";
  }

  const meta = att?.metadata || {};
  const mediaId =
    att?.media_id ||
    meta.media_id ||
    extractMediaIdFromUrl(att?.file_url) ||
    extractMediaIdFromUrl(meta.media_url) ||
    extractMediaIdFromUrl(att?.storage_url) ||
    extractMediaIdFromUrl(att?.thumbnail_url) ||
    extractMediaIdFromUrl(meta.thumbnail_url);
  const mediaBlobUrl = mediaId
    ? `${getApiBaseUrl()}/media/v1/${mediaId}/blob`
    : null;
  const mediaThumbnailUrl = mediaId
    ? `${getApiBaseUrl()}/media/v1/${mediaId}/thumbnail`
    : null;

  // Reject any URL that points at the internal cluster or raw MinIO host —
  // the browser cannot resolve those DNS names and http:// on an https page
  // triggers Mixed Content. Always prefer the media-service /blob proxy when
  // a mediaId is available, which stays on the public gateway origin.
  const fallbackUrl = [meta.media_url, att?.file_url, att?.storage_url].find(
    isReachableUrl,
  );
  const fallbackThumbnail = [att?.thumbnail_url, meta.thumbnail_url].find(
    isReachableUrl,
  );

  // Prefer the media-service /blob proxy when we have a mediaId — it stays on
  // the public API gateway and never leaks internal MinIO URLs. Only fall back
  // to a stored URL when no mediaId is known (legacy rows).
  const resolvedUrl = mediaBlobUrl || fallbackUrl;
  const resolvedThumbnail =
    mediaThumbnailUrl || fallbackThumbnail || resolvedUrl;

  return {
    id: att?.id,
    message_id: att?.message_id || fallbackMessageId,
    media_id: mediaId,
    media_type,
    metadata: {
      filename: att?.file_name || att?.filename || meta.filename,
      size: att?.file_size || att?.size || meta.size,
      mime_type: att?.mime_type || meta.mime_type,
      media_url: resolvedUrl,
      thumbnail_url: resolvedThumbnail,
      duration:
        meta.duration ??
        att?.duration ??
        att?.audio_duration ??
        att?.file_duration,
    },
    created_at: att?.uploaded_at || att?.created_at || new Date().toISOString(),
  };
};

// Backend wraps responses in { data: ... } — unwrap if present
export const unwrap = async (response: Response) => {
  try {
    const json = await response.json();
    const data = json?.data !== undefined ? json.data : json;
    return snakecaseKeys(data);
  } catch {
    return null;
  }
};

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = await TokenService.getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

/**
 * Wrapper around fetch that automatically refreshes the access token and
 * retries once when the server returns 401 Unauthorized.
 */
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<Response> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      ...(await getAuthHeaders()),
    },
  });

  if (response.status === 401 && !isRetry) {
    try {
      await AuthService.refreshTokens();
      return authenticatedFetch(url, options, true);
    } catch {
      // refresh failed — fall through to let caller handle the 401
    }
  }

  return response;
};

/** Erreur réseau / HTTP avec code statut (diagnostic logs / toasts). */
export function httpError(label: string, response: Response): Error {
  return new Error(`${label} (${response.status})`);
}

/** Erreur HTTP enrichie : status + corps parsé pour gestion fine côté appelant. */
export type ApiError = Error & { status: number; body?: unknown };

export async function richHttpError(
  label: string,
  response: Response,
): Promise<ApiError> {
  const body = await response.json().catch(() => undefined);
  const message =
    (body as { error?: string; message?: string })?.error ||
    (body as { message?: string })?.message ||
    `${label} (${response.status})`;
  const err = new Error(message) as ApiError;
  err.status = response.status;
  err.body = body;
  return err;
}

/**
 * Run an async mapper over items in bounded-size batches to cap the number of
 * concurrent requests. Avoids DoS-ing the client and backend when a group has
 * hundreds of members and each one requires a profile fetch.
 */
export async function batchedMap<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// le user-service throttle court est a ~10 req/s; on garde 5 in-flight
// max pour laisser de la marge et eviter le burst 429 au load de la
// ConversationsList (enrichissement profile en parallele).
export const MEMBER_PROFILE_FETCH_CONCURRENCY = 5;
