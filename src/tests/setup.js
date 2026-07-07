import { vi } from "vitest";

// Mock bcryptjs to make password hashing and comparison instant (0ms) in tests
vi.mock("bcryptjs", () => ({
  default: {
    hash: async (password) => `mocked-hash:${password}`,
    compare: async (password, hash) => hash === `mocked-hash:${password}` || hash === password,
  },
}));
