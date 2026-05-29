import { canonicalizeMimeType, resolveMimeType } from "@/utils/mime";

describe("resolveMimeType", () => {
  it("maps a known extension to its MIME type regardless of the kind hint", () => {
    expect(resolveMimeType("jpg", "image")).toBe("image/jpeg");
    expect(resolveMimeType("png", "image")).toBe("image/png");
    expect(resolveMimeType("mp4", "video")).toBe("video/mp4");
    expect(resolveMimeType("m4a", "audio")).toBe("audio/mp4");
    expect(resolveMimeType("pdf", "file")).toBe("application/pdf");
  });

  it("falls back to the per-kind default for unknown extensions", () => {
    expect(resolveMimeType("xyz", "image")).toBe("image/jpeg");
    expect(resolveMimeType("xyz", "video")).toBe("video/mp4");
    expect(resolveMimeType("xyz", "audio")).toBe("audio/mp4");
    expect(resolveMimeType("xyz", "file")).toBe("application/octet-stream");
  });
});

describe("canonicalizeMimeType", () => {
  it("strips parameters and lowercases", () => {
    expect(canonicalizeMimeType("Image/JPEG; charset=utf-8")).toBe(
      "image/jpeg",
    );
    expect(canonicalizeMimeType("  text/plain ")).toBe("text/plain");
  });

  it("normalizes known iOS audio aliases to audio/mp4", () => {
    expect(canonicalizeMimeType("audio/x-m4a")).toBe("audio/mp4");
    expect(canonicalizeMimeType("audio/m4a")).toBe("audio/mp4");
    expect(canonicalizeMimeType("AUDIO/X-M4A")).toBe("audio/mp4");
  });

  it("leaves unrelated audio types untouched", () => {
    expect(canonicalizeMimeType("audio/mpeg")).toBe("audio/mpeg");
    expect(canonicalizeMimeType("audio/wav")).toBe("audio/wav");
  });
});
