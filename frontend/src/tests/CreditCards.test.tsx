import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreditCards from "@/pages/CreditCards";
import api from "@/lib/api";

const mockWorkspaces = [{ id: "ws-1", name: "Workspace Teste", type: "personal", role: "owner" }];
const mockCards = [
  {
    id: "card-1",
    workspace_id: "ws-1",
    name: "Nubank Ultravioleta",
    brand: "Mastercard",
    limit_amount: 15000,
    closing_day: 25,
    due_day: 5,
    color: "#8A05BE",
    cardType: "physical",
    lastFourDigits: "1234",
    bankName: "Nubank",
    institution: "Nu Pagamentos S.A.",
    cardTier: "black",
    card_image_url: "workspaces/ws-1/cards/card-1/photo.jpg",
    imageUrl: "/cards/card-1/image",
  },
  {
    id: "card-2",
    workspace_id: "ws-1",
    name: "Inter Virtual",
    brand: "Visa",
    limit_amount: 8000,
    closing_day: 10,
    due_day: 20,
    color: "#FF7A00",
    cardType: "virtual",
    lastFourDigits: "9876",
    bankName: "Banco Inter",
    cardTier: "platinum",
  },
];

const mockInvoices = [
  {
    id: "inv-1",
    card_id: "card-1",
    workspace_id: "ws-1",
    reference_month: "2026-08",
    start_date: "2026-07-26",
    closing_date: "2026-08-25",
    due_date: "2026-09-05",
    days_until_due: 4,
    total_amount: 1450.5,
    status: "open",
  },
];

const mockForecast = {
  card_id: "card-1",
  card_name: "Nubank Ultravioleta",
  limit_amount: 15000,
  total_committed_future: 2500,
  months_ahead: 6,
  forecast: [
    {
      reference_month: "2026-09",
      month_label: "Setembro 2026",
      closing_date: "2026-09-25",
      due_date: "2026-10-05",
      days_until_due: 34,
      predicted_total: 600,
      installments_count: 2,
      items: [
        {
          transaction_id: "tx-1",
          description: "Notebook 1/3",
          amount: 600,
          installments: 3,
          installment_current: 1,
          original_date: "2026-08-28",
        },
      ],
    },
  ],
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

  it("deve renderizar os cartões com dados de identificação, ícones de bandeira e imagem de fundo", async () => {
    renderCreditCards();

    expect(screen.getByText(/Cartões de Crédito e Faturas/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Nubank Ultravioleta")).toBeInTheDocument();
      expect(screen.getByText("Inter Virtual")).toBeInTheDocument();
    });

    // Verificar badges de tipo
    expect(screen.getByText("🏦 Físico")).toBeInTheDocument();
    expect(screen.getByText("💳 Virtual")).toBeInTheDocument();

    // Verificar bancos
    expect(screen.getByText("Nubank")).toBeInTheDocument();
    expect(screen.getByText("Banco Inter")).toBeInTheDocument();

    // Verificar últimos 4 dígitos
    expect(screen.getByText(/•••• 1234/i)).toBeInTheDocument();
    expect(screen.getByText(/•••• 9876/i)).toBeInTheDocument();

    // Verificar badges de tier (black e platinum)
    expect(screen.getByText("black")).toBeInTheDocument();
    expect(screen.getByText("platinum")).toBeInTheDocument();

    // Verificar imagem de fundo renderizada para o cartão 1
    const imgElement = screen.getByAltText("Nubank Ultravioleta");
    expect(imgElement).toBeInTheDocument();
    expect(imgElement).toHaveAttribute("src", "/cards/card-1/image");
  });

  it("deve abrir o modal 'Novo Cartão de Crédito' e comprovar textualmente todos os 12 campos no DOM", async () => {
    renderCreditCards();

    await waitFor(() => {
      expect(screen.getByText("Nubank Ultravioleta")).toBeInTheDocument();
    });

    const btn = screen.getByRole("button", { name: /Novo Cartão/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText("Novo Cartão de Crédito")).toBeInTheDocument();
      expect(screen.getByText(/Configure os dados de identificação/i)).toBeInTheDocument();

      // 1. Nome do Cartão *
      expect(screen.getByLabelText(/Nome do Cartão \*/i)).toBeInTheDocument();
      // 2. Tipo de Cartão (Físico / Virtual)
      expect(screen.getByLabelText(/Tipo de Cartão/i)).toBeInTheDocument();
      // 3. Banco / Emissor
      expect(screen.getByLabelText(/Banco \/ Emissor/i)).toBeInTheDocument();
      // 4. Bandeira (Opcional)
      expect(screen.getByLabelText(/Bandeira \(Opcional\)/i)).toBeInTheDocument();
      // 5. Últimos 4 dígitos
      expect(screen.getByLabelText(/Últimos 4 dígitos/i)).toBeInTheDocument();
      // 6. Instituição (Opcional)
      expect(screen.getByLabelText(/Instituição \(Opcional\)/i)).toBeInTheDocument();
      // 7. Tier do Cartão
      expect(screen.getByLabelText(/Tier do Cartão/i)).toBeInTheDocument();
      // 8. Limite Total (R$)
      expect(screen.getByLabelText(/Limite Total \(R\$\)/i)).toBeInTheDocument();
      // 9. Dia do Fechamento (1-31) *
      expect(screen.getByLabelText(/Dia do Fechamento \(1-31\) \*/i)).toBeInTheDocument();
      // 10. Dia do Vencimento (1-31) *
      expect(screen.getByLabelText(/Dia do Vencimento \(1-31\) \*/i)).toBeInTheDocument();
      // 11. Foto / Imagem do Cartão (Opcional)
      expect(screen.getByLabelText(/Foto \/ Imagem do Cartão \(Opcional\)/i)).toBeInTheDocument();
      // 12. Cor de Fundo do Cartão
      expect(screen.getByText(/Cor de Fundo do Cartão/i)).toBeInTheDocument();
    });
  });

  it("deve filtrar caracteres não numéricos e validar que lastFourDigits tenha 4 dígitos", async () => {
    renderCreditCards();

    await waitFor(() => {
      expect(screen.getByText("Nubank Ultravioleta")).toBeInTheDocument();
    });

    const btn = screen.getByRole("button", { name: /Novo Cartão/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByLabelText(/Nome do Cartão/i)).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText(/Nome do Cartão \*/i);
    const digitsInput = screen.getByLabelText(/Últimos 4 dígitos/i);

    fireEvent.change(nameInput, { target: { value: "Cartão Teste Validação" } });
    fireEvent.change(digitsInput, { target: { value: "12a" } });

    // "12a" deve virar "12"
    expect((digitsInput as HTMLInputElement).value).toBe("12");

    const submitBtn = screen.getByRole("button", { name: /Criar Cartão/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Os últimos 4 dígitos devem conter exatamente 4 números/i)).toBeInTheDocument();
    });
  });

  it("deve abrir modal 'Editar Cartão de Crédito' pré-preenchido com todos os campos e preview de foto existente", async () => {
    renderCreditCards();

    await waitFor(() => {
      expect(screen.getByText("Nubank Ultravioleta")).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button");
    const moreMenuBtn = moreButtons.find((b) => b.querySelector("svg.lucide-more-vertical") || b.innerHTML.includes("lucide-more-vertical"));
    if (moreMenuBtn) {
      fireEvent.click(moreMenuBtn);
      const editOption = await screen.findByText("Editar");
      fireEvent.click(editOption);

      await waitFor(() => {
        expect(screen.getByText("Editar Cartão de Crédito")).toBeInTheDocument();

        // 1. Nome
        const nameInput = screen.getByLabelText(/Nome do Cartão \*/i) as HTMLInputElement;
        expect(nameInput.value).toBe("Nubank Ultravioleta");

        // 3. Banco
        const bankInput = screen.getByLabelText(/Banco \/ Emissor/i) as HTMLInputElement;
        expect(bankInput.value).toBe("Nubank");

        // 5. Últimos 4 dígitos
        const digitsInput = screen.getByLabelText(/Últimos 4 dígitos/i) as HTMLInputElement;
        expect(digitsInput.value).toBe("1234");

        // 6. Instituição
        const instInput = screen.getByLabelText(/Instituição \(Opcional\)/i) as HTMLInputElement;
        expect(instInput.value).toBe("Nu Pagamentos S.A.");

        // 11. Preview da Imagem
        expect(screen.getByAltText("Preview do Cartão")).toBeInTheDocument();

        // Botão de salvar no modo edit
        expect(screen.getByRole("button", { name: /Salvar Alterações/i })).toBeInTheDocument();
      });
    }
  });
});
