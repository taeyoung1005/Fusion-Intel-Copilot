from __future__ import annotations

import random
from dataclasses import dataclass
from math import sqrt

from scene_config import TransformConfig


@dataclass(frozen=True, slots=True)
class PatrolMotion:
    route: tuple[TransformConfig, ...]
    route_index: int
    speed: float


@dataclass(frozen=True, slots=True)
class PatrolAdvance:
    transform: TransformConfig
    motion: PatrolMotion


@dataclass(frozen=True, slots=True)
class RoamingState:
    target_index: int | None
    visit_count: int


@dataclass(frozen=True, slots=True)
class RoamingMotion:
    route: tuple[TransformConfig, ...]
    state: RoamingState
    seed: int
    arrival_tolerance: float


@dataclass(frozen=True, slots=True)
class RoamingAdvance:
    motion: RoamingMotion
    target: TransformConfig | None
    target_changed: bool


def advance_patrol_motion(
    location: TransformConfig,
    motion: PatrolMotion,
    step_seconds: float,
) -> PatrolAdvance:
    target = motion.route[motion.route_index]
    distance = distance_between(location, target)
    max_step = motion.speed * step_seconds
    if distance <= max_step:
        return PatrolAdvance(
            transform=target,
            motion=PatrolMotion(
                route=motion.route,
                route_index=next_route_index(motion.route, motion.route_index),
                speed=motion.speed,
            ),
        )
    return PatrolAdvance(
        transform=interpolate_transform(location, target, max_step),
        motion=motion,
    )


def advance_roaming_motion(
    location: TransformConfig,
    motion: RoamingMotion,
) -> RoamingAdvance:
    match motion.state.target_index:
        case None:
            return retarget_roaming_motion(motion, previous_index=None)
        case target_index:
            target = motion.route[target_index]
            if distance_between(location, target) > motion.arrival_tolerance:
                return RoamingAdvance(motion=motion, target=None, target_changed=False)
            return retarget_roaming_motion(motion, previous_index=target_index)


def retarget_roaming_motion(
    motion: RoamingMotion,
    previous_index: int | None,
) -> RoamingAdvance:
    target_index = select_roaming_target_index(
        route_size=len(motion.route),
        seed=motion.seed,
        visit_count=motion.state.visit_count,
        previous_index=previous_index,
    )
    next_motion = RoamingMotion(
        route=motion.route,
        state=RoamingState(target_index=target_index, visit_count=motion.state.visit_count + 1),
        seed=motion.seed,
        arrival_tolerance=motion.arrival_tolerance,
    )
    return RoamingAdvance(
        motion=next_motion,
        target=motion.route[target_index],
        target_changed=True,
    )


def select_roaming_target_index(
    route_size: int,
    seed: int,
    visit_count: int,
    previous_index: int | None,
) -> int:
    rng = random.Random(seed + visit_count)
    if previous_index is None or route_size == 1:
        return rng.randrange(route_size)
    candidates = tuple(index for index in range(route_size) if index != previous_index)
    return candidates[rng.randrange(len(candidates))]


def next_route_index(route: tuple[TransformConfig, ...], route_index: int) -> int:
    return (route_index + 1) % len(route)


def interpolate_transform(
    location: TransformConfig,
    target: TransformConfig,
    max_step: float,
) -> TransformConfig:
    distance = distance_between(location, target)
    ratio = max_step / distance
    return TransformConfig(
        x=location.x + (target.x - location.x) * ratio,
        y=location.y + (target.y - location.y) * ratio,
        z=target.z,
        pitch=target.pitch,
        yaw=target.yaw,
        roll=target.roll,
    )


def distance_between(location: TransformConfig, target: TransformConfig) -> float:
    return sqrt((location.x - target.x) ** 2 + (location.y - target.y) ** 2 + (location.z - target.z) ** 2)
