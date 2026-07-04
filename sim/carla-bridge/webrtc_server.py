from __future__ import annotations

import asyncio
import json
import logging
import threading
from fractions import Fraction
from typing import Final

import numpy as np
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from av import VideoFrame

from webrtc_core import CameraFrameStore, WebrtcConfig

INVALID_OFFER_ERROR: Final = "invalid WebRTC offer: expected string 'sdp' and 'type'"
INTERNAL_OFFER_ERROR: Final = "internal WebRTC signaling error"
LOGGER: Final = logging.getLogger(__name__)


class LatestCameraFrameTrack(VideoStreamTrack):
    kind = "video"

    def __init__(
        self,
        camera_id: str,
        frame_store: CameraFrameStore,
        fps: float,
        width: int,
        height: int,
    ) -> None:
        super().__init__()
        self._camera_id = camera_id
        self._frame_store = frame_store
        self._fps = max(fps, 1.0)
        self._width = width
        self._height = height
        self._pts = 0

    async def recv(self) -> VideoFrame:
        await asyncio.sleep(1.0 / self._fps)
        self._pts += 1
        frame = self._frame_store.read(self._camera_id)
        if frame is None:
            array = np.zeros((self._height, self._width, 3), dtype=np.uint8)
        else:
            array = frame
        video_frame = VideoFrame.from_ndarray(array, format="rgb24")
        video_frame.pts = self._pts
        video_frame.time_base = Fraction(1, round(self._fps))
        return video_frame


def start_webrtc_server_in_thread(
    config: WebrtcConfig,
    frame_store: CameraFrameStore,
    width: int,
    height: int,
) -> threading.Thread | None:
    if not config.enabled:
        return None
    thread = threading.Thread(
        target=lambda: asyncio.run(run_webrtc_server(config, frame_store, width, height)),
        name="d4d-carla-webrtc",
        daemon=True,
    )
    thread.start()
    return thread


async def run_webrtc_server(
    config: WebrtcConfig,
    frame_store: CameraFrameStore,
    width: int,
    height: int,
) -> None:
    peer_connections: set[RTCPeerConnection] = set()
    app = web.Application()
    app.router.add_get("/health", lambda _request: web.json_response({"ok": True}))
    app.router.add_post(
        "/webrtc/{camera_id}/offer",
        lambda request: handle_offer(
            request,
            config=config,
            frame_store=frame_store,
            peer_connections=peer_connections,
            width=width,
            height=height,
        ),
    )

    async def on_shutdown(_app: web.Application) -> None:
        await asyncio.gather(*(peer.close() for peer in tuple(peer_connections)), return_exceptions=True)
        peer_connections.clear()

    app.on_shutdown.append(on_shutdown)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, config.host, config.port)
    await site.start()
    print(f"CARLA WebRTC signaling online: http://{config.host}:{config.port}")
    await asyncio.Event().wait()


async def handle_offer(
    request: web.Request,
    *,
    config: WebrtcConfig,
    frame_store: CameraFrameStore,
    peer_connections: set[RTCPeerConnection],
    width: int,
    height: int,
) -> web.Response:
    camera_id = request.match_info["camera_id"]
    if camera_id not in frame_store.camera_ids():
        return web.json_response({"error": "unknown CARLA camera"}, status=404)

    try:
        params = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "invalid WebRTC offer: expected JSON body"}, status=400)

    match params:
        case {"sdp": str(sdp), "type": str(offer_type)}:
            pass
        case _:
            return web.json_response({"error": INVALID_OFFER_ERROR}, status=400)

    peer: RTCPeerConnection | None = None
    try:
        offer = RTCSessionDescription(sdp=sdp, type=offer_type)
        peer = RTCPeerConnection()
        peer_connections.add(peer)

        @peer.on("connectionstatechange")
        async def on_connectionstatechange() -> None:
            if peer.connectionState in {"failed", "closed", "disconnected"}:
                await peer.close()
                peer_connections.discard(peer)

        peer.addTrack(
            LatestCameraFrameTrack(
                camera_id=camera_id,
                frame_store=frame_store,
                fps=config.fps,
                width=width,
                height=height,
            )
        )
        await peer.setRemoteDescription(offer)
        answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        return web.json_response(
            {
                "type": peer.localDescription.type,
                "sdp": peer.localDescription.sdp,
            }
        )
    except Exception:  # noqa: BROAD_EXCEPT_OK
        LOGGER.exception("failed to handle CARLA WebRTC offer")
        if peer is not None:
            peer_connections.discard(peer)
            await peer.close()
        return web.json_response({"error": INTERNAL_OFFER_ERROR}, status=500)
