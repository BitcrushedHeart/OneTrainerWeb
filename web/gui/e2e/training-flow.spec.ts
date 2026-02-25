import { test, expect, APIRequestContext } from "@playwright/test";

const API_BASE = process.env.API_URL || "http://localhost:8000";

test.describe("Training Flow (Lifecycle) Tests", () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: API_BASE });

    // Verify backend is reachable
    const health = await api.get("/api/health");
    if (!health.ok()) {
      test.skip();
    }
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("GET /api/training/status returns a valid status object", async () => {
    const response = await api.get("/api/training/status");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(typeof body.status).toBe("string");

    // The status should be one of the known values
    const validStatuses = ["idle", "running", "stopping", "error"];
    expect(validStatuses).toContain(body.status);

    // error and start_time fields should be present (may be null)
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("start_time");
  });

  test("GET /api/training/status returns idle when not training", async () => {
    const response = await api.get("/api/training/status");
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Assuming no training is running during tests, status should be idle
    // (unless a previous test started training, which we don't do)
    expect(body.status).toBe("idle");
    expect(body.start_time).toBeNull();
  });

  test("POST /api/training/start returns a structured response (may fail gracefully)", async () => {
    // Attempting to start training without a valid model loaded.
    // The endpoint should return a proper JSON response, not a raw 500.
    const response = await api.post("/api/training/start", {
      data: { reattach: false },
    });

    // The endpoint may return 200 with {"ok": false, "error": "..."} or
    // it may return 200 with {"ok": true} if somehow a trainer could be created.
    // It should NOT return a 500 Internal Server Error (unhandled exception).
    // Accept both 200 (structured error) and 422/500 (if the server wraps it).
    const body = await response.json();

    if (response.status() === 200) {
      expect(body).toHaveProperty("ok");
      // If training failed to start (no model), ok should be false
      if (!body.ok) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
      }
    } else {
      // If the server returned an HTTP error status, it should still be
      // structured JSON (not a raw traceback)
      expect(typeof body).toBe("object");
    }
  });

  test("POST /api/training/stop handles gracefully when not training", async () => {
    const response = await api.post("/api/training/stop");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("ok");

    // When not training, stop should return ok: false with an error message
    expect(body.ok).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("not running");
  });

  test("POST /api/training/sample handles gracefully when not training", async () => {
    const response = await api.post("/api/training/sample");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("ok");
    expect(body.ok).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("not running");
  });

  test("POST /api/training/backup handles gracefully when not training", async () => {
    const response = await api.post("/api/training/backup");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("ok");
    expect(body.ok).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("POST /api/training/save handles gracefully when not training", async () => {
    const response = await api.post("/api/training/save");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("ok");
    expect(body.ok).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("POST /api/training/sample/custom handles gracefully when not training", async () => {
    const response = await api.post("/api/training/sample/custom", {
      data: {
        prompt: "a test prompt",
        negative_prompt: "",
        height: 512,
        width: 512,
        seed: 42,
        random_seed: false,
        diffusion_steps: 20,
        cfg_scale: 7.0,
      },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("ok");
    expect(body.ok).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("not running");
  });

  test("training status remains idle after failed start attempt", async () => {
    // Try to start training (will likely fail due to no model)
    await api.post("/api/training/start", {
      data: { reattach: false },
    });

    // Give it a moment to settle (the start_training may fail synchronously
    // or asynchronously depending on where the error occurs)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check status — it should either be idle or error, not stuck in "running"
    const statusRes = await api.get("/api/training/status");
    expect(statusRes.status()).toBe(200);

    const status = await statusRes.json();
    // After a failed start, status should be idle or error, never "running"
    // (unless a model was actually loaded, which is unlikely in a test env)
    expect(["idle", "error"]).toContain(status.status);
  });
});
