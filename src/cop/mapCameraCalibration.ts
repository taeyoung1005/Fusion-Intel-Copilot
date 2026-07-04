export type CameraYawMapCalibration = {
  readonly screenAngleOffsetDegrees: number
  readonly yawSign: -1 | 1
  readonly screenNorthAngleDegrees: number
}

export const TOWN10_CARLA_CAMERA_CALIBRATION = {
  screenAngleOffsetDegrees: 90,
  yawSign: -1,
  screenNorthAngleDegrees: 180,
} as const satisfies CameraYawMapCalibration
