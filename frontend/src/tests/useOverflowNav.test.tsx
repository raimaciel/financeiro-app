import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { useOverflowNav, type NavItem } from "@/hooks/useOverflowNav";
import { LayoutDashboard, FolderKanban, Tags, Landmark, CreditCard, PieChart } from "lucide-react";

const mockItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "workspaces", label: "Workspaces", href: "/workspaces", icon: FolderKanban },
  { id: "categories", label: "Categorias", href: "/categories", icon: Tags },
  { id: "accounts", label: "Contas", href: "/accounts", icon: Landmark },
  { id: "credit-cards", label: "Cartões", href: "/credit-cards", icon: CreditCard },
  { id: "budgets", label: "Orçamentos", href: "/budgets", icon: PieChart },
];

function createWrapper(initialEntries = ["/dashboard"]) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe("useOverflowNav Hook", () => {
  it("deve inicializar com todos os itens visíveis por padrão", () => {
    const { result } = renderHook(
      () => useOverflowNav({ items: mockItems }),
      { wrapper: createWrapper(["/dashboard"]) }
    );

    expect(result.current.visibleItems).toEqual(mockItems);
    expect(result.current.overflowItems).toEqual([]);
    expect(result.current.hasOverflow).toBe(false);
  });

  it("deve identificar corretamente se um item está ativo", () => {
    const { result } = renderHook(
      () => useOverflowNav({ items: mockItems }),
      { wrapper: createWrapper(["/credit-cards"]) }
    );

    const activeItem = mockItems.find((i) => i.href === "/credit-cards")!;
    const inactiveItem = mockItems.find((i) => i.href === "/dashboard")!;

    expect(result.current.isItemActive(activeItem)).toBe(true);
    expect(result.current.isItemActive(inactiveItem)).toBe(false);
  });

  it("deve calcular overflow dividindo visibleItems e overflowItems quando a largura for limitada", () => {
    const { result } = renderHook(
      () => useOverflowNav({ items: mockItems, gap: 8, moreButtonWidth: 80 }),
      { wrapper: createWrapper(["/dashboard"]) }
    );

    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 300, configurable: true });

    const measure = document.createElement("div");
    mockItems.forEach(() => {
      const itemEl = document.createElement("div");
      itemEl.setAttribute("data-nav-item", "true");
      Object.defineProperty(itemEl, "offsetWidth", { value: 100, configurable: true });
      measure.appendChild(itemEl);
    });

    const moreBtn = document.createElement("div");
    moreBtn.setAttribute("data-more-btn", "true");
    Object.defineProperty(moreBtn, "offsetWidth", { value: 80, configurable: true });
    measure.appendChild(moreBtn);

    (result.current.containerRef as any).current = container;
    (result.current.measureRef as any).current = measure;

    act(() => {
      result.current.recalculate();
    });

    // Com 300px disponíveis e 80px do botão Mais: restam ~212px -> cabem 2 itens de 100px (100 + 8 + 100 = 208px)
    expect(result.current.visibleItems.length).toBeLessThan(mockItems.length);
    expect(result.current.overflowItems.length).toBeGreaterThan(0);
    expect(result.current.hasOverflow).toBe(true);
  });

  it("deve priorizar manter o item da rota ativa visível quando houver overflow", () => {
    // Rota ativa é o 5º item ("/credit-cards")
    const { result } = renderHook(
      () => useOverflowNav({ items: mockItems, gap: 8, moreButtonWidth: 80 }),
      { wrapper: createWrapper(["/credit-cards"]) }
    );

    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 250, configurable: true });

    const measure = document.createElement("div");
    mockItems.forEach(() => {
      const itemEl = document.createElement("div");
      itemEl.setAttribute("data-nav-item", "true");
      Object.defineProperty(itemEl, "offsetWidth", { value: 90, configurable: true });
      measure.appendChild(itemEl);
    });

    const moreBtn = document.createElement("div");
    moreBtn.setAttribute("data-more-btn", "true");
    Object.defineProperty(moreBtn, "offsetWidth", { value: 80, configurable: true });
    measure.appendChild(moreBtn);

    (result.current.containerRef as any).current = container;
    (result.current.measureRef as any).current = measure;

    act(() => {
      result.current.recalculate();
    });

    // O item ativo (/credit-cards) deve estar presente em visibleItems
    const hasActiveInVisible = result.current.visibleItems.some(
      (item) => item.href === "/credit-cards"
    );
    expect(hasActiveInVisible).toBe(true);
  });
});
