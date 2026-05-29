/**
 * WHISPR-1039: garantit que la compression ne déforme jamais une image.
 * Test unitaire pur sur la fonction de décision `buildResizeAction`.
 *
 * WHISPR-1197: garantit que GIF/HEIC ne sont jamais re-encodés dans compressImage.
 * convertHeicToJpeg: conversion HEIC→JPEG dédiée compat web (Chrome/Firefox).
 */

// Mock expo-image-manipulator AVANT l'import du module testé : ainsi on peut
// observer si compressImage l'appelle (cas JPEG/PNG) ou court-circuite (GIF/HEIC).
const mockManipulateAsync = jest.fn();
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

// Mock Image.getSize pour ne pas dépendre du runtime natif.
jest.mock("react-native", () => ({
  Image: {
    getSize: (
      _uri: string,
      onSuccess: (w: number, h: number) => void,
    ): void => {
      onSuccess(800, 600);
    },
  },
}));

import {
  buildResizeAction,
  compressImage,
  convertHeicToJpeg,
  detectImageFormatFromUri,
} from "@/utils/imageCompression";

describe("buildResizeAction (WHISPR-1039)", () => {
  const MAX_W = 1920;
  const MAX_H = 1920;

  it("borne uniquement la largeur pour une image paysage trop large", () => {
    expect(buildResizeAction(4000, 3000, MAX_W, MAX_H)).toEqual([
      { resize: { width: MAX_W } },
    ]);
  });

  it("borne uniquement la hauteur pour une image portrait trop haute", () => {
    expect(buildResizeAction(1080, 4000, MAX_W, MAX_H)).toEqual([
      { resize: { height: MAX_H } },
    ]);
  });

  it("ne renvoie aucun resize si l'image rentre déjà dans les bornes", () => {
    expect(buildResizeAction(800, 600, MAX_W, MAX_H)).toEqual([]);
    expect(buildResizeAction(MAX_W, MAX_H, MAX_W, MAX_H)).toEqual([]);
  });

  it("traite une image carrée trop grande comme paysage (cap largeur)", () => {
    expect(buildResizeAction(3000, 3000, MAX_W, MAX_H)).toEqual([
      { resize: { width: MAX_W } },
    ]);
  });

  it("ne contraint jamais les deux dimensions simultanément", () => {
    // Régression directe : avant le fix, le resize forçait { width, height }
    // ce qui écrasait l'image en carré 1920x1920.
    for (const [w, h] of [
      [4000, 3000],
      [1080, 4000],
      [3000, 3000],
      [200, 200],
    ]) {
      const result = buildResizeAction(w, h, MAX_W, MAX_H);
      if (result.length === 0) continue;
      const resize = result[0].resize as Record<string, unknown>;
      const hasWidth = "width" in resize;
      const hasHeight = "height" in resize;
      expect(hasWidth && hasHeight).toBe(false);
    }
  });
});

describe("detectImageFormatFromUri (WHISPR-1197)", () => {
  it.each([
    ["file:///tmp/photo.gif", "gif"],
    ["file:///tmp/photo.GIF", "gif"],
    ["file:///tmp/photo.heic", "heic"],
    ["file:///tmp/photo.HEIC", "heic"],
    ["file:///tmp/photo.heif", "heic"],
    ["file:///tmp/photo.jpg", "jpeg"],
    ["file:///tmp/photo.jpeg", "jpeg"],
    ["file:///tmp/photo.png", "png"],
    ["file:///tmp/photo.webp", "webp"],
    ["file:///tmp/photo", "unknown"],
    ["file:///tmp/photo.unknown", "unknown"],
  ])("%s → %s", (uri, expected) => {
    expect(detectImageFormatFromUri(uri)).toBe(expected);
  });

  it("ignore une querystring après le nom de fichier", () => {
    expect(detectImageFormatFromUri("https://cdn/photo.gif?token=abc")).toBe(
      "gif",
    );
    expect(detectImageFormatFromUri("https://cdn/photo.heic#frag")).toBe(
      "heic",
    );
  });
});

describe("compressImage format short-circuit (WHISPR-1197)", () => {
  beforeEach(() => {
    mockManipulateAsync.mockReset();
  });

  it("retourne l'URI inchangée pour un GIF, sans appeler manipulateAsync", async () => {
    const inputUri = "file:///tmp/animated.gif";
    const result = await compressImage(inputUri);
    expect(result).toBe(inputUri);
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  it("retourne l'URI inchangée pour un HEIC (extension .heic)", async () => {
    const inputUri = "file:///tmp/IMG_1234.heic";
    const result = await compressImage(inputUri);
    expect(result).toBe(inputUri);
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  it("retourne l'URI inchangée pour un HEIF (extension .heif)", async () => {
    const inputUri = "file:///tmp/IMG_1234.heif";
    const result = await compressImage(inputUri);
    expect(result).toBe(inputUri);
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  it("compresse un JPEG via manipulateAsync (pas de régression)", async () => {
    mockManipulateAsync
      .mockResolvedValueOnce({ uri: "file:///tmp/resized.jpg" })
      .mockResolvedValueOnce({ uri: "file:///tmp/compressed.jpg" });
    const result = await compressImage("file:///tmp/photo.jpg");
    expect(mockManipulateAsync).toHaveBeenCalledTimes(2);
    expect(result).toBe("file:///tmp/compressed.jpg");
  });

  it("compresse un PNG via manipulateAsync (pas de régression)", async () => {
    mockManipulateAsync
      .mockResolvedValueOnce({ uri: "file:///tmp/resized.jpg" })
      .mockResolvedValueOnce({ uri: "file:///tmp/compressed.jpg" });
    const result = await compressImage("file:///tmp/photo.png");
    expect(mockManipulateAsync).toHaveBeenCalledTimes(2);
    expect(result).toBe("file:///tmp/compressed.jpg");
  });

  it("compresse une URI sans extension reconnue (fallback compression)", async () => {
    mockManipulateAsync
      .mockResolvedValueOnce({ uri: "file:///tmp/resized.jpg" })
      .mockResolvedValueOnce({ uri: "file:///tmp/compressed.jpg" });
    const result = await compressImage("file:///tmp/photo");
    expect(mockManipulateAsync).toHaveBeenCalledTimes(2);
    expect(result).toBe("file:///tmp/compressed.jpg");
  });
});

describe("convertHeicToJpeg (compat web)", () => {
  beforeEach(() => {
    mockManipulateAsync.mockReset();
  });

  it("convertit un .heic en JPEG et renomme le fichier", async () => {
    mockManipulateAsync.mockResolvedValueOnce({
      uri: "file:///tmp/IMG_1234.jpg",
    });
    const result = await convertHeicToJpeg(
      "file:///tmp/IMG_1234.heic",
      "IMG_1234.heic",
    );
    expect(result).not.toBeNull();
    expect(result!.uri).toBe("file:///tmp/IMG_1234.jpg");
    expect(result!.mimeType).toBe("image/jpeg");
    expect(result!.filename).toBe("IMG_1234.jpg");
  });

  it("convertit un .heif en JPEG et renomme le fichier", async () => {
    mockManipulateAsync.mockResolvedValueOnce({
      uri: "file:///tmp/IMG_5678.jpg",
    });
    const result = await convertHeicToJpeg(
      "file:///tmp/IMG_5678.heif",
      "IMG_5678.heif",
    );
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("image/jpeg");
    expect(result!.filename).toBe("IMG_5678.jpg");
  });

  it("appelle manipulateAsync avec compress 0.92 et format JPEG", async () => {
    mockManipulateAsync.mockResolvedValueOnce({ uri: "file:///tmp/out.jpg" });
    await convertHeicToJpeg("file:///tmp/photo.heic", "photo.heic");
    expect(mockManipulateAsync).toHaveBeenCalledWith(
      "file:///tmp/photo.heic",
      [],
      { compress: 0.92, format: "jpeg" },
    );
  });

  it("retourne null pour une URI non-HEIC (JPEG) sans appeler manipulateAsync", async () => {
    const result = await convertHeicToJpeg(
      "file:///tmp/photo.jpg",
      "photo.jpg",
    );
    expect(result).toBeNull();
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  it("retourne null si manipulateAsync échoue (fallback safe)", async () => {
    mockManipulateAsync.mockRejectedValueOnce(new Error("manipulate failed"));
    const result = await convertHeicToJpeg(
      "file:///tmp/IMG_1234.heic",
      "IMG_1234.heic",
    );
    expect(result).toBeNull();
  });

  it("conserve le casing .HEIC dans la détection mais produit .jpg en minuscule", async () => {
    mockManipulateAsync.mockResolvedValueOnce({ uri: "file:///tmp/out.jpg" });
    const result = await convertHeicToJpeg(
      "file:///tmp/PHOTO.HEIC",
      "PHOTO.HEIC",
    );
    expect(result).not.toBeNull();
    expect(result!.filename).toBe("PHOTO.jpg");
  });
});
