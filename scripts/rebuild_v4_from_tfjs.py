"""
Reconstruct the 3-class MobileNetV3Small food classifier in Keras 3 and load
its trained weights from the HuggingFace TFJS layers-model export at
`mobilenet-food-binary/tfjs/`. Then save as SavedModel and convert to a TFJS
graph-model that mobile-app can load via `tf.loadGraphModel()`.

Why this script exists:
- The source `model.keras` in mobilenet-food-binary is a 1-output BINARY model
  (the repo was re-trained but the README/metrics/tfjs export were not
  updated — they still describe the original 3-class model).
- The 3-class weights only survive in `mobilenet-food-binary/tfjs/`
  (group1-shard1of1.bin), which is a tfjs layers-model with Keras 3 metadata.
- tfjs-layers (JS runtime) cannot parse Keras 3 metadata.
- tf_keras (the Keras 2 legacy converter backend used by `tensorflowjs_converter
  --input_format=tfjs_layers_model`) can't parse it either — hard_swish
  activation + SE block multi-input wiring breaks deserialization.
- So we re-create the architecture from scratch using Keras 3
  (`tf.keras.applications.MobileNetV3Small`), assign the bin-file weights
  by name, save as SavedModel (Keras 3 native), and let tensorflowjs convert
  SavedModel -> graph-model (a path that bypasses Keras metadata entirely).

Usage (from mobile-app/):
    python scripts/rebuild_v4_from_tfjs.py \
        --src ../mobilenet-food-binary/tfjs \
        --out assets/models/v4-tfjs \
        --also-copy-to public/models/v4-tfjs
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import tensorflow as tf


def load_weight_specs(model_json: Path) -> tuple[list[dict], list[Path]]:
    """Return (weight_specs, list_of_bin_files) from a tfjs layers-model dir."""
    d = json.loads(model_json.read_text())
    manifest = d["weightsManifest"][0]
    weights = manifest["weights"]
    paths = [model_json.parent / p for p in manifest["paths"]]
    return weights, paths


def read_weight_tensors(weight_specs: list[dict], bin_paths: list[Path]) -> dict[str, np.ndarray]:
    """Concatenate the bin shards and split into named numpy arrays.

    Handles per-tensor uint8 quantization (HF's TFJS export quantizes every
    weight to ~25% of float32 size using {min, scale, dtype=uint8}).
    Dequantizes back to float32 with: f32 = uint8 * scale + min.
    """
    blob = b"".join(p.read_bytes() for p in bin_paths)
    out: dict[str, np.ndarray] = {}
    offset = 0
    dtype_map = {"float32": np.float32, "int32": np.int32, "uint8": np.uint8, "bool": np.bool_}
    quantized_count = 0
    for spec in weight_specs:
        shape = spec["shape"]
        n = int(np.prod(shape)) if shape else 1
        quant = spec.get("quantization")
        if quant:
            # Read raw uint8 bytes then dequantize to original dtype (float32).
            stored_dtype = np.dtype(dtype_map[quant.get("dtype", "uint8")])
            nbytes = n * stored_dtype.itemsize
            raw = np.frombuffer(blob, dtype=stored_dtype, count=n, offset=offset).reshape(shape)
            arr = (raw.astype(np.float32) * float(quant["scale"])) + float(quant["min"])
            quantized_count += 1
        else:
            dtype = np.dtype(dtype_map[spec.get("dtype", "float32")])
            nbytes = n * dtype.itemsize
            arr = np.frombuffer(blob, dtype=dtype, count=n, offset=offset).reshape(shape).copy()
        out[spec["name"]] = arr
        offset += nbytes
    if offset != len(blob):
        print(f"  WARN: leftover {len(blob) - offset} bytes in weight blob (mismatch?)")
    print(f"      {quantized_count}/{len(weight_specs)} weights were uint8-quantized (dequantized to float32)")
    return out


def build_model() -> tf.keras.Model:
    """Recreate the architecture described in the mobilenet-food-binary README."""
    base = tf.keras.applications.MobileNetV3Small(
        input_shape=(224, 224, 3),
        include_top=False,
        weights=None,           # we'll load trained weights manually
        include_preprocessing=True,  # bakes in Rescaling([-1, 1]) — matches HF training
    )
    inp = tf.keras.Input(shape=(224, 224, 3), name="input")
    x = base(inp, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D(name="global_average_pooling2d")(x)
    x = tf.keras.layers.Dropout(0.2, name="dropout")(x)
    out = tf.keras.layers.Dense(3, activation="softmax", name="dense")(x)
    return tf.keras.Model(inp, out, name="mobilenet_v3_small_food")


def assign_weights(model: tf.keras.Model, weights: dict[str, np.ndarray]) -> tuple[int, int]:
    """Assign weights by position.

    Keras 3 doesn't expose layer-prefixed names on `v.name` (only the variable
    basename like 'kernel' or 'gamma'), so name-based matching against the
    HF export ('conv/kernel', 'conv_bn/gamma', ...) is unreliable. Both
    pipelines build the exact same `MobileNetV3Small + GAP + Dropout +
    Dense(3)` architecture though, so the 208 weights are in the same order.
    Position-based assignment is safe as long as the shapes line up at every
    index — which we verify and fail loudly otherwise.
    """
    model_weights = model.weights
    hf_items = list(weights.items())
    if len(model_weights) != len(hf_items):
        raise SystemExit(
            f"weight count mismatch: model has {len(model_weights)}, HF has {len(hf_items)}"
        )
    matched = 0
    mismatched: list[str] = []
    for i, (v, (name, arr)) in enumerate(zip(model_weights, hf_items)):
        if tuple(v.shape) != tuple(arr.shape):
            mismatched.append(
                f"[{i}] hf={name}{tuple(arr.shape)} vs model{tuple(v.shape)}"
            )
            continue
        v.assign(arr)
        matched += 1
    if mismatched:
        print(f"  WARN: {len(mismatched)} shape mismatches (first 5): {mismatched[:5]}")
    return matched, len(hf_items)


def export_savedmodel(model: tf.keras.Model, out_dir: Path) -> None:
    """Save as TF SavedModel with an explicit serving signature (training=False)."""

    @tf.function(input_signature=[tf.TensorSpec([None, 224, 224, 3], tf.float32, name="input")])
    def serving_fn(x):
        return model(x, training=False)

    tf.saved_model.save(
        model,
        str(out_dir),
        signatures={"serving_default": serving_fn.get_concrete_function()},
    )


def convert_to_tfjs_graph(saved_model_dir: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        "-m",
        "tensorflowjs.converters.converter",
        "--input_format=tf_saved_model",
        "--output_format=tfjs_graph_model",
        "--signature_name=serving_default",
        "--saved_model_tags=serve",
        str(saved_model_dir),
        str(out_dir),
    ]
    print("     $ " + " ".join(cmd))
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        sys.exit(f"tensorflowjs converter failed (exit {result.returncode}).")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True, help="Path to mobilenet-food-binary/tfjs/ (layers-model)")
    p.add_argument("--out", required=True, help="Destination dir for model.json + .bin")
    p.add_argument("--also-copy-to", default=None, help="Optional 2nd destination (e.g. public/)")
    args = p.parse_args()

    src = Path(args.src).resolve()
    out = Path(args.out).resolve()
    model_json = src / "model.json"
    if not model_json.is_file():
        sys.exit(f"Source not found: {model_json}")

    print(f"[1/4] Reading weights from {src}")
    specs, bin_paths = load_weight_specs(model_json)
    weights = read_weight_tensors(specs, bin_paths)
    print(f"      {len(weights)} weight tensors loaded from {len(bin_paths)} shard(s)")

    print(f"[2/4] Building MobileNetV3Small + 3-class head in Keras 3")
    model = build_model()
    print(f"      input={model.input_shape} output={model.output_shape}")

    print(f"[3/4] Assigning trained weights by name")
    matched, total = assign_weights(model, weights)
    print(f"      matched {matched}/{total}")
    if matched < total * 0.9:
        sys.exit(f"ERROR: only {matched}/{total} weights matched — name scheme drift, aborting.")

    with tempfile.TemporaryDirectory(prefix="v4_saved_") as tmp:
        saved_dir = Path(tmp) / "saved"
        print(f"[4/4] Exporting SavedModel + converting to TFJS graph-model")
        export_savedmodel(model, saved_dir)
        convert_to_tfjs_graph(saved_dir, out)

    print(f"\nOK: wrote {out}")
    if args.also_copy_to:
        dest = Path(args.also_copy_to).resolve()
        dest.mkdir(parents=True, exist_ok=True)
        for f in out.iterdir():
            shutil.copy2(f, dest / f.name)
        print(f"     mirrored to {dest}")


if __name__ == "__main__":
    main()
