from __future__ import annotations

import sys
import types
import unittest

from scene_config import TransformConfig, WalkerConfig


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
        self.ActorBlueprint = object
        self.Client = object
        self.Location = FakeLocation
        self.Rotation = FakeRotation
        self.Transform = FakeTransform
        self.VehicleControl = FakeVehicleControl
        self.WeatherParameters = object
        self.World = object


sys.modules.setdefault("carla", FakeCarla())

from scene import advance_walker_patrols, spawn_vehicles, spawn_walkers  # noqa: E402


class FakeBlueprintLibrary:
    def find(self, blueprint: str) -> str:
        return blueprint

    def filter(self, pattern: str) -> list[str]:
        return [pattern]


class FakeRoamingPedestrian:
    def __init__(self) -> None:
        self.location = FakeLocation(x=0.0, y=0.0, z=0.2)
        self.physics_enabled = True
        self.goals: list[FakeLocation] = []

    def get_location(self) -> FakeLocation:
        return self.location

    def go_to_location(self, location: FakeLocation) -> None:
        self.goals.append(location)

    def set_simulate_physics(self, enabled: bool) -> None:
        self.physics_enabled = enabled


class FakeWalkerWorld:
    def __init__(self) -> None:
        self.pedestrian = FakeRoamingPedestrian()

    def get_blueprint_library(self) -> FakeBlueprintLibrary:
        return FakeBlueprintLibrary()

    def try_spawn_actor(self, blueprint: str, transform: FakeTransform) -> FakeRoamingPedestrian:
        return self.pedestrian


class FakeSpawnPointMap:
    def get_spawn_points(self) -> list[FakeTransform]:
        return [
            FakeTransform(FakeLocation(x=1.0, y=1.0, z=0.3), FakeRotation(pitch=0.0, yaw=0.0, roll=0.0))
        ]


class FakeTrafficVehicle:
    def __init__(self) -> None:
        self.autopilot_calls: list[tuple[bool, int]] = []
        self.throttle = 0.0

    def set_autopilot(self, enabled: bool, port: int) -> None:
        self.autopilot_calls.append((enabled, port))

    def apply_control(self, control: FakeVehicleControl) -> None:
        self.throttle = control.throttle


class FakeVehicleWorld:
    def __init__(self) -> None:
        self.vehicle = FakeTrafficVehicle()

    def get_blueprint_library(self) -> FakeBlueprintLibrary:
        return FakeBlueprintLibrary()

    def get_map(self) -> FakeSpawnPointMap:
        return FakeSpawnPointMap()

    def try_spawn_actor(self, blueprint: str, transform: FakeTransform) -> FakeTrafficVehicle:
        return self.vehicle


class FakeTrafficManager:
    def __init__(self, port: int) -> None:
        self._port = port

    def get_port(self) -> int:
        return self._port


class FakeClient:
    def __init__(self) -> None:
        self.requested_ports: list[int] = []

    def get_trafficmanager(self, port: int) -> FakeTrafficManager:
        self.requested_ports.append(port)
        return FakeTrafficManager(port)


class RoamingWalkerRuntimeTests(unittest.TestCase):
    def test_assigns_seeded_roaming_destination_to_actor_when_no_target_exists(self) -> None:
        # Given: a spawned walker configured for CARLA roaming AI.
        route = (
            TransformConfig(x=10.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
            TransformConfig(x=20.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
            TransformConfig(x=30.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
        )
        walker = WalkerConfig(
            blueprint="walker.pedestrian.0010",
            transform=TransformConfig(x=0.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
            route=route,
            speed=1.0,
            movement="roam",
            roaming_seed=1,
            arrival_tolerance=0.5,
        )
        world = FakeWalkerWorld()
        actors, patrols = spawn_walkers(world, (walker,))

        # When: runtime advances the walker state for the first time.
        updated = advance_walker_patrols(patrols, step_seconds=1.0)

        # Then: the pure roaming target is reflected on the CARLA-facing actor.
        self.assertEqual(actors, [world.pedestrian])
        self.assertEqual(len(updated), 1)
        self.assertEqual(len(world.pedestrian.goals), 1)
        self.assertEqual(world.pedestrian.goals[0].x, route[0].x)


class SpawnVehiclesTrafficManagerTests(unittest.TestCase):
    def test_enables_autopilot_with_client_traffic_manager_port_when_client_is_passed(self) -> None:
        # Given: bridge runtime has a CARLA client available.
        world = FakeVehicleWorld()
        client = FakeClient()

        # When: background vehicles are spawned with a Traffic Manager port.
        actors = spawn_vehicles(world, count=1, client=client, tm_port=8100)

        # Then: each spawned vehicle is handed to CARLA Traffic Manager.
        self.assertEqual(actors, [world.vehicle])
        self.assertEqual(client.requested_ports, [8100])
        self.assertEqual(world.vehicle.autopilot_calls, [(True, 8100)])
        self.assertEqual(world.vehicle.throttle, 0.0)


if __name__ == "__main__":
    unittest.main()
