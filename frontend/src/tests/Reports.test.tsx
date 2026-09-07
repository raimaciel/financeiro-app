import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Reports from "@/pages/Reports";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import api from "@/lib/api";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

// Mocks de API
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mocks de Exportação
vi.mock("xlsx", () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

const mockSave = vi.fn();
vi.mock("jspdf", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        setFont: vi.fn(),
        setFontSize: vi.fn(),
        setTextColor: vi.fn(),
        text: vi.fn(),
        setDrawColor: vi.fn(),
        setFillColor: vi.fn(),
        roundedRect: vi.fn(),
        save: mockSave,
      };
    }),
  };
});

vi.mock("jspdf-autotable", () => ({
  default: vi.fn(),
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    selectedWorkspaceId: "ws-1",
    selectedWorkspace: { id: "ws-1", name: "Meu Workspace", role: "owner" },
    workspaces: [{ id: "ws-1", name: "Meu Workspace", role: "owner" }],
    hasWorkspace: true,
    isLoading: false,
  }),
  WorkspaceProvider: ({ children }: any) => children,
}));

// Mock Recharts para ambiente de teste jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
}));

const mockWorkspaces = [
  { id: "ws-1", name: "Meu Workspace", role: "owner" },
];

const mockAccounts = [
  {
    id: "acc-1",
    workspace_id: "ws-1",
    name: "Nubank Principal",
    bank_name: "Nubank",
    account_type: "checking",
    initial_balance: 1000,
    color: "#820ad1",
    status: "active",
  },
];

const mockCategories = [
  { id: 1, name: "Alimentação", color: "#EF4444", icon: "Utensils", type: "expense" },
  { id: 2, name: "Salário", color: "#22C55E", icon: "Briefcase", type: "income" },
];

const mockReportData = {
  period: {
    start: "2026-09-01",
    end: "2026-09-30",
  },
  filters: {
    account_id: null,
    category_id: null,
    type: null,
  },
  totals: {
    income: 5000,
    expense: 1500,
    balance: 3500,
    count: 2,
  },
  by_category: [
    {
      category_id: 1,
      name: "Alimentação",
      color: "#EF4444",
      icon: "Utensils",
      type: "expense",
      total: 1500,
      percentage: 100,
    },
  ],
  by_account: [
    {
      account_id: "acc-1",
      name: "Nubank Principal",
      bank_name: "Nubank",
      color: "#820ad1",
      total_income: 5000,
      total_expense: 1500,
      net_total: 3500,
    },
  ],
  transactions: [
    {
      id: 10,
      date: "2026-09-05",
      description: "Salário Setembro",
      amount: 5000,
      type: "income",
      category_name: "Salário",
      category_color: "#22C55E",
      account_name: "Nubank Principal",
      account_bank_name: "Nubank",
      account_color: "#820ad1",
    },
    {
      id: 11,
      date: "2026-09-12",
      description: "Supermercado Semanal",
      amount: 1500,
      type: "expense",
      category_name: "Alimentação",
      category_color: "#EF4444",
      account_name: "Nubank Principal",
      account_bank_name: "Nubank",
      account_color: "#820ad1",
    },
  ],
};

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <BrowserRouter>
          <Reports />
        </BrowserRouter>
      </WorkspaceProvider>
    </QueryClientProvider>
  );
}

describe("Página de Relatórios Financeiros (Fase 7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockImplementation((url: string) => {
      if (url.includes("/workspaces") && !url.includes("bank-accounts") && !url.includes("categories") && !url.includes("reports")) {
        return Promise.resolve({ data: mockWorkspaces });
      }
      if (url.includes("/bank-accounts")) {
        return Promise.resolve({ data: mockAccounts });
      }
      if (url.includes("/categories")) {
        return Promise.resolve({ data: mockCategories });
      }
      if (url.includes("/reports/summary")) {
        return Promise.resolve({ data: mockReportData });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it("1. deve renderizar o título da página, filtros e atalhos de período", async () => {
    renderWithProviders();

    expect(screen.getByRole("heading", { name: /Relatórios Financeiros/i })).toBeInTheDocument();
    expect(screen.getByText("Filtros do Relatório")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Este Mês" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mês Passado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Últimos 30 Dias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Este Ano" })).toBeInTheDocument();
  });

  it("2. deve exibir os cards de métricas consolidadas e tabela com lançamentos", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("R$ 5.000,00")).toBeInTheDocument(); // Receitas
      expect(screen.getByText("R$ 1.500,00")).toBeInTheDocument(); // Despesas
      expect(screen.getByText("R$ 3.500,00")).toBeInTheDocument(); // Saldo Líquido
    });

    expect(screen.getByText("Salário Setembro")).toBeInTheDocument();
    expect(screen.getByText("Supermercado Semanal")).toBeInTheDocument();
  });

  it("3. deve alternar o período ao clicar no atalho 'Este Ano'", async () => {
    renderWithProviders();

    const thisYearBtn = screen.getByRole("button", { name: "Este Ano" });
    fireEvent.click(thisYearBtn);

    const year = new Date().getFullYear();
    const startDateInput = screen.getByLabelText(/Data Inicial/i) as HTMLInputElement;
    expect(startDateInput.value).toBe(`${year}-01-01`);
  });

  it("4. deve disparar a exportação para Excel ao clicar no botão 'Exportar Excel'", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Salário Setembro")).toBeInTheDocument();
    });

    const exportExcelBtn = screen.getByRole("button", { name: /Exportar Excel/i });
    expect(exportExcelBtn).toBeEnabled();

    fireEvent.click(exportExcelBtn);

    expect(XLSX.utils.book_new).toHaveBeenCalled();
    expect(XLSX.writeFile).toHaveBeenCalled();
  });

  it("5. deve disparar a exportação para PDF ao clicar no botão 'Exportar PDF'", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Salário Setembro")).toBeInTheDocument();
    });

    const exportPdfBtn = screen.getByRole("button", { name: /Exportar PDF/i });
    expect(exportPdfBtn).toBeEnabled();

    fireEvent.click(exportPdfBtn);

    expect(jsPDF).toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalled();
  });
});
