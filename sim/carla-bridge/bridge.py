from __future__ import annotations

import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import sleep
from typing import Final

import carla
import numpy as np
from PIL import Image

from bridge_core import (
    ActivityDetailValue,
    ActivityLogEvent,
    build_activity_log_line,
    build_frame_data_url,
    build_frame_payload,
    should_emit_frame,
)
from scene import SceneAdvance, advance_scene_runtime, spawn_scene, spawn_vehicles
from scene_config import ScenarioEventConfig, SceneConfig, TimedActorConfig, load_scene_config
from webrtc_core import CameraFrameStore, WebrtcConfig, load_webrtc_config
from webrtc_server import start_webrtc_server_in_thread

FRAME_WIDTH: Final = 640
FRAME_HEIGHT: Final = 360
SCENE_STEP_SECONDS: Final = 0.1
CAMERA_SENSOR_TICK_SECONDS: Final = 0.1
DETERMINISTIC_BASE_TIME: Final = datetime(2026, 7, 4, 9, 42, tzinfo=UTC)


@dataclass(frozen=True, slots=True)
class CameraSpec:
    id: str
    label: str
    location: carla.Location
    rotation: carla.Rotation


@dataclass(frozen=True, slots=True)
class BridgeConfig:
    d4d_origin: str
    carla_host: str
    carla_port: int
    map_name: str | None
    scenario: str | None
    frame_stride: int
    vehicle_count: int
    webrtc: WebrtcConfig
    scene: SceneConfig
    cameras: tuple[CameraSpec, ...]


def load_config(path: Path, scenario_override: str | None = None) -> BridgeConfig:
    raw = json.loads(path.read_text(encoding="utf-8"))
    cameras = tuple(parse_camera(entry) for entry in raw["cameras"])
    map_name = raw.get("map")
    scenario = scenario_override if scenario_override is not None else read_optional_config_string(raw, "scenario")
    return BridgeConfig(
        d4d_origin=str(raw.get("d4d_origin", "http://127.0.0.1:5173")).rstrip("/"),
        carla_host=str(raw.get("carla_host", "127.0.0.1")),
        carla_port=int(raw.get("carla_port", 2000)),
        map_name=str(map_name) if map_name is not None else None,
        scenario=scenario,
        frame_stride=int(raw.get("frame_stride", 10)),
        vehicle_count=int(raw.get("vehicle_count", 24)),
        webrtc=load_webrtc_config(raw),
        scene=load_scene_config(raw),
        cameras=cameras,
    )


def read_optional_config_string(raw: dict[str, object], field: str) -> str | None:
    value = raw.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(f"invalid bridge config field: {field}")
    return value


def parse_camera(raw: dict[str, object]) -> CameraSpec:
    location = raw["location"]
    rotation = raw["rotation"]
    if not isinstance(location, dict) or not isinstance(rotation, dict):
        raise TypeError("camera location and rotation must be JSON objects")
    return CameraSpec(
        id=str(raw["id"]),
        label=str(raw["label"]),
        location=carla.Location(
            x=float(location["x"]),
            y=float(location["y"]),
            z=float(location["z"]),
        ),
        rotation=carla.Rotation(
            pitch=float(rotation["pitch"]),
            yaw=float(rotation["yaw"]),
            roll=float(rotation.get("roll", 0.0)),
        ),
    )


def image_to_rgb_array(image: carla.Image) -> np.ndarray:
    array = np.frombuffer(image.raw_data, dtype=np.uint8).reshape((image.height, image.width, 4))
    return array[:, :, :3][:, :, ::-1].copy()


def rgb_array_to_jpeg_bytes(rgb: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(rgb).save(buffer, format="JPEG", quality=78)
    return buffer.getvalue()


def log_activity_event(event: ActivityLogEvent) -> None:
    print(build_activity_log_line(event), flush=True)


def handle_camera_image(
    d4d_origin: str,
    frame_stride: int,
    frame_store: CameraFrameStore,
    camera: CameraSpec,
    image: carla.Image,
    yaw: float,
) -> None:
    rgb = image_to_rgb_array(image)
    frame_store.publish(camera.id, rgb)
    if not should_emit_frame(image.frame, every_n_frames=frame_stride):
        return
    log_activity_event(
        ActivityLogEvent(
            source="carla",
            stage="frame-upload:start",
            level="info",
            message="CARLA frame upload started",
            detail={
                "cameraId": camera.id,
                "frameNumber": image.frame,
                "label": camera.label,
            },
        ),
    )
    data_url = build_frame_data_url(rgb_array_to_jpeg_bytes(rgb))
    payload = build_frame_payload(data_url, camera.label, yaw=yaw)
    url = f"{d4d_origin}/api/carla-cameras/{urllib.parse.quote(camera.id)}/frame"
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=2.5) as response:
            response.read()
            log_activity_event(
                ActivityLogEvent(
                    source="carla",
                    stage="frame-upload:end",
                    level="info",
                    message="CARLA frame upload completed",
                    detail={
                        "cameraId": camera.id,
                        "frameNumber": image.frame,
                        "httpStatus": response.status,
                    },
                ),
            )
    except urllib.error.URLError as error:
        log_activity_event(
            ActivityLogEvent(
                source="carla",
                stage="frame-upload:end",
                level="warn",
                message="CARLA frame upload failed",
                detail={
                    "cameraId": camera.id,
                    "error": str(error),
                    "frameNumber": image.frame,
                },
            ),
        )
        print(f"D4D post failed for {camera.id}: {error}", file=sys.stderr)


def spawn_cameras(
    world: carla.World,
    config: BridgeConfig,
    frame_store: CameraFrameStore,
) -> list[carla.Actor]:
    blueprint = world.get_blueprint_library().find("sensor.camera.rgb")
    blueprint.set_attribute("image_size_x", str(FRAME_WIDTH))
    blueprint.set_attribute("image_size_y", str(FRAME_HEIGHT))
    blueprint.set_attribute("fov", "82")
    blueprint.set_attribute("sensor_tick", str(CAMERA_SENSOR_TICK_SECONDS))

    sensors: list[carla.Actor] = []
    for camera in config.cameras:
        sensor = world.spawn_actor(blueprint, carla.Transform(camera.location, camera.rotation))
        sensor.listen(
            lambda image, camera=camera: handle_camera_image(
                config.d4d_origin,
                config.frame_stride,
                frame_store,
                camera,
                image,
                yaw=camera.rotation.yaw,
            ),
        )
        sensors.append(sensor)
        print(f"CARLA CCTV online: {camera.id} {camera.label}")
    return sensors


def attach_timed_drone_sensors(
    d4d_origin: str,
    frame_stride: int,
    frame_store: CameraFrameStore,
    advance: SceneAdvance,
) -> None:
    for spawn in advance.spawned_timed_actors:
        if spawn.config.kind != "drone":
            continue
        camera = camera_spec_for_timed_drone(spawn.config)
        spawn.actor.listen(
            lambda image, camera=camera, actor=spawn.actor: handle_camera_image(
                d4d_origin,
                frame_stride,
                frame_store,
                camera,
                image,
                yaw=actor.get_transform().rotation.yaw,
            ),
        )
        print(f"CARLA drone ISR online: {camera.id} {camera.label}")


def camera_spec_for_timed_drone(actor_config: TimedActorConfig) -> CameraSpec:
    return CameraSpec(
        id=actor_config.camera_id if actor_config.camera_id is not None else actor_config.id,
        label=actor_config.role,
        location=carla.Location(
            x=actor_config.transform.x,
            y=actor_config.transform.y,
            z=actor_config.transform.z,
        ),
        rotation=carla.Rotation(
            pitch=actor_config.transform.pitch,
            yaw=actor_config.transform.yaw,
            roll=actor_config.transform.roll,
        ),
    )


def post_timeline_event(d4d_origin: str, scenario: str, event: ScenarioEventConfig) -> None:
    payload = json.dumps(build_activity_payload(scenario, event), ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{d4d_origin}/api/activity-events",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    print(
        f"CARLA deterministic T+{event.at_seconds:05.1f}s "
        f"{event.stage} activity={event.activity_stage} tone={event.alert_tone} "
        f"map={event.map_effect} asset={event.asset_id or '-'}"
    )
    try:
        with urllib.request.urlopen(request, timeout=1.5) as response:
            response.read()
    except urllib.error.URLError as error:
        print(build_activity_log_line(activity_log_event_from_timeline(event)), flush=True)
        print(f"D4D activity post failed for {event.id}: {error}", file=sys.stderr)


def build_activity_payload(
    scenario: str,
    event: ScenarioEventConfig,
) -> dict[str, ActivityDetailValue | dict[str, ActivityDetailValue]]:
    return {
        "ts": scenario_timestamp(event),
        "source": normalize_activity_source(event.source),
        "level": normalize_activity_level(event.level),
        "stage": f"{event.activity_stage}:end",
        "message": event.message,
        "detail": {
            "activityId": event.id,
            "alertTone": event.alert_tone,
            "assetId": event.asset_id,
            "cameraId": event.camera_id,
            "mapEffect": event.map_effect,
            "rawLevel": event.level,
            "rawSource": event.source,
            "scenario": scenario,
            "scenarioStage": event.stage,
            "simSeconds": event.at_seconds,
        },
    }


def activity_log_event_from_timeline(event: ScenarioEventConfig) -> ActivityLogEvent:
    return ActivityLogEvent(
        source=normalize_activity_source(event.source),
        stage=f"{event.activity_stage}:end",
        level=normalize_activity_level(event.level),
        message=event.message,
        detail={
            "activityId": event.id,
            "cameraId": event.camera_id,
            "rawLevel": event.level,
            "rawSource": event.source,
            "simSeconds": event.at_seconds,
        },
    )


def normalize_activity_source(source: str) -> str:
    match source:
        case "vision" | "codex" | "carla":
            return source
        case _:
            return "carla"


def normalize_activity_level(level: str) -> str:
    match level:
        case "info" | "watch" | "warn" | "error":
            return level
        case "normal":
            return "info"
        case "alert":
            return "warn"
        case _:
            return "watch"


def scenario_timestamp(event: ScenarioEventConfig) -> str:
    timestamp = DETERMINISTIC_BASE_TIME + timedelta(seconds=event.at_seconds)
    return timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def run(config: BridgeConfig) -> None:
    if config.scenario is not None:
        print(f"CARLA scenario selected: {config.scenario}")
    client = carla.Client(config.carla_host, config.carla_port)
    client.set_timeout(30.0)
    world = client.get_world()
    if config.map_name is not None:
        world = client.load_world(config.map_name)
    frame_store = CameraFrameStore()
    start_webrtc_server_in_thread(config.webrtc, frame_store, FRAME_WIDTH, FRAME_HEIGHT)
    scene_runtime = spawn_scene(world, config.scene)
    actors = [*spawn_cameras(world, config, frame_store), *spawn_vehicles(world, config.vehicle_count, client=client)]
    try:
        while True:
            advance = advance_scene_runtime(world, scene_runtime, SCENE_STEP_SECONDS)
            scene_runtime = advance.runtime
            attach_timed_drone_sensors(config.d4d_origin, config.frame_stride, frame_store, advance)
            scenario_name = config.scenario or (scene_runtime.timeline.name if scene_runtime.timeline is not None else "default")
            for event in advance.events:
                post_timeline_event(config.d4d_origin, scenario_name, event)
            sleep(SCENE_STEP_SECONDS)
    finally:
        for actor in (*scene_runtime.actors, *actors):
            actor.destroy()


def parse_cli_args(argv: list[str]) -> tuple[Path, str | None]:
    config_path = Path("config.json")
    scenario: str | None = None
    index = 1
    while index < len(argv):
        value = argv[index]
        if value == "--scenario":
            index += 1
            if index >= len(argv):
                raise SystemExit("--scenario requires a value")
            scenario = argv[index]
        else:
            config_path = Path(value)
        index += 1
    return config_path, scenario


def main() -> int:
    config_path, scenario = parse_cli_args(sys.argv)
    run(load_config(config_path, scenario))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
