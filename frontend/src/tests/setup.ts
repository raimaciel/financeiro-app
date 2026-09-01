import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock global do módulo axios/api para que os testes não façam chamadas HTTP reais
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// Limpa todos os mocks após cada teste
afterEach(() => {
  vi.clearAllMocks();
});
