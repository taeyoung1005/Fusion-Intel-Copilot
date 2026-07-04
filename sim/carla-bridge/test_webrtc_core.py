from collections.abc import Awaitable, Callable
import json
import unittest
from unittest.mock import patch

import numpy as np
from aiortc import RTCSessionDescription

from webrtc_core import CameraFrameStore, WebrtcConfig, load_webrtc_config
from webrtc_server import LatestCameraFrameTrack, handle_offer

ConnectionCallback = Callable[[], Awaitable[None]]


class FakeFrame:
    def __init__(self, value: str) -> None:
        self.value = value
        self.copied = False

    def copy(self) -> "FakeFrame":
        frame = FakeFrame(self.value)
        frame.copied = True
        return frame


class CameraFrameStoreTests(unittest.TestCase):
    def test_returns_copies_of_latest_camera_frame(self) -> None:
        # Given: a latest-frame store backing WebRTC tracks.
        store = CameraFrameStore()
        frame = FakeFrame("frame-1")

        # When: a CARLA camera publishes a frame and WebRTC reads it.
        store.publish("CARLA-E-02", frame)
        first = store.read("CARLA-E-02")
        second = store.read("CARLA-E-02")

        # Then: each consumer receives an independent copy.
        self.assertIsNot(first, frame)
        self.assertIsNot(second, first)
        self.assertEqual(first.value, "frame-1")
        self.assertTrue(first.copied)

    def test_tracks_known_camera_ids(self) -> None:
        # Given: two CARLA cameras have published frames.
        store = CameraFrameStore()
        store.publish("CARLA-E-02", FakeFrame("east"))
        store.publish("CARLA-N-01", FakeFrame("north"))

        # Then: the signaling server can reject unknown cameras deterministically.
        self.assertEqual(store.camera_ids(), ("CARLA-E-02", "CARLA-N-01"))


class LatestCameraFrameTrackTests(unittest.IsolatedAsyncioTestCase):
    async def test_emits_latest_carla_frame_as_rgb_video_frame(self) -> None:
        # Given: WebRTC has a latest-frame store with a CARLA RGB frame.
        store = CameraFrameStore()
        rgb = np.zeros((2, 3, 3), dtype=np.uint8)
        rgb[1, 2] = [12, 34, 56]
        store.publish("CARLA-E-02", rgb)
        track = LatestCameraFrameTrack(
            camera_id="CARLA-E-02",
            frame_store=store,
            fps=1_000.0,
            width=3,
            height=2,
        )

        # When: aiortc asks the track for the next media frame.
        frame = await track.recv()

        # Then: the track returns a real RGB VideoFrame with the latest CARLA pixels.
        emitted = frame.to_ndarray(format="rgb24")
        self.assertEqual(emitted.shape, (2, 3, 3))
        self.assertEqual(emitted[1, 2].tolist(), [12, 34, 56])
        self.assertEqual(frame.time_base.numerator, 1)
        self.assertEqual(frame.time_base.denominator, 1_000)

    async def test_emits_black_frame_before_camera_has_published(self) -> None:
        # Given: a WebRTC track is requested before the CARLA camera has a frame.
        track = LatestCameraFrameTrack(
            camera_id="CARLA-E-02",
            frame_store=CameraFrameStore(),
            fps=1_000.0,
            width=3,
            height=2,
        )

        # When: aiortc asks the track for the next media frame.
        frame = await track.recv()

        # Then: the stream remains valid with a black placeholder frame.
        emitted = frame.to_ndarray(format="rgb24")
        self.assertEqual(emitted.shape, (2, 3, 3))
        self.assertEqual(int(emitted.max()), 0)


class LoadWebrtcConfigTests(unittest.TestCase):
    def test_uses_disabled_defaults_when_config_is_missing(self) -> None:
        config = load_webrtc_config({})

        self.assertFalse(config.enabled)
        self.assertEqual(config.host, "0.0.0.0")
        self.assertEqual(config.port, 8765)
        self.assertEqual(config.fps, 10.0)

    def test_parses_enabled_webrtc_config(self) -> None:
        config = load_webrtc_config(
            {"webrtc": {"enabled": True, "host": "127.0.0.1", "port": 9999, "fps": 12}}
        )

        self.assertTrue(config.enabled)
        self.assertEqual(config.host, "127.0.0.1")
        self.assertEqual(config.port, 9999)
        self.assertEqual(config.fps, 12.0)


class OfferRequestStub:
    def __init__(self, camera_id: str, payload: dict[str, str | int]) -> None:
        self.match_info = {"camera_id": camera_id}
        self._payload = payload

    async def json(self) -> dict[str, str | int]:
        return self._payload


class FailingPeerConnection:
    connectionState = "new"

    def __init__(self) -> None:
        self.closed = False

    def on(self, _event: str) -> Callable[[ConnectionCallback], ConnectionCallback]:
        return lambda callback: callback

    def addTrack(self, _track: LatestCameraFrameTrack) -> None:
        return None

    async def setRemoteDescription(self, _offer: RTCSessionDescription) -> None:
        raise RuntimeError("secret stack token")

    async def createAnswer(self) -> None:
        raise AssertionError("createAnswer should not run after setRemoteDescription fails")

    async def setLocalDescription(self, _answer: None) -> None:
        raise AssertionError("setLocalDescription should not run after setRemoteDescription fails")

    async def close(self) -> None:
        self.closed = True


class HandleOfferTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_offer_when_required_fields_are_missing(self) -> None:
        # Given: a known CARLA camera and a signaling request without SDP fields.
        frame_store = CameraFrameStore()
        frame_store.publish("CARLA-E-02", FakeFrame("frame-1"))
        request = OfferRequestStub("CARLA-E-02", {})

        # When: the WebRTC offer endpoint handles the malformed payload.
        response = await handle_offer(
            request,
            config=WebrtcConfig(enabled=True, host="127.0.0.1", port=8765, fps=10.0),
            frame_store=frame_store,
            peer_connections=set(),
            width=3,
            height=2,
        )

        # Then: the client receives a 400 JSON error without a traceback.
        self.assertEqual(response.status, 400)
        self.assertEqual(
            json.loads(response.text),
            {"error": "invalid WebRTC offer: expected string 'sdp' and 'type'"},
        )
        self.assertNotIn("Traceback", response.text)

    async def test_rejects_offer_when_required_fields_have_wrong_type(self) -> None:
        # Given: a known CARLA camera and a signaling request with a non-string SDP.
        frame_store = CameraFrameStore()
        frame_store.publish("CARLA-E-02", FakeFrame("frame-1"))
        request = OfferRequestStub("CARLA-E-02", {"sdp": 123, "type": "offer"})

        # When: the WebRTC offer endpoint handles the malformed payload.
        response = await handle_offer(
            request,
            config=WebrtcConfig(enabled=True, host="127.0.0.1", port=8765, fps=10.0),
            frame_store=frame_store,
            peer_connections=set(),
            width=3,
            height=2,
        )

        # Then: the client receives a 400 JSON error without a traceback.
        self.assertEqual(response.status, 400)
        self.assertEqual(
            json.loads(response.text),
            {"error": "invalid WebRTC offer: expected string 'sdp' and 'type'"},
        )
        self.assertNotIn("Traceback", response.text)

    async def test_hides_internal_offer_errors_from_response_body(self) -> None:
        # Given: a valid offer payload but an internal peer setup failure.
        frame_store = CameraFrameStore()
        frame_store.publish("CARLA-E-02", FakeFrame("frame-1"))
        request = OfferRequestStub("CARLA-E-02", {"sdp": "v=0\r\n", "type": "offer"})
        peer = FailingPeerConnection()
        peer_connections = set()

        # When: the WebRTC offer endpoint hits an internal exception.
        with patch("webrtc_server.RTCPeerConnection", return_value=peer):
            response = await handle_offer(
                request,
                config=WebrtcConfig(enabled=True, host="127.0.0.1", port=8765, fps=10.0),
                frame_store=frame_store,
                peer_connections=peer_connections,
                width=3,
                height=2,
            )

        # Then: the client receives only a generic 500 response while cleanup runs.
        self.assertEqual(response.status, 500)
        self.assertEqual(json.loads(response.text), {"error": "internal WebRTC signaling error"})
        self.assertNotIn("secret stack token", response.text)
        self.assertNotIn("Traceback", response.text)
        self.assertTrue(peer.closed)
        self.assertNotIn(peer, peer_connections)


if __name__ == "__main__":
    unittest.main()
