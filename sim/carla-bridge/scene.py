from __future__ import annotations

import random
from dataclasses import dataclass
from math import sqrt

import carla

from scene_config import PropConfig, SceneConfig, TransformConfig, WalkerConfig, WeatherConfig


@dataclass(frozen=True, slots=True)
class WalkerPatrol:
    pedestrian: carla.Actor
    route: tuple[TransformConfig, ...]
    route_index: int
    speed: float


@dataclass(frozen=True, slots=True)
class SceneRuntime:
    actors: tuple[carla.Actor, ...]
    walker_patrols: tuple[WalkerPatrol, ...]


def spawn_scene(world: carla.World, scene: SceneConfig) -> SceneRuntime:
    apply_weather(world, scene.weather)
    walker_actors, walker_patrols = spawn_walkers(world, scene.walkers)
    actors = (
        *spawn_props(world, scene.props),
        *spawn_parked_vehicles(world, scene.parked_vehicles),
        *walker_actors,
    )
    return SceneRuntime(actors=actors, walker_patrols=walker_patrols)


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
    print(f"CARLA parked security vehicles online: {len(actors)}")
    return actors


def spawn_vehicles(world: carla.World, count: int) -> list[carla.Actor]:
    blueprints = list(world.get_blueprint_library().filter("vehicle.*"))
    spawn_points = list(world.get_map().get_spawn_points())
    random.Random(7).shuffle(spawn_points)
    vehicles: list[carla.Actor] = []
    for spawn_point in spawn_points[:count]:
        blueprint = random.choice(blueprints)
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
            ),
        )
    print(f"CARLA checkpoint walkers online: {len(actors)}")
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
    )


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
