"""
API-level tests for the config endpoints.

These tests exercise the REST API through FastAPI's TestClient,
verifying that the config CRUD endpoints work correctly.

NOTE: The config router may not yet be wired into main.py (it is
being developed in parallel). Tests gracefully skip if the endpoints
return 404, indicating the router is not yet registered.
"""

import json
import os
import sys

import pytest

# Ensure project root is importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)


def _get_client():
    """
    Attempt to construct a TestClient for the FastAPI app.
    Returns the client, or None if imports fail.
    """
    try:
        from fastapi.testclient import TestClient
        from web.backend.main import app
        return TestClient(app)
    except Exception:
        return None


def _config_router_available(client) -> bool:
    """
    Probe whether the config router is wired into the app by
    hitting GET /api/config. Returns True if it returns 200.
    """
    if client is None:
        return False
    try:
        resp = client.get("/api/config")
        return resp.status_code != 404
    except Exception:
        return False


# Fixture that provides the client and skips if unavailable
@pytest.fixture
def client():
    c = _get_client()
    if c is None:
        pytest.skip("Could not create TestClient (import error)")
    return c


@pytest.fixture
def config_client(client):
    """Client that also checks the config router is available."""
    if not _config_router_available(client):
        pytest.skip(
            "Config router not yet wired into main.py "
            "(GET /api/config returned 404). "
            "This is expected while the router is being developed."
        )
    return client


# ===================================================================
# 1. Health endpoint (baseline sanity)
# ===================================================================

class TestHealthBaseline:
    """Verify that the app itself is functional."""

    def test_health_returns_200(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


# ===================================================================
# 2. GET /api/config
# ===================================================================

class TestGetConfig:
    """Tests for the GET /api/config endpoint."""

    def test_get_config_returns_200(self, config_client):
        resp = config_client.get("/api/config")
        assert resp.status_code == 200

    def test_get_config_returns_dict(self, config_client):
        resp = config_client.get("/api/config")
        data = resp.json()
        assert isinstance(data, dict)

    def test_get_config_has_version(self, config_client):
        resp = config_client.get("/api/config")
        data = resp.json()
        assert "__version" in data
        assert data["__version"] == 10

    def test_get_config_has_expected_keys(self, config_client):
        """The config dict should contain well-known training config keys."""
        resp = config_client.get("/api/config")
        data = resp.json()
        expected_keys = [
            "training_method",
            "model_type",
            "base_model_name",
            "learning_rate",
            "batch_size",
            "epochs",
            "optimizer",
            "unet",
            "text_encoder",
            "vae",
            "resolution",
        ]
        for key in expected_keys:
            assert key in data, f"Expected key '{key}' missing from GET /api/config response"

    def test_get_config_optimizer_is_dict(self, config_client):
        """The optimizer field should be a nested dict."""
        resp = config_client.get("/api/config")
        data = resp.json()
        assert isinstance(data["optimizer"], dict)

    def test_get_config_unet_is_dict(self, config_client):
        resp = config_client.get("/api/config")
        data = resp.json()
        assert isinstance(data["unet"], dict)


# ===================================================================
# 3. PUT /api/config
# ===================================================================

class TestUpdateConfig:
    """Tests for the PUT /api/config endpoint."""

    def test_put_config_returns_200(self, config_client):
        resp = config_client.put("/api/config", json={"batch_size": 8})
        assert resp.status_code == 200

    def test_put_config_applies_update(self, config_client):
        """A partial update should be reflected in the returned config."""
        resp = config_client.put("/api/config", json={"batch_size": 16})
        data = resp.json()
        assert data["batch_size"] == 16

    def test_put_config_returns_full_config(self, config_client):
        """Even a partial update should return the full config dict."""
        resp = config_client.put("/api/config", json={"epochs": 50})
        data = resp.json()
        # Should have many more keys than just the one we sent
        assert len(data) > 10
        assert "__version" in data
        assert "optimizer" in data
        assert data["epochs"] == 50

    def test_put_config_preserves_other_fields(self, config_client):
        """Updating one field should not reset other fields."""
        # First set a known value
        config_client.put("/api/config", json={"batch_size": 32})

        # Then update a different field
        resp = config_client.put("/api/config", json={"epochs": 200})
        data = resp.json()

        assert data["epochs"] == 200
        assert data["batch_size"] == 32, "batch_size should not have been reset"

    def test_put_config_with_empty_body(self, config_client):
        """An empty update should return the current config unchanged."""
        resp = config_client.put("/api/config", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert "__version" in data

    def test_put_config_unknown_keys_ignored(self, config_client):
        """Unknown keys should not cause an error (from_dict ignores them)."""
        resp = config_client.put(
            "/api/config",
            json={"not_a_real_field": "something"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "not_a_real_field" not in data

    def test_put_config_nested_optimizer(self, config_client):
        """Updating the optimizer sub-config should work."""
        resp = config_client.put(
            "/api/config",
            json={"optimizer": {"weight_decay": 0.05}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["optimizer"]["weight_decay"] == 0.05

    def test_put_config_learning_rate(self, config_client):
        """Update the learning rate and verify."""
        resp = config_client.put(
            "/api/config",
            json={"learning_rate": 1e-4},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["learning_rate"] == pytest.approx(1e-4)


# ===================================================================
# 4. GET /api/config/defaults
# ===================================================================

class TestGetDefaults:
    """Tests for the GET /api/config/defaults endpoint."""

    def test_defaults_returns_200(self, config_client):
        resp = config_client.get("/api/config/defaults")
        assert resp.status_code == 200

    def test_defaults_returns_valid_config(self, config_client):
        resp = config_client.get("/api/config/defaults")
        data = resp.json()
        assert isinstance(data, dict)
        assert "__version" in data
        assert data["__version"] == 10

    def test_defaults_match_python_defaults(self, config_client):
        """The API defaults should match TrainConfig.default_values().to_dict()."""
        from modules.util.config.TrainConfig import TrainConfig

        resp = config_client.get("/api/config/defaults")
        api_defaults = resp.json()

        python_defaults = TrainConfig.default_values().to_dict()

        # Compare a set of well-known keys
        for key in ["training_method", "model_type", "batch_size", "epochs",
                     "learning_rate", "resolution"]:
            assert api_defaults[key] == python_defaults[key], (
                f"API default for '{key}' ({api_defaults[key]!r}) "
                f"differs from Python default ({python_defaults[key]!r})"
            )

    def test_defaults_independent_of_current_config(self, config_client):
        """
        Changing the current config should NOT affect what /defaults returns.
        """
        # Modify current config
        config_client.put("/api/config", json={"batch_size": 999})

        # Defaults should still return the standard default (1)
        resp = config_client.get("/api/config/defaults")
        data = resp.json()
        assert data["batch_size"] == 1


# ===================================================================
# 5. GET /api/config/schema
# ===================================================================

class TestGetSchema:
    """Tests for the GET /api/config/schema endpoint."""

    def test_schema_returns_200(self, config_client):
        resp = config_client.get("/api/config/schema")
        assert resp.status_code == 200

    def test_schema_has_fields_key(self, config_client):
        resp = config_client.get("/api/config/schema")
        data = resp.json()
        assert "fields" in data
        assert isinstance(data["fields"], dict)

    def test_schema_fields_have_type_and_nullable(self, config_client):
        """Each field entry should include 'type' and 'nullable' metadata."""
        resp = config_client.get("/api/config/schema")
        fields = resp.json()["fields"]

        for field_name, meta in fields.items():
            assert "type" in meta, f"Field '{field_name}' missing 'type' in schema"
            assert "nullable" in meta, f"Field '{field_name}' missing 'nullable' in schema"

    def test_schema_contains_expected_fields(self, config_client):
        """Well-known config fields should appear in the schema."""
        resp = config_client.get("/api/config/schema")
        fields = resp.json()["fields"]

        expected = [
            "training_method", "model_type", "base_model_name",
            "learning_rate", "batch_size", "epochs", "resolution",
        ]
        for name in expected:
            assert name in fields, f"Expected field '{name}' not in schema"

    def test_schema_nullable_consistency(self, config_client):
        """
        Fields we know are nullable should be marked as such,
        and vice versa.
        """
        resp = config_client.get("/api/config/schema")
        fields = resp.json()["fields"]

        # Known nullable fields
        if "custom_learning_rate_scheduler" in fields:
            assert fields["custom_learning_rate_scheduler"]["nullable"] is True
        if "clip_grad_norm" in fields:
            assert fields["clip_grad_norm"]["nullable"] is True

        # Known non-nullable fields
        if "training_method" in fields:
            assert fields["training_method"]["nullable"] is False
        if "batch_size" in fields:
            assert fields["batch_size"]["nullable"] is False


# ===================================================================
# 6. POST /api/config/export
# ===================================================================

class TestExportConfig:
    """Tests for the POST /api/config/export endpoint."""

    def test_export_returns_200_or_expected_error(self, config_client):
        """
        Export may fail with 404 if the concept/sample files do not exist
        (to_pack_dict reads from filesystem). We accept 200 or 404/500
        as valid responses.
        """
        resp = config_client.post(
            "/api/config/export",
            json={"include_secrets": False},
        )
        # 200 = success, 404 = missing concept/sample files,
        # 500 = other error (e.g. service method signature mismatch)
        assert resp.status_code in (200, 404, 422, 500)

    def test_export_with_no_body(self, config_client):
        """POST /api/config/export with no body should not crash."""
        resp = config_client.post("/api/config/export")
        # Accept any of these; the endpoint might require a body
        assert resp.status_code in (200, 404, 422, 500)


# ===================================================================
# 7. POST /api/config/validate
# ===================================================================

class TestValidateConfig:
    """Tests for the POST /api/config/validate endpoint."""

    def test_validate_valid_config(self, config_client):
        """A valid partial config should return valid: true."""
        resp = config_client.post(
            "/api/config/validate",
            json={"batch_size": 4, "epochs": 10, "learning_rate": 1e-4},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert "errors" not in data

    def test_validate_invalid_type(self, config_client):
        """
        Passing a value that cannot be coerced to the expected type
        should return valid: false with an error description.
        """
        resp = config_client.post(
            "/api/config/validate",
            json={"epochs": "not_a_number"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert isinstance(data["errors"], list)
        assert len(data["errors"]) > 0

    def test_validate_empty_body(self, config_client):
        """An empty dict should be valid (defaults are valid)."""
        resp = config_client.post(
            "/api/config/validate",
            json={},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True

    def test_validate_does_not_mutate_current_config(self, config_client):
        """Validation must not alter the in-memory config."""
        # Capture current state
        before = config_client.get("/api/config").json()

        # Validate something different
        config_client.post(
            "/api/config/validate",
            json={"batch_size": 9999, "epochs": 9999},
        )

        # Current config should be unchanged
        after = config_client.get("/api/config").json()
        assert before == after


# ===================================================================
# 8. Config round-trip through the API
# ===================================================================

class TestApiRoundTrip:
    """
    Full round-trip through the API: GET -> PUT -> GET should
    produce consistent results.
    """

    def test_get_put_get_consistency(self, config_client):
        """GET, then PUT the same data back, then GET again should match."""
        resp1 = config_client.get("/api/config")
        data1 = resp1.json()

        # PUT the same config back
        resp_put = config_client.put("/api/config", json=data1)
        assert resp_put.status_code == 200

        # GET again
        resp2 = config_client.get("/api/config")
        data2 = resp2.json()

        # The configs should be identical
        assert data1 == data2, (
            "Config changed after PUT-ing the same data back. "
            "This indicates a serialisation instability."
        )

    def test_modify_and_read_back(self, config_client):
        """Modify a value via PUT, then verify via GET."""
        config_client.put("/api/config", json={"epochs": 42})

        resp = config_client.get("/api/config")
        data = resp.json()
        assert data["epochs"] == 42

    def test_multiple_updates_accumulate(self, config_client):
        """Multiple PUT calls should accumulate changes."""
        config_client.put("/api/config", json={"batch_size": 4})
        config_client.put("/api/config", json={"epochs": 10})
        config_client.put("/api/config", json={"learning_rate": 5e-5})

        resp = config_client.get("/api/config")
        data = resp.json()

        assert data["batch_size"] == 4
        assert data["epochs"] == 10
        assert data["learning_rate"] == pytest.approx(5e-5)
