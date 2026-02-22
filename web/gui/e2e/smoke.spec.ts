import { test, expect, APIRequestContext } from "@playwright/test";

const API_BASE = process.env.API_URL || "http://localhost:8000";

test.describe("API Smoke Tests", () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({
      baseURL: API_BASE,
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("Health endpoint responds", async () => {
    const response = await api.get("/api/health");

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status", "ok");
  });

  test("Default config loads", async () => {
    const response = await api.get("/api/config");

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("model_type");
    expect(body).toHaveProperty("training_method");
    expect(body).toHaveProperty("learning_rate");
    expect(body).toHaveProperty("epochs");
  });

  test("Defaults endpoint works", async () => {
    const response = await api.get("/api/config/defaults");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // A valid config object must be a non-null object with at least one key
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
    expect(Object.keys(body).length).toBeGreaterThan(0);
  });

  test("Presets list loads", async () => {
    const response = await api.get("/api/presets");

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
