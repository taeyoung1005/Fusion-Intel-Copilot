import type { VisionPipelineRequest } from "./visionPipelineClient"

export const COP_VISION_SAMPLE: VisionPipelineRequest = {
  cameraId: "CAM-E-03",
  incidentId: "inc-east",
  sequenceId: "cop-deterministic-vision-sample",
  capturedAt: "2026-06-30T09:41:02.000Z",
  providerHint: "local-frame-cv",
  frames: [
    {
      frameId: "frame-001",
      timestampMs: 0,
      width: 640,
      height: 360,
      objects: [
        {
          objectId: "person-alpha",
          label: "person",
          confidence: 0.71,
          distanceMeters: 52,
          bbox: { x: 438, y: 116, width: 28, height: 74 },
        },
      ],
    },
    {
      frameId: "frame-002",
      timestampMs: 1000,
      width: 640,
      height: 360,
      objects: [
        {
          objectId: "person-alpha",
          label: "person",
          confidence: 0.78,
          distanceMeters: 34,
          bbox: { x: 408, y: 122, width: 34, height: 86 },
        },
      ],
    },
    {
      frameId: "frame-003",
      timestampMs: 2000,
      width: 640,
      height: 360,
      objects: [
        {
          objectId: "person-alpha",
          label: "person",
          confidence: 0.84,
          distanceMeters: 18,
          bbox: { x: 374, y: 128, width: 42, height: 104 },
        },
      ],
    },
  ],
}
