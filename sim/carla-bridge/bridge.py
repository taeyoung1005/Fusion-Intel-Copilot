from __future__ import annotations

import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from time import sleep
from typing import Final

import carla
import numpy as np
from PIL import Image

from bridge_core import build_frame_data_url, build_frame_payload, should_emit_frame
from scene import advance_walker_patrols, spawn_scene, spawn_vehicles
from scene_config import SceneConfig, load_scene_config

FRAME_WIDTH: Final = 640
FRAME_HEIGHT: Final = 360
SCENE_STEP_SECONDS: Final = 0.1
CAMERA_SENSOR_TICK_SECONDS: Final = 0.1


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
    frame_stride: int
    vehicle_count: int
    scene: SceneConfig
    cameras: tuple[CameraSpec, ...]


def load_config(path: Path) -> BridgeConfig:
    raw = json.loads(path.read_text(encoding="utf-8"))
    cameras = tuple(parse_camera(entry) for entry in raw["cameras"])
    map_name = raw.get("map")
    return BridgeConfig(
        d4d_origin=str(raw.get("d4d_origin", "http://127.0.0.1:5173")).rstrip("/"),
        carla_host=str(raw.get("carla_host", "127.0.0.1")),
        carla_port=int(raw.get("carla_port", 2000)),
        map_name=str(map_name) if map_name is not None else None,
        frame_stride=int(raw.get("frame_stride", 10)),
        vehicle_count=int(raw.get("vehicle_count", 24)),
        scene=load_scene_config(raw),
        cameras=cameras,
    )


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


def image_to_jpeg_bytes(image: carla.Image) -> bytes:
    array = np.frombuffer(image.raw_data, dtype=np.uint8).reshape((image.height, image.width, 4))
    rgb = array[:, :, :3][:, :, ::-1]
    buffer = io.BytesIO()
    Image.fromarray(rgb).save(buffer, format="JPEG", quality=78)
    return buffer.getvalue()


def post_frame(d4d_origin: str, frame_stride: int, camera: CameraSpec, image: carla.Image) -> None:
    if not should_emit_frame(image.frame, every_n_frames=frame_stride):
        return
    data_url = build_frame_data_url(image_to_jpeg_bytes(image))
    payload = build_frame_payload(data_url, camera.label)
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
    except urllib.error.URLError as error:
        print(f"D4D post failed for {camera.id}: {error}", file=sys.stderr)


def spawn_cameras(world: carla.World, config: BridgeConfig) -> list[carla.Actor]:
    blueprint = world.get_blueprint_library().find("sensor.camera.rgb")
    blueprint.set_attribute("image_size_x", str(FRAME_WIDTH))
    blueprint.set_attribute("image_size_y", str(FRAME_HEIGHT))
    blueprint.set_attribute("fov", "82")
    blueprint.set_attribute("sensor_tick", str(CAMERA_SENSOR_TICK_SECONDS))

    sensors: list[carla.Actor] = []
    for camera in config.cameras:
        sensor = world.spawn_actor(blueprint, carla.Transform(camera.location, camera.rotation))
        sensor.listen(
            lambda image, camera=camera: post_frame(
                config.d4d_origin,
                config.frame_stride,
                camera,
                image,
            ),
        )
        sensors.append(sensor)
        print(f"CARLA CCTV online: {camera.id} {camera.label}")
    return sensors


def run(config: BridgeConfig) -> None:
    client = carla.Client(config.carla_host, config.carla_port)
    client.set_timeout(30.0)
    world = client.get_world()
    if config.map_name is not None:
        world = client.load_world(config.map_name)
    scene_runtime = spawn_scene(world, config.scene)
    walker_patrols = scene_runtime.walker_patrols
    actors = [
        *scene_runtime.actors,
        *spawn_cameras(world, config),
        *spawn_vehicles(world, config.vehicle_count),
    ]
    try:
        while True:
            walker_patrols = advance_walker_patrols(walker_patrols, SCENE_STEP_SECONDS)
            sleep(SCENE_STEP_SECONDS)
    finally:
        for actor in actors:
            actor.destroy()


def main() -> int:
    config_path = Path(sys.argv[1] if len(sys.argv) > 1 else "config.json")
    run(load_config(config_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
