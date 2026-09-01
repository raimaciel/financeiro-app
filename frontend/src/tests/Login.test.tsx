import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Login from "@/pages/Login";

const mockLogin = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
    isLoading: false,
    token: null,
  }),
}));

function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Login", () => {
  it("deve renderizar o título e campos do formulário", () => {
    renderLogin();
    expect(screen.getByText(/acesse sua conta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument();
  });

  it("deve aceitar digitação nos campos e submeter com sucesso", async () => {
    renderLogin();
    const emailInput = screen.getByLabelText(/e-mail/i);
    const passInput = screen.getByLabelText(/senha/i);
    const submitBtn = screen.getByRole("button", { name: /entrar/i });

    fireEvent.change(emailInput, { target: { value: "teste@email.com" } });
    fireEvent.change(passInput, { target: { value: "123456" } });

    expect((emailInput as HTMLInputElement).value).toBe("teste@email.com");
    expect((passInput as HTMLInputElement).value).toBe("123456");

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("teste@email.com", "123456");
    });
  });

  it("deve ter link para cadastro", () => {
    renderLogin();
    const registerLink = screen.getByRole("link", { name: /cadastre-se/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute("href", "/register");
  });
});
