from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Protocol, TypeVar

from scene_config import JsonMap


class CopyableFrame(Protocol):
    def copy(self) -> "CopyableFrame": ...


FrameT = TypeVar("FrameT", bound=CopyableFrame)


@dataclass(frozen=True, slots=True)
class WebrtcConfig:
    enabled: bool
    host: str
    port: int
    fps: float


class CameraFrameStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._frames: dict[str, CopyableFrame] = {}

    def publish(self, camera_id: str, frame: FrameT) -> None:
        with self._lock:
            self._frames[camera_id] = frame.copy()

    def read(self, camera_id: str) -> CopyableFrame | None:
        with self._lock:
            frame = self._frames.get(camera_id)
            return None if frame is None else frame.copy()

    def camera_ids(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(sorted(self._frames))


def load_webrtc_config(raw: JsonMap) -> WebrtcConfig:
    webrtc = raw.get("webrtc")
    if not isinstance(webrtc, dict):
        return WebrtcConfig(enabled=False, host="0.0.0.0", port=8765, fps=10.0)
    return WebrtcConfig(
        enabled=bool(webrtc.get("enabled", False)),
        host=read_string(webrtc, "host", "0.0.0.0"),
        port=read_int(webrtc, "port", 8765),
        fps=read_float(webrtc, "fps", 10.0),
    )


def read_string(raw: JsonMap, field: str, default: str) -> str:
    value = raw.get(field, default)
    if not isinstance(value, str):
        raise TypeError(f"invalid WebRTC config field: {field}")
    return value


def read_int(raw: JsonMap, field: str, default: int) -> int:
    value = raw.get(field, default)
    if not isinstance(value, int):
        raise TypeError(f"invalid WebRTC config field: {field}")
    return value


def read_float(raw: JsonMap, field: str, default: float) -> float:
    value = raw.get(field, default)
    if not isinstance(value, int | float):
        raise TypeError(f"invalid WebRTC config field: {field}")
    return float(value)
