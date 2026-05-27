export const DEFAULT_MIME_BY_KIND: Record<
  "image" | "video" | "audio" | "file",
  string
> = {
  image: "image/jpeg",
  video: "video/mp4",
  audio: "audio/mp4",
  file: "application/octet-stream",
};

export const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  caf: "audio/x-caf",
};

/** Resolve a MIME type from a file extension, with a per-kind fallback. */
export function resolveMimeType(
  extension: string,
  kind: "image" | "video" | "audio" | "file",
): string {
  return EXTENSION_TO_MIME[extension] ?? DEFAULT_MIME_BY_KIND[kind];
}

/** Normalize a MIME type string: strip params, lowercase, map known aliases. */
export function canonicalizeMimeType(mime: string): string {
  const normalized = mime.split(";")[0].trim().toLowerCase();
  switch (normalized) {
    case "audio/x-m4a":
    case "audio/m4a":
      return "audio/mp4";
    default:
      return normalized;
  }
}
