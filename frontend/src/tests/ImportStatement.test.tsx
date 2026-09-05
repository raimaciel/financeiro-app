import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ImportStatement from "@/pages/ImportStatement";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockWorkspaces = [
  { id: "ws-1", name: "Meu Workspace", role: "owner" },
];

const mockAccounts = [
  {
    id: "acc-1",
    workspace_id: "ws-1",
    name: "Conta Corrente Inter",
    bank_name: "Banco Inter",
    account_type: "checking",
    initial_balance: 2500,
    color: "#FF7A00",
    status: "active",
  },
];

const mockCategories = [
  { id: 1, name: "Alimentação", color: "#EF4444", icon: "Utensils", type: "expense" },
  { id: 2, name: "Salário", color: "#10B981", icon: "DollarSign", type: "income" },
];

const mockPreviewData = {
  account_id: "acc-1",
  account_name: "Conta Corrente Inter",
  bank_name: "Banco Inter",
  filename: "extrato_setembro.ofx",
  fileType: "ofx",
  totalCount: 2,
  duplicatesCount: 1,
  newCount: 1,
  transactions: [
    {
      id: "tx-1",
      date: "2026-09-01",
      description: "Depósito Salário",
      amount: 4500.0,
      type: "income",
      category_id: 2,
      category_name: "Salário",
      is_duplicate: false,
      duplicate_reason: null,
    },
    {
      id: "tx-2",
      date: "2026-09-02",
      description: "Supermercado BH",
      amount: 180.5,
      type: "expense",
      category_id: 1,
      category_name: "Alimentação",
      is_duplicate: true,
      duplicate_reason: "Transação similar já cadastrada",
    },
  ],
};

const mockConfirmData = {
  success: true,
  imported_count: 1,
  duplicates_ignored: 1,
  message: "1 transação(ões) importada(s) com sucesso. 1 duplicada(s) ignorada(s).",
};

function renderImportStatement() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <WorkspaceProvider>
          <ImportStatement />
        </WorkspaceProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Importação de Extratos Bancários (OFX/CSV)", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
      if (url.includes("/accounts")) return Promise.resolve({ data: mockAccounts }) as any;
      if (url.includes("/categories")) return Promise.resolve({ data: mockCategories }) as any;
      return Promise.resolve({ data: [] }) as any;
    });

    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url.includes("/import/confirm")) {
        return Promise.resolve({ data: mockConfirmData }) as any;
      }
      if (url.includes("/import")) {
        return Promise.resolve({ data: mockPreviewData }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });
  });

  it("deve renderizar a tela inicial de seleção de conta e área de upload", async () => {
    renderImportStatement();

    expect(screen.getByText(/Importar Extrato Bancário/i)).toBeInTheDocument();
    expect(screen.getByText(/1. Seleção & Upload/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Conta Corrente Inter")).toBeInTheDocument();
    });

    expect(screen.getByText(/Arquivo do Extrato/i)).toBeInTheDocument();
    expect(screen.getByText(/Clique para selecionar ou arraste o arquivo aqui/i)).toBeInTheDocument();
  });

  it("deve selecionar um arquivo, enviar para análise e exibir a tabela de revisão", async () => {
    renderImportStatement();

    await waitFor(() => {
      expect(screen.getByText("Conta Corrente Inter")).toBeInTheDocument();
    });

    // Simular upload de arquivo OFX
    const file = new File(["<OFX>sample</OFX>"], "extrato_setembro.ofx", { type: "text/plain" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("extrato_setembro.ofx")).toBeInTheDocument();
    });

    // Clicar em 'Analisar Extrato e Avançar'
    const analyzeBtn = screen.getByRole("button", { name: /Analisar Extrato e Avançar/i });
    expect(analyzeBtn).not.toBeDisabled();
    fireEvent.click(analyzeBtn);

    // Passo 2: Tabela de Revisão
    await waitFor(() => {
      expect(screen.getByText("2. Revisão & Categorização")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Depósito Salário")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Supermercado BH")).toBeInTheDocument();
      expect(screen.getByText("Duplicada")).toBeInTheDocument();
      expect(screen.getByText("Nova")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Confirmar Importação/i })).toBeInTheDocument();
  });

  it("deve confirmar a importação e exibir o resumo final de sucesso", async () => {
    renderImportStatement();

    await waitFor(() => {
      expect(screen.getByText("Conta Corrente Inter")).toBeInTheDocument();
    });

    const file = new File(["data,valor,descricao"], "extrato.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const analyzeBtn = screen.getByRole("button", { name: /Analisar Extrato e Avançar/i });
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Confirmar Importação/i })).toBeInTheDocument();
    });

    // Clica em 'Confirmar Importação'
    const confirmBtn = screen.getByRole("button", { name: /Confirmar Importação/i });
    fireEvent.click(confirmBtn);

    // Passo 3: Tela de Conclusão
    await waitFor(() => {
      expect(screen.getByText(/Importação Concluída com Sucesso!/i)).toBeInTheDocument();
      expect(screen.getByText(/Ver Transações Importadas/i)).toBeInTheDocument();
      expect(screen.getByText(/Ver Contas e Bancos/i)).toBeInTheDocument();
    });
  });
});
