import unittest

from scene_config import TransformConfig
from scene_movement import (
    PatrolMotion,
    RoamingMotion,
    RoamingState,
    advance_patrol_motion,
    advance_roaming_motion,
)


class PatrolMotionTests(unittest.TestCase):
    def test_interpolates_toward_current_waypoint_when_step_is_short(self) -> None:
        # Given: an actor is two meters away from the active patrol waypoint.
        route = (
            TransformConfig(x=2.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
            TransformConfig(x=4.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
        )
        motion = PatrolMotion(route=route, route_index=0, speed=1.0)
        location = TransformConfig(x=0.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0)

        # When: the pure motion step advances one simulated second.
        advance = advance_patrol_motion(location, motion, step_seconds=1.0)

        # Then: only the movement contract changes, with no CARLA actor involved.
        self.assertEqual(advance.motion.route_index, 0)
        self.assertEqual(advance.transform.x, 1.0)


class RoamingMotionTests(unittest.TestCase):
    def test_selects_seeded_waypoint_and_waits_until_arrival_before_retargeting(self) -> None:
        # Given: a roaming pedestrian with a deterministic random waypoint pool.
        route = (
            TransformConfig(x=10.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
            TransformConfig(x=20.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
            TransformConfig(x=30.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0),
        )
        location = TransformConfig(x=0.0, y=0.0, z=0.2, pitch=0.0, yaw=0.0, roll=0.0)
        motion = RoamingMotion(
            route=route,
            state=RoamingState(target_index=None, visit_count=0),
            seed=1,
            arrival_tolerance=0.5,
        )

        # When: no target exists yet.
        first = advance_roaming_motion(location, motion)

        # Then: the first seeded random target is selected.
        self.assertTrue(first.target_changed)
        self.assertEqual(first.target, route[0])
        self.assertEqual(first.motion.state, RoamingState(target_index=0, visit_count=1))

        # When: the actor has not arrived at that target.
        second = advance_roaming_motion(location, first.motion)

        # Then: no new target is emitted.
        self.assertFalse(second.target_changed)
        self.assertIsNone(second.target)
        self.assertEqual(second.motion.state, first.motion.state)

        # When: the actor reaches the selected target.
        third = advance_roaming_motion(route[0], second.motion)

        # Then: the next target changes and does not immediately repeat.
        self.assertTrue(third.target_changed)
        self.assertEqual(third.target, route[1])
        self.assertEqual(third.motion.state, RoamingState(target_index=1, visit_count=2))


if __name__ == "__main__":
    unittest.main()
