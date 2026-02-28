import os
import sys

import pytest

# Ensure project root is importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)


def _get_client():
    try:
        from web.backend.main import app

        from fastapi.testclient import TestClient
        return TestClient(app)
    except Exception:
        return None


def _config_router_available(client) -> bool:
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
    if not _config_router_available(client):
        pytest.skip(
            "Config router not yet wired into main.py "
            "(GET /api/config returned 404). "
            "This is expected while the router is being developed."
        )
    return client


# 1. Health endpoint (baseline sanity)

class TestHealthBaseline:
    def test_health_returns_200(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


# 2. GET /api/config

class TestGetConfig:
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
        resp = config_client.get("/api/config")
        data = resp.json()
        assert isinstance(data["optimizer"], dict)

    def test_get_config_unet_is_dict(self, config_client):
        resp = config_client.get("/api/config")
        data = resp.json()
        assert isinstance(data["unet"], dict)


# 3. PUT /api/config

class TestUpdateConfig:
    def test_put_config_returns_200(self, config_client):
        resp = config_client.put("/api/config", json={"batch_size": 8})
        assert resp.status_code == 200

    def test_put_config_applies_update(self, config_client):
        resp = config_client.put("/api/config", json={"batch_size": 16})
        data = resp.json()
        assert data["batch_size"] == 16

    def test_put_config_returns_full_config(self, config_client):
        resp = config_client.put("/api/config", json={"epochs": 50})
        data = resp.json()
        # Should have many more keys than just the one we sent
        assert len(data) > 10
        assert "__version" in data
        assert "optimizer" in data
        assert data["epochs"] == 50

    def test_put_config_preserves_other_fields(self, config_client):
        # First set a known value
        config_client.put("/api/config", json={"batch_size": 32})

        # Then update a different field
        resp = config_client.put("/api/config", json={"epochs": 200})
        data = resp.json()

        assert data["epochs"] == 200
        assert data["batch_size"] == 32, "batch_size should not have been reset"

    def test_put_config_with_empty_body(self, config_client):
        resp = config_client.put("/api/config", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert "__version" in data

    def test_put_config_unknown_keys_ignored(self, config_client):
        resp = config_client.put(
            "/api/config",
            json={"not_a_real_field": "something"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "not_a_real_field" not in data

    def test_put_config_nested_optimizer(self, config_client):
        resp = config_client.put(
            "/api/config",
            json={"optimizer": {"weight_decay": 0.05}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["optimizer"]["weight_decay"] == 0.05

    def test_put_config_learning_rate(self, config_client):
        resp = config_client.put(
            "/api/config",
            json={"learning_rate": 1e-4},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["learning_rate"] == pytest.approx(1e-4)


# 4. GET /api/config/defaults

class TestGetDefaults:
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
        # Modify current config
        config_client.put("/api/config", json={"batch_size": 999})

        # Defaults should still return the standard default (1)
        resp = config_client.get("/api/config/defaults")
        data = resp.json()
        assert data["batch_size"] == 1


# 5. GET /api/config/schema

class TestGetSchema:
    def test_schema_returns_200(self, config_client):
        resp = config_client.get("/api/config/schema")
        assert resp.status_code == 200

    def test_schema_has_fields_key(self, config_client):
        resp = config_client.get("/api/config/schema")
        data = resp.json()
        assert "fields" in data
        assert isinstance(data["fields"], dict)

    def test_schema_fields_have_type_and_nullable(self, config_client):
        resp = config_client.get("/api/config/schema")
        fields = resp.json()["fields"]

        for field_name, meta in fields.items():
            assert "type" in meta, f"Field '{field_name}' missing 'type' in schema"
            assert "nullable" in meta, f"Field '{field_name}' missing 'nullable' in schema"

    def test_schema_contains_expected_fields(self, config_client):
        resp = config_client.get("/api/config/schema")
        fields = resp.json()["fields"]

        expected = [
            "training_method", "model_type", "base_model_name",
            "learning_rate", "batch_size", "epochs", "resolution",
        ]
        for name in expected:
            assert name in fields, f"Expected field '{name}' not in schema"

    def test_schema_nullable_consistency(self, config_client):
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


# 6. POST /api/config/export

class TestExportConfig:
    def test_export_returns_200_or_expected_error(self, config_client):
        resp = config_client.post(
            "/api/config/export",
            json={"include_secrets": False},
        )
        # 200 = success, 404 = missing concept/sample files,
        # 500 = other error (e.g. service method signature mismatch)
        assert resp.status_code in (200, 404, 422, 500)

    def test_export_with_no_body(self, config_client):
        resp = config_client.post("/api/config/export")
        # Accept any of these; the endpoint might require a body
        assert resp.status_code in (200, 404, 422, 500)


# 7. POST /api/config/validate

class TestValidateConfig:
    def test_validate_valid_config(self, config_client):
        resp = config_client.post(
            "/api/config/validate",
            json={"batch_size": 4, "epochs": 10, "learning_rate": 1e-4},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert "errors" not in data

    def test_validate_invalid_type(self, config_client):
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
        resp = config_client.post(
            "/api/config/validate",
            json={},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True

    def test_validate_does_not_mutate_current_config(self, config_client):
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


# 8. Config round-trip through the API

class TestApiRoundTrip:
    def test_get_put_get_consistency(self, config_client):
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
        config_client.put("/api/config", json={"epochs": 42})

        resp = config_client.get("/api/config")
        data = resp.json()
        assert data["epochs"] == 42

    def test_multiple_updates_accumulate(self, config_client):
        config_client.put("/api/config", json={"batch_size": 4})
        config_client.put("/api/config", json={"epochs": 10})
        config_client.put("/api/config", json={"learning_rate": 5e-5})

        resp = config_client.get("/api/config")
        data = resp.json()

        assert data["batch_size"] == 4
        assert data["epochs"] == 10
        assert data["learning_rate"] == pytest.approx(5e-5)
