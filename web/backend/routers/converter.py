"""
REST endpoint for model format conversion.

Mirrors the legacy ``ConvertModelUI.convert_model()`` flow:
  1. Create model_loader / model_saver via ``create`` module
  2. Load model with the correct ModelNames variant
  3. Save model in the requested format / dtype
  4. Clean up GPU memory with ``torch_gc``
"""

import traceback
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["tools"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ConvertModelRequest(BaseModel):
    model_type: str  # ModelType enum value, e.g. "STABLE_DIFFUSION_15"
    training_method: str  # "FINE_TUNE", "LORA", "EMBEDDING"
    input_name: str  # file / directory path or HuggingFace repo id
    output_dtype: str  # "FLOAT_32", "FLOAT_16", "BFLOAT_16"
    output_model_format: str  # "SAFETENSORS", "DIFFUSERS"
    output_model_destination: str  # output file / directory path


class ConvertModelResponse(BaseModel):
    ok: bool
    error: str | None = None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/tools/convert", response_model=ConvertModelResponse)
def convert_model(req: ConvertModelRequest) -> ConvertModelResponse:
    """
    Convert a model between formats.

    This is a long-running, synchronous (blocking) operation.  The frontend
    should display a loading indicator while the request is in flight.
    """
    try:
        # Lazy-import heavy modules so the router file itself loads instantly.
        from modules.util import create
        from modules.util.enum.DataType import DataType
        from modules.util.enum.ModelFormat import ModelFormat
        from modules.util.enum.ModelType import ModelType
        from modules.util.enum.TrainingMethod import TrainingMethod
        from modules.util.ModelNames import EmbeddingName, ModelNames
        from modules.util.ModelWeightDtypes import ModelWeightDtypes
        from modules.util.torch_util import torch_gc

        # Map string values to enum members
        model_type = ModelType(req.model_type)
        training_method = TrainingMethod(req.training_method)
        output_dtype = DataType(req.output_dtype)
        output_model_format = ModelFormat(req.output_model_format)

        weight_dtypes = ModelWeightDtypes.from_single_dtype(output_dtype)

        # Create loader & saver
        model_loader = create.create_model_loader(
            model_type=model_type,
            training_method=training_method,
        )
        model_saver = create.create_model_saver(
            model_type=model_type,
            training_method=training_method,
        )

        # Load model – the ModelNames variant depends on training method
        print(f"Loading model {req.input_name}")
        if training_method == TrainingMethod.FINE_TUNE:
            model = model_loader.load(
                model_type=model_type,
                model_names=ModelNames(base_model=req.input_name),
                weight_dtypes=weight_dtypes,
            )
        elif training_method in (TrainingMethod.LORA, TrainingMethod.EMBEDDING):
            model = model_loader.load(
                model_type=model_type,
                model_names=ModelNames(
                    lora=req.input_name,
                    embedding=EmbeddingName(str(uuid4()), req.input_name),
                ),
                weight_dtypes=weight_dtypes,
            )
        else:
            return ConvertModelResponse(ok=False, error=f"Unsupported training method: {req.training_method}")

        # Save model in target format
        print(f"Saving model {req.output_model_destination}")
        model_saver.save(
            model=model,
            model_type=model_type,
            output_model_format=output_model_format,
            output_model_destination=req.output_model_destination,
            dtype=output_dtype.torch_dtype(),
        )
        print("Model converted")

        # Free GPU memory
        torch_gc()

        return ConvertModelResponse(ok=True)

    except Exception as exc:
        traceback.print_exc()
        # Attempt cleanup even after an error
        try:
            from modules.util.torch_util import torch_gc
            torch_gc()
        except Exception:
            pass
        return ConvertModelResponse(ok=False, error=str(exc))
