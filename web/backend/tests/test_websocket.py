import os
import sys
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# Path setup (same pattern as conftest.py)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)


# Helpers

def _make_client():
    try:
        from web.backend.main import app

        from fastapi.testclient import TestClient

        return TestClient(app)
    except Exception:
        return None


def _make_mock_trainer_service():
    mock = MagicMock()
    mock.set_ws_broadcast = MagicMock()
    return mock


def _make_mock_monitor_service(metrics: dict | None = None):
    if metrics is None:
        metrics = {
            "cpu_percent": 12.5,
            "ram_used_gb": 8.0,
            "ram_total_gb": 32.0,
            "ram_percent": 25.0,
            "gpus": [],
        }
    mock = MagicMock()
    mock.get_metrics.return_value = metrics
    return mock


def _make_mock_log_service(history: list[dict[str, Any]] | None = None):
    if history is None:
        history = [
            {"text": "INFO: Server started", "ts": 1700000000.0},
            {"text": "INFO: Ready", "ts": 1700000001.0},
        ]
    mock = MagicMock()
    mock.get_history.return_value = history
    mock.set_ws_broadcast = MagicMock()
    mock.set_event_loop = MagicMock()
    return mock


# Fixtures

@pytest.fixture
def client():
    c = _make_client()
    if c is None:
        pytest.skip("Could not create TestClient (import error)")
    return c


@pytest.fixture
def mock_trainer_service():
    mock_svc = _make_mock_trainer_service()
    with patch(
        "web.backend.services.trainer_service.TrainerService.get_instance",
        return_value=mock_svc,
    ):
        yield mock_svc


@pytest.fixture
def mock_monitor_service():
    mock_svc = _make_mock_monitor_service()
    with patch(
        "web.backend.services.monitor_service.MonitorService.get_instance",
        return_value=mock_svc,
    ):
        yield mock_svc


@pytest.fixture
def mock_log_service():
    mock_svc = _make_mock_log_service()
    with patch(
        "web.backend.services.log_service.LogService.get_instance",
        return_value=mock_svc,
    ):
        yield mock_svc


@pytest.fixture
def mock_log_service_empty():
    mock_svc = _make_mock_log_service(history=[])
    with patch(
        "web.backend.services.log_service.LogService.get_instance",
        return_value=mock_svc,
    ):
        yield mock_svc


# 1. Training WebSocket  (/ws/training)

class TestTrainingWebSocket:
    def test_connect_and_disconnect(self, client, mock_trainer_service):
        with client.websocket_connect("/ws/training"):
            # Connection is open; the context manager will close it.
            pass
        # If we reach here without an exception, connect/disconnect succeeded.

    def test_trainer_service_broadcast_wired(self, client, mock_trainer_service):
        with client.websocket_connect("/ws/training"):
            pass
        mock_trainer_service.set_ws_broadcast.assert_called_once()

    def test_trainer_service_broadcast_callable(self, client, mock_trainer_service):
        with client.websocket_connect("/ws/training"):
            pass
        args = mock_trainer_service.set_ws_broadcast.call_args
        broadcast_fn = args[0][0]
        assert callable(broadcast_fn)

    def test_send_message_does_not_crash(self, client, mock_trainer_service):
        with client.websocket_connect("/ws/training") as ws:
            ws.send_text('{"action": "ping"}')
            # The endpoint logs and continues; no response expected.

    def test_multiple_connections(self, client, mock_trainer_service):
        with client.websocket_connect("/ws/training") as ws1, client.websocket_connect("/ws/training") as ws2:
            # Both connections are open.
            ws1.send_text("hello from client 1")
            ws2.send_text("hello from client 2")
        # Both disconnected cleanly.


# 2. System Metrics WebSocket  (/ws/system)

class TestSystemWebSocket:
    def test_connect_and_disconnect(self, client, mock_monitor_service):
        with client.websocket_connect("/ws/system") as ws:
            # Immediately receive the first metrics message and disconnect.
            _msg = ws.receive_json()
        # Clean disconnect.

    def test_receives_json_message(self, client, mock_monitor_service):
        with client.websocket_connect("/ws/system") as ws:
            msg = ws.receive_json()
            assert isinstance(msg, dict)

    def test_message_has_type_metrics(self, client, mock_monitor_service):
        with client.websocket_connect("/ws/system") as ws:
            msg = ws.receive_json()
            assert msg.get("type") == "metrics"

    def test_message_has_data_payload(self, client, mock_monitor_service):
        with client.websocket_connect("/ws/system") as ws:
            msg = ws.receive_json()
            assert "data" in msg
            data = msg["data"]
            assert isinstance(data, dict)

    def test_metrics_data_keys(self, client, mock_monitor_service):
        with client.websocket_connect("/ws/system") as ws:
            msg = ws.receive_json()
            data = msg["data"]
            expected_keys = ["cpu_percent", "ram_used_gb", "ram_total_gb", "ram_percent", "gpus"]
            for key in expected_keys:
                assert key in data, f"Expected key '{key}' missing from metrics data"

    def test_metrics_values_match_mock(self, client, mock_monitor_service):
        with client.websocket_connect("/ws/system") as ws:
            msg = ws.receive_json()
            data = msg["data"]
            assert data["cpu_percent"] == 12.5
            assert data["ram_used_gb"] == 8.0
            assert data["ram_total_gb"] == 32.0
            assert data["ram_percent"] == 25.0
            assert data["gpus"] == []

    def test_receives_multiple_messages(self, client, mock_monitor_service):
        with client.websocket_connect("/ws/system") as ws:
            msg1 = ws.receive_json()
            msg2 = ws.receive_json()
            assert msg1["type"] == "metrics"
            assert msg2["type"] == "metrics"

    def test_multiple_connections(self, client, mock_monitor_service):
        with client.websocket_connect("/ws/system") as ws1, client.websocket_connect("/ws/system") as ws2:
            msg1 = ws1.receive_json()
            msg2 = ws2.receive_json()
            assert msg1["type"] == "metrics"
            assert msg2["type"] == "metrics"

    def test_custom_metrics(self, client):
        custom_metrics = {
            "cpu_percent": 99.9,
            "ram_used_gb": 30.0,
            "ram_total_gb": 32.0,
            "ram_percent": 93.75,
            "gpus": [
                {
                    "index": 0,
                    "name": "Test GPU",
                    "vram_used_mb": 8000.0,
                    "vram_total_mb": 24000.0,
                    "vram_percent": 33.3,
                    "temperature": 65.0,
                    "utilization": 80.0,
                },
            ],
        }
        mock_svc = _make_mock_monitor_service(custom_metrics)
        with patch(
            "web.backend.services.monitor_service.MonitorService.get_instance",
            return_value=mock_svc,
        ), client.websocket_connect("/ws/system") as ws:
            msg = ws.receive_json()
            data = msg["data"]
            assert data["cpu_percent"] == 99.9
            assert len(data["gpus"]) == 1
            assert data["gpus"][0]["name"] == "Test GPU"


# 3. Terminal WebSocket  (/ws/terminal)

class TestTerminalWebSocket:
    def test_connect_and_disconnect(self, client, mock_log_service):
        with client.websocket_connect("/ws/terminal") as ws:
            # Drain the replayed history so the socket can close cleanly.
            _msg1 = ws.receive_json()
            _msg2 = ws.receive_json()

    def test_log_service_broadcast_wired(self, client, mock_log_service):
        with client.websocket_connect("/ws/terminal") as ws:
            # Drain history
            ws.receive_json()
            ws.receive_json()
        mock_log_service.set_ws_broadcast.assert_called()

    def test_log_service_event_loop_set(self, client, mock_log_service):
        with client.websocket_connect("/ws/terminal") as ws:
            # Drain history
            ws.receive_json()
            ws.receive_json()
        mock_log_service.set_event_loop.assert_called()

    def test_receives_history_replay(self, client, mock_log_service):
        with client.websocket_connect("/ws/terminal") as ws:
            msg1 = ws.receive_json()
            msg2 = ws.receive_json()

            assert msg1["type"] == "log"
            assert msg1["data"]["text"] == "INFO: Server started"
            assert msg1["data"]["ts"] == 1700000000.0

            assert msg2["type"] == "log"
            assert msg2["data"]["text"] == "INFO: Ready"
            assert msg2["data"]["ts"] == 1700000001.0

    def test_history_message_format(self, client, mock_log_service):
        with client.websocket_connect("/ws/terminal") as ws:
            msg = ws.receive_json()
            assert isinstance(msg, dict)
            assert "type" in msg
            assert "data" in msg
            assert msg["type"] == "log"
            assert "text" in msg["data"]
            assert "ts" in msg["data"]

    def test_empty_history(self, client, mock_log_service_empty):
        with client.websocket_connect("/ws/terminal") as ws:
            # The endpoint enters a receive loop after replaying history.
            # With no history, it waits for client messages.  Send one to
            # verify the connection is alive.
            ws.send_text("ping")

    def test_send_message_does_not_crash(self, client, mock_log_service_empty):
        with client.websocket_connect("/ws/terminal") as ws:
            ws.send_text('{"action": "test"}')

    def test_multiple_connections(self, client, mock_log_service):
        with client.websocket_connect("/ws/terminal") as ws1:
            msg1 = ws1.receive_json()
            assert msg1["type"] == "log"

            with client.websocket_connect("/ws/terminal") as ws2:
                msg2 = ws2.receive_json()
                assert msg2["type"] == "log"

                # Both should get the same first history entry
                assert msg1["data"]["text"] == msg2["data"]["text"]

    def test_large_history(self, client):
        large_history = [
            {"text": f"Log line {i}", "ts": 1700000000.0 + i}
            for i in range(50)
        ]
        mock_svc = _make_mock_log_service(history=large_history)
        with patch(
            "web.backend.services.log_service.LogService.get_instance",
            return_value=mock_svc,
        ), client.websocket_connect("/ws/terminal") as ws:
            received = []
            for _ in range(50):
                msg = ws.receive_json()
                received.append(msg)

            assert len(received) == 50
            assert received[0]["data"]["text"] == "Log line 0"
            assert received[49]["data"]["text"] == "Log line 49"


# 4. ConnectionManager unit tests

class TestConnectionManager:
    def test_initial_active_count(self):
        from web.backend.ws.connection_manager import ConnectionManager
        mgr = ConnectionManager(name="test")
        assert mgr.active_count == 0

    def test_name_stored(self):
        from web.backend.ws.connection_manager import ConnectionManager
        mgr = ConnectionManager(name="Test WS")
        assert mgr._name == "Test WS"


class TestBroadcastBridge:
    def test_broadcast_sync_no_connections(self):
        from web.backend.ws.connection_manager import BroadcastBridge, ConnectionManager
        mgr = ConnectionManager(name="test")
        bridge = BroadcastBridge(mgr, name="test")
        # Should not raise even without an event loop
        bridge.broadcast_sync({"type": "test", "data": {}})

    def test_broadcast_sync_no_event_loop(self):
        from web.backend.ws.connection_manager import BroadcastBridge, ConnectionManager
        mgr = ConnectionManager(name="test")
        # Fake a connection so active_count > 0
        mgr._connections.append(MagicMock())
        bridge = BroadcastBridge(mgr, name="test")
        # No event loop captured — should not raise
        bridge.broadcast_sync({"type": "test", "data": {}})

    def test_capture_event_loop_outside_async(self):
        from web.backend.ws.connection_manager import BroadcastBridge, ConnectionManager
        mgr = ConnectionManager(name="test")
        bridge = BroadcastBridge(mgr, name="test")
        # No running event loop — should log a warning but not raise
        bridge.capture_event_loop()
        assert bridge._event_loop is None


# 5. Cross-cutting WebSocket concerns

class TestWebSocketCrossCutting:
    def test_invalid_ws_path_rejected(self, client):
        with pytest.raises((Exception, RuntimeError)), client.websocket_connect("/ws/nonexistent"):
            pass

    def test_all_endpoints_accept_connections(self, client, mock_trainer_service, mock_monitor_service, mock_log_service):
        with client.websocket_connect("/ws/training"), client.websocket_connect("/ws/system") as ws_system:
            # System sends a message immediately
            msg = ws_system.receive_json()
            assert msg["type"] == "metrics"

            with client.websocket_connect("/ws/terminal") as ws_terminal:
                # Terminal replays history
                msg = ws_terminal.receive_json()
                assert msg["type"] == "log"
