import { test, expect, APIRequestContext } from "@playwright/test";

const API_BASE = process.env.API_URL || "http://localhost:8000";

/**
 * A subset of optimizer enum values from modules/util/enum/Optimizer.py.
 * These are common optimizers that should always be available.
 */
const TEST_OPTIMIZERS = [
  "ADAMW",
  "ADAMW_8BIT",
  "ADAM",
  "SGD",
  "LION",
] as const;

test.describe("Optimizer Change Tests", () => {
  let api: APIRequestContext;
  let originalConfig: Record<string, unknown>;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: API_BASE });

    // Verify backend is reachable
    const health = await api.get("/api/health");
    if (!health.ok()) {
      test.skip();
    }

    // Save original config to restore later
    const configRes = await api.get("/api/config");
    originalConfig = await configRes.json();
  });

  test.afterAll(async () => {
    // Restore the original optimizer setting
    if (originalConfig) {
      await api.put("/api/config", {
        data: { optimizer: originalConfig.optimizer },
      });
    }
    await api.dispose();
  });

  test("optimizer field exists in config and has expected structure", async () => {
    const response = await api.get("/api/config");
    expect(response.status()).toBe(200);

    const config = await response.json();
    expect(config).toHaveProperty("optimizer");
    expect(typeof config.optimizer).toBe("object");
    expect(config.optimizer).toHaveProperty("optimizer");
  });

  test("changing optimizer via config PUT persists the selection", async () => {
    const currentConfig = await (await api.get("/api/config")).json();
    const currentOptimizer = currentConfig.optimizer.optimizer;

    // Choose a different optimizer
    const targetOptimizer =
      currentOptimizer === "ADAMW_8BIT" ? "SGD" : "ADAMW_8BIT";

    // PUT the full optimizer sub-object with just the optimizer enum changed
    const putRes = await api.put("/api/config", {
      data: {
        optimizer: {
          ...currentConfig.optimizer,
          optimizer: targetOptimizer,
        },
      },
    });
    expect(putRes.status()).toBe(200);

    // GET and verify
    const verifyRes = await api.get("/api/config");
    const verified = await verifyRes.json();
    expect(verified.optimizer.optimizer).toBe(targetOptimizer);

    // Restore
    await api.put("/api/config", {
      data: { optimizer: currentConfig.optimizer },
    });
  });

  for (const optimizer of TEST_OPTIMIZERS) {
    test(`switching to optimizer ${optimizer} via config update`, async () => {
      const currentConfig = await (await api.get("/api/config")).json();

      // Update the optimizer selection
      const putRes = await api.put("/api/config", {
        data: {
          optimizer: {
            ...currentConfig.optimizer,
            optimizer: optimizer,
          },
        },
      });
      expect(putRes.status()).toBe(200);

      const putBody = await putRes.json();
      expect(putBody.optimizer.optimizer).toBe(optimizer);

      // GET to verify persistence
      const getRes = await api.get("/api/config");
      const config = await getRes.json();
      expect(config.optimizer.optimizer).toBe(optimizer);
    });
  }

  test("optimizer change preserves other config fields (epochs, learning_rate)", async () => {
    // Set known values
    const testEpochs = 13;
    const testLR = 0.000321;
    await api.put("/api/config", {
      data: { epochs: testEpochs, learning_rate: testLR },
    });

    // Change the optimizer
    const currentConfig = await (await api.get("/api/config")).json();
    const targetOpt =
      currentConfig.optimizer.optimizer === "LION" ? "ADAMW" : "LION";

    await api.put("/api/config", {
      data: {
        optimizer: {
          ...currentConfig.optimizer,
          optimizer: targetOpt,
        },
      },
    });

    // Verify epochs and learning_rate are preserved
    const verifyRes = await api.get("/api/config");
    const verified = await verifyRes.json();
    expect(verified.epochs).toBe(testEpochs);
    expect(verified.learning_rate).toBeCloseTo(testLR, 6);
    expect(verified.optimizer.optimizer).toBe(targetOpt);

    // Restore
    await api.put("/api/config", {
      data: {
        epochs: (originalConfig as Record<string, unknown>).epochs,
        learning_rate: (originalConfig as Record<string, unknown>).learning_rate,
        optimizer: (originalConfig as Record<string, unknown>).optimizer,
      },
    });
  });

  test("optimizer weight_decay can be modified", async () => {
    const currentConfig = await (await api.get("/api/config")).json();
    const originalWeightDecay = currentConfig.optimizer.weight_decay;

    const testWeightDecay = originalWeightDecay === 0.05 ? 0.1 : 0.05;

    // Modify weight_decay within the optimizer sub-object
    const putRes = await api.put("/api/config", {
      data: {
        optimizer: {
          ...currentConfig.optimizer,
          weight_decay: testWeightDecay,
        },
      },
    });
    expect(putRes.status()).toBe(200);

    // Verify
    const verified = await (await api.get("/api/config")).json();
    expect(verified.optimizer.weight_decay).toBeCloseTo(testWeightDecay, 6);

    // Restore
    await api.put("/api/config", {
      data: {
        optimizer: {
          ...currentConfig.optimizer,
          weight_decay: originalWeightDecay,
        },
      },
    });
  });

  test("switching optimizer back and forth retains the optimizer selection", async () => {
    const currentConfig = await (await api.get("/api/config")).json();
    const firstOpt = "ADAMW";
    const secondOpt = "SGD";

    // Switch to first
    await api.put("/api/config", {
      data: {
        optimizer: { ...currentConfig.optimizer, optimizer: firstOpt },
      },
    });
    let config = await (await api.get("/api/config")).json();
    expect(config.optimizer.optimizer).toBe(firstOpt);

    // Switch to second
    await api.put("/api/config", {
      data: {
        optimizer: { ...config.optimizer, optimizer: secondOpt },
      },
    });
    config = await (await api.get("/api/config")).json();
    expect(config.optimizer.optimizer).toBe(secondOpt);

    // Switch back to first
    await api.put("/api/config", {
      data: {
        optimizer: { ...config.optimizer, optimizer: firstOpt },
      },
    });
    config = await (await api.get("/api/config")).json();
    expect(config.optimizer.optimizer).toBe(firstOpt);

    // Restore
    await api.put("/api/config", {
      data: { optimizer: currentConfig.optimizer },
    });
  });

  test("defaults endpoint includes optimizer with default values", async () => {
    const defaultsRes = await api.get("/api/config/defaults");
    expect(defaultsRes.status()).toBe(200);

    const defaults = await defaultsRes.json();
    expect(defaults).toHaveProperty("optimizer");
    expect(typeof defaults.optimizer).toBe("object");
    expect(defaults.optimizer).toHaveProperty("optimizer");
    expect(typeof defaults.optimizer.optimizer).toBe("string");
  });
});
