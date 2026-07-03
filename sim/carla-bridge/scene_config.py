from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

JsonValue: TypeAlias = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
JsonMap: TypeAlias = dict[str, JsonValue]


class SceneConfigError(TypeError):
    def __init__(self, field: str) -> None:
        self.field = field
        super().__init__(f"invalid CARLA scene config field: {field}")


@dataclass(frozen=True, slots=True)
class TransformConfig:
    x: float
    y: float
    z: float
    pitch: float
    yaw: float
    roll: float


@dataclass(frozen=True, slots=True)
class PropConfig:
    blueprint: str
    transform: TransformConfig


@dataclass(frozen=True, slots=True)
class WalkerConfig:
    blueprint: str
    transform: TransformConfig
    route: tuple[TransformConfig, ...]
    speed: float


@dataclass(frozen=True, slots=True)
class WeatherConfig:
    cloudiness: float
    precipitation: float
    sun_altitude_angle: float
    fog_density: float
    wetness: float


@dataclass(frozen=True, slots=True)
class SceneConfig:
    weather: WeatherConfig | None
    props: tuple[PropConfig, ...]
    parked_vehicles: tuple[PropConfig, ...]
    walkers: tuple[WalkerConfig, ...]


def load_scene_config(raw: JsonMap) -> SceneConfig:
    scene_raw = raw.get("scene")
    if scene_raw is None:
        return SceneConfig(weather=None, props=(), parked_vehicles=(), walkers=())
    if not isinstance(scene_raw, dict):
        raise SceneConfigError("scene")
    return SceneConfig(
        weather=parse_weather(scene_raw.get("weather")),
        props=tuple(parse_prop(item, "props") for item in read_list(scene_raw, "props")),
        parked_vehicles=tuple(
            parse_prop(item, "parked_vehicles") for item in read_list(scene_raw, "parked_vehicles")
        ),
        walkers=tuple(parse_walker(item) for item in read_list(scene_raw, "walkers")),
    )


def parse_weather(raw: JsonValue) -> WeatherConfig | None:
    if raw is None:
        return None
    data = require_map(raw, "weather")
    return WeatherConfig(
        cloudiness=read_float(data, "cloudiness", 0.0),
        precipitation=read_float(data, "precipitation", 0.0),
        sun_altitude_angle=read_float(data, "sun_altitude_angle", 45.0),
        fog_density=read_float(data, "fog_density", 0.0),
        wetness=read_float(data, "wetness", 0.0),
    )


def parse_prop(raw: JsonValue, field: str) -> PropConfig:
    data = require_map(raw, field)
    return PropConfig(
        blueprint=read_string(data, "blueprint"),
        transform=parse_transform(data),
    )


def parse_walker(raw: JsonValue) -> WalkerConfig:
    data = require_map(raw, "walkers")
    return WalkerConfig(
        blueprint=read_string(data, "blueprint"),
        transform=parse_transform(data),
        route=parse_walker_route(data),
        speed=read_float(data, "speed", 1.2),
    )


def parse_walker_route(raw: JsonMap) -> tuple[TransformConfig, ...]:
    route = raw.get("route")
    if route is not None:
        return tuple(parse_transform({"location": require_map(item, "route")}) for item in read_route(route))
    return (parse_transform({"location": require_map(raw.get("destination"), "destination")}),)


def read_route(raw: JsonValue) -> list[JsonValue]:
    if not isinstance(raw, list) or len(raw) == 0:
        raise SceneConfigError("route")
    return raw


def parse_transform(raw: JsonMap) -> TransformConfig:
    location = require_map(raw.get("location"), "location")
    rotation = raw.get("rotation")
    rotation_map = require_map(rotation, "rotation") if rotation is not None else {}
    return TransformConfig(
        x=read_float(location, "x", 0.0),
        y=read_float(location, "y", 0.0),
        z=read_float(location, "z", 0.0),
        pitch=read_float(rotation_map, "pitch", 0.0),
        yaw=read_float(rotation_map, "yaw", 0.0),
        roll=read_float(rotation_map, "roll", 0.0),
    )


def read_list(raw: JsonMap, field: str) -> list[JsonValue]:
    value = raw.get(field, [])
    if not isinstance(value, list):
        raise SceneConfigError(field)
    return value


def require_map(raw: JsonValue, field: str) -> JsonMap:
    if not isinstance(raw, dict):
        raise SceneConfigError(field)
    return raw


def read_string(raw: JsonMap, field: str) -> str:
    value = raw.get(field)
    if not isinstance(value, str):
        raise SceneConfigError(field)
    return value


def read_float(raw: JsonMap, field: str, default: float) -> float:
    value = raw.get(field, default)
    if not isinstance(value, int | float):
        raise SceneConfigError(field)
    return float(value)
