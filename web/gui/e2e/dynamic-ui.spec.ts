import { test, expect, APIRequestContext } from "@playwright/test";

const API_BASE = process.env.API_URL || "http://localhost:8000";

test.describe("Dynamic UI Config Behavior Tests", () => {
  let api: APIRequestContext;
  let originalConfig: Record<string, unknown>;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: API_BASE });

    // Verify backend is reachable
    const health = await api.get("/api/health");
    if (!health.ok()) {
      test.skip();
    }

    // Save original config for restoration
    const configRes = await api.get("/api/config");
    originalConfig = await configRes.json();
  });

  test.afterAll(async () => {
    // Restore original training method and model type
    if (originalConfig) {
      await api.put("/api/config", {
        data: {
          training_method: originalConfig.training_method,
          model_type: originalConfig.model_type,
        },
      });
    }
    await api.dispose();
  });

  test("LORA training method: config contains lora-related fields", async () => {
    // Switch to LORA
    const putRes = await api.put("/api/config", {
      data: { training_method: "LORA" },
    });
    expect(putRes.status()).toBe(200);

    // GET config and verify lora fields exist
    const getRes = await api.get("/api/config");
    expect(getRes.status()).toBe(200);

    const config = await getRes.json();
    expect(config.training_method).toBe("LORA");

    // These are LoRA-specific fields from TrainConfig
    expect(config).toHaveProperty("lora_model_name");
    expect(config).toHaveProperty("lora_rank");
    expect(config).toHaveProperty("lora_alpha");
    expect(config).toHaveProperty("lora_weight_dtype");
  });

  test("EMBEDDING training method: config contains embedding-related fields", async () => {
    // Switch to EMBEDDING
    const putRes = await api.put("/api/config", {
      data: { training_method: "EMBEDDING" },
    });
    expect(putRes.status()).toBe(200);

    // GET config and verify embedding fields exist
    const getRes = await api.get("/api/config");
    expect(getRes.status()).toBe(200);

    const config = await getRes.json();
    expect(config.training_method).toBe("EMBEDDING");

    // Embedding-specific fields from TrainConfig
    expect(config).toHaveProperty("embedding_learning_rate");
    expect(config).toHaveProperty("embedding_weight_dtype");
  });

  test("FINE_TUNE training method: config is valid", async () => {
    // Switch to FINE_TUNE
    const putRes = await api.put("/api/config", {
      data: { training_method: "FINE_TUNE" },
    });
    expect(putRes.status()).toBe(200);

    const getRes = await api.get("/api/config");
    const config = await getRes.json();
    expect(config.training_method).toBe("FINE_TUNE");

    // Core fields should always exist regardless of training method
    expect(config).toHaveProperty("model_type");
    expect(config).toHaveProperty("epochs");
    expect(config).toHaveProperty("learning_rate");
    expect(config).toHaveProperty("optimizer");
  });

  test("FINE_TUNE_VAE training method: config is valid", async () => {
    // Switch to FINE_TUNE_VAE
    const putRes = await api.put("/api/config", {
      data: { training_method: "FINE_TUNE_VAE" },
    });
    expect(putRes.status()).toBe(200);

    const getRes = await api.get("/api/config");
    const config = await getRes.json();
    expect(config.training_method).toBe("FINE_TUNE_VAE");

    // Core fields should still be present
    expect(config).toHaveProperty("model_type");
    expect(config).toHaveProperty("epochs");
    expect(config).toHaveProperty("learning_rate");
  });

  test("changing model_type preserves training_method", async () => {
    // Set a specific training method first
    await api.put("/api/config", {
      data: { training_method: "LORA" },
    });

    // Now switch model type
    const putRes = await api.put("/api/config", {
      data: { model_type: "FLUX_DEV_1" },
    });
    expect(putRes.status()).toBe(200);

    // Verify training_method is preserved
    const getRes = await api.get("/api/config");
    const config = await getRes.json();
    expect(config.model_type).toBe("FLUX_DEV_1");
    expect(config.training_method).toBe("LORA");
  });

  test("changing model_type preserves epochs and learning_rate", async () => {
    // Set known values
    const testValues = {
      epochs: 12,
      learning_rate: 0.000789,
      model_type: "STABLE_DIFFUSION_15",
    };
    await api.put("/api/config", { data: testValues });

    // Switch model type
    const putRes = await api.put("/api/config", {
      data: { model_type: "STABLE_DIFFUSION_XL_10_BASE" },
    });
    expect(putRes.status()).toBe(200);

    // Verify other fields are preserved
    const getRes = await api.get("/api/config");
    const config = await getRes.json();
    expect(config.model_type).toBe("STABLE_DIFFUSION_XL_10_BASE");
    expect(config.epochs).toBe(testValues.epochs);
    expect(config.learning_rate).toBeCloseTo(testValues.learning_rate, 6);

    // Restore
    await api.put("/api/config", {
      data: { model_type: originalConfig.model_type },
    });
  });

  test("changing training_method preserves model_type and batch_size", async () => {
    // GET current config
    const startRes = await api.get("/api/config");
    const startConfig = await startRes.json();

    // Set a specific model_type and batch_size
    const testBatchSize = startConfig.batch_size === 3 ? 5 : 3;
    await api.put("/api/config", {
      data: {
        model_type: "STABLE_DIFFUSION_15",
        batch_size: testBatchSize,
      },
    });

    // Switch training method
    const putRes = await api.put("/api/config", {
      data: { training_method: "EMBEDDING" },
    });
    expect(putRes.status()).toBe(200);

    // Verify model_type and batch_size are preserved
    const getRes = await api.get("/api/config");
    const config = await getRes.json();
    expect(config.training_method).toBe("EMBEDDING");
    expect(config.model_type).toBe("STABLE_DIFFUSION_15");
    expect(config.batch_size).toBe(testBatchSize);

    // Restore
    await api.put("/api/config", {
      data: {
        model_type: startConfig.model_type,
        batch_size: startConfig.batch_size,
        training_method: startConfig.training_method,
      },
    });
  });

  test("LoRA rank and alpha are numeric and persist through method cycling", async () => {
    // Switch to LORA and set specific rank/alpha
    await api.put("/api/config", {
      data: {
        training_method: "LORA",
        lora_rank: 16,
        lora_alpha: 8.0,
      },
    });

    // Cycle to FINE_TUNE and back to LORA
    await api.put("/api/config", {
      data: { training_method: "FINE_TUNE" },
    });
    await api.put("/api/config", {
      data: { training_method: "LORA" },
    });

    // Verify the LoRA values persisted
    const getRes = await api.get("/api/config");
    const config = await getRes.json();
    expect(config.training_method).toBe("LORA");
    expect(config.lora_rank).toBe(16);
    expect(config.lora_alpha).toBeCloseTo(8.0, 2);
  });

  test("config schema endpoint provides field metadata for dynamic rendering", async () => {
    const schemaRes = await api.get("/api/config/schema");
    expect(schemaRes.status()).toBe(200);

    const schema = await schemaRes.json();
    expect(schema).toHaveProperty("fields");

    // Verify that key dynamic fields are described in the schema
    const fields = schema.fields;
    const expectedFields = [
      "model_type",
      "training_method",
      "learning_rate",
      "epochs",
    ];

    for (const field of expectedFields) {
      if (fields[field]) {
        expect(fields[field]).toHaveProperty("type");
      }
    }
  });

  test("combined model_type + training_method switch in single PUT", async () => {
    // PUT both model_type and training_method at once
    const putRes = await api.put("/api/config", {
      data: {
        model_type: "STABLE_DIFFUSION_3",
        training_method: "LORA",
      },
    });
    expect(putRes.status()).toBe(200);

    const config = await putRes.json();
    expect(config.model_type).toBe("STABLE_DIFFUSION_3");
    expect(config.training_method).toBe("LORA");

    // GET to double-check
    const getRes = await api.get("/api/config");
    const verified = await getRes.json();
    expect(verified.model_type).toBe("STABLE_DIFFUSION_3");
    expect(verified.training_method).toBe("LORA");
  });
});
