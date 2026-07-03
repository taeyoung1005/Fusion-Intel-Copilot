import { randomUUID } from "node:crypto"
import type { IncomingMessage } from "node:http"
import type { HttpServer } from "vite"
import { type WebSocket, WebSocketServer } from "ws"

type SignalRole = "phone" | "viewer"

type Room = {
  phone: WebSocket | null
  viewers: Map<string, WebSocket>
}

const rooms = new Map<string, Room>()

const roomFor = (cameraId: string): Room => {
  const existing = rooms.get(cameraId)
  if (existing !== undefined) {
    return existing
  }
  const room: Room = { phone: null, viewers: new Map() }
  rooms.set(cameraId, room)
  return room
}

const send = (socket: WebSocket, message: unknown): void => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

const parseParams = (
  url: string | undefined,
): { readonly cameraId: string; readonly role: SignalRole } | null => {
  const parsed = new URL(url ?? "/", "http://localhost")
  const cameraId = parsed.searchParams.get("cameraId")
  const role = parsed.searchParams.get("role")
  if (cameraId === null || cameraId.length === 0) {
    return null
  }
  if (role !== "phone" && role !== "viewer") {
    return null
  }
  return { cameraId, role }
}

const handlePhoneConnection = (socket: WebSocket, cameraId: string): void => {
  const room = roomFor(cameraId)
  room.phone = socket

  for (const viewerId of room.viewers.keys()) {
    send(socket, { type: "viewer-joined", viewerId })
  }

  socket.on("message", (raw) => {
    const message = parseMessage(raw.toString())
    if (message === null || typeof message.viewerId !== "string") {
      return
    }
    const viewer = room.viewers.get(message.viewerId)
    if (viewer === undefined) {
      return
    }
    if (message.type === "offer" || message.type === "ice-candidate") {
      send(viewer, { type: message.type, payload: message.payload })
    }
  })

  socket.on("close", () => {
    if (room.phone === socket) {
      room.phone = null
    }
    for (const viewer of room.viewers.values()) {
      send(viewer, { type: "phone-left" })
    }
  })
}

const handleViewerConnection = (socket: WebSocket, cameraId: string): void => {
  const room = roomFor(cameraId)
  const viewerId = randomUUID()
  room.viewers.set(viewerId, socket)

  send(socket, { type: "joined", viewerId })
  if (room.phone !== null) {
    send(room.phone, { type: "viewer-joined", viewerId })
  }

  socket.on("message", (raw) => {
    const message = parseMessage(raw.toString())
    if (message === null || room.phone === null) {
      return
    }
    if (message.type === "answer" || message.type === "ice-candidate") {
      send(room.phone, { type: message.type, viewerId, payload: message.payload })
    }
  })

  socket.on("close", () => {
    room.viewers.delete(viewerId)
    if (room.phone !== null) {
      send(room.phone, { type: "viewer-left", viewerId })
    }
  })
}

type SignalMessage = {
  readonly type: string
  readonly viewerId?: unknown
  readonly payload?: unknown
}

const parseMessage = (raw: string): SignalMessage | null => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof (parsed as { type: unknown }).type === "string"
    ) {
      return parsed as SignalMessage
    }
    return null
  } catch {
    return null
  }
}

const SIGNAL_PATHNAME = "/api/mobile-signal"

export const attachMobileSignaling = (httpServer: HttpServer): void => {
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname
    if (pathname !== SIGNAL_PATHNAME) {
      return
    }
    const params = parseParams(request.url)
    if (params === null) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      if (params.role === "phone") {
        handlePhoneConnection(ws, params.cameraId)
      } else {
        handleViewerConnection(ws, params.cameraId)
      }
    })
  })
}
