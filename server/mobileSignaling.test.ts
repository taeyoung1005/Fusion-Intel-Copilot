import { type Server, createServer } from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import WebSocket from "ws"
import { attachMobileSignaling } from "./mobileSignaling"

type QueuedSocket = WebSocket & { readonly nextMessage: () => Promise<unknown> }

const startedServers: Server[] = []

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map(close))
})

describe("mobile WebRTC signaling relay", () => {
  it("relays an offer from the phone to a viewer that joined first, then the answer back", async () => {
    // Given: a signaling server with a viewer already waiting for PHONE-001.
    const wsUrl = await startSignalingServer()
    const viewer = await connect(`${wsUrl}/api/mobile-signal?cameraId=PHONE-001&role=viewer`)
    const joined = await viewer.nextMessage()
    expect(joined).toMatchObject({ type: "joined" })
    const viewerId = (joined as { viewerId: string }).viewerId

    // When: the phone connects and is told a viewer is already waiting.
    const phone = await connect(`${wsUrl}/api/mobile-signal?cameraId=PHONE-001&role=phone`)
    const viewerJoined = await phone.nextMessage()
    expect(viewerJoined).toEqual({ type: "viewer-joined", viewerId })

    // Then: an offer from the phone reaches only that viewer, and the answer routes back to the phone.
    phone.send(JSON.stringify({ type: "offer", viewerId, payload: { sdp: "phone-offer" } }))
    const offer = await viewer.nextMessage()
    expect(offer).toEqual({ type: "offer", payload: { sdp: "phone-offer" } })

    viewer.send(JSON.stringify({ type: "answer", payload: { sdp: "viewer-answer" } }))
    const answer = await phone.nextMessage()
    expect(answer).toEqual({ type: "answer", viewerId, payload: { sdp: "viewer-answer" } })

    viewer.close()
    phone.close()
  })

  it("notifies the phone when its viewer disconnects", async () => {
    // Given: a phone connected with one active viewer.
    const wsUrl = await startSignalingServer()
    const phone = await connect(`${wsUrl}/api/mobile-signal?cameraId=PHONE-002&role=phone`)
    const viewer = await connect(`${wsUrl}/api/mobile-signal?cameraId=PHONE-002&role=viewer`)
    const viewerJoined = await phone.nextMessage()
    const viewerId = (viewerJoined as { viewerId: string }).viewerId

    // When: the viewer disconnects.
    viewer.close()

    // Then: the phone is notified so it can tear down that viewer's peer connection.
    const viewerLeft = await phone.nextMessage()
    expect(viewerLeft).toEqual({ type: "viewer-left", viewerId })

    phone.close()
  })
})

const startSignalingServer = async (): Promise<string> => {
  const server = createServer((_request, response) => response.writeHead(404).end())
  attachMobileSignaling(server)
  await listen(server)
  startedServers.push(server)
  const address = server.address()
  if (typeof address === "string" || address === null || typeof address.port !== "number") {
    throw new Error("Expected TCP server address")
  }
  return `ws://127.0.0.1:${address.port}`
}

// Queues incoming messages from the moment the socket is created, since the
// server can push a message before the caller awaits `connect` and attaches
// its own handler — a plain `once("message", ...)` added after open() would
// race that push and silently drop it.
const connect = (url: string): Promise<QueuedSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url) as QueuedSocket
    const queue: unknown[] = []
    const waiters: Array<(value: unknown) => void> = []
    socket.on("message", (raw) => {
      const parsed: unknown = JSON.parse(raw.toString())
      const waiter = waiters.shift()
      if (waiter !== undefined) {
        waiter(parsed)
        return
      }
      queue.push(parsed)
    })
    Object.assign(socket, {
      nextMessage: (): Promise<unknown> =>
        new Promise((resolveMessage) => {
          const queued = queue.shift()
          if (queued !== undefined) {
            resolveMessage(queued)
            return
          }
          waiters.push(resolveMessage)
        }),
    })
    socket.once("open", () => resolve(socket))
    socket.once("error", reject)
  })

const listen = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve()
        return
      }
      reject(error)
    })
  })
