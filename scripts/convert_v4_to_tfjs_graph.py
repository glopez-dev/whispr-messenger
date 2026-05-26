"""
Reconvert mobilenet-food-binary/model.keras into a TFJS GraphModel.

The Keras 3 layers-model export contains RandomFlip / RandomRotation /
RandomZoom data-augmentation layers wrapped in a Sequential. tfjs-layers
(Keras 2 API) does not implement those layers, so loadLayersModel fails.
This script rebuilds the model without that Sequential and exports via
tf.saved_model.save, then tensorflowjs_converter emits a clean GraphModel.

REQUIRED MANUAL VENV PATCH (one-off):
The tfjs converter runs a second Grappler pass with the 'remap' optimizer
that fuses Conv2D + activation into _FusedConv2D. tfjs's CPU backend (used
by React Native) cannot execute _FusedConv2D for activations like
_fusedhardswish (present in MobileNetV3). Drop 'remap' from the optimizer
list to keep Conv2D + BiasAdd + Activation as separate ops:

  Edit .venv-tfjs/Lib/site-packages/tensorflowjs/converters/
       tf_saved_model_conversion_v2.py  around line 186
       Replace ['remap', 'constfold', 'arithmetic', 'dependency']
       with    ['constfold', 'arithmetic', 'dependency']

Without this patch, the converted v4 model will crash at inference on
React Native with: "Activation _fusedhardswish has not been implemented
for the CPU backend."

Usage (from mobile-app/):
  python scripts/convert_v4_to_tfjs_graph.py \\
      --src ../mobilenet-food-binary/model.keras \\
      --out assets/models/v4-tfjs

The output dir will contain model.json + group1-shard1of1.bin (single shard).
Copy the same files into public/models/v4-tfjs/ for the web build.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import tensorflow as tf


def export_serving_savedmodel(keras_path: Path, out_dir: Path) -> None:
    print(f"[1/3] Loading Keras model: {keras_path}")
    model = tf.keras.models.load_model(str(keras_path), compile=False)
    print(f"      Inputs:  {model.input_shape}")
    print(f"      Outputs: {model.output_shape}")

    # Rebuild the model skipping the data-augmentation Sequential (Random*
    # layers are no-ops at inference, are unsupported by tfjs-layers, and
    # their seed_generator breaks tf.saved_model.save). Keep only the
    # MobileNet backbone + classification head.
    print(f"      Rebuilding without augmentation layers...")
    inp = tf.keras.Input(shape=model.input_shape[1:], dtype=tf.float32, name="input")
    x = inp
    for layer in model.layers:
        cls = layer.__class__.__name__
        if cls == "InputLayer":
            continue
        if cls == "Sequential" and any(
            type(sub).__name__.startswith("Random") for sub in layer.layers
        ):
            print(f"        - skipping augmentation Sequential '{layer.name}'")
            continue
        x = layer(x)
    clean = tf.keras.Model(inp, x, name=f"{model.name}_clean")
    print(f"      Clean model: input={clean.input_shape}, output={clean.output_shape}")

    @tf.function(
        input_signature=[tf.TensorSpec([None, 224, 224, 3], tf.float32, name="input")]
    )
    def serving_fn(x):
        return clean(x, training=False)

    print(f"[2/3] Saving SavedModel: {out_dir}")
    tf.saved_model.save(
        clean,
        str(out_dir),
        signatures={"serving_default": serving_fn.get_concrete_function()},
    )


def convert_to_tfjs_graph(saved_model_dir: Path, out_dir: Path) -> None:
    print(f"[3/3] Converting SavedModel to TFJS GraphModel: {out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)
    # Call the converter via `python -m` so it resolves through the active
    # venv's site-packages instead of relying on the .exe being on PATH.
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
    p.add_argument("--src", required=True, help="Path to model.keras")
    p.add_argument("--out", required=True, help="Destination dir for model.json + .bin")
    args = p.parse_args()

    src = Path(args.src).resolve()
    out = Path(args.out).resolve()
    if not src.is_file():
        sys.exit(f"Source model not found: {src}")

    with tempfile.TemporaryDirectory(prefix="v4_saved_model_") as tmp:
        saved_model_dir = Path(tmp) / "saved_model"
        export_serving_savedmodel(src, saved_model_dir)

        if out.exists():
            shutil.rmtree(out)
        convert_to_tfjs_graph(saved_model_dir, out)

    print("\nDone. Generated files:")
    for f in sorted(out.iterdir()):
        size_kb = f.stat().st_size / 1024
        print(f"  {f.name}  ({size_kb:.1f} KB)")
    print(
        "\nNext steps:\n"
        f"  1. Copy {out}/* into mobile-app/public/models/v4-tfjs/ (web build)\n"
        "  2. In src/services/moderation/tfjs.service.ts, change SPECS.v4.format\n"
        '     from "layers" to "graph".\n'
        "  3. In src/services/moderation/tfjs.service.web.ts, change\n"
        '     MODEL_FORMATS.v4 from "layers" to "graph".\n'
    )


if __name__ == "__main__":
    main()
