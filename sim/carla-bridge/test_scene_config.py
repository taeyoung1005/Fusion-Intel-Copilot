import unittest

from scene_config import load_scene_config


class LoadSceneConfigTests(unittest.TestCase):
    def test_parses_checkpoint_scene_elements_when_present(self) -> None:
        # Given: a CARLA scene configuration with checkpoint props and actors.
        raw = {
            "scene": {
                "weather": {
                    "cloudiness": 35,
                    "precipitation": 0,
                    "sun_altitude_angle": 18,
                    "fog_density": 8,
                    "wetness": 12,
                },
                "props": [
                    {
                        "blueprint": "static.prop.streetbarrier",
                        "location": {"x": -88.5, "y": 21.0, "z": 0.1},
                        "rotation": {"yaw": 90},
                    }
                ],
                "parked_vehicles": [
                    {
                        "blueprint": "vehicle.dodge.charger_police_2020",
                        "location": {"x": -90.2, "y": 17.5, "z": 0.2},
                        "rotation": {"yaw": 12},
                    }
                ],
                "walkers": [
                    {
                        "blueprint": "walker.pedestrian.0010",
                        "location": {"x": -91.0, "y": 25.0, "z": 0.2},
                        "route": [
                            {"x": -79.0, "y": 25.0, "z": 0.2},
                            {"x": -91.0, "y": 25.0, "z": 0.2},
                        ],
                        "speed": 1.1,
                    }
                ],
            }
        }

        # When: the bridge parses the scene boundary.
        scene = load_scene_config(raw)

        # Then: every visible scene layer is represented as typed config.
        self.assertEqual(scene.weather.sun_altitude_angle, 18.0)
        self.assertEqual(scene.props[0].blueprint, "static.prop.streetbarrier")
        self.assertEqual(scene.parked_vehicles[0].blueprint, "vehicle.dodge.charger_police_2020")
        self.assertEqual(scene.walkers[0].route[0].x, -79.0)
        self.assertEqual(scene.walkers[0].route[1].x, -91.0)
        self.assertEqual(scene.walkers[0].speed, 1.1)

    def test_keeps_older_single_destination_walker_config_supported(self) -> None:
        # Given: the first CARLA bridge walker format with one destination.
        raw = {
            "scene": {
                "walkers": [
                    {
                        "blueprint": "walker.pedestrian.0010",
                        "location": {"x": -91.0, "y": 25.0, "z": 0.2},
                        "destination": {"x": -79.0, "y": 25.0, "z": 0.2},
                    }
                ]
            }
        }

        # When: the bridge parses the walker.
        scene = load_scene_config(raw)

        # Then: the destination is normalized into the route model.
        self.assertEqual(scene.walkers[0].route[0].x, -79.0)
        self.assertEqual(scene.walkers[0].speed, 1.2)

    def test_defaults_to_empty_scene_when_missing(self) -> None:
        # Given: an older CARLA bridge config without scene dressing.
        raw = {}

        # When: the scene config is parsed.
        scene = load_scene_config(raw)

        # Then: the bridge remains backward compatible.
        self.assertIsNone(scene.weather)
        self.assertEqual(scene.props, ())
        self.assertEqual(scene.parked_vehicles, ())
        self.assertEqual(scene.walkers, ())
        self.assertIsNone(scene.timeline)

    def test_parses_deterministic_demo_timeline_when_present(self) -> None:
        # Given: a three-minute deterministic penetration demo timeline.
        raw = {
            "scene": {
                "timeline": {
                    "name": "deterministic",
                    "seed": 44,
                    "duration_seconds": 180,
                    "events": [
                        {
                            "id": "evt-normal-surveillance",
                            "at_seconds": 0,
                            "stage": "normal_surveillance",
                            "activity_stage": "receive",
                            "source": "carla",
                            "level": "normal",
                            "message": "정상 감시",
                            "camera_id": "CARLA-N-01",
                            "alert_tone": "normal",
                            "map_effect": "baseline",
                        },
                        {
                            "id": "evt-drone-handoff",
                            "at_seconds": 75,
                            "stage": "drone_handoff",
                            "activity_stage": "handoff",
                            "source": "drone-isr",
                            "level": "warn",
                            "message": "공중 자산 인계",
                            "camera_id": "CARLA-DRONE-ISR",
                            "asset_id": "DRONE-ISR-01",
                            "alert_tone": "watch",
                            "map_effect": "handoff-route",
                        },
                    ],
                    "actors": [
                        {
                            "id": "intruder-01",
                            "kind": "walker",
                            "blueprint": "walker.pedestrian.0039",
                            "role": "intruder-crossing",
                            "spawn_at_seconds": 35,
                            "location": {"x": 260, "y": -224, "z": 0.16},
                            "route": [
                                {"x": 246, "y": -232, "z": 0.16},
                                {"x": 236, "y": -240, "z": 0.16},
                            ],
                            "speed": 0.65,
                        },
                        {
                            "id": "drone-isr-01",
                            "kind": "drone",
                            "blueprint": "sensor.camera.rgb",
                            "role": "drone-isr-asset",
                            "spawn_at_seconds": 75,
                            "location": {"x": 250, "y": -222, "z": 32},
                            "rotation": {"pitch": -60, "yaw": -140, "roll": 0},
                            "route": [
                                {"x": 236, "y": -240, "z": 32, "pitch": -60, "yaw": -140, "roll": 0}
                            ],
                            "speed": 8.0,
                        },
                    ],
                }
            }
        }

        # When: the bridge parses the scene boundary.
        scene = load_scene_config(raw)

        # Then: the deterministic replay contract is represented as typed config.
        self.assertIsNotNone(scene.timeline)
        timeline = scene.timeline
        self.assertEqual(timeline.name, "deterministic")
        self.assertEqual(timeline.seed, 44)
        self.assertEqual(timeline.duration_seconds, 180.0)
        self.assertEqual([event.stage for event in timeline.events], ["normal_surveillance", "drone_handoff"])
        self.assertEqual(timeline.events[1].asset_id, "DRONE-ISR-01")
        self.assertEqual([actor.id for actor in timeline.actors], ["intruder-01", "drone-isr-01"])
        self.assertEqual(timeline.actors[0].kind, "walker")
        self.assertEqual(timeline.actors[1].kind, "drone")
        self.assertEqual(timeline.actors[1].transform.z, 32.0)


if __name__ == "__main__":
    unittest.main()
