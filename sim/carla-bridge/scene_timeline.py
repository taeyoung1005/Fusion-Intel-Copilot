from __future__ import annotations

from dataclasses import dataclass
from typing import assert_never

import carla

from scene_config import (
    ScenarioEventConfig,
    ScenarioTimelineConfig,
    TimedActorConfig,
    TimedActorKind,
    TransformConfig,
)
from scene_geometry import (
    distance_meters,
    interpolate_transform,
    next_route_index,
    to_carla_transform,
)
from scene_walkers import WalkerPatrol, advance_walker_patrols


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
