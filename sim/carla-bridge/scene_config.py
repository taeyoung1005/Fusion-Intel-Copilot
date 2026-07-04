from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias

JsonValue: TypeAlias = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
JsonMap: TypeAlias = dict[str, JsonValue]
TimedActorKind: TypeAlias = Literal["walker", "vehicle", "drone", "animal"]


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
    blueprints: tuple[str, ...] = ()
    role: str = "patrol"
    movement: str = "patrol"
    roaming_seed: int | None = None
    arrival_tolerance: float | None = None

    def __post_init__(self) -> None:
        if len(self.blueprints) == 0:
            object.__setattr__(self, "blueprints", (self.blueprint,))


@dataclass(frozen=True, slots=True)
class WeatherConfig:
    cloudiness: float
    precipitation: float
    sun_altitude_angle: float
    fog_density: float
    wetness: float


@dataclass(frozen=True, slots=True)
class ScenarioEventConfig:
    id: str
    at_seconds: float
    stage: str
    activity_stage: str
    source: str
    level: str
    message: str
    camera_id: str | None
    asset_id: str | None
    alert_tone: str
    map_effect: str


@dataclass(frozen=True, slots=True)
class TimedActorConfig:
    id: str
    kind: TimedActorKind
    blueprint: str
    role: str
    spawn_at_seconds: float
    transform: TransformConfig
    route: tuple[TransformConfig, ...]
    speed: float
    blueprints: tuple[str, ...] = ()
    despawn_at_seconds: float | None = None
    movement: str = "patrol"
    camera_id: str | None = None

    def __post_init__(self) -> None:
        if len(self.blueprints) == 0:
            object.__setattr__(self, "blueprints", (self.blueprint,))


@dataclass(frozen=True, slots=True)
class ScenarioTimelineConfig:
    name: str
    seed: int
    duration_seconds: float
    events: tuple[ScenarioEventConfig, ...]
    actors: tuple[TimedActorConfig, ...]


@dataclass(frozen=True, slots=True)
class SceneConfig:
    weather: WeatherConfig | None
    props: tuple[PropConfig, ...]
    parked_vehicles: tuple[PropConfig, ...]
    walkers: tuple[WalkerConfig, ...]
    timeline: ScenarioTimelineConfig | None = None


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
        timeline=parse_timeline(scene_raw.get("timeline")),
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
    blueprints = read_blueprints(data)
    return WalkerConfig(
        blueprint=blueprints[0],
        blueprints=blueprints,
        transform=parse_transform(data),
        route=parse_walker_route(data),
        speed=read_float(data, "speed", 1.2),
        role=read_optional_string(data, "role", "patrol"),
        movement=read_optional_string(data, "movement", "patrol"),
        roaming_seed=read_nullable_int(data, "roaming_seed"),
        arrival_tolerance=read_nullable_float(data, "arrival_tolerance"),
    )


def parse_walker_route(raw: JsonMap) -> tuple[TransformConfig, ...]:
    route = raw.get("route")
    if route is not None:
        return tuple(parse_waypoint(item) for item in read_route(route))
    return (parse_transform({"location": require_map(raw.get("destination"), "destination")}),)


def parse_timeline(raw: JsonValue) -> ScenarioTimelineConfig | None:
    if raw is None:
        return None
    data = require_map(raw, "timeline")
    return ScenarioTimelineConfig(
        name=read_string(data, "name"),
        seed=read_int(data, "seed", 0),
        duration_seconds=read_float(data, "duration_seconds", 180.0),
        events=tuple(parse_scenario_event(item) for item in read_list(data, "events")),
        actors=tuple(parse_timed_actor(item) for item in read_list(data, "actors")),
    )


def parse_scenario_event(raw: JsonValue) -> ScenarioEventConfig:
    data = require_map(raw, "events")
    return ScenarioEventConfig(
        id=read_string(data, "id"),
        at_seconds=read_float(data, "at_seconds", 0.0),
        stage=read_string(data, "stage"),
        activity_stage=read_string(data, "activity_stage"),
        source=read_string(data, "source"),
        level=read_string(data, "level"),
        message=read_string(data, "message"),
        camera_id=read_nullable_string(data, "camera_id"),
        asset_id=read_nullable_string(data, "asset_id"),
        alert_tone=read_string(data, "alert_tone"),
        map_effect=read_string(data, "map_effect"),
    )


def parse_timed_actor(raw: JsonValue) -> TimedActorConfig:
    data = require_map(raw, "actors")
    blueprints = read_blueprints(data)
    return TimedActorConfig(
        id=read_string(data, "id"),
        kind=parse_timed_actor_kind(data),
        blueprint=blueprints[0],
        blueprints=blueprints,
        role=read_optional_string(data, "role", "scenario-actor"),
        spawn_at_seconds=read_float(data, "spawn_at_seconds", 0.0),
        despawn_at_seconds=read_nullable_float(data, "despawn_at_seconds"),
        transform=parse_transform(data),
        route=tuple(parse_waypoint(item) for item in read_route(data.get("route"))),
        speed=read_float(data, "speed", 1.0),
        movement=read_optional_string(data, "movement", "patrol"),
        camera_id=read_nullable_string(data, "camera_id"),
    )


def parse_timed_actor_kind(raw: JsonMap) -> TimedActorKind:
    value = read_string(raw, "kind")
    match value:
        case "walker" | "vehicle" | "drone" | "animal":
            return value
        case _:
            raise SceneConfigError("kind")


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


def parse_waypoint(raw: JsonValue) -> TransformConfig:
    data = require_map(raw, "route")
    location = data.get("location")
    if location is not None:
        return parse_transform(data)
    return TransformConfig(
        x=read_float(data, "x", 0.0),
        y=read_float(data, "y", 0.0),
        z=read_float(data, "z", 0.0),
        pitch=read_float(data, "pitch", 0.0),
        yaw=read_float(data, "yaw", 0.0),
        roll=read_float(data, "roll", 0.0),
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


def read_optional_string(raw: JsonMap, field: str, default: str) -> str:
    value = raw.get(field, default)
    if not isinstance(value, str):
        raise SceneConfigError(field)
    return value


def read_nullable_string(raw: JsonMap, field: str) -> str | None:
    value = raw.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise SceneConfigError(field)
    return value


def read_blueprints(raw: JsonMap) -> tuple[str, ...]:
    value = raw.get("blueprints")
    if value is None:
        return (read_string(raw, "blueprint"),)
    if not isinstance(value, list) or len(value) == 0:
        raise SceneConfigError("blueprints")
    blueprints: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise SceneConfigError("blueprints")
        blueprints.append(item)
    return tuple(blueprints)


def read_int(raw: JsonMap, field: str, default: int) -> int:
    value = raw.get(field, default)
    if not isinstance(value, int):
        raise SceneConfigError(field)
    return value


def read_nullable_int(raw: JsonMap, field: str) -> int | None:
    value = raw.get(field)
    if value is None:
        return None
    if not isinstance(value, int):
        raise SceneConfigError(field)
    return value


def read_float(raw: JsonMap, field: str, default: float) -> float:
    value = raw.get(field, default)
    if not isinstance(value, int | float):
        raise SceneConfigError(field)
    return float(value)


def read_nullable_float(raw: JsonMap, field: str) -> float | None:
    value = raw.get(field)
    if value is None:
        return None
    if not isinstance(value, int | float):
        raise SceneConfigError(field)
    return float(value)
