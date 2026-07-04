import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import { MAP_VIEW } from "./copData"
import {
  DEFAULT_FACILITY_VIEWPORT,
  FACILITY_VIEWPORT_ZOOM,
  type FacilityViewport,
  facilityViewBox,
  facilityViewBoxRect,
  minimapViewportIndicator,
  panFacilityViewport,
  pointerMapPoint,
  rotateFacilityViewport,
  zoomFacilityViewport,
} from "./facilityMapViewport"

type ViewMode = "2D" | "3D"

type DragSnapshot = {
  readonly pointerId: number
  readonly clientX: number
  readonly clientY: number
  readonly viewport: FacilityViewport
  readonly svgWidth: number
  readonly svgHeight: number
}

export type FacilityMapViewportControls = {
  readonly viewport: FacilityViewport
  readonly viewBox: string
  readonly minimapCoveragePercent: number
  readonly minimapStyle: CSSProperties
  readonly rotationTransform?: string
  readonly zoomIn: () => void
  readonly zoomOut: () => void
  readonly resetViewport: () => void
  readonly rotateLeft: () => void
  readonly rotateRight: () => void
  readonly handleWheel: (event: WheelEvent) => void
  readonly handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void
  readonly handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void
  readonly endPointerDrag: (event: ReactPointerEvent<SVGSVGElement>) => void
}

export const useFacilityMapViewport = (viewMode: ViewMode): FacilityMapViewportControls => {
  const [viewport, setViewport] = useState(DEFAULT_FACILITY_VIEWPORT)
  const dragSnapshotRef = useRef<DragSnapshot | null>(null)
  const minimap = minimapViewportIndicator(viewport)
  const minimapStyle = useMemo<CSSProperties>(
    () => ({
      height: `${minimap.heightPercent}%`,
      left: `${minimap.leftPercent}%`,
      top: `${minimap.topPercent}%`,
      transform: `rotate(${viewport.rotation}deg)`,
      width: `${minimap.widthPercent}%`,
    }),
    [
      minimap.heightPercent,
      minimap.leftPercent,
      minimap.topPercent,
      minimap.widthPercent,
      viewport.rotation,
    ],
  )
  const rotationTransform =
    viewport.rotation === 0
      ? undefined
      : `rotate(${viewport.rotation} ${MAP_VIEW.width / 2} ${MAP_VIEW.height / 2})`
  const zoomIn = useCallback(() => {
    setViewport((current) =>
      zoomFacilityViewport(current, current.zoom + FACILITY_VIEWPORT_ZOOM.step, current.center),
    )
  }, [])
  const zoomOut = useCallback(() => {
    setViewport((current) =>
      zoomFacilityViewport(current, current.zoom - FACILITY_VIEWPORT_ZOOM.step, current.center),
    )
  }, [])
  const resetViewport = useCallback(() => setViewport(DEFAULT_FACILITY_VIEWPORT), [])
  const rotateLeft = useCallback(
    () => setViewport((current) => rotateFacilityViewport(current, -15)),
    [],
  )
  const rotateRight = useCallback(
    () => setViewport((current) => rotateFacilityViewport(current, 15)),
    [],
  )
  const handleWheel = useCallback((event: WheelEvent) => {
    const target = event.currentTarget
    if (!(target instanceof SVGSVGElement)) {
      return
    }
    const rect = target.getBoundingClientRect()
    const bounds = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
    const clientX = event.clientX
    const clientY = event.clientY
    const deltaY = event.deltaY
    event.preventDefault()
    setViewport((current) => {
      const focusPoint = pointerMapPoint(bounds, clientX, clientY, current)
      const zoomDelta = deltaY < 0 ? FACILITY_VIEWPORT_ZOOM.step : -FACILITY_VIEWPORT_ZOOM.step
      return zoomFacilityViewport(current, current.zoom + zoomDelta, focusPoint)
    })
  }, [])
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.button !== 0 || viewMode !== "2D") {
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      dragSnapshotRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        viewport,
        svgWidth: rect.width,
        svgHeight: rect.height,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [viewMode, viewport],
  )
  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const snapshot = dragSnapshotRef.current
    if (snapshot === null || snapshot.pointerId !== event.pointerId) {
      return
    }
    const rect = facilityViewBoxRect(snapshot.viewport)
    const delta = {
      x: ((snapshot.clientX - event.clientX) / snapshot.svgWidth) * rect.width,
      y: ((snapshot.clientY - event.clientY) / snapshot.svgHeight) * rect.height,
    }
    setViewport(panFacilityViewport(snapshot.viewport, delta))
  }, [])
  const endPointerDrag = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const snapshot = dragSnapshotRef.current
    if (snapshot === null || snapshot.pointerId !== event.pointerId) {
      return
    }
    dragSnapshotRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return {
    viewport,
    viewBox: facilityViewBox(viewport),
    minimapCoveragePercent: minimap.coveragePercent,
    minimapStyle,
    ...(rotationTransform === undefined ? {} : { rotationTransform }),
    zoomIn,
    zoomOut,
    resetViewport,
    rotateLeft,
    rotateRight,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    endPointerDrag,
  }
}
