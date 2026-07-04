from __future__ import annotations

from dataclasses import dataclass

import carla

from scene_config import TransformConfig, WalkerConfig
from scene_geometry import (
    distance_meters,
    interpolate_transform,
    next_route_index,
    to_carla_transform,
)


@dataclass(frozen=True, slots=True)
class WalkerPatrol:
    pedestrian: carla.Actor
    route: tuple[TransformConfig, ...]
    route_index: int
    speed: float
    role: str = "patrol"


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
