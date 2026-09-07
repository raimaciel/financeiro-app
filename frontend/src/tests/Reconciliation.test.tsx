import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    selectedWorkspaceId: "ws-001",
    selectedWorkspace: { id: "ws-001", name: "Workspace Teste" },
  }),
}));

// Mock Radix Select with native <select> to avoid jsdom scrollIntoView issues
vi.mock("@/components/ui/select", () => {
  const React = require("react");
  const Select = ({ value, onValueChange, children }: any) => {
    const options: { value: string; label: string }[] = [];
    React.Children.forEach(children, (child: any) => {
      if (!child) return;
      const type = child.type?.displayName ?? child.type?.name ?? "";
      if (type.includes("Content") || type.includes("content")) {
        React.Children.forEach(child.props?.children, (item: any) => {
          if (!item) return;
          const itype = item.type?.displayName ?? item.type?.name ?? "";
          if (itype.includes("Item") || itype.includes("item")) {
            const label = typeof item.props?.children === "string"
              ? item.props.children
              : item.props?.value ?? "";
            options.push({ value: item.props?.value ?? "", label });
          }
        });
      }
    });
    return (
      <select
        data-testid="select-reconciliation-account"
        value={value ?? ""}
        onChange={(e) => onValueChange?.(e.target.value)}
        role="combobox"
      >
        <option value="">Selecione uma conta...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} role="option">
            {o.label}
          </option>
        ))}
      </select>
    );
  };
  const SelectTrigger = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const SelectContent = ({ children }: any) => <div>{children}</div>;
  const SelectItem = ({ value, children }: any) => <div role="option" data-value={value}>{children}</div>;
  const SelectValue = ({ placeholder }: any) => <span>{placeholder}</span>;
  return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
});

import api from "@/lib/api";
import Reconciliation from "../pages/Reconciliation";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_ACCOUNTS = [
  { id: "acc-1", name: "Conta Corrente", bank_name: "Bradesco", color: "#ff0000", account_type: "checking", initial_balance: 1000, status: "active", workspace_id: "ws-001" },
  { id: "acc-2", name: "Poupanca", bank_name: "Caixa", color: "#00aa00", account_type: "savings", initial_balance: 500, status: "active", workspace_id: "ws-001" },
];

const MOCK_MATCH_RESPONSE = {
  account: { id: "acc-1", name: "Conta Corrente", bank_name: "Bradesco" },
  total_items: 3,
  matched_exact_count: 1,
  matched_approximate_count: 1,
  unmatched_count: 1,
  items: [
    {
      id: "item-1", date: "2026-09-10", amount: 150, description: "Supermercado",
      type: "expense", category_id: null, category_name: null, external_id: "fitid-001",
      status: "matched_exact", confidence: "high", suggested_action: "ignore",
      matched_transaction: { id: 101, date: "2026-09-10", amount: 150, description: "Supermercado Mensal", type: "expense", reconciled: 0 },
    },
    {
      id: "item-2", date: "2026-09-10", amount: 55.9, description: "Netflix",
      type: "expense", category_id: null, category_name: null, external_id: "fitid-002",
      status: "matched_approximate", confidence: "medium", suggested_action: "link_existing",
      difference_days: 2,
      matched_transaction: { id: 102, date: "2026-09-08", amount: 55.9, description: "Netflix Streaming", type: "expense", reconciled: 0 },
    },
    {
      id: "item-3", date: "2026-09-12", amount: 300, description: "Restaurante Novo",
      type: "expense", category_id: null, category_name: null, external_id: "fitid-003",
      status: "unmatched", confidence: "none", suggested_action: "create_new",
      matched_transaction: null,
    },
  ],
};

const MOCK_CONFIRM_RESPONSE = {
  success: true, linked_count: 1, created_count: 1, ignored_count: 1,
  total_processed: 3,
  message: "Conciliacao concluida: 1 criados, 1 vinculados e 1 ignorados.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

async function renderAndSelectAndUpload(matchResponse: any) {
  (api.get as any).mockResolvedValue({ data: MOCK_ACCOUNTS });
  (api.post as any).mockResolvedValue({ data: matchResponse });

  render(<Reconciliation />, { wrapper: createWrapper() });

  // Wait for accounts to load and select to appear
  await waitFor(() => {
    expect(screen.getByTestId("select-reconciliation-account")).toBeDefined();
  });

  // Select first account using native select
  const select = screen.getByTestId("select-reconciliation-account") as HTMLSelectElement;
  await act(async () => {
    fireEvent.change(select, { target: { value: "acc-1" } });
  });

  // Upload a file
  const fileInput = screen.getByTestId("file-input");
  const file = new File(["OFXHEADER:100\nDATA:OFXSGML"], "extrato.ofx", { type: "text/plain" });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  await act(async () => {
    fireEvent.change(fileInput);
  });

  // Wait for match API to be called
  await waitFor(() => {
    expect(api.post).toHaveBeenCalled();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Reconciliation Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({ data: MOCK_ACCOUNTS });
  });

  it("1. deve renderizar titulo, seletor de conta e zona de upload", async () => {
    render(<Reconciliation />, { wrapper: createWrapper() });
    expect(screen.getByText(/Concilia/)).toBeDefined();
    await waitFor(() => {
      expect(screen.getByTestId("select-reconciliation-account")).toBeDefined();
    });
    expect(screen.getByTestId("upload-zone")).toBeDefined();
    expect(screen.getByTestId("file-input")).toBeDefined();
  });

  it("2. deve exibir aviso ao tentar upload sem selecionar conta", async () => {
    render(<Reconciliation />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId("upload-zone")).toBeDefined();
    });
    const fileInput = screen.getByTestId("file-input");
    const file = new File(["data"], "extrato.csv", { type: "text/csv" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeDefined();
    });
  });

  it("3. deve exibir contadores corretos apos match", async () => {
    await renderAndSelectAndUpload(MOCK_MATCH_RESPONSE);
    await waitFor(() => {
      expect(screen.getByTestId("filter-all")).toBeDefined();
    });
    expect(screen.getByTestId("filter-all").textContent).toContain("3");
    expect(screen.getByTestId("filter-matched_exact").textContent).toContain("1");
    expect(screen.getByTestId("filter-matched_approximate").textContent).toContain("1");
    expect(screen.getByTestId("filter-unmatched").textContent).toContain("1");
  });

  it("4. deve exibir todos os itens de reconciliacao depois do match", async () => {
    await renderAndSelectAndUpload(MOCK_MATCH_RESPONSE);
    await waitFor(() => {
      expect(screen.getByTestId("reconciliation-item-item-1")).toBeDefined();
    });
    expect(screen.getByTestId("reconciliation-item-item-2")).toBeDefined();
    expect(screen.getByTestId("reconciliation-item-item-3")).toBeDefined();
    expect(screen.getByText("Supermercado")).toBeDefined();
    expect(screen.getByText("Netflix")).toBeDefined();
    expect(screen.getByText("Restaurante Novo")).toBeDefined();
  });

  it("5. deve mostrar mensagem de sucesso apos confirmar conciliacao", async () => {
    (api.get as any).mockResolvedValue({ data: MOCK_ACCOUNTS });
    (api.post as any)
      .mockResolvedValueOnce({ data: MOCK_MATCH_RESPONSE })
      .mockResolvedValueOnce({ data: MOCK_CONFIRM_RESPONSE });

    await renderAndSelectAndUpload(MOCK_MATCH_RESPONSE);

    await waitFor(() => {
      expect(screen.getByTestId("btn-confirm-reconciliation")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("btn-confirm-reconciliation"));

    await waitFor(() => {
      expect(screen.getByTestId("success-message")).toBeDefined();
    });
    expect(screen.getByText(/Conciliacao concluida/i)).toBeDefined();
  });

  it("6. deve exibir erro quando API de match falha", async () => {
    (api.get as any).mockResolvedValue({ data: MOCK_ACCOUNTS });
    (api.post as any).mockRejectedValue({
      response: { data: { error: "Nenhuma movimentacao identificada no extrato" } },
    });

    render(<Reconciliation />, { wrapper: createWrapper() });
    await waitFor(() => expect(screen.getByTestId("select-reconciliation-account")).toBeDefined());

    const select = screen.getByTestId("select-reconciliation-account") as HTMLSelectElement;
    await act(async () => fireEvent.change(select, { target: { value: "acc-1" } }));

    const fileInput = screen.getByTestId("file-input");
    const file = new File(["bad data"], "extrato.csv", { type: "text/csv" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    await act(async () => fireEvent.change(fileInput));

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeDefined();
    });
    expect(screen.getByText(/Nenhuma movimentacao/i)).toBeDefined();
  });

  it("7. deve limpar resultados ao clicar em Novo Extrato", async () => {
    await renderAndSelectAndUpload(MOCK_MATCH_RESPONSE);
    await waitFor(() => {
      expect(screen.getByTestId("btn-new-import")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("btn-new-import"));
    await waitFor(() => {
      expect(screen.getByTestId("upload-zone")).toBeDefined();
    });
    expect(screen.queryByTestId("btn-confirm-reconciliation")).toBeNull();
    expect(screen.queryByTestId("filter-all")).toBeNull();
  });
});

