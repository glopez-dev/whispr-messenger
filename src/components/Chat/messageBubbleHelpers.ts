import { MessageWithRelations } from "@/types/messaging";
import { isReachableUrl } from "@/utils";
import { getApiBaseUrl } from "@/services/apiBase";

/**
 * True when a URL hostname points to the internal cluster (unreachable from
 * the public network) — e.g. MinIO's in-cluster DNS `minio.minio.svc…` or
 * other `.svc.cluster.local` entries. These hosts can leak into stored
 * media_url values when the backend forgets to rewrite presigned URLs.
 */
export function isInternalClusterUrl(url: string): boolean {
  return (
    url.includes(".svc.cluster.local") ||
    url.includes("minio.minio") ||
    /https?:\/\/[^/]*\.internal[:/]/.test(url) ||
    /https?:\/\/[^/]*\.local(:\d+)?\//.test(url)
  );
}

/**
 * Resolve a media URL — prepend the API base for relative paths and rewrite
 * internal cluster URLs (preprod/prod MinIO k8s DNS) to the public media
 * proxy when a mediaId is available.
 */
export function resolveMediaUrl(
  url: string | null | undefined,
  mediaId?: string,
  kind: "blob" | "thumbnail" = "blob",
): string {
  if (!url && mediaId) {
    return `${getApiBaseUrl()}/media/v1/${encodeURIComponent(mediaId)}/${kind}`;
  }
  if (!url) return "";
  if (url.startsWith("file://") || url.startsWith("data:")) {
    return url;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    // URLs pointing to the media service blob/thumbnail endpoints are always valid
    if (
      url.includes("/media/v1/") &&
      (url.includes("/blob") || url.includes("/thumbnail"))
    ) {
      return url;
    }
    // Any other absolute URL: prefer the media-service proxy when we have a
    // mediaId. Stored presigned MinIO URLs go stale when credentials rotate
    // (SignatureDoesNotMatch), so always funnel through /media/v1/<id>/<kind>
    // which re-signs on every request.
    if (mediaId) {
      return `${getApiBaseUrl()}/media/v1/${encodeURIComponent(mediaId)}/${kind}`;
    }
    // No mediaId: drop unreachable internal URLs, pass presigned URLs through
    // as last-resort fallback.
    if (isInternalClusterUrl(url)) {
      return "";
    }
    return url;
  }
  // Relative path from the API — prepend base URL
  return `${getApiBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function extractMediaIdFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/media\/v1\/([^/]+)\/(?:blob|thumbnail)(?:\?|$)/i);
  return match?.[1];
}

/**
 * Return false for messages that have nothing to display (no text, no media,
 * not a tombstone). Keeps the main component free of a deeply-nested guard.
 */
export function shouldRenderMessage(message: MessageWithRelations): boolean {
  if (message.content) return true;
  if (message.is_deleted) return true;
  if (message.attachments && message.attachments.length > 0) return true;

  const meta = message.metadata as
    | { media_url?: string; media_id?: string }
    | undefined;
  const hasMetadataMedia =
    message.message_type === "media" &&
    !!meta &&
    Boolean(meta.media_url || meta.media_id);
  return hasMetadataMedia;
}

/**
 * WebSocket-delivered media messages may arrive without an explicit
 * attachments array — only a `metadata` blob. Synthesise a virtual
 * attachment so the UI can render a preview immediately.
 */
export function buildMetadataAttachment(message: MessageWithRelations) {
  if (message.message_type !== "media" || !message.metadata) return null;
  const meta = message.metadata as {
    media_url?: string;
    media_id?: string;
    thumbnail_url?: string;
    media_type?: "image" | "video" | "file" | "audio";
    filename?: string;
    size?: number;
    mime_type?: string;
    duration?: number;
  };
  if (!meta.media_url && !meta.media_id) return null;

  const mediaId =
    meta.media_id ||
    extractMediaIdFromUrl(meta.media_url) ||
    extractMediaIdFromUrl(meta.thumbnail_url);
  const apiBase = getApiBaseUrl();
  const blobFallback = mediaId ? `${apiBase}/media/v1/${mediaId}/blob` : null;
  const thumbFallback = mediaId
    ? `${apiBase}/media/v1/${mediaId}/thumbnail`
    : null;
  const blobUrl =
    blobFallback || (isReachableUrl(meta.media_url) ? meta.media_url : null);
  const thumbUrl =
    thumbFallback ||
    (isReachableUrl(meta.thumbnail_url) ? meta.thumbnail_url : blobUrl);

  return {
    id: `synth-${message.id}`,
    message_id: message.id,
    media_id: mediaId,
    media_type: (meta.media_type || "image") as
      | "image"
      | "video"
      | "file"
      | "audio",
    metadata: {
      filename: meta.filename,
      size: meta.size,
      mime_type: meta.mime_type,
      media_url: blobUrl,
      thumbnail_url: thumbUrl,
      duration: meta.duration,
    },
    created_at: message.sent_at,
  };
}

/**
 * Shallow equality check on `delivery_statuses` arrays — compares only the
 * fields that feed the rendered status label.
 */
export function deliveryStatusesEqual(
  a: MessageWithRelations["delivery_statuses"],
  b: MessageWithRelations["delivery_statuses"],
): boolean {
  if (a === b) return true;
  const al = a?.length ?? 0;
  const bl = b?.length ?? 0;
  if (al !== bl) return false;
  if (al === 0) return true;
  for (let i = 0; i < al; i += 1) {
    const x = a![i];
    const y = b![i];
    if (x.user_id !== y.user_id || x.read_at !== y.read_at) return false;
  }
  return true;
}
