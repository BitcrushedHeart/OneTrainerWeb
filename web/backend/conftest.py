import os
import sys

import pytest
from fastapi.testclient import TestClient

# Ensure project root is in path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from web.backend.main import app


@pytest.fixture
def client():
    return TestClient(app)
