import { test, expect, APIRequestContext } from "@playwright/test";

const API_BASE = process.env.API_URL || "http://localhost:8000";

test.describe("Config Round-Trip Tests", () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: API_BASE });

    // Verify backend is reachable before running tests
    const health = await api.get("/api/health");
    if (!health.ok()) {
      test.skip();
    }
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("GET /api/config returns a valid config object", async () => {
    const response = await api.get("/api/config");
    expect(response.status()).toBe(200);

    const config = await response.json();
    expect(typeof config).toBe("object");
    expect(config).not.toBeNull();
    expect(config).toHaveProperty("model_type");
    expect(config).toHaveProperty("training_method");
    expect(config).toHaveProperty("learning_rate");
  });

  test("full round-trip: GET -> PUT modified -> GET verify -> PUT restore -> GET verify", async () => {
    // 1. GET original config
    const originalRes = await api.get("/api/config");
    expect(originalRes.status()).toBe(200);
    const original = await originalRes.json();

    const originalEpochs = original.epochs;
    const modifiedEpochs = originalEpochs === 10 ? 20 : 10;

    // 2. PUT modified fields
    const putRes = await api.put("/api/config", {
      data: { epochs: modifiedEpochs },
    });
    expect(putRes.status()).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.epochs).toBe(modifiedEpochs);

    // 3. GET to verify the modification persisted
    const verifyRes = await api.get("/api/config");
    expect(verifyRes.status()).toBe(200);
    const verified = await verifyRes.json();
    expect(verified.epochs).toBe(modifiedEpochs);

    // 4. PUT original value back to restore
    const restoreRes = await api.put("/api/config", {
      data: { epochs: originalEpochs },
    });
    expect(restoreRes.status()).toBe(200);

    // 5. GET to verify restoration matches original
    const restoredRes = await api.get("/api/config");
    expect(restoredRes.status()).toBe(200);
    const restored = await restoredRes.json();
    expect(restored.epochs).toBe(originalEpochs);
  });

  test("modifying learning_rate round-trips correctly", async () => {
    // GET original
    const originalRes = await api.get("/api/config");
    const original = await originalRes.json();
    const originalLR = original.learning_rate;

    const modifiedLR = 0.00042;

    // PUT modified
    const putRes = await api.put("/api/config", {
      data: { learning_rate: modifiedLR },
    });
    expect(putRes.status()).toBe(200);

    // GET verify
    const verifyRes = await api.get("/api/config");
    const verified = await verifyRes.json();
    expect(verified.learning_rate).toBeCloseTo(modifiedLR, 6);

    // Restore
    await api.put("/api/config", {
      data: { learning_rate: originalLR },
    });
  });

  test("modifying multiple fields at once persists all changes", async () => {
    // GET original
    const originalRes = await api.get("/api/config");
    const original = await originalRes.json();

    const modifications = {
      epochs: original.epochs === 5 ? 15 : 5,
      batch_size: original.batch_size === 2 ? 4 : 2,
    };

    // PUT modified
    const putRes = await api.put("/api/config", { data: modifications });
    expect(putRes.status()).toBe(200);

    // GET verify all changes
    const verifyRes = await api.get("/api/config");
    const verified = await verifyRes.json();
    expect(verified.epochs).toBe(modifications.epochs);
    expect(verified.batch_size).toBe(modifications.batch_size);

    // Restore
    await api.put("/api/config", {
      data: {
        epochs: original.epochs,
        batch_size: original.batch_size,
      },
    });
  });

  test("unknown fields are silently ignored (not rejected)", async () => {
    // PUT a payload containing a field that does not exist on TrainConfig
    const putRes = await api.put("/api/config", {
      data: {
        __nonexistent_test_field_xyz: "should_be_ignored",
        __another_fake_field: 12345,
      },
    });
    // The API should accept the request (from_dict silently drops unknown keys)
    expect(putRes.status()).toBe(200);

    // GET the config and verify the unknown fields are NOT present
    const getRes = await api.get("/api/config");
    const config = await getRes.json();
    expect(config).not.toHaveProperty("__nonexistent_test_field_xyz");
    expect(config).not.toHaveProperty("__another_fake_field");
  });

  test("config serialization is idempotent (GET -> PUT whole -> GET yields same)", async () => {
    // GET the full config
    const firstRes = await api.get("/api/config");
    expect(firstRes.status()).toBe(200);
    const firstConfig = await firstRes.json();

    // PUT the full config back unchanged
    const putRes = await api.put("/api/config", { data: firstConfig });
    expect(putRes.status()).toBe(200);

    // GET again — should be identical
    const secondRes = await api.get("/api/config");
    expect(secondRes.status()).toBe(200);
    const secondConfig = await secondRes.json();

    // Compare key-by-key for top-level fields.
    // We compare JSON representations to handle nested objects and arrays.
    expect(JSON.stringify(secondConfig)).toBe(JSON.stringify(firstConfig));
  });

  test("nested optimizer settings can be updated via partial PUT", async () => {
    // GET original to capture the current optimizer sub-object
    const originalRes = await api.get("/api/config");
    const original = await originalRes.json();
    const originalOptimizer = original.optimizer;

    // Modify a nested field (optimizer.weight_decay is commonly present)
    const modifiedWeightDecay =
      originalOptimizer.weight_decay === 0.01 ? 0.02 : 0.01;

    const putRes = await api.put("/api/config", {
      data: {
        optimizer: {
          ...originalOptimizer,
          weight_decay: modifiedWeightDecay,
        },
      },
    });
    expect(putRes.status()).toBe(200);

    // GET and verify
    const verifyRes = await api.get("/api/config");
    const verified = await verifyRes.json();
    expect(verified.optimizer.weight_decay).toBeCloseTo(
      modifiedWeightDecay,
      6,
    );

    // Restore
    await api.put("/api/config", {
      data: { optimizer: originalOptimizer },
    });
  });

  test("validate endpoint accepts valid partial config", async () => {
    const validateRes = await api.post("/api/config/validate", {
      data: { epochs: 10, learning_rate: 0.001 },
    });
    expect(validateRes.status()).toBe(200);

    const body = await validateRes.json();
    expect(body).toHaveProperty("valid", true);
  });

  test("defaults endpoint returns a complete config", async () => {
    const defaultsRes = await api.get("/api/config/defaults");
    expect(defaultsRes.status()).toBe(200);

    const defaults = await defaultsRes.json();
    expect(defaults).toHaveProperty("model_type");
    expect(defaults).toHaveProperty("training_method");
    expect(defaults).toHaveProperty("epochs");
    expect(defaults).toHaveProperty("learning_rate");
    expect(defaults).toHaveProperty("optimizer");
  });

  test("schema endpoint returns field metadata", async () => {
    const schemaRes = await api.get("/api/config/schema");
    expect(schemaRes.status()).toBe(200);

    const schema = await schemaRes.json();
    expect(schema).toHaveProperty("fields");
    expect(typeof schema.fields).toBe("object");

    // Spot-check a few known fields
    if (schema.fields.model_type) {
      expect(schema.fields.model_type).toHaveProperty("type");
      expect(schema.fields.model_type).toHaveProperty("nullable");
    }
    if (schema.fields.epochs) {
      expect(schema.fields.epochs).toHaveProperty("type");
    }
  });
});
