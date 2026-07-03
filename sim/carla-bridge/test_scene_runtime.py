from __future__ import annotations

import sys
import types
import unittest

from scene_config import PropConfig, TransformConfig, WalkerConfig


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

from scene import WalkerPatrol, advance_walker_patrols, spawn_parked_vehicles, spawn_vehicles, spawn_walkers  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
