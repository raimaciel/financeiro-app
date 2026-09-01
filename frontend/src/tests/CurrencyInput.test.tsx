import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurrencyInput } from "@/components/ui/currency-input";

describe("CurrencyInput", () => {
  it("deve renderizar o prefixo R$ e o placeholder", () => {
    render(<CurrencyInput id="amount" placeholder="0,00" />);
    expect(screen.getByText("R$")).toBeInTheDocument();
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("placeholder", "0,00");
  });

  it("deve formatar valor inicial numérico como moeda brasileira (9300 -> 9.300,00)", () => {
    render(<CurrencyInput value={9300} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("9.300,00");
  });

  it("deve atualizar centavos da direita para esquerda ao digitar (5000 -> 50,00 e float 50)", () => {
    const handleChange = vi.fn();
    render(<CurrencyInput onChange={handleChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    // Simula digitação "5000"
    fireEvent.change(input, { target: { value: "5000" } });

    expect(handleChange).toHaveBeenCalledWith(50);
    expect(input.value).toBe("50,00");
  });

  it("deve lidar com remoção de dígitos (backspace)", () => {
    const handleChange = vi.fn();
    render(<CurrencyInput value={50} onChange={handleChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("50,00");

    // Simula remoção do último dígito (de 5000 para 500)
    fireEvent.change(input, { target: { value: "5,00" } });
    expect(handleChange).toHaveBeenCalledWith(5);
  });

  it("deve respeitar a prop disabled", () => {
    render(<CurrencyInput disabled />);
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
  });
});
