# DETR Inference Service Contract

The DETR service is a separate FastAPI process for the GPU server. It does not
modify or import `bridge.py`.

## Runtime

Install dependencies:

```bash
python3 -m pip install -r sim/carla-bridge/requirements-detr.txt
```

Start the service on the CARLA-free GPU:

```bash
CUDA_VISIBLE_DEVICES=1 python3 sim/carla-bridge/detr_inference_service.py
```

Configurable environment variables:

| Variable | Default |
|---|---|
| `D4D_DETR_HOST` | `0.0.0.0` |
| `D4D_DETR_PORT` | `8766` |
| `D4D_DETR_MODEL_ID` | `facebook/detr-resnet-50` |
| `D4D_DETR_THRESHOLD` | `0.5` |
| `D4D_DETR_SOURCE_ORIGIN` | `http://127.0.0.1:5173` |

`D4D_DETR_SOURCE_ORIGIN` is used only when `source` is a relative dev-server
path such as `/api/carla-cameras/CAM-CARLA-01/frame.jpg`.

## Endpoint

`POST /detect`

Request body:

```json
{
  "source": "/api/carla-cameras/CAM-CARLA-01/frame.jpg",
  "frameWidth": 1280,
  "frameHeight": 720
}
```

`source` accepts:

- A dev-server frame URL path: `/api/carla-cameras/{id}/frame.jpg`
- An absolute `http://` or `https://` frame URL
- A base64 image data URL such as `data:image/jpeg;base64,...`

Response body is a raw `DetrDetection[]` array compatible with
`src/cop/detrVisionDetector.ts` `DetrDetectionSchema`:

```json
[
  {
    "label": "person",
    "score": 0.932,
    "box": {
      "xmin": 102.4,
      "ymin": 91.2,
      "xmax": 215.8,
      "ymax": 431.6
    }
  }
]
```

The service returns pixel-space boxes from server-side `facebook/detr-resnet-50`
object detection. The client must continue to call `normalizeDetrDetections`
for D4D `VisionFrameObject` normalization.
