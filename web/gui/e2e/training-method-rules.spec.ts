import { test, expect, APIRequestContext } from "@playwright/test";

const API_BASE = process.env.API_URL || "http://localhost:8000";

/**
 * All four training methods from modules/util/enum/TrainingMethod.py.
 */
const TRAINING_METHODS = [
  "FINE_TUNE",
  "LORA",
  "EMBEDDING",
  "FINE_TUNE_VAE",
] as const;

test.describe("Training Method Rules Tests", () => {
  let api: APIRequestContext;
  let originalConfig: Record<string, unknown>;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: API_BASE });

    // Verify backend is reachable
    const health = await api.get("/api/health");
    if (!health.ok()) {
      test.skip();
    }

    // Save original config to restore at the end
    const configRes = await api.get("/api/config");
    originalConfig = await configRes.json();
  });

  test.afterAll(async () => {
    // Restore original training method
    if (originalConfig) {
      await api.put("/api/config", {
        data: { training_method: originalConfig.training_method },
      });
    }
    await api.dispose();
  });

  for (const method of TRAINING_METHODS) {
    test(`switching to ${method} persists correctly`, async () => {
      // PUT the new training method
      const putRes = await api.put("/api/config", {
        data: { training_method: method },
      });
      expect(putRes.status()).toBe(200);

      const putBody = await putRes.json();
      expect(putBody.training_method).toBe(method);

      // GET to verify the change persisted
      const getRes = await api.get("/api/config");
      expect(getRes.status()).toBe(200);

      const config = await getRes.json();
      expect(config.training_method).toBe(method);
    });
  }

  test("switching training method preserves model_type", async () => {
    // GET original model_type
    const originalRes = await api.get("/api/config");
    const original = await originalRes.json();
    const originalModelType = original.model_type;

    // Switch training method to something different than current
    const targetMethod =
      original.training_method === "LORA" ? "FINE_TUNE" : "LORA";

    const putRes = await api.put("/api/config", {
      data: { training_method: targetMethod },
    });
    expect(putRes.status()).toBe(200);

    // Verify model_type is unchanged
    const verifyRes = await api.get("/api/config");
    const verified = await verifyRes.json();
    expect(verified.training_method).toBe(targetMethod);
    expect(verified.model_type).toBe(originalModelType);

    // Restore
    await api.put("/api/config", {
      data: { training_method: original.training_method },
    });
  });

  test("switching training method preserves learning_rate and epochs", async () => {
    // Set known values
    const testValues = { learning_rate: 0.000456, epochs: 7 };
    await api.put("/api/config", { data: testValues });

    // Switch through all training methods
    for (const method of TRAINING_METHODS) {
      await api.put("/api/config", {
        data: { training_method: method },
      });
    }

    // After all switches, verify the numeric fields are preserved
    const finalRes = await api.get("/api/config");
    const finalConfig = await finalRes.json();
    expect(finalConfig.learning_rate).toBeCloseTo(testValues.learning_rate, 6);
    expect(finalConfig.epochs).toBe(testValues.epochs);

    // Restore original values
    await api.put("/api/config", {
      data: {
        learning_rate: originalConfig.learning_rate,
        epochs: originalConfig.epochs,
        training_method: originalConfig.training_method,
      },
    });
  });

  test("cycling through all training methods and back to original yields consistent config", async () => {
    // GET starting config
    const startRes = await api.get("/api/config");
    const startConfig = await startRes.json();

    // Cycle through all methods
    for (const method of TRAINING_METHODS) {
      const putRes = await api.put("/api/config", {
        data: { training_method: method },
      });
      expect(putRes.status()).toBe(200);
    }

    // Restore original training method
    await api.put("/api/config", {
      data: { training_method: startConfig.training_method },
    });

    // GET final config
    const finalRes = await api.get("/api/config");
    const finalConfig = await finalRes.json();

    // The training_method should match the original
    expect(finalConfig.training_method).toBe(startConfig.training_method);
    // Other core fields should be preserved
    expect(finalConfig.model_type).toBe(startConfig.model_type);
    expect(finalConfig.epochs).toBe(startConfig.epochs);
  });
});
