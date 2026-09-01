import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import api from "@/lib/api";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

const mockNotifications = {
  workspace_id: "ws-1",
  total_count: 2,
  notifications: [
    {
      id: "budget_exceeded_b1_2026-10",
      type: "budget_exceeded",
      title: "Orçamento Excedido: Alimentação",
      message: "O limite de R$ 1000 foi ultrapassado.",
      severity: "danger",
      related_link: "/budgets",
      created_context_date: "2026-10-10",
    },
    {
      id: "invoice_due_c1_2026-10",
      type: "invoice_due_soon",
      title: "Fatura do Nubank Vence em Breve",
      message: "A fatura vence no dia 12/10/2026.",
      severity: "warning",
      related_link: "/credit-cards",
      created_context_date: "2026-10-12",
    },
  ],
};

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url.includes("/notifications")) {
    return Promise.resolve({ data: mockNotifications }) as any;
  }
  return Promise.resolve({ data: [] }) as any;
});

function renderPopover() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NotificationsPopover workspaceId="ws-1" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Componente de Sino de Notificações", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("deve renderizar o sino e o badge numérico com a contagem de não lidas", async () => {
    renderPopover();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    expect(bellBtn).toBeInTheDocument();

    await waitFor(() => {
      const badge = screen.getByText("2");
      expect(badge).toBeInTheDocument();
    });
  });

  it("deve abrir o painel dropdown ao clicar no sino e exibir as notificações", async () => {
    renderPopover();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    fireEvent.click(bellBtn);

    await waitFor(() => {
      expect(screen.getByText("Orçamento Excedido: Alimentação")).toBeInTheDocument();
      expect(screen.getByText("Fatura do Nubank Vence em Breve")).toBeInTheDocument();
    });
  });

  it("deve marcar todas como lidas ao clicar no botão correspondente", async () => {
    renderPopover();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    fireEvent.click(bellBtn);

    const markAllBtn = await screen.findByRole("button", { name: /Marcar lidas/i });
    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(screen.queryByText("2 nova(s)")).not.toBeInTheDocument();
    });
  });
});
