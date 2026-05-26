/**
 * V2: 9-class softmax (EfficientNet-B0 + custom head), includes a catch-all
 * "Other" label alongside the eight trained food classes.
 */
export const CLASS_NAMES_V2 = [
  "Baked Potato",
  "Burger",
  "Crispy Chicken",
  "Donut",
  "Fries",
  "Hot Dog",
  "Other",
  "Pizza",
  "Sandwich",
] as const;

/**
 * V3: 3-class softmax (MobileNetV3-Small + custom head) trained on
 * healthy/unhealthy/not_food. Class order matches the alphabetical sort
 * applied by `tf.keras.utils.image_dataset_from_directory` at training time.
 * Only `unhealthy` produces a block decision.
 */
export const CLASS_NAMES_V3 = ["healthy", "not_food", "unhealthy"] as const;

/** Index of the "unhealthy" class in CLASS_NAMES_V3 — the only blocking label. */
export const V3_UNHEALTHY_INDEX = 2;

/**
 * Backwards-compatible alias. A few existing modules and tests import
 * CLASS_NAMES expecting the V2 label set.
 */
export const CLASS_NAMES = CLASS_NAMES_V2;

export const INPUT_SIZE = 224;
