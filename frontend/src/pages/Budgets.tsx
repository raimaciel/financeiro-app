import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import api from "@/lib/api";
import type { BudgetListResponse, Category } from "@/types";
function formatCurrency(val: number): string { return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart,
  Plus,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  Calendar,
  Wallet,
  ArrowDownCircle,
  TrendingDown,
  Sparkles,
} from "lucide-react";

export default function Budgets() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id;

  const [currentMonth, setCurrentMonth] = useState(() => {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | "">("");
  const [limitAmount, setLimitAmount] = useState<string>("");
  const [alertThreshold, setAlertThreshold] = useState<number>(80);
  const [errorMsg, setErrorMsg] = useState("");

  // Navegação de mês
  const handlePrevMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    setCurrentMonth(prevDate.toISOString().slice(0, 7));
  };

  const handleNextMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const nextDate = new Date(y, m, 1);
    setCurrentMonth(nextDate.toISOString().slice(0, 7));
  };

  // Buscar orçamentos do mês
  const { data, isLoading } = useQuery<BudgetListResponse>({
    queryKey: ["budgets", workspaceId, currentMonth],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${workspaceId}/budgets?month=${currentMonth}`);
      return res.data;
    },
    enabled: !!workspaceId,
  });

  // Buscar categorias para o modal de orçamento
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories", workspaceId],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${workspaceId}/categories`);
      return res.data;
    },
    enabled: !!workspaceId,
  });

  // Mutation: Upsert de orçamento
  const saveBudgetMutation = useMutation({
    mutationFn: async (payload: { category_id: number; limit_amount: number; month: string; alert_threshold_percent: number }) => {
      return api.post(`/workspaces/${workspaceId}/budgets`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets", workspaceId, currentMonth] });
      setIsModalOpen(false);
      setSelectedCategory("");
      setLimitAmount("");
      setErrorMsg("");
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error || "Erro ao salvar orçamento.");
    },
  });

  // Mutation: Exclusão de orçamento
  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/workspaces/${workspaceId}/budgets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets", workspaceId, currentMonth] });
    },
  });

  const handleOpenCreateModal = () => {
    setSelectedCategory("");
    setLimitAmount("");
    setAlertThreshold(80);
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const handleEditBudget = (category_id: number, current_limit: number, threshold?: number) => {
    setSelectedCategory(category_id);
    setLimitAmount(String(current_limit));
    setAlertThreshold(threshold || 80);
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) {
      setErrorMsg("Selecione uma categoria.");
      return;
    }
    const val = Number(limitAmount.replace(",", "."));
    if (isNaN(val) || val <= 0) {
      setErrorMsg("Informe um limite mensal válido.");
      return;
    }

    saveBudgetMutation.mutate({
      category_id: Number(selectedCategory),
      limit_amount: val,
      month: currentMonth,
      alert_threshold_percent: Number(alertThreshold) || 80,
    });
  };

  const summary = data?.summary || {
    total_budgeted: 0,
    total_spent: 0,
    total_remaining: 0,
    warning_count: 0,
    exceeded_count: 0,
    ok_count: 0,
  };

  const budgets = data?.budgets || [];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <PieChart className="h-6 w-6 text-primary" />
            Orçamentos por Categoria
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Defina tetos de gastos mensais e acompanhe o consumo em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Seletor de Mês */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-2xs p-1">
            <button
              onClick={handlePrevMonth}
              aria-label="Mês anterior"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1 font-semibold text-sm text-slate-800">
              <Calendar className="h-4 w-4 text-primary" />
              <input
                type="month"
                aria-label="Selecionar Mês"
                value={currentMonth}
                onChange={(e) => e.target.value && setCurrentMonth(e.target.value)}
                className="font-semibold text-sm bg-transparent border-none focus:outline-hidden cursor-pointer"
              />
            </div>
            <button
              onClick={handleNextMonth}
              aria-label="Próximo mês"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <Button onClick={handleOpenCreateModal} className="flex items-center gap-1.5 shadow-xs">
            <Plus className="h-4 w-4" />
            Definir Orçamento
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Orçado
            </CardTitle>
            <Wallet className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatCurrency(summary.total_budgeted)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Limite total definido para o mês</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Gasto
            </CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">
              {formatCurrency(summary.total_spent)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Gasto real nas categorias orçadas</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Saldo Restante
            </CardTitle>
            <TrendingDown className={`h-4 w-4 ${summary.total_remaining >= 0 ? "text-emerald-600" : "text-rose-600"}`} />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                summary.total_remaining >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatCurrency(summary.total_remaining)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {summary.total_remaining >= 0 ? "Disponível para gastar" : "Orçamento estourado"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Status de Alerta
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {summary.warning_count + summary.exceeded_count}
              </span>
              <span className="text-xs text-slate-500">em alerta</span>
            </div>
            <div className="flex gap-2 mt-1 text-xs">
              {summary.warning_count > 0 && (
                <span className="text-amber-600 font-medium">⚠️ {summary.warning_count} atenção</span>
              )}
              {summary.exceeded_count > 0 && (
                <span className="text-rose-600 font-medium">🚨 {summary.exceeded_count} excedido(s)</span>
              )}
              {summary.warning_count === 0 && summary.exceeded_count === 0 && (
                <span className="text-emerald-600 font-medium">✓ Tudo sob controle</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Orçamentos */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
          <CardTitle className="text-base font-bold text-slate-900">
            Categorias e Limites Mensais
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Carregando orçamentos...</div>
          ) : budgets.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Sparkles className="h-10 w-10 text-slate-300 mx-auto" />
              <h3 className="font-semibold text-base text-slate-700">Nenhum orçamento para este mês</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                Defina limites para suas categorias essenciais para receber alertas automáticos antes de estourar seus gastos.
              </p>
              <Button onClick={handleOpenCreateModal} variant="outline" className="mt-2">
                <Plus className="h-4 w-4 mr-1.5" />
                Definir Primeiro Orçamento
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {budgets.map((item) => {
                const percentage = item.percentage_used || 0;
                const isExceeded = item.status === "exceeded";
                const isWarning = item.status === "warning";

                const barColor = isExceeded
                  ? "bg-rose-500"
                  : isWarning
                  ? "bg-amber-500"
                  : "bg-emerald-500";

                const badgeBg = isExceeded
                  ? "bg-rose-100 text-rose-700"
                  : isWarning
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700";

                const badgeText = isExceeded ? "Excedido" : isWarning ? "Atenção" : "Normal";

                return (
                  <div key={item.id} className="p-5 hover:bg-slate-50/60 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.category_color || "#64748b" }}
                        />
                        <h4 className="font-bold text-sm text-slate-900">{item.category_name}</h4>
                        <Badge variant="secondary" className={`text-[10px] font-bold ${badgeBg}`}>
                          {badgeText}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm font-medium">
                        <div className="text-slate-600">
                          <span className="font-bold text-slate-900">{formatCurrency(item.spent_amount)}</span>
                          {" de "}
                          <span className="text-slate-500">{formatCurrency(item.monthly_limit)}</span>
                        </div>

                        <div className="text-right font-bold text-sm min-w-14">
                          {percentage.toFixed(1)}%
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditBudget(item.category_id, item.monthly_limit, item.alert_threshold_percent)}
                            className="p-1 text-slate-400 hover:text-primary rounded-md transition-colors"
                            title="Editar Limite"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteBudgetMutation.mutate(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                            title="Excluir Orçamento"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Barra de Progresso */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.min(100, percentage)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1.5">
                      <span>
                        {item.remaining_amount >= 0
                          ? `Resta ${formatCurrency(item.remaining_amount)}`
                          : `Ultrapassado em ${formatCurrency(Math.abs(item.remaining_amount))}`}
                      </span>
                      <span>Alerta em {item.alert_threshold_percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Definir / Editar Orçamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900">Definir Orçamento Mensal</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-600">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria *</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(Number(e.target.value))}
                  className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  <option value="">Selecione a categoria</option>
                  {categories
                    .filter((c) => c.type === "expense")
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Limite Mensal (R$) *
                </label>
                <Input
                  type="text"
                  placeholder="Ex: 800,00"
                  value={limitAmount}
                  onChange={(e) => setLimitAmount(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mês de Referência
                </label>
                <Input
                  type="month"
                  value={currentMonth}
                  disabled
                  className="bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gatilho de Alerta (%)
                </label>
                <Input
                  type="number"
                  min="50"
                  max="99"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-400">
                  Notifica quando atingir este percentual (padrão 80%).
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveBudgetMutation.isPending}>
                  {saveBudgetMutation.isPending ? "Salvando..." : "Salvar Orçamento"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
