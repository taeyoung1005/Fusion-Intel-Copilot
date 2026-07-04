from __future__ import annotations

import base64
import binascii
import io
import os
import socket
from dataclasses import dataclass
from functools import lru_cache
from typing import TYPE_CHECKING, Final, Protocol, Sequence, TypedDict
from urllib.parse import urljoin, urlsplit

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from PIL import Image, UnidentifiedImageError

if TYPE_CHECKING:
    from fastapi import FastAPI

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "1")

MODEL_ID: Final = os.environ.get("D4D_DETR_MODEL_ID", "facebook/detr-resnet-50")
DETR_THRESHOLD: Final = float(os.environ.get("D4D_DETR_THRESHOLD", "0.5"))
SOURCE_ORIGIN: Final = os.environ.get("D4D_DETR_SOURCE_ORIGIN", "http://127.0.0.1:5173")
ALLOWED_ORIGINS: Final = tuple(
    origin.strip()
    for origin in os.environ.get(
        "D4D_DETR_ALLOWED_ORIGINS",
        f"{SOURCE_ORIGIN},http://localhost:5173",
    ).split(",")
    if origin.strip()
)
SERVICE_HOST: Final = os.environ.get("D4D_DETR_HOST", "0.0.0.0")
SERVICE_PORT: Final = int(os.environ.get("D4D_DETR_PORT", "8766"))


class DetectRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    source: str = Field(min_length=1)
    frame_width: int = Field(alias="frameWidth", gt=0)
    frame_height: int = Field(alias="frameHeight", gt=0)


class DetrBox(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    xmin: float
    ymin: float
    xmax: float
    ymax: float


class DetrDetection(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    label: str = Field(min_length=1)
    score: float = Field(ge=0, le=1)
    box: DetrBox


class RawDetrBox(TypedDict):
    xmin: float
    ymin: float
    xmax: float
    ymax: float


class RawDetrDetection(TypedDict):
    label: str
    score: float
    box: RawDetrBox


class RawDetectionPipeline(Protocol):
    def __call__(self, image: Image.Image, *, threshold: float) -> Sequence[RawDetrDetection]: ...


class Detector(Protocol):
    def __call__(self, image: Image.Image) -> Sequence[DetrDetection]: ...


@dataclass(frozen=True, slots=True)
class DetrServiceError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


@dataclass(frozen=True, slots=True)
class SourceImageError(DetrServiceError):
    pass


@dataclass(frozen=True, slots=True)
class DetectorRuntimeError(DetrServiceError):
    pass


@dataclass(frozen=True, slots=True)
class TransformersDetector:
    pipeline: RawDetectionPipeline

    def __call__(self, image: Image.Image) -> tuple[DetrDetection, ...]:
        raw = self.pipeline(image, threshold=DETR_THRESHOLD)
        return tuple(DETR_DETECTION_LIST.validate_python(raw))


DETR_DETECTION_LIST: Final = TypeAdapter(list[DetrDetection])


def decode_data_url(source: str) -> bytes:
    header, separator, payload = source.partition(",")
    if separator == "" or ";base64" not in header:
        raise SourceImageError("data URL frame source must be base64 encoded")
    try:
        return base64.b64decode(payload, validate=True)
    except binascii.Error as exc:
        raise SourceImageError("data URL frame source contains invalid base64") from exc


def resolve_frame_url(source: str) -> str:
    parsed = urlsplit(source)
    if parsed.scheme in {"http", "https"}:
        return source
    if source.startswith("/"):
        return urljoin(f"{SOURCE_ORIGIN.rstrip('/')}/", source.lstrip("/"))
    raise SourceImageError("frame source must be a data URL, absolute URL, or dev-server path")


async def fetch_frame_url(url: str) -> bytes:
    try:
        import httpx2
    except ModuleNotFoundError as exc:
        raise DetectorRuntimeError("httpx2 is required to fetch frame URLs") from exc

    limits = httpx2.Limits(max_connections=200, max_keepalive_connections=40, keepalive_expiry=30.0)
    timeout = httpx2.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0)
    transport = httpx2.AsyncHTTPTransport(
        http2=True,
        retries=3,
        limits=limits,
        socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)],
    )
    async with httpx2.AsyncClient(
        transport=transport,
        timeout=timeout,
        follow_redirects=True,
    ) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
        except httpx2.HTTPError as exc:
            raise SourceImageError(f"failed to fetch frame source: {url}") from exc
        return bytes(response.content)


async def load_source_bytes(source: str) -> bytes:
    if source.startswith("data:"):
        return decode_data_url(source)
    return await fetch_frame_url(resolve_frame_url(source))


def open_rgb_image(data: bytes) -> Image.Image:
    try:
        with Image.open(io.BytesIO(data)) as image:
            return image.convert("RGB")
    except UnidentifiedImageError as exc:
        raise SourceImageError("frame source is not a supported image") from exc


def filter_detections(detections: Sequence[DetrDetection], threshold: float) -> tuple[DetrDetection, ...]:
    return tuple(detection for detection in detections if detection.score >= threshold)


@lru_cache(maxsize=1)
def get_default_detector() -> Detector:
    try:
        import torch
        from transformers import pipeline
    except ModuleNotFoundError as exc:
        raise DetectorRuntimeError("torch and transformers are required for DETR inference") from exc

    device = 0 if torch.cuda.is_available() else -1
    return TransformersDetector(
        pipeline=pipeline("object-detection", model=MODEL_ID, device=device),
    )


async def detect_frame(
    request: DetectRequest,
    *,
    detector: Detector | None = None,
) -> tuple[DetrDetection, ...]:
    image = open_rgb_image(await load_source_bytes(request.source))
    selected_detector = get_default_detector() if detector is None else detector
    return filter_detections(selected_detector(image), DETR_THRESHOLD)


def create_app() -> "FastAPI":
    from fastapi import FastAPI, HTTPException, status
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="D4D CARLA DETR Inference Service")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )

    @app.post("/detect", response_model=list[DetrDetection])
    async def detect(request: DetectRequest) -> tuple[DetrDetection, ...]:
        try:
            return await detect_frame(request)
        except SourceImageError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        except DetectorRuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return app


def main() -> None:
    import uvicorn

    uvicorn.run(create_app(), host=SERVICE_HOST, port=SERVICE_PORT)


if __name__ == "__main__":
    main()
