from __future__ import annotations

from math import sqrt

import carla

from scene_config import TransformConfig


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
