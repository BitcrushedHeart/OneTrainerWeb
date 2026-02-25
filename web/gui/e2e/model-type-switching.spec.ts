import { test, expect, APIRequestContext } from "@playwright/test";

const API_BASE = process.env.API_URL || "http://localhost:8000";

/**
 * A representative subset of model types covering diverse architectures.
 * Using the actual enum values from modules/util/enum/ModelType.py.
 */
const MODEL_TYPES = [
  "STABLE_DIFFUSION_15",
  "STABLE_DIFFUSION_XL_10_BASE",
  "STABLE_DIFFUSION_3",
  "FLUX_DEV_1",
  "PIXART_ALPHA",
] as const;

test.describe("Model Type Switching Tests", () => {
  let api: APIRequestContext;
  let originalModelType: string;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: API_BASE });

    // Verify backend is reachable
    const health = await api.get("/api/health");
    if (!health.ok()) {
      test.skip();
    }

    // Save the original model_type to restore later
    const configRes = await api.get("/api/config");
    const config = await configRes.json();
    originalModelType = config.model_type;
  });

  test.afterAll(async () => {
    // Restore the original model type
    if (originalModelType) {
      await api.put("/api/config", {
        data: { model_type: originalModelType },
      });
    }
    await api.dispose();
  });

  for (const modelType of MODEL_TYPES) {
    test(`switching to ${modelType} persists correctly`, async () => {
      // PUT the new model type
      const putRes = await api.put("/api/config", {
        data: { model_type: modelType },
      });
      expect(putRes.status()).toBe(200);

      const putBody = await putRes.json();
      expect(putBody.model_type).toBe(modelType);

      // GET to verify the change persisted in the in-memory config
      const getRes = await api.get("/api/config");
      expect(getRes.status()).toBe(200);

      const config = await getRes.json();
      expect(config.model_type).toBe(modelType);
    });
  }

  test("defaults endpoint works regardless of current model type", async () => {
    // The defaults endpoint returns a freshly-constructed config, independent
    // of the current in-memory model_type.
    const defaultsRes = await api.get("/api/config/defaults");
    expect(defaultsRes.status()).toBe(200);

    const defaults = await defaultsRes.json();
    expect(defaults).toHaveProperty("model_type");
    expect(typeof defaults.model_type).toBe("string");
  });

  test("defaults endpoint returns consistent results across calls", async () => {
    const res1 = await api.get("/api/config/defaults");
    const res2 = await api.get("/api/config/defaults");

    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    const defaults1 = await res1.json();
    const defaults2 = await res2.json();

    expect(JSON.stringify(defaults1)).toBe(JSON.stringify(defaults2));
  });

  test("switching model type preserves unrelated fields", async () => {
    // Set a known learning_rate and then switch model type
    const originalRes = await api.get("/api/config");
    const original = await originalRes.json();

    const testLR = 0.000123;
    await api.put("/api/config", {
      data: { learning_rate: testLR },
    });

    // Switch to a different model type
    const targetType =
      original.model_type === "STABLE_DIFFUSION_15"
        ? "FLUX_DEV_1"
        : "STABLE_DIFFUSION_15";

    const switchRes = await api.put("/api/config", {
      data: { model_type: targetType },
    });
    expect(switchRes.status()).toBe(200);

    // Verify learning_rate is preserved after model type switch
    const verifyRes = await api.get("/api/config");
    const verified = await verifyRes.json();
    expect(verified.model_type).toBe(targetType);
    expect(verified.learning_rate).toBeCloseTo(testLR, 6);

    // Restore
    await api.put("/api/config", {
      data: {
        model_type: original.model_type,
        learning_rate: original.learning_rate,
      },
    });
  });

  test("rapid model type switching does not corrupt config", async () => {
    // Quickly switch through several model types
    for (const modelType of MODEL_TYPES) {
      const putRes = await api.put("/api/config", {
        data: { model_type: modelType },
      });
      expect(putRes.status()).toBe(200);
    }

    // After all switches, GET should return a valid config
    const finalRes = await api.get("/api/config");
    expect(finalRes.status()).toBe(200);

    const finalConfig = await finalRes.json();
    expect(finalConfig).toHaveProperty("model_type");
    expect(finalConfig).toHaveProperty("training_method");
    expect(finalConfig).toHaveProperty("epochs");
    expect(finalConfig).toHaveProperty("learning_rate");

    // The final model type should be the last one we set
    expect(finalConfig.model_type).toBe(MODEL_TYPES[MODEL_TYPES.length - 1]);
  });
});
