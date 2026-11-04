"""r2 (#1533): HF -> MLX conversion with the CPU-device workaround.

Metal/MTLCompilerService is unreachable from sandboxed processes on this box
(#737 family); mlx_lm convert otherwise dies in save_safetensors with
"Unable to load kernel vs_Addbfloat16". Forcing the default device to CPU
makes conversion pure numpy-ish host work — correctness unaffected (weights
are rearranged, not computed). oMLX itself runs GPU in the GUI session.

usage: python r2_convert.py <hf_dir> <mlx_out_dir>
"""
import sys

import mlx.core as mx

mx.set_default_device(mx.cpu)

from mlx_lm.convert import convert  # noqa: E402

convert(hf_path=sys.argv[1], mlx_path=sys.argv[2], dtype=mx.bfloat16)
print("done:", sys.argv[2])
