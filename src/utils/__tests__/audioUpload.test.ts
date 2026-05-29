import { forceAudioUploadIdentity } from "@/utils/audioUpload";

describe("forceAudioUploadIdentity", () => {
  it("rewrites filename + MIME to audio/mp4 for any audio/* input", () => {
    const result = forceAudioUploadIdentity("clip.m4a", "audio/x-m4a");
    expect(result.mimeType).toBe("audio/mp4");
    expect(result.filename).toMatch(/^clip-\d+\.mp4$/);
  });

  it("falls back to a default basename when the source has no name", () => {
    const result = forceAudioUploadIdentity("", "audio/m4a");
    expect(result.filename).toMatch(/^recording-\d+\.mp4$/);
    expect(result.mimeType).toBe("audio/mp4");
  });

  it("leaves non-audio payloads alone but still canonicalizes the MIME", () => {
    const result = forceAudioUploadIdentity("photo.jpg", "Image/JPEG");
    expect(result.filename).toBe("photo.jpg");
    expect(result.mimeType).toBe("image/jpeg");
  });
});
