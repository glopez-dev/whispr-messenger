/**
 * Tests for decideV3FromProbs — MobileNetV3-Small 3-class health gate.
 *
 * The v3 model emits a softmax over `[healthy, not_food, unhealthy]`.
 * decideV3FromProbs blocks only when `unhealthy` is the top-1 class
 * AND `p(unhealthy) >= threshold`.
 */

import {
  decideV3FromProbs,
  V3_UNHEALTHY_THRESHOLD_DEFAULT,
} from "../tfjs.decide";

// Order must match CLASS_NAMES_V3 in moderation.constants.ts.
function probs(healthy: number, notFood: number, unhealthy: number) {
  return new Float32Array([healthy, notFood, unhealthy]);
}

describe("decideV3FromProbs", () => {
  it("blocks when unhealthy dominates above the default threshold", () => {
    const r = decideV3FromProbs(probs(0.005, 0.005, 0.99));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("BLOCK_TRAINED_CLASS");
    expect(r.bestClass).toBe("unhealthy");
    expect(r.bestProb).toBeCloseTo(0.99);
  });

  it("allows when healthy dominates", () => {
    const r = decideV3FromProbs(probs(0.8, 0.1, 0.1));
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("OTHER_CLASS");
    expect(r.bestClass).toBe("healthy");
    expect(r.bestProb).toBeCloseTo(0.8);
  });

  it("allows when not_food dominates", () => {
    const r = decideV3FromProbs(probs(0.1, 0.85, 0.05));
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("OTHER_CLASS");
    expect(r.bestClass).toBe("not_food");
  });

  it("blocks exactly at the threshold boundary (p(unhealthy) == threshold)", () => {
    const r = decideV3FromProbs(
      probs(0.25, 0.25, V3_UNHEALTHY_THRESHOLD_DEFAULT),
      V3_UNHEALTHY_THRESHOLD_DEFAULT,
    );
    expect(r.allowed).toBe(false);
    expect(r.bestClass).toBe("unhealthy");
  });

  it("honours a caller-supplied stricter threshold", () => {
    // p(unhealthy)=0.6 is top-1 but below the 0.9 strict gate.
    const r = decideV3FromProbs(probs(0.2, 0.2, 0.6), 0.9);
    expect(r.allowed).toBe(true);
    expect(r.bestClass).toBe("unhealthy");
  });

  it("honours a caller-supplied permissive threshold", () => {
    const r = decideV3FromProbs(probs(0.45, 0.35, 0.2), 0.1);
    expect(r.allowed).toBe(true);
    expect(r.bestClass).toBe("healthy");
  });

  it("allows when unhealthy is the runner-up even if above threshold", () => {
    // Healthy is top-1 so we must not block on the unhealthy slot alone.
    const r = decideV3FromProbs(probs(0.55, 0.05, 0.4), 0.3);
    expect(r.allowed).toBe(true);
    expect(r.bestClass).toBe("healthy");
  });

  it("returns the full probs dictionary for transparency in the appeal flow", () => {
    const r = decideV3FromProbs(probs(0.1, 0.2, 0.7));
    expect(r.probs).toEqual({
      healthy: expect.closeTo(0.1),
      not_food: expect.closeTo(0.2),
      unhealthy: expect.closeTo(0.7),
    });
  });

  it("throws when the output length does not match the 3-class head", () => {
    expect(() => decideV3FromProbs(new Float32Array([0.5]))).toThrow(
      /length mismatch/,
    );
    expect(() => decideV3FromProbs(new Float32Array([]))).toThrow(
      /length mismatch/,
    );
  });
});
