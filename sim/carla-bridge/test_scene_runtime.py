from __future__ import annotations

import sys
import types
import unittest

from scene_config import PropConfig, SceneConfig, TransformConfig, WalkerConfig


class FakeVehicleControl:
    def __init__(self, hand_brake: bool = False, throttle: float = 0.0, steer: float = 0.0) -> None:
        self.hand_brake = hand_brake
        self.throttle = throttle
        self.steer = steer


class FakeLocation:
    def __init__(self, x: float, y: float, z: float) -> None:
        self.x = x
        self.y = y
        self.z = z


class FakeRotation:
    def __init__(self, pitch: float, yaw: float, roll: float) -> None:
        self.pitch = pitch
        self.yaw = yaw
        self.roll = roll


class FakeTransform:
    def __init__(self, location: FakeLocation, rotation: FakeRotation) -> None:
        self.location = location
        self.rotation = rotation


class FakeCarla(types.ModuleType):
    def __init__(self) -> None:
        super().__init__("carla")
        self.Actor = object
        self.Location = FakeLocation
        self.Rotation = FakeRotation
        self.Transform = FakeTransform
        self.VehicleControl = FakeVehicleControl
        self.WeatherParameters = object
        self.World = object


sys.modules.setdefault("carla", FakeCarla())

from scene_config import ScenarioEventConfig, ScenarioTimelineConfig, TimedActorConfig  # noqa: E402
from scene import (  # noqa: E402
    WalkerPatrol,
    advance_scene_runtime,
    advance_walker_patrols,
    spawn_parked_vehicles,
    spawn_scene,
    spawn_vehicles,
    spawn_walkers,
)


class FakeBlueprintLibrary:
    def find(self, blueprint: str) -> str:
        return blueprint

    def filter(self, pattern: str) -> list[str]:
        return [pattern]


class FakeVehicle:
    def __init__(self) -> None:
        self.hand_brake = False
        self.autopilot_enabled = False
        self.throttle = 0.0
        self.steer = 0.0

    def set_autopilot(self, enabled: bool) -> None:
        self.autopilot_enabled = enabled

    def apply_control(self, control: FakeVehicleControl) -> None:
        self.hand_brake = control.hand_brake
        self.throttle = control.throttle
        self.steer = control.steer


class FakePedestrian:
    def __init__(self, location: FakeLocation) -> None:
        self.location = location
        self.physics_enabled = True
        self.transforms: list[FakeTransform] = []

    def get_location(self) -> FakeLocation:
        return self.location

    def set_transform(self, transform: FakeTransform) -> None:
        self.transforms.append(transform)
        self.location = transform.location

    def set_simulate_physics(self, enabled: bool) -> None:
        self.physics_enabled = enabled


class FakeWorld:
    def __init__(self) -> None:
        self.vehicle = FakeVehicle()

    def get_blueprint_library(self) -> FakeBlueprintLibrary:
        return FakeBlueprintLibrary()

    def try_spawn_actor(self, blueprint: str, transform: object) -> FakeVehicle:
        return self.vehicle


class FakeSpawnPointMap:
    def get_spawn_points(self) -> list[FakeTransform]:
        return [
            FakeTransform(FakeLocation(x=1.0, y=1.0, z=0.3), FakeRotation(pitch=0.0, yaw=0.0, roll=0.0))
        ]


class FakeWalkerWorld:
    def __init__(self) -> None:
        self.calls = 0
        self.pedestrian = FakePedestrian(FakeLocation(x=0.0, y=0.0, z=0.0))

    def get_blueprint_library(self) -> FakeBlueprintLibrary:
        return FakeBlueprintLibrary()

    def try_spawn_actor(self, blueprint: str, transform: object) -> FakePedestrian | None:
        self.calls += 1
        if self.calls == 1:
            return None
        return self.pedestrian


class FakeMovingVehicleWorld:
    def __init__(self) -> None:
        self.vehicle = FakeVehicle()

    def get_blueprint_library(self) -> FakeBlueprintLibrary:
        return FakeBlueprintLibrary()

    def get_map(self) -> FakeSpawnPointMap:
        return FakeSpawnPointMap()

    def try_spawn_actor(self, blueprint: str, transform: object) -> FakeVehicle:
        return self.vehicle


class FakeTimelineActor:
    def __init__(self, actor_id: str, location: FakeLocation) -> None:
        self.actor_id = actor_id
        self.location = location
        self.hand_brake = False
        self.physics_enabled = True
        self.transforms: list[FakeTransform] = []

    def get_location(self) -> FakeLocation:
        return self.location

    def set_transform(self, transform: FakeTransform) -> None:
        self.transforms.append(transform)
        self.location = transform.location

    def set_simulate_physics(self, enabled: bool) -> None:
        self.physics_enabled = enabled

    def apply_control(self, control: FakeVehicleControl) -> None:
        self.hand_brake = control.hand_brake


class FakeTimelineWorld:
    def __init__(self) -> None:
        self.spawned_blueprints: list[str] = []
        self.spawned_locations: list[tuple[float, float, float]] = []

    def get_blueprint_library(self) -> FakeBlueprintLibrary:
        return FakeBlueprintLibrary()

    def try_spawn_actor(self, blueprint: str, transform: FakeTransform) -> FakeTimelineActor:
        self.spawned_blueprints.append(blueprint)
        self.spawned_locations.append((transform.location.x, transform.location.y, transform.location.z))
        return FakeTimelineActor(blueprint, transform.location)


class SpawnParkedVehiclesTests(unittest.TestCase):
    def test_leaves_traffic_manager_unopened_when_spawning_parked_security_vehicle(self) -> None:
        # Given: a parked security vehicle in the checkpoint scene.
        vehicle = PropConfig(
            blueprint="vehicle.dodge.charger_police_2020",
            transform=TransformConfig(x=-99.0, y=17.0, z=0.25, pitch=0.0, yaw=12.0, roll=0.0),
        )
        world = FakeWorld()

        # When: the scene spawns the parked vehicle.
        actors = spawn_parked_vehicles(world, (vehicle,))

        # Then: the car is held in place without opening CARLA Traffic Manager.
        self.assertEqual(actors, [world.vehicle])
        self.assertTrue(world.vehicle.hand_brake)
        self.assertFalse(world.vehicle.autopilot_enabled)


class SpawnMovingVehiclesTests(unittest.TestCase):
    def test_applies_direct_throttle_for_background_patrol_vehicle_motion(self) -> None:
        # Given: a CARLA road spawn point for background security traffic.
        world = FakeMovingVehicleWorld()

        # When: the bridge spawns moving vehicles.
        actors = spawn_vehicles(world, count=1)

        # Then: the vehicle moves without opening CARLA Traffic Manager.
        self.assertEqual(actors, [world.vehicle])
        self.assertFalse(world.vehicle.autopilot_enabled)
        self.assertGreater(world.vehicle.throttle, 0.0)


class SpawnWalkersTests(unittest.TestCase):
    def test_retries_route_points_when_initial_walker_spawn_collides(self) -> None:
        # Given: the configured start point collides with roadside geometry.
        walker = WalkerConfig(
            blueprint="walker.pedestrian.0010",
            transform=TransformConfig(x=1.0, y=1.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
            route=(
                TransformConfig(x=2.0, y=2.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
                TransformConfig(x=3.0, y=3.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
            ),
            speed=0.8,
        )
        world = FakeWalkerWorld()

        # When: the bridge spawns checkpoint walkers.
        actors, patrols = spawn_walkers(world, (walker,))

        # Then: it uses a route point fallback instead of dropping the patrol.
        self.assertEqual(actors, [world.pedestrian])
        self.assertEqual(len(patrols), 1)
        self.assertEqual(world.calls, 2)
        self.assertFalse(world.pedestrian.physics_enabled)


class WalkerPatrolTests(unittest.TestCase):
    def test_moves_walker_toward_current_route_point(self) -> None:
        # Given: a walker standing on a checkpoint patrol route.
        first = TransformConfig(x=-95.0, y=27.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0)
        second = TransformConfig(x=-78.0, y=27.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0)
        pedestrian = FakePedestrian(FakeLocation(x=-97.0, y=27.0, z=0.2))
        patrol = WalkerPatrol(
            pedestrian=pedestrian,
            route=(first, second),
            route_index=0,
            speed=1.0,
        )

        # When: the bridge updates patrol state.
        updated = advance_walker_patrols((patrol,), step_seconds=1.0)

        # Then: the person moves closer without waiting on CARLA's AI controller.
        self.assertEqual(updated[0].route_index, 0)
        self.assertEqual(round(pedestrian.location.x, 2), -96.0)

    def test_advances_to_next_route_point_after_walker_reaches_current_target(self) -> None:
        # Given: a walker standing at the current checkpoint patrol waypoint.
        first = TransformConfig(x=-95.0, y=27.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0)
        second = TransformConfig(x=-78.0, y=27.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0)
        pedestrian = FakePedestrian(FakeLocation(x=-95.1, y=27.0, z=0.2))
        patrol = WalkerPatrol(
            pedestrian=pedestrian,
            route=(first, second),
            route_index=0,
            speed=1.0,
        )

        # When: the bridge updates patrol state.
        updated = advance_walker_patrols((patrol,), step_seconds=1.0)

        # Then: the next update will continue toward the following waypoint.
        self.assertEqual(updated[0].route_index, 1)
        self.assertEqual(round(pedestrian.location.x, 2), -95.0)


class DeterministicTimelineRuntimeTests(unittest.TestCase):
    def test_replays_timed_assets_and_stage_events_in_the_same_order_each_run(self) -> None:
        # Given: a deterministic scenario with one intruder and one drone handoff.
        timeline = ScenarioTimelineConfig(
            name="deterministic",
            seed=44,
            duration_seconds=180.0,
            events=(
                ScenarioEventConfig(
                    id="evt-normal-surveillance",
                    at_seconds=0.0,
                    stage="normal_surveillance",
                    activity_stage="receive",
                    source="carla",
                    level="normal",
                    message="정상 감시",
                    camera_id="CARLA-N-01",
                    asset_id=None,
                    alert_tone="normal",
                    map_effect="baseline",
                ),
                ScenarioEventConfig(
                    id="evt-approach-detected",
                    at_seconds=35.0,
                    stage="perimeter_approach_detected",
                    activity_stage="detect",
                    source="vision",
                    level="warn",
                    message="외곽 접근 탐지",
                    camera_id="CARLA-N-01",
                    asset_id="intruder-01",
                    alert_tone="watch",
                    map_effect="perimeter-marker",
                ),
                ScenarioEventConfig(
                    id="evt-drone-handoff",
                    at_seconds=75.0,
                    stage="drone_handoff",
                    activity_stage="handoff",
                    source="drone-isr",
                    level="warn",
                    message="공중 자산 인계",
                    camera_id="CARLA-DRONE-ISR",
                    asset_id="drone-isr-01",
                    alert_tone="watch",
                    map_effect="handoff-route",
                ),
            ),
            actors=(
                TimedActorConfig(
                    id="intruder-01",
                    kind="walker",
                    blueprint="walker.pedestrian.0039",
                    role="intruder-crossing",
                    spawn_at_seconds=35.0,
                    transform=TransformConfig(x=260.0, y=-224.0, z=0.16, pitch=0.0, yaw=0.0, roll=0.0),
                    route=(
                        TransformConfig(x=246.0, y=-232.0, z=0.16, pitch=0.0, yaw=0.0, roll=0.0),
                    ),
                    speed=0.65,
                ),
                TimedActorConfig(
                    id="drone-isr-01",
                    kind="drone",
                    blueprint="sensor.camera.rgb",
                    role="drone-isr-asset",
                    spawn_at_seconds=75.0,
                    transform=TransformConfig(x=250.0, y=-222.0, z=32.0, pitch=-60.0, yaw=-140.0, roll=0.0),
                    route=(
                        TransformConfig(x=236.0, y=-240.0, z=32.0, pitch=-60.0, yaw=-140.0, roll=0.0),
                    ),
                    speed=8.0,
                ),
            ),
        )

        def replay_once() -> tuple[list[str], list[str], list[tuple[float, float, float]]]:
            world = FakeTimelineWorld()
            runtime = spawn_scene(
                world,
                SceneConfig(weather=None, props=(), parked_vehicles=(), walkers=(), timeline=timeline),
            )
            event_ids: list[str] = []
            for step_seconds in (0.1, 34.9, 40.0):
                advance = advance_scene_runtime(world, runtime, step_seconds)
                runtime = advance.runtime
                event_ids.extend(event.id for event in advance.events)
            return event_ids, world.spawned_blueprints, world.spawned_locations

        # When: the same scripted timeline is replayed twice.
        first_events, first_blueprints, first_locations = replay_once()
        second_events, second_blueprints, second_locations = replay_once()

        # Then: stage triggers and timed asset spawns are byte-for-byte repeatable.
        self.assertEqual(
            first_events,
            ["evt-normal-surveillance", "evt-approach-detected", "evt-drone-handoff"],
        )
        self.assertEqual(second_events, first_events)
        self.assertEqual(first_blueprints, ["walker.pedestrian.0039", "sensor.camera.rgb"])
        self.assertEqual(second_blueprints, first_blueprints)
        self.assertEqual(second_locations, first_locations)


if __name__ == "__main__":
    unittest.main()
