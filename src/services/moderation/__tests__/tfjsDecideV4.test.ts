/**
 * Tests for decideV4FromProbs — MobileNetV3-Small binary food/not_food gate.
 *
 * V4 emits a single sigmoid: p(food). Block when `p(food) >= threshold`,
 * allow otherwise. Mirrors the v2/v3 policy (only non-food imagery passes).
 */

import { decideV4FromProbs, V4_FOOD_THRESHOLD_DEFAULT } from "../tfjs.decide";

const sigmoid = (pFood: number) => new Float32Array([pFood]);

describe("decideV4FromProbs", () => {
  it("blocks when p(food) is above the default threshold", () => {
    const r = decideV4FromProbs(sigmoid(0.9));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("BLOCK_TRAINED_CLASS");
    expect(r.bestClass).toBe("food");
    expect(r.bestProb).toBeCloseTo(0.9);
    expect(r.probs.food).toBeCloseTo(0.9, 5);
    expect(r.probs.not_food).toBeCloseTo(0.1, 5);
  });

  it("allows when p(food) is below the default threshold", () => {
    const r = decideV4FromProbs(sigmoid(0.1));
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("OTHER_CLASS");
    expect(r.bestClass).toBe("not_food");
    expect(r.bestProb).toBeCloseTo(0.9);
  });

  it("blocks exactly at the threshold", () => {
    const r = decideV4FromProbs(sigmoid(V4_FOOD_THRESHOLD_DEFAULT));
    expect(r.allowed).toBe(false);
    expect(r.bestClass).toBe("food");
  });

  it("respects a custom threshold", () => {
    const lenient = decideV4FromProbs(sigmoid(0.6), 0.8);
    expect(lenient.allowed).toBe(true);
    expect(lenient.bestClass).toBe("not_food");

    const strict = decideV4FromProbs(sigmoid(0.4), 0.3);
    expect(strict.allowed).toBe(false);
    expect(strict.bestClass).toBe("food");
  });

  it("throws on the wrong output length (defends against wiring to v2/v3)", () => {
    expect(() => decideV4FromProbs(new Float32Array([0.1, 0.2, 0.7]))).toThrow(
      /V4 output length mismatch/,
    );
  });
});
