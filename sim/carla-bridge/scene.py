from __future__ import annotations

import random
from dataclasses import dataclass
from math import sqrt
from typing import assert_never

import carla

from scene_config import (
    PropConfig,
    ScenarioEventConfig,
    ScenarioTimelineConfig,
    SceneConfig,
    TimedActorConfig,
    TimedActorKind,
    TransformConfig,
    WalkerConfig,
    WeatherConfig,
)


@dataclass(frozen=True, slots=True)
class WalkerPatrol:
    pedestrian: carla.Actor
    route: tuple[TransformConfig, ...]
    route_index: int
    speed: float
    role: str = "patrol"


@dataclass(frozen=True, slots=True)
class TimedActorPatrol:
    actor_id: str
    kind: TimedActorKind
    actor: carla.Actor
    route: tuple[TransformConfig, ...]
    route_index: int
    speed: float
    role: str


@dataclass(frozen=True, slots=True)
class TimedActorSpawn:
    config: TimedActorConfig
    actor: carla.Actor


@dataclass(frozen=True, slots=True)
class SceneRuntime:
    actors: tuple[carla.Actor, ...]
    walker_patrols: tuple[WalkerPatrol, ...]
    timeline: ScenarioTimelineConfig | None = None
    elapsed_seconds: float = 0.0
    pending_timed_actors: tuple[TimedActorConfig, ...] = ()
    active_timed_actors: tuple[TimedActorPatrol, ...] = ()
    emitted_event_ids: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SceneAdvance:
    runtime: SceneRuntime
    events: tuple[ScenarioEventConfig, ...]
    spawned_timed_actors: tuple[TimedActorSpawn, ...]


def spawn_scene(world: carla.World, scene: SceneConfig) -> SceneRuntime:
    apply_weather(world, scene.weather)
    walker_actors, walker_patrols = spawn_walkers(world, scene.walkers)
    actors = (
        *spawn_props(world, scene.props),
        *spawn_parked_vehicles(world, scene.parked_vehicles),
        *walker_actors,
    )
    return SceneRuntime(
        actors=actors,
        walker_patrols=walker_patrols,
        timeline=scene.timeline,
        pending_timed_actors=() if scene.timeline is None else scene.timeline.actors,
    )


def apply_weather(world: carla.World, weather: WeatherConfig | None) -> None:
    if weather is None:
        return
    world.set_weather(
        carla.WeatherParameters(
            cloudiness=weather.cloudiness,
            precipitation=weather.precipitation,
            sun_altitude_angle=weather.sun_altitude_angle,
            fog_density=weather.fog_density,
            wetness=weather.wetness,
        ),
    )


def spawn_props(world: carla.World, props: tuple[PropConfig, ...]) -> list[carla.Actor]:
    actors: list[carla.Actor] = []
    for prop in props:
        actor = world.try_spawn_actor(
            world.get_blueprint_library().find(prop.blueprint),
            to_carla_transform(prop.transform),
        )
        if actor is not None:
            actors.append(actor)
    print(f"CARLA checkpoint props online: {len(actors)}")
    return actors


def spawn_parked_vehicles(world: carla.World, vehicles: tuple[PropConfig, ...]) -> list[carla.Actor]:
    actors: list[carla.Actor] = []
    for vehicle in vehicles:
        actor = world.try_spawn_actor(
            world.get_blueprint_library().find(vehicle.blueprint),
            to_carla_transform(vehicle.transform),
        )
        if actor is not None:
            actor.apply_control(carla.VehicleControl(hand_brake=True))
            actors.append(actor)
    print(f"CARLA parked security vehicles online: spawned={len(actors)} configured={len(vehicles)}")
    return actors


def spawn_vehicles(world: carla.World, count: int) -> list[carla.Actor]:
    blueprints = list(world.get_blueprint_library().filter("vehicle.*"))
    spawn_points = list(world.get_map().get_spawn_points())
    rng = random.Random(7)
    rng.shuffle(spawn_points)
    vehicles: list[carla.Actor] = []
    for spawn_point in spawn_points[:count]:
        blueprint = rng.choice(blueprints)
        vehicle = world.try_spawn_actor(blueprint, spawn_point)
        if vehicle is not None:
            vehicle.apply_control(carla.VehicleControl(throttle=0.36, steer=0.0))
            vehicles.append(vehicle)
    print(f"CARLA vehicles online: {len(vehicles)}")
    return vehicles


def spawn_walkers(world: carla.World, walkers: tuple[WalkerConfig, ...]) -> tuple[list[carla.Actor], tuple[WalkerPatrol, ...]]:
    actors: list[carla.Actor] = []
    patrols: list[WalkerPatrol] = []
    for walker in walkers:
        pedestrian = spawn_walker(world, walker)
        if pedestrian is None:
            continue
        pedestrian.set_simulate_physics(False)
        actors.append(pedestrian)
        patrols.append(
            WalkerPatrol(
                pedestrian=pedestrian,
                route=walker.route,
                route_index=0,
                speed=walker.speed,
                role=walker.role,
            ),
        )
    print(
        "CARLA checkpoint walkers online: "
        f"spawned={len(actors)} configured={len(walkers)} {format_role_counts(patrols)}"
    )
    return actors, tuple(patrols)


def spawn_walker(world: carla.World, walker: WalkerConfig) -> carla.Actor | None:
    blueprint = world.get_blueprint_library().find(walker.blueprint)
    for transform in (walker.transform, *walker.route):
        pedestrian = world.try_spawn_actor(blueprint, to_carla_transform(transform))
        if pedestrian is not None:
            return pedestrian
    return None


def advance_walker_patrols(
    patrols: tuple[WalkerPatrol, ...],
    step_seconds: float,
) -> tuple[WalkerPatrol, ...]:
    return tuple(advance_walker_patrol(patrol, step_seconds) for patrol in patrols)


def advance_scene_runtime(
    world: carla.World,
    runtime: SceneRuntime,
    step_seconds: float,
) -> SceneAdvance:
    elapsed_seconds = round(runtime.elapsed_seconds + step_seconds, 3)
    walker_patrols = advance_walker_patrols(runtime.walker_patrols, step_seconds)
    active_timed_actors = advance_timed_actor_patrols(runtime.active_timed_actors, step_seconds)
    spawned, pending_timed_actors = spawn_due_timed_actors(
        world,
        runtime.pending_timed_actors,
        elapsed_seconds,
    )
    events = due_timeline_events(runtime.timeline, runtime.emitted_event_ids, elapsed_seconds)
    next_runtime = SceneRuntime(
        actors=(*runtime.actors, *(spawn.actor for spawn in spawned)),
        walker_patrols=walker_patrols,
        timeline=runtime.timeline,
        elapsed_seconds=elapsed_seconds,
        pending_timed_actors=pending_timed_actors,
        active_timed_actors=(
            *active_timed_actors,
            *(spawned_timed_actor_patrol(spawn) for spawn in spawned),
        ),
        emitted_event_ids=(*runtime.emitted_event_ids, *(event.id for event in events)),
    )
    return SceneAdvance(runtime=next_runtime, events=events, spawned_timed_actors=spawned)


def spawn_due_timed_actors(
    world: carla.World,
    pending_actors: tuple[TimedActorConfig, ...],
    elapsed_seconds: float,
) -> tuple[tuple[TimedActorSpawn, ...], tuple[TimedActorConfig, ...]]:
    spawned: list[TimedActorSpawn] = []
    still_pending: list[TimedActorConfig] = []
    for actor_config in pending_actors:
        if actor_config.spawn_at_seconds > elapsed_seconds:
            still_pending.append(actor_config)
            continue
        actor = spawn_timed_actor(world, actor_config)
        if actor is not None:
            spawned.append(TimedActorSpawn(config=actor_config, actor=actor))
    return tuple(spawned), tuple(still_pending)


def spawn_timed_actor(world: carla.World, actor_config: TimedActorConfig) -> carla.Actor | None:
    blueprint = world.get_blueprint_library().find(actor_config.blueprint)
    configure_drone_blueprint(blueprint, actor_config)
    actor = world.try_spawn_actor(blueprint, to_carla_transform(actor_config.transform))
    if actor is None:
        return None
    configure_timed_actor(actor, actor_config)
    return actor


def configure_drone_blueprint(blueprint: carla.ActorBlueprint, actor_config: TimedActorConfig) -> None:
    if actor_config.kind != "drone" or not hasattr(blueprint, "set_attribute"):
        return
    blueprint.set_attribute("image_size_x", "640")
    blueprint.set_attribute("image_size_y", "360")
    blueprint.set_attribute("fov", "82")
    blueprint.set_attribute("sensor_tick", "0.1")


def configure_timed_actor(actor: carla.Actor, actor_config: TimedActorConfig) -> None:
    match actor_config.kind:
        case "walker":
            actor.set_simulate_physics(False)
        case "vehicle":
            actor.apply_control(carla.VehicleControl(throttle=0.28, steer=0.0))
        case "drone":
            return
        case unreachable:
            assert_never(unreachable)


def spawned_timed_actor_patrol(spawn: TimedActorSpawn) -> TimedActorPatrol:
    return TimedActorPatrol(
        actor_id=spawn.config.id,
        kind=spawn.config.kind,
        actor=spawn.actor,
        route=spawn.config.route,
        route_index=0,
        speed=spawn.config.speed,
        role=spawn.config.role,
    )


def advance_timed_actor_patrols(
    patrols: tuple[TimedActorPatrol, ...],
    step_seconds: float,
) -> tuple[TimedActorPatrol, ...]:
    return tuple(advance_timed_actor_patrol(patrol, step_seconds) for patrol in patrols)


def advance_timed_actor_patrol(patrol: TimedActorPatrol, step_seconds: float) -> TimedActorPatrol:
    current_target = patrol.route[patrol.route_index]
    location = patrol.actor.get_location()
    distance = distance_meters(location, current_target)
    max_step = patrol.speed * step_seconds
    if distance > max_step:
        patrol.actor.set_transform(to_carla_transform(interpolate_transform(location, current_target, max_step)))
        return patrol
    patrol.actor.set_transform(to_carla_transform(current_target))
    return TimedActorPatrol(
        actor_id=patrol.actor_id,
        kind=patrol.kind,
        actor=patrol.actor,
        route=patrol.route,
        route_index=next_route_index(patrol.route, patrol.route_index),
        speed=patrol.speed,
        role=patrol.role,
    )


def due_timeline_events(
    timeline: ScenarioTimelineConfig | None,
    emitted_event_ids: tuple[str, ...],
    elapsed_seconds: float,
) -> tuple[ScenarioEventConfig, ...]:
    if timeline is None:
        return ()
    emitted = set(emitted_event_ids)
    return tuple(
        event for event in timeline.events if event.at_seconds <= elapsed_seconds and event.id not in emitted
    )


def advance_walker_patrol(patrol: WalkerPatrol, step_seconds: float) -> WalkerPatrol:
    current_target = patrol.route[patrol.route_index]
    location = patrol.pedestrian.get_location()
    distance = distance_meters(location, current_target)
    max_step = patrol.speed * step_seconds
    if distance > max_step:
        patrol.pedestrian.set_transform(to_carla_transform(interpolate_transform(location, current_target, max_step)))
        return patrol
    patrol.pedestrian.set_transform(to_carla_transform(current_target))
    next_index = next_route_index(patrol.route, patrol.route_index)
    return WalkerPatrol(
        pedestrian=patrol.pedestrian,
        route=patrol.route,
        route_index=next_index,
        speed=patrol.speed,
        role=patrol.role,
    )


def format_role_counts(patrols: list[WalkerPatrol]) -> str:
    counts: dict[str, int] = {}
    for patrol in patrols:
        counts[patrol.role] = counts.get(patrol.role, 0) + 1
    return " ".join(f"{role}={count}" for role, count in sorted(counts.items()))


def next_route_index(route: tuple[TransformConfig, ...], route_index: int) -> int:
    return (route_index + 1) % len(route)


def interpolate_transform(location: carla.Location, target: TransformConfig, max_step: float) -> TransformConfig:
    distance = distance_meters(location, target)
    ratio = max_step / distance
    return TransformConfig(
        x=location.x + (target.x - location.x) * ratio,
        y=location.y + (target.y - location.y) * ratio,
        z=target.z,
        pitch=target.pitch,
        yaw=target.yaw,
        roll=target.roll,
    )


def distance_meters(location: carla.Location, target: TransformConfig) -> float:
    return sqrt((location.x - target.x) ** 2 + (location.y - target.y) ** 2 + (location.z - target.z) ** 2)


def to_carla_transform(transform: TransformConfig) -> carla.Transform:
    return carla.Transform(to_carla_location(transform), to_carla_rotation(transform))


def to_carla_location(transform: TransformConfig) -> carla.Location:
    return carla.Location(x=transform.x, y=transform.y, z=transform.z)


def to_carla_rotation(transform: TransformConfig) -> carla.Rotation:
    return carla.Rotation(pitch=transform.pitch, yaw=transform.yaw, roll=transform.roll)
