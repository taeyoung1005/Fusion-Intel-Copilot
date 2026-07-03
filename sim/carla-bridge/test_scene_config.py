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


if __name__ == "__main__":
    unittest.main()
