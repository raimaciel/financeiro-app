import React, { useState } from "react";
import type { CreditCard } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Filter,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  SlidersHorizontal,
  Building2,
  Calendar,
  CreditCard as CreditCardIcon,
  Cloud,
} from "lucide-react";

export interface CardFilterState {
  bank: string;
  brand: string;
  cardType: string;
  period: string; // 'all' | '7d' | '30d' | '90d'
  sortBy: "name" | "limit" | "due_day" | "closing_day" | "expires_at";
  sortDir: "asc" | "desc";
  search: string;
}

export const DEFAULT_FILTERS: CardFilterState = {
  bank: "all",
  brand: "all",
  cardType: "all",
  period: "all",
  sortBy: "name",
  sortDir: "asc",
  search: "",
};

interface CreditCardFiltersProps {
  cards: CreditCard[];
  filters: CardFilterState;
  onFilterChange: (updater: CardFilterState | ((prev: CardFilterState) => CardFilterState)) => void;
  filteredCount: number;
  totalCount: number;
}

export function CreditCardFilters({
  cards,
  filters,
  onFilterChange,
  filteredCount,
  totalCount,
}: CreditCardFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Extrair opções únicas a partir dos cartões cadastrados
  const uniqueBanks = Array.from(
    new Set(
      cards
        .map((c) => c.bank_name || c.bankName || c.bank)
        .filter((b): b is string => !!b && b.trim() !== "")
    )
  ).sort((a, b) => a.localeCompare(b));

  const uniqueBrands = Array.from(
    new Set(
      cards
        .map((c) => c.brand)
        .filter((b): b is string => !!b && b.trim() !== "")
    )
  ).sort((a, b) => a.localeCompare(b));

  const hasActiveFilters =
    filters.bank !== "all" ||
    filters.brand !== "all" ||
    filters.cardType !== "all" ||
    filters.period !== "all" ||
    filters.search !== "" ||
    filters.sortBy !== "name" ||
    filters.sortDir !== "asc";

  const handleReset = () => {
    onFilterChange(DEFAULT_FILTERS);
  };

  const toggleSortDir = () => {
    onFilterChange((prev) => ({
      ...prev,
      sortDir: prev.sortDir === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 shadow-2xs space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Mobile Filter Button */}
        <div className="flex sm:hidden items-center justify-between w-full">
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs bg-white">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros e Ordenação {hasActiveFilters && "•"}
              </Button>
            </DialogTrigger>
            {mobileOpen && (
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" /> Filtros de Cartões
                  </DialogTitle>
                </DialogHeader>
                <div className="py-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Busca */}
                    <div className="w-full">
                      <Input
                        placeholder="Buscar cartão por nome, banco..."
                        value={filters.search}
                        onChange={(e) => {
                          const val = e.target.value;
                          onFilterChange((prev) => ({ ...prev, search: val }));
                        }}
                        className="h-9 text-xs bg-white"
                      />
                    </div>

                    {/* Banco */}
                    <div className="w-full">
                      <Select
                        value={filters.bank}
                        onValueChange={(val) =>
                          onFilterChange((prev) => ({ ...prev, bank: val }))
                        }
                      >
                        <SelectTrigger className="h-9 text-xs bg-white">
                          <SelectValue placeholder="Banco" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">🏦 Todos os Bancos</SelectItem>
                          {uniqueBanks.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Bandeira */}
                    <div className="w-full">
                      <Select
                        value={filters.brand}
                        onValueChange={(val) =>
                          onFilterChange((prev) => ({ ...prev, brand: val }))
                        }
                      >
                        <SelectTrigger className="h-9 text-xs bg-white">
                          <SelectValue placeholder="Bandeira" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">💳 Todas as Bandeiras</SelectItem>
                          <SelectItem value="Visa">Visa</SelectItem>
                          <SelectItem value="Mastercard">Mastercard</SelectItem>
                          <SelectItem value="Elo">Elo</SelectItem>
                          <SelectItem value="American Express">American Express</SelectItem>
                          <SelectItem value="Hipercard">Hipercard</SelectItem>
                          {uniqueBrands
                            .filter((b) => !["Visa", "Mastercard", "Elo", "American Express", "Hipercard"].includes(b))
                            .map((b) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Tipo: Físico / Virtual / Todos */}
                    <div className="w-full">
                      <Select
                        value={filters.cardType}
                        onValueChange={(val) =>
                          onFilterChange((prev) => ({ ...prev, cardType: val }))
                        }
                      >
                        <SelectTrigger className="h-9 text-xs bg-white">
                          <SelectValue placeholder="Tipo de Cartão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">📂 Todos os Tipos</SelectItem>
                          <SelectItem value="physical">🪪 Físico</SelectItem>
                          <SelectItem value="virtual">⚡ Virtual (Todos)</SelectItem>
                          <SelectItem value="virtual_permanent">♾️ Virtual Permanente</SelectItem>
                          <SelectItem value="virtual_temporary">⏱️ Virtual Temporário</SelectItem>
                          <SelectItem value="virtual_app_linked">🔗 Virtual App/Site</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cadastrado em (Período) */}
                    <div className="w-full">
                      <Select
                        value={filters.period}
                        onValueChange={(val) =>
                          onFilterChange((prev) => ({ ...prev, period: val }))
                        }
                      >
                        <SelectTrigger className="h-9 text-xs bg-white">
                          <SelectValue placeholder="Cadastrado em" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">📅 Cadastro: Todos os períodos</SelectItem>
                          <SelectItem value="7d">Últimos 7 dias</SelectItem>
                          <SelectItem value="30d">Últimos 30 dias</SelectItem>
                          <SelectItem value="90d">Últimos 90 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Ordenação */}
                    <div className="w-full">
                      <Select
                        value={filters.sortBy}
                        onValueChange={(val: any) =>
                          onFilterChange((prev) => ({ ...prev, sortBy: val }))
                        }
                      >
                        <SelectTrigger className="h-9 text-xs bg-white">
                          <SelectValue placeholder="Ordenar por" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Nome (A-Z / Z-A)</SelectItem>
                          <SelectItem value="limit">Limite (Maior / Menor)</SelectItem>
                          <SelectItem value="due_day">Data de Vencimento</SelectItem>
                          <SelectItem value="closing_day">Data de Fechamento</SelectItem>
                          <SelectItem value="expires_at">Data de Expiração</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-rose-600">
                      Limpar Filtros
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setMobileOpen(false)} className="ml-auto text-xs">
                    Ver Resultados ({filteredCount})
                  </Button>
                </div>
              </DialogContent>
            )}
          </Dialog>

          <Badge variant="secondary" className="text-[11px] font-semibold bg-white border">
            {filteredCount} de {totalCount} cartões
          </Badge>
        </div>

        {/* Desktop Filter Controls */}
        <div className="hidden sm:flex flex-1 items-center gap-2 flex-wrap">
          {/* 1. Busca por nome */}
          <div className="w-full sm:w-44">
            <Input
              placeholder="Buscar cartão..."
              value={filters.search}
              onChange={(e) => {
                const val = e.target.value;
                onFilterChange((prev) => ({ ...prev, search: val }));
              }}
              className="h-9 text-xs bg-white"
            />
          </div>

          {/* 2. Banco */}
          <div className="w-full sm:w-36">
            <Select
              value={filters.bank}
              onValueChange={(val) =>
                onFilterChange((prev) => ({ ...prev, bank: val }))
              }
            >
              <SelectTrigger className="h-9 text-xs bg-white">
                <SelectValue placeholder="Banco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🏦 Todos os Bancos</SelectItem>
                {uniqueBanks.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Bandeira */}
          <div className="w-full sm:w-36">
            <Select
              value={filters.brand}
              onValueChange={(val) =>
                onFilterChange((prev) => ({ ...prev, brand: val }))
              }
            >
              <SelectTrigger className="h-9 text-xs bg-white">
                <SelectValue placeholder="Bandeira" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">💳 Todas Bandeiras</SelectItem>
                <SelectItem value="Visa">Visa</SelectItem>
                <SelectItem value="Mastercard">Mastercard</SelectItem>
                <SelectItem value="Elo">Elo</SelectItem>
                <SelectItem value="American Express">American Express</SelectItem>
                <SelectItem value="Hipercard">Hipercard</SelectItem>
                {uniqueBrands
                  .filter((b) => !["Visa", "Mastercard", "Elo", "American Express", "Hipercard"].includes(b))
                  .map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* 4. Tipo de Cartão (Físico / Virtual / Todos) */}
          <div className="w-full sm:w-40">
            <Select
              value={filters.cardType}
              onValueChange={(val) =>
                onFilterChange((prev) => ({ ...prev, cardType: val }))
              }
            >
              <SelectTrigger className="h-9 text-xs bg-white">
                <SelectValue placeholder="Tipo de Cartão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📂 Todos os Tipos</SelectItem>
                <SelectItem value="physical">🪪 Físico</SelectItem>
                <SelectItem value="virtual">⚡ Virtual (Todos)</SelectItem>
                <SelectItem value="virtual_permanent">♾️ Virtual Permanente</SelectItem>
                <SelectItem value="virtual_temporary">⏱️ Virtual Temporário</SelectItem>
                <SelectItem value="virtual_app_linked">🔗 Virtual App/Site</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 5. Cadastrado em (Intervalo / Período) */}
          <div className="w-full sm:w-44">
            <Select
              value={filters.period}
              onValueChange={(val) =>
                onFilterChange((prev) => ({ ...prev, period: val }))
              }
            >
              <SelectTrigger className="h-9 text-xs bg-white">
                <SelectValue placeholder="Cadastrado em" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📅 Cadastro: Todos</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 6. Ordenação */}
          <div className="w-full sm:w-44">
            <Select
              value={filters.sortBy}
              onValueChange={(val: any) =>
                onFilterChange((prev) => ({ ...prev, sortBy: val }))
              }
            >
              <SelectTrigger className="h-9 text-xs bg-white">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nome (A-Z / Z-A)</SelectItem>
                <SelectItem value="limit">Limite (Maior/Menor)</SelectItem>
                <SelectItem value="due_day">Data de Vencimento</SelectItem>
                <SelectItem value="closing_day">Data de Fechamento</SelectItem>
                <SelectItem value="expires_at">Data de Expiração</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 7. Botão Toggle Direção (↑/↓) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleSortDir}
            className="h-9 px-2.5 bg-white text-xs font-semibold gap-1 shrink-0"
            title={filters.sortDir === "asc" ? "Ordem Crescente (clique para inverter)" : "Ordem Decrescente (clique para inverter)"}
          >
            {filters.sortDir === "asc" ? (
              <>
                <ArrowUp className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px]">Cresc.</span>
              </>
            ) : (
              <>
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px]">Decresc.</span>
              </>
            )}
          </Button>

          {/* 8. Botão Reset */}
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-9 px-2.5 text-xs text-muted-foreground hover:text-rose-600 gap-1 shrink-0"
              title="Limpar todos os filtros"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </Button>
          )}
        </div>

        {/* Desktop Count Badge */}
        <div className="hidden sm:flex items-center shrink-0">
          <Badge variant="secondary" className="text-xs font-semibold px-2.5 py-1 bg-white border shadow-2xs">
            {filteredCount === totalCount
              ? `${totalCount} ${totalCount === 1 ? "cartão" : "cartões"}`
              : `${filteredCount} de ${totalCount} cartões`}
          </Badge>
        </div>
      </div>
    </div>
  );
}
