export const syntheticDayCameraGroups = [
  {
    groupId: "group-road",
    label: "Synthetic Alpha road pair",
    cameraIds: ["camera-A", "camera-B"],
    purpose: "Correlates adjacent road movement and A/B handoff only",
  },
  {
    groupId: "group-ammo-depot",
    label: "Synthetic depot correlation group",
    cameraIds: ["camera-C", "camera-D", "camera-E", "camera-F"],
    purpose: "Correlates repeated depot appearances across four synthetic views",
  },
] as const

export const syntheticDayTopology = {
  topologyId: "topology-synthetic-day",
  generatedAt: "2026-06-29T00:00:00.000Z",
  cameras: [
    {
      cameraId: "camera-A",
      label: "Road west approach synthetic view",
      zone: "구역 Alpha",
      coverageNote: "Synthetic road segment before the Alpha handoff",
    },
    {
      cameraId: "camera-B",
      label: "Road east approach synthetic view",
      zone: "구역 Alpha",
      coverageNote: "Synthetic road segment after the Alpha handoff",
    },
    {
      cameraId: "camera-C",
      label: "Depot outer synthetic view",
      zone: "탄약고 구역",
      coverageNote: "Synthetic depot outer lane",
    },
    {
      cameraId: "camera-D",
      label: "Depot gate synthetic view",
      zone: "탄약고 구역",
      coverageNote: "Synthetic depot gate lane",
    },
    {
      cameraId: "camera-E",
      label: "Depot inner synthetic view",
      zone: "탄약고 구역",
      coverageNote: "Synthetic depot inner lane",
    },
    {
      cameraId: "camera-F",
      label: "Depot service synthetic view",
      zone: "탄약고 구역",
      coverageNote: "Synthetic depot service lane",
    },
  ],
  cameraGroups: syntheticDayCameraGroups,
  edges: [
    {
      fromCameraId: "camera-A",
      toCameraId: "camera-B",
      relationship: "adjacent",
      coverageNote: "구역 Alpha blind-spot handoff",
    },
    {
      fromCameraId: "camera-C",
      toCameraId: "camera-D",
      relationship: "shared_approach",
      coverageNote: "Synthetic depot outer-to-gate correlation",
    },
    {
      fromCameraId: "camera-D",
      toCameraId: "camera-E",
      relationship: "handoff",
      coverageNote: "Synthetic depot gate-to-inner handoff",
    },
    {
      fromCameraId: "camera-E",
      toCameraId: "camera-F",
      relationship: "overlap",
      coverageNote: "Synthetic depot inner-to-service overlap",
    },
  ],
} as const
