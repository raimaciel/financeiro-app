import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Register from "@/pages/Register";

const mockRegister = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    register: mockRegister,
    user: null,
    isLoading: false,
    token: null,
  }),
}));

function renderRegister() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Register />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Registro", () => {
  it("deve renderizar os campos incluindo o Código de Convite", () => {
    renderRegister();
    expect(screen.getByText(/Criar uma Conta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Senha/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Código de Convite/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Criar Conta/i })).toBeInTheDocument();
  });

  it("deve preencher os campos e submeter com o código de convite", async () => {
    renderRegister();
    const nameInput = screen.getByLabelText(/Nome completo/i);
    const emailInput = screen.getByLabelText(/E-mail/i);
    const passInput = screen.getByLabelText(/Senha/i);
    const inviteInput = screen.getByLabelText(/Código de Convite/i);
    const submitBtn = screen.getByRole("button", { name: /Criar Conta/i });

    fireEvent.change(nameInput, { target: { value: "Novo Usuário" } });
    fireEvent.change(emailInput, { target: { value: "novo@email.com" } });
    fireEvent.change(passInput, { target: { value: "123456" } });
    fireEvent.change(inviteInput, { target: { value: "FINANCEIRO2026" } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        "Novo Usuário",
        "novo@email.com",
        "123456",
        "FINANCEIRO2026"
      );
    });
  });

  it("deve ter link para login", () => {
    renderRegister();
    const loginLink = screen.getByRole("link", { name: /Faça login/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute("href", "/login");
  });
});
