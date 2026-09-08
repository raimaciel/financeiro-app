import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isAdminOnly?: boolean;
}

interface UseOverflowNavOptions {
  items: NavItem[];
  gap?: number;
  moreButtonWidth?: number;
}

export function useOverflowNav({
  items,
  gap = 12,
  moreButtonWidth = 85,
}: UseOverflowNavOptions) {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const [visibleItems, setVisibleItems] = useState<NavItem[]>(items);
  const [overflowItems, setOverflowItems] = useState<NavItem[]>([]);

  const isItemActive = useCallback(
    (item: NavItem) => {
      if (location.pathname === item.href) return true;
      if (
        item.href !== "/" &&
        item.href !== "/dashboard" &&
        location.pathname.startsWith(item.href)
      ) {
        return true;
      }
      return false;
    },
    [location.pathname]
  );

  const calculateLayout = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;

    if (!container || !measure) return;

    const availableWidth = container.clientWidth;

    // Em ambientes jsdom/teste sem largura ou container muito estreito inicial, mantém todos os itens
    if (availableWidth <= 0) {
      setVisibleItems(items);
      setOverflowItems([]);
      return;
    }

    const itemElements = Array.from(
      measure.querySelectorAll<HTMLElement>("[data-nav-item]")
    );
    const moreBtnElement = measure.querySelector<HTMLElement>("[data-more-btn]");

    if (itemElements.length !== items.length) {
      setVisibleItems(items);
      setOverflowItems([]);
      return;
    }

    const itemWidths = itemElements.map(
      (el) => el.getBoundingClientRect().width || el.offsetWidth || 90
    );
    const measuredMoreWidth = moreBtnElement
      ? moreBtnElement.getBoundingClientRect().width ||
        moreBtnElement.offsetWidth ||
        moreButtonWidth
      : moreButtonWidth;

    // Largura total necessária para renderizar todos os itens
    let totalWidthNeeded = 0;
    for (let i = 0; i < itemWidths.length; i++) {
      totalWidthNeeded += itemWidths[i] + (i > 0 ? gap : 0);
    }

    // Se todos os itens couberem confortavelmente, nenhum vai para o overflow
    if (totalWidthNeeded <= availableWidth) {
      setVisibleItems(items);
      setOverflowItems([]);
      return;
    }

    // Caso contrário, precisamos reservar espaço para o botão "Mais"
    const reservedForMore = measuredMoreWidth + gap;
    const maxAvailableForItems = Math.max(0, availableWidth - reservedForMore);

    const activeIndex = items.findIndex(isItemActive);

    const visibleIndices = new Set<number>();

    if (activeIndex !== -1) {
      // Priorizar item ativo: reservamos espaço para ele
      const activeWidth = itemWidths[activeIndex];
      const remainingForOthers = Math.max(0, maxAvailableForItems - activeWidth - gap);

      let otherUsedWidth = 0;
      for (let i = 0; i < items.length; i++) {
        if (i === activeIndex) continue;
        const itemW = itemWidths[i];
        const needed = otherUsedWidth === 0 ? itemW : itemW + gap;
        if (otherUsedWidth + needed <= remainingForOthers) {
          visibleIndices.add(i);
          otherUsedWidth += needed;
        } else {
          break;
        }
      }
      visibleIndices.add(activeIndex);
    } else {
      // Sem item ativo específico na lista
      let usedWidth = 0;
      for (let i = 0; i < items.length; i++) {
        const itemW = itemWidths[i];
        const needed = usedWidth === 0 ? itemW : itemW + gap;
        if (usedWidth + needed <= maxAvailableForItems) {
          visibleIndices.add(i);
          usedWidth += needed;
        } else {
          break;
        }
      }
    }

    // Garantir que pelo menos 1 item seja exibido se possível
    if (visibleIndices.size === 0 && items.length > 0) {
      visibleIndices.add(activeIndex !== -1 ? activeIndex : 0);
    }

    const nextVisible: NavItem[] = [];
    const nextOverflow: NavItem[] = [];

    items.forEach((item, index) => {
      if (visibleIndices.has(index)) {
        nextVisible.push(item);
      } else {
        nextOverflow.push(item);
      }
    });

    setVisibleItems(nextVisible);
    setOverflowItems(nextOverflow);
  }, [items, gap, moreButtonWidth, isItemActive]);

  useEffect(() => {
    calculateLayout();
  }, [calculateLayout]);

  useEffect(() => {
    const container = containerRef.current;

    let rAFId: number | null = null;
    const handleResize = () => {
      if (rAFId) cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        calculateLayout();
      });
    };

    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && container) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(container);
    }

    return () => {
      if (rAFId) cancelAnimationFrame(rAFId);
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [calculateLayout]);

  return {
    containerRef,
    measureRef,
    visibleItems,
    overflowItems,
    hasOverflow: overflowItems.length > 0,
    isItemActive,
    recalculate: calculateLayout,
  };
}
