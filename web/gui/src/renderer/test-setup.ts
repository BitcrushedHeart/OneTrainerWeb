/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";

// Mock fetch globally for API tests
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock requestAnimationFrame / cancelAnimationFrame for hooks that use them
globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  return setTimeout(() => cb(Date.now()), 0) as unknown as number;
};

globalThis.cancelAnimationFrame = (id: number): void => {
  clearTimeout(id);
};

// Reset all mocks between tests
afterEach(() => {
  vi.restoreAllMocks();
  mockFetch.mockReset();
});

export { mockFetch };
