from __future__ import annotations

import base64
import io
import json
import unittest

from pydantic import ValidationError
from PIL import Image

from detr_inference_service import DetectRequest, DetrBox, DetrDetection, detect_frame


def build_data_url() -> str:
    image = Image.new("RGB", (2, 2), (12, 34, 56))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    payload = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"


class DetrDetectionSchemaTests(unittest.TestCase):
    def test_accepts_client_compatible_raw_detection_payload(self) -> None:
        # Given: a raw detection with the same fields expected by detrVisionDetector.ts.
        raw = {
            "label": "person",
            "score": 0.91,
            "box": {"xmin": 1.0, "ymin": 2.0, "xmax": 3.0, "ymax": 4.0},
        }

        # When: the service parses the response item.
        detection = DetrDetection.model_validate(raw)

        # Then: the JSON shape remains the raw DetrDetection contract.
        self.assertEqual(json.loads(detection.model_dump_json()), raw)

    def test_rejects_fields_outside_client_detection_schema(self) -> None:
        # Given: a detection payload with an extra field the client schema would reject.
        raw = {
            "label": "person",
            "score": 0.91,
            "box": {"xmin": 1.0, "ymin": 2.0, "xmax": 3.0, "ymax": 4.0},
            "objectId": "server-generated-id",
        }

        # When / Then: validation rejects the non-contract field.
        with self.assertRaises(ValidationError):
            DetrDetection.model_validate(raw)


class DetectFrameTests(unittest.IsolatedAsyncioTestCase):
    async def test_filters_detections_below_threshold(self) -> None:
        # Given: a frame source and a detector returning one valid and one low-confidence item.
        request = DetectRequest(source=build_data_url(), frameWidth=2, frameHeight=2)

        def detector(_image: Image.Image) -> tuple[DetrDetection, DetrDetection]:
            return (
                DetrDetection(
                    label="person",
                    score=0.75,
                    box=DetrBox(xmin=0.0, ymin=0.0, xmax=1.0, ymax=1.0),
                ),
                DetrDetection(
                    label="traffic light",
                    score=0.49,
                    box=DetrBox(xmin=1.0, ymin=1.0, xmax=2.0, ymax=2.0),
                ),
            )

        # When: the service handles the detect request.
        detections = await detect_frame(request, detector=detector)

        # Then: only DetrDetection[] items at or above the server threshold are returned.
        self.assertEqual(
            [json.loads(detection.model_dump_json()) for detection in detections],
            [
                {
                    "label": "person",
                    "score": 0.75,
                    "box": {"xmin": 0.0, "ymin": 0.0, "xmax": 1.0, "ymax": 1.0},
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
