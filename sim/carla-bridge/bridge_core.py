import base64
import json
from typing import Final

DATA_URL_PREFIX: Final = "data:image/jpeg;base64,"


def build_frame_data_url(jpeg_bytes: bytes) -> str:
    encoded = base64.b64encode(jpeg_bytes).decode("ascii")
    return f"{DATA_URL_PREFIX}{encoded}"


def build_frame_payload(frame_data_url: str, label: str) -> bytes:
    return json.dumps(
        {"frameDataUrl": frame_data_url, "label": label},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")


def should_emit_frame(frame_number: int, every_n_frames: int) -> bool:
    if every_n_frames <= 1:
        return True
    return frame_number == 1 or (frame_number - 1) % every_n_frames == 0
