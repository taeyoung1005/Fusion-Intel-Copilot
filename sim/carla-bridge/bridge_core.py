import base64
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from collections.abc import Mapping
from typing import Final

DATA_URL_PREFIX: Final = "data:image/jpeg;base64,"
ACTIVITY_LOG_PREFIX: Final = "D4D_ACTIVITY "
type ActivityDetailValue = str | int | float | bool | None


@dataclass(frozen=True, slots=True)
class ActivityLogEvent:
    source: str
    stage: str
    level: str
    message: str
    detail: Mapping[str, ActivityDetailValue] | None = None


def build_frame_data_url(jpeg_bytes: bytes) -> str:
    encoded = base64.b64encode(jpeg_bytes).decode("ascii")
    return f"{DATA_URL_PREFIX}{encoded}"


def build_frame_payload(frame_data_url: str, label: str) -> bytes:
    return json.dumps(
        {"frameDataUrl": frame_data_url, "label": label},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")


def build_activity_log_line(event: ActivityLogEvent) -> str:
    payload: dict[str, ActivityDetailValue | dict[str, ActivityDetailValue]] = {
        "ts": datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": event.source,
        "stage": event.stage,
        "level": event.level,
        "message": event.message,
    }
    if event.detail is not None:
        payload["detail"] = dict(event.detail)
    return f"{ACTIVITY_LOG_PREFIX}{json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}"


def should_emit_frame(frame_number: int, every_n_frames: int) -> bool:
    if every_n_frames <= 1:
        return True
    return frame_number == 1 or (frame_number - 1) % every_n_frames == 0
