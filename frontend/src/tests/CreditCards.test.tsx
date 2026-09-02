import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CreditCards from "@/pages/CreditCards";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import api from "@/lib/api";

// Mock do módulo de API
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

const mockCards = [
  {
    id: "card-1",
    workspace_id: "ws-1",
    name: "Nubank Ultravioleta",
    brand: "Mastercard",
    limit_amount: 15000,
    closing_day: 25,
    due_day: 5,
    best_purchase_day: 26,
    color: "#820ad1",
    card_type: "physical",
    last_four_digits: "1234",
    bank_name: "Nubank",
    institution: "Nu Pagamentos S.A.",
    card_tier: "black",
    card_image_url: "workspaces/ws-1/cards/card-1/photo.jpg",
  },
  {
    id: "card-2",
    workspace_id: "ws-1",
    name: "Inter Virtual",
    brand: "Visa",
    limit_amount: 5000,
    closing_day: 10,
    due_day: 17,
    best_purchase_day: 11,
    color: "#ff7a00",
    card_type: "virtual_permanent",
    registered_for: "Netflix",
    last_four_digits: "9876",
    bank_name: "Banco Inter",
    institution: "Banco Inter S.A.",
    card_tier: "platinum",
    card_image_url: null,
  },
  {
    id: "card-3",
    workspace_id: "ws-1",
    name: "Cartão Compra Única",
    brand: "Mastercard",
    limit_amount: 1000,
    closing_day: 15,
    due_day: 22,
    best_purchase_day: 16,
    color: "#1d3557",
    card_type: "virtual_temporary",
    registered_for: "Amazon",
    expires_at: "2026-09-03T18:00:00Z",
    last_four_digits: "5555",
    bank_name: "Nubank",
    card_tier: "standard",
  },
];

const mockInvoices = [
  {
    id: "inv-1",
    credit_card_id: "card-1",
    workspace_id: "ws-1",
    reference_month: "2026-09",
    start_date: "2026-08-26",
    closing_date: "2026-09-25",
    due_date: "2026-10-05",
    total_amount: 1250.5,
    status: "open",
    days_until_due: 33,
  },
];

const mockForecast = {
  card_id: "card-1",
  card_name: "Nubank Ultravioleta",
  limit_amount: 15000,
  total_committed_future: 450.0,
  months_ahead: 6,
  forecast: [],
};

function renderCreditCards() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CreditCards />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Cartões de Crédito e Faturas", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
      if (url.includes("/credit-cards/") && url.includes("/forecast")) return Promise.resolve({ data: mockForecast }) as any;
      if (url.includes("/cards/") && url.includes("/invoices")) return Promise.resolve({ data: mockInvoices }) as any;
      if (url.includes("/credit-cards")) return Promise.resolve({ data: mockCards }) as any;
      return Promise.resolve({ data: [] }) as any;
    });

    vi.mocked(api.post).mockImplementation((url: string, data: any) => {
      if (url.includes("/credit-cards")) {
        return Promise.resolve({
          data: {
            id: "card-new",
            workspace_id: "ws-1",
            ...data,
          },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });

    vi.mocked(api.put).mockImplementation((url: string, data: any) => {
      if (url.includes("/credit-cards/")) {
        return Promise.resolve({
          data: {
            id: "card-1",
            workspace_id: "ws-1",
            ...data,
          },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });

    vi.mocked(api.delete).mockImplementation(() => {
      return Promise.resolve({ data: { success: true } }) as any;
    });
  });

  it("deve renderizar os cartões com dados de identificação, badges e rastreabilidade", async () => {
    renderCreditCards();

    expect(screen.getByText(/Cartões de Crédito e Faturas/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Nubank Ultravioleta" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Inter Virtual" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Cartão Compra Única" })).toBeInTheDocument();
    });

    // Verificar badges de tipo
    expect(screen.getAllByText(/Físico/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Virtual/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/24h/i).length).toBeGreaterThan(0);

    // Rastreabilidade de virtual (🔒 Cadastrado em: Netflix e Amazon)
    expect(screen.getAllByText(/Cadastrado em:/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Amazon")).toBeInTheDocument();

    // Verificar bancos
    expect(screen.getByText("Banco Inter")).toBeInTheDocument();

    // Verificar últimos 4 dígitos
    expect(screen.getByText(/•••• 1234/i)).toBeInTheDocument();
    expect(screen.getByText(/•••• 9876/i)).toBeInTheDocument();
  });

  it("deve renderizar a barra de filtros e contador de cartões", async () => {
    renderCreditCards();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Nubank Ultravioleta" })).toBeInTheDocument();
    });

    // Contador de cartões
    expect(screen.getAllByText(/3 cartões/i).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/Buscar cartão.../i)).toBeInTheDocument();
  });

  it("deve abrir o modal 'Novo Cartão de Crédito' e validar campos", async () => {
    renderCreditCards();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Nubank Ultravioleta" })).toBeInTheDocument();
    });

    const btn = screen.getByRole("button", { name: /Novo Cartão/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText("Novo Cartão de Crédito")).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText(/Nome do Cartão \*/i);
    fireEvent.change(nameInput, { target: { value: "Meu Novo Cartão" } });

    const submitBtn = screen.getByRole("button", { name: /Criar Cartão/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/workspaces/ws-1/credit-cards",
        expect.objectContaining({ name: "Meu Novo Cartão" })
      );
    });
  });
});
