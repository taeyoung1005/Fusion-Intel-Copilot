import json
import unittest

from bridge_core import (
    ActivityLogEvent,
    build_activity_log_line,
    build_frame_data_url,
    build_frame_payload,
    should_emit_frame,
)


class BuildFrameDataUrlTests(unittest.TestCase):
    def test_wraps_jpeg_bytes_as_base64_data_url(self) -> None:
        # Given: JPEG bytes from a CARLA RGB sensor.
        jpeg_bytes = b"abcd"

        # When: the bridge converts them for the D4D camera registry.
        data_url = build_frame_data_url(jpeg_bytes)

        # Then: D4D receives a browser-renderable image data URL.
        self.assertEqual(data_url, "data:image/jpeg;base64,YWJjZA==")


class BuildFramePayloadTests(unittest.TestCase):
    def test_serializes_frame_and_label_for_registry_post(self) -> None:
        # Given: a frame data URL and stable CARLA camera label.
        frame_data_url = "data:image/jpeg;base64,YWJjZA=="

        # When: the bridge builds the HTTP JSON payload.
        payload = build_frame_payload(frame_data_url, "CARLA 북측 게이트")

        # Then: the payload matches the D4D /api/carla-cameras boundary.
        self.assertEqual(
            json.loads(payload.decode("utf-8")),
            {"frameDataUrl": frame_data_url, "label": "CARLA 북측 게이트"},
        )


class ShouldEmitFrameTests(unittest.TestCase):
    def test_emits_first_frame_and_every_nth_frame(self) -> None:
        # Given: a bridge configured to publish every third CARLA sensor frame.
        every_n_frames = 3

        # When: sequential CARLA frame numbers arrive.
        decisions = [should_emit_frame(frame, every_n_frames) for frame in range(1, 8)]

        # Then: frame 1 is sent immediately and the configured cadence follows.
        self.assertEqual(decisions, [True, False, False, True, False, False, True])


class BuildActivityLogLineTests(unittest.TestCase):
    def test_serializes_structured_activity_line_for_frame_upload(self) -> None:
        event = ActivityLogEvent(
            source="carla",
            stage="frame-upload:end",
            level="info",
            message="CARLA frame uploaded",
            detail={"cameraId": "CAM-CARLA-01", "frameNumber": 42},
        )

        line = build_activity_log_line(event)

        prefix = "D4D_ACTIVITY "
        self.assertTrue(line.startswith(prefix))
        payload = json.loads(line.removeprefix(prefix))
        self.assertIsInstance(payload.pop("ts"), str)
        self.assertEqual(
            payload,
            {
                "source": "carla",
                "stage": "frame-upload:end",
                "level": "info",
                "message": "CARLA frame uploaded",
                "detail": {"cameraId": "CAM-CARLA-01", "frameNumber": 42},
            },
        )


if __name__ == "__main__":
    unittest.main()
