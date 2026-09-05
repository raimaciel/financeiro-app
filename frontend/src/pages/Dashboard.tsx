import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import type { DashboardData } from "@/types";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  Repeat,
  Target,
  FileSpreadsheet,
  TrendingDown,
  Wallet,
  Landmark,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard as CreditCardIcon,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Loader2,
  AlertCircle,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Tag,
  Layers,
  Sparkles,
  DollarSign,
  ShoppingCart,
  Home,
  Car,
  Utensils,
  Heart,
  Briefcase,
  GraduationCap,
  Plane,
  Gift,
  Smartphone,
  Music,
  Coffee,
  Shirt,
  Dumbbell,
  Baby,
  Stethoscope,
  Zap,
  Droplets,
  Wifi,
  Bus,
  PiggyBank,
  Building2,
  TreePine,
  ShoppingBag,
  CircleDollarSign,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ── Ícones do sistema ───────────────────────────────────────────────────────

const ICONS_MAP: Record<string, React.ReactNode> = {
  ShoppingCart: <ShoppingCart className="h-4 w-4" />,
  Home: <Home className="h-4 w-4" />,
  Car: <Car className="h-4 w-4" />,
  Utensils: <Utensils className="h-4 w-4" />,
  Heart: <Heart className="h-4 w-4" />,
  Briefcase: <Briefcase className="h-4 w-4" />,
  GraduationCap: <GraduationCap className="h-4 w-4" />,
  Plane: <Plane className="h-4 w-4" />,
  Gift: <Gift className="h-4 w-4" />,
  TrendingUp: <TrendingUp className="h-4 w-4" />,
  DollarSign: <DollarSign className="h-4 w-4" />,
  Smartphone: <Smartphone className="h-4 w-4" />,
  Music: <Music className="h-4 w-4" />,
  Coffee: <Coffee className="h-4 w-4" />,
  Shirt: <Shirt className="h-4 w-4" />,
  Dumbbell: <Dumbbell className="h-4 w-4" />,
  Baby: <Baby className="h-4 w-4" />,
  Stethoscope: <Stethoscope className="h-4 w-4" />,
  Zap: <Zap className="h-4 w-4" />,
  Droplets: <Droplets className="h-4 w-4" />,
  Wifi: <Wifi className="h-4 w-4" />,
  Bus: <Bus className="h-4 w-4" />,
  PiggyBank: <PiggyBank className="h-4 w-4" />,
  Building2: <Building2 className="h-4 w-4" />,
  TreePine: <TreePine className="h-4 w-4" />,
  ShoppingBag: <ShoppingBag className="h-4 w-4" />,
  Wallet: <Wallet className="h-4 w-4" />,
  CircleDollarSign: <CircleDollarSign className="h-4 w-4" />,
};

function renderCategoryIcon(iconName?: string) {
  if (iconName && ICONS_MAP[iconName]) {
    return ICONS_MAP[iconName];
  }
  return <Tag className="h-4 w-4" />;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCurrentYearMonth(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function formatMonthLabel(yearMonth: string): string {
  const [yyyy, mm] = yearMonth.split("-");
  const date = new Date(Number(yyyy), Number(mm) - 1, 1);
  const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${yyyy}`;
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [yyyy, mm] = yearMonth.split("-");
  const d = new Date(Number(yyyy), Number(mm) - 1 + delta, 1);
  const nextY = d.getFullYear();
  const nextM = String(d.getMonth() + 1).padStart(2, "0");
  return `${nextY}-${nextM}`;
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

// ── API calls ──────────────────────────────────────────────────────────────

const fetchDashboard = async (workspaceId: string, month: string): Promise<DashboardData> => {
  const res = await api.get(`/workspaces/${workspaceId}/dashboard`, {
    params: { month },
  });
  return res.data;
};

// ── Tooltip Customizado para Gráficos ──────────────────────────────────────

function CustomAreaTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-lg border shadow-lg text-xs space-y-1">
        <p className="font-bold text-slate-800 border-b pb-1 mb-1">{label}</p>
        <p className="text-green-600 font-semibold flex items-center justify-between gap-3">
          <span>Receitas:</span>
          <span>{formatCurrency(payload[0]?.value || 0)}</span>
        </p>
        <p className="text-red-600 font-semibold flex items-center justify-between gap-3">
          <span>Despesas:</span>
          <span>{formatCurrency(payload[1]?.value || 0)}</span>
        </p>
        {payload[0] && payload[1] && (
          <p className="text-slate-700 font-bold pt-1 border-t flex items-center justify-between gap-3">
            <span>Saldo:</span>
            <span>{formatCurrency((payload[0].value || 0) - (payload[1].value || 0))}</span>
          </p>
        )}
      </div>
    );
  }
  return null;
}

function CustomPieTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-2.5 rounded-lg border shadow-lg text-xs space-y-0.5">
        <p className="font-bold text-slate-900 flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
          {data.name}
        </p>
        <p className="font-semibold text-slate-700">{formatCurrency(data.total)}</p>
        <p className="text-[11px] text-muted-foreground">{data.percentage}% do total</p>
      </div>
    );
  }
  return null;
}

// ── Componente Principal ───────────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Corrente",
  savings: "Poupança",
  investment: "Investimento",
  cash: "Dinheiro",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { selectedWorkspaceId } = useWorkspace();
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());

  const {
    data: dashboard,
    isLoading: loadingDashboard,
    isError: errorDashboard,
  } = useQuery({
    queryKey: ["dashboard", selectedWorkspaceId, selectedMonth],
    queryFn: () => fetchDashboard(selectedWorkspaceId, selectedMonth),
    enabled: !!selectedWorkspaceId,
  });

  const { data: recurringData } = useQuery({
    queryKey: ["recurring", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return null;
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/recurring`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  const { data: budgetsData } = useQuery({
    queryKey: ["budgets", selectedWorkspaceId, selectedMonth],
    queryFn: async () => {
      if (!selectedWorkspaceId) return null;
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/budgets?month=${selectedMonth}`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  const budgetsSummary = budgetsData?.summary;
  const recurringSummary = recurringData?.summary;
  const summary = dashboard?.summary;
  const accountsBalance = dashboard?.accounts_balance || [];
  const totalAccountsBalance = dashboard?.total_accounts_balance ?? 0;
  const hasTransactions = (summary?.total_income || 0) > 0 || (summary?.total_expense || 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Financeiro</h1>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs gap-1">
              <Sparkles className="h-3 w-3" /> Visão Geral
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Métricas consolidadas, gráficos evolutivos e saúde financeira.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:self-start">
          <Link to="/transactions">
            <Button size="sm" className="gap-2 font-semibold shadow-sm">
              <Plus className="h-4 w-4" />
              Novo Lançamento
            </Button>
          </Link>
        </div>
      </div>

      {/* Barra de Navegação Mensal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="text-sm font-semibold text-slate-700">
          Período de Referência
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
            title="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-semibold min-w-[170px] justify-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{formatMonthLabel(selectedMonth)}</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
            title="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {selectedMonth !== getCurrentYearMonth() && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-primary"
              onClick={() => setSelectedMonth(getCurrentYearMonth())}
            >
              Mês atual
            </Button>
          )}
        </div>
      </div>

      {/* Estados de Carregamento e Erro */}
      {loadingDashboard && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Calculando métricas financeiras...</p>
        </div>
      )}

      {errorDashboard && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>Não foi possível carregar o dashboard. Verifique sua conexão e tente novamente.</span>
        </div>
      )}

      {!loadingDashboard && !errorDashboard && dashboard && (
        <>
          {/* 1. CARDS DE MÉTRICAS PRINCIPAIS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Receitas */}
            <Card className="border-l-4 border-l-green-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Receitas do Mês
                </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold text-green-600">
                  {formatCurrency(summary?.total_income || 0)}
                </p>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  {summary && summary.income_change_percent !== 0 ? (
                    summary.income_change_percent > 0 ? (
                      <span className="text-green-600 font-semibold flex items-center">
                        <ArrowUpRight className="h-3.5 w-3.5" /> +{summary.income_change_percent}%
                      </span>
                    ) : (
                      <span className="text-red-600 font-semibold flex items-center">
                        <ArrowDownRight className="h-3.5 w-3.5" /> {summary.income_change_percent}%
                      </span>
                    )
                  ) : (
                    <span>0%</span>
                  )}
                  <span>vs mês anterior</span>
                </div>
              </CardContent>
            </Card>

            {/* Despesas */}
            <Card className="border-l-4 border-l-red-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Despesas do Mês
                </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                  <TrendingDown className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold text-red-600">
                  {formatCurrency(summary?.total_expense || 0)}
                </p>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  {summary && summary.expense_change_percent !== 0 ? (
                    summary.expense_change_percent > 0 ? (
                      <span className="text-red-600 font-semibold flex items-center">
                        <ArrowUpRight className="h-3.5 w-3.5" /> +{summary.expense_change_percent}%
                      </span>
                    ) : (
                      <span className="text-green-600 font-semibold flex items-center">
                        <ArrowDownRight className="h-3.5 w-3.5" /> {summary.expense_change_percent}%
                      </span>
                    )
                  ) : (
                    <span>0%</span>
                  )}
                  <span>vs mês anterior</span>
                </div>
              </CardContent>
            </Card>

            {/* Saldo Líquido */}
            <Card
              className={`border-l-4 shadow-sm ${
                (summary?.balance || 0) >= 0 ? "border-l-blue-500" : "border-l-amber-500"
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Saldo Líquido
                </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <Wallet className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p
                  className={`text-2xl font-extrabold ${
                    (summary?.balance || 0) >= 0 ? "text-slate-900" : "text-amber-600"
                  }`}
                >
                  {formatCurrency(summary?.balance || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(summary?.balance || 0) >= 0 ? "✓ Superávit financeiro" : "⚠️ Atenção: déficit no mês"}
                </p>
              </CardContent>
            </Card>

            {/* Faturas a Vencer */}
            <Card className="border-l-4 border-l-purple-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Faturas em Aberto
                </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                  <Receipt className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold text-purple-700">
                  {formatCurrency(dashboard.invoices_summary.total_invoices_due)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboard.invoices_summary.invoices_due_count}{" "}
                  {dashboard.invoices_summary.invoices_due_count === 1 ? "fatura a vencer" : "faturas a vencer"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* SEÇÃO: SALDO POR CONTA */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold tracking-tight text-slate-900">
                  Saldo por Conta
                </h2>
              </div>
              {accountsBalance.length > 0 && (
                <div className="flex items-center gap-2 text-sm bg-slate-50 px-3.5 py-1.5 rounded-lg border">
                  <span className="text-muted-foreground font-medium">Saldo Total em Contas:</span>
                  <span
                    className={`font-bold text-base ${
                      totalAccountsBalance >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(totalAccountsBalance)}
                  </span>
                </div>
              )}
            </div>

            {accountsBalance.length === 0 ? (
              <Card className="border-dashed bg-slate-50/50 shadow-sm">
                <CardContent className="flex flex-col sm:flex-row items-center justify-between p-4 gap-4 text-center sm:text-left">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      <Landmark className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Nenhuma conta bancária cadastrada
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cadastre suas contas correntes, poupanças ou investimentos para acompanhar seus saldos em tempo real.
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0 font-semibold">
                    <Link to="/accounts">
                      <Plus className="h-3.5 w-3.5" />
                      Cadastrar Conta
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {accountsBalance.map((acc) => {
                  const isPositive = acc.current_balance >= 0;
                  return (
                    <Card key={acc.id} className="hover:shadow-md transition-shadow relative overflow-hidden bg-white shadow-sm">
                      <div
                        className="absolute top-0 left-0 bottom-0 w-1.5"
                        style={{ backgroundColor: acc.color || "#2563eb" }}
                      />
                      <CardContent className="p-4 pl-5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Landmark className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <p className="text-sm font-bold text-slate-900 truncate" title={acc.name}>
                                {acc.name}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {acc.bank_name || "Instituição financeira"}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-semibold uppercase px-1.5 py-0 shrink-0 bg-slate-50">
                            {ACCOUNT_TYPE_LABELS[acc.account_type] || acc.account_type}
                          </Badge>
                        </div>

                        <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-slate-100">
                          <span className="text-xs text-muted-foreground">Saldo atual</span>
                          <span
                            className={`text-base font-extrabold tracking-tight ${
                              isPositive ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(acc.current_balance)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. GRÁFICOS (LINHA/ÁREA E PIE/DONUT) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico de Evolução (2 colunas) */}
            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <LineChartIcon className="h-4 w-4 text-primary" />
                      Evolução Financeira (Últimos 6 Meses)
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Comparativo de receitas vs despesas ao longo do tempo.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={dashboard.evolution_last_6_months}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22C55E" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748B" fontSize={11} tickLine={false} tickFormatter={(val) => `R$${val}`} />
                      <Tooltip content={<CustomAreaTooltip />} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        wrapperStyle={{ fontSize: 11, paddingBottom: 10 }}
                      />
                      <Area
                        type="monotone"
                        name="Receitas"
                        dataKey="income"
                        stroke="#22C55E"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorIncome)"
                      />
                      <Area
                        type="monotone"
                        name="Despesas"
                        dataKey="expense"
                        stroke="#EF4444"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorExpense)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gráfico de Distribuição por Categoria (1 coluna) */}
            <Card className="shadow-sm flex flex-col justify-between">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-primary" />
                  Despesas por Categoria
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Distribuição percentual dos gastos no mês.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-center">
                {dashboard.expenses_by_category.length === 0 ? (
                  <div className="h-[240px] flex flex-col items-center justify-center text-center text-xs text-muted-foreground">
                    <PieChartIcon className="h-8 w-8 text-slate-300 mb-2" />
                    Nenhuma despesa registrada neste mês.
                  </div>
                ) : (
                  <>
                    <div className="h-[180px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip content={<CustomPieTooltip />} />
                          <Pie
                            data={dashboard.expenses_by_category}
                            dataKey="total"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={3}
                          >
                            {dashboard.expenses_by_category.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color || "#64748B"} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-2 space-y-1.5 max-h-[110px] overflow-y-auto pr-1 text-xs">
                      {dashboard.expenses_by_category.map((cat) => (
                        <div key={cat.category_id} className="flex items-center justify-between text-slate-700">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 font-medium">
                            <span>{formatCurrency(cat.total)}</span>
                            <span className="text-muted-foreground text-[10px]">({cat.percentage}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 3. GRIDS INFERIORES: TOP GASTOS, FATURAS E LIMITE DE CARTÕES */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Top 5 Maiores Gastos */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Top 5 Maiores Gastos</span>
                  <Link to="/transactions" className="text-xs font-normal text-primary hover:underline">
                    Ver todos
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2.5">
                {dashboard.top_expenses.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Nenhum gasto registrado neste mês.
                  </p>
                ) : (
                  dashboard.top_expenses.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: tx.category_color || "#64748B" }}
                        >
                          {renderCategoryIcon(tx.category_icon)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">
                            {tx.description || "Sem descrição"}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{formatDateBR(tx.date)}</span>
                            {tx.category_name && <span>• {tx.category_name}</span>}
                            {tx.installments && tx.installments > 1 && (
                              <span className="text-purple-700 bg-purple-50 px-1 py-0.2 rounded font-semibold">
                                {tx.installmentCurrent}/{tx.installments}x
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="font-bold text-sm text-red-600 shrink-0 ml-2">
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Faturas a Vencer (Próximos 30 dias) */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Faturas a Vencer</span>
                  <Link to="/credit-cards" className="text-xs font-normal text-primary hover:underline">
                    Ver cartões
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2.5">
                {dashboard.invoices_summary.upcoming_invoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    🎉 Nenhuma fatura pendente para este período!
                  </p>
                ) : (
                  dashboard.invoices_summary.upcoming_invoices.map((inv) => (
                    <Link
                      to="/credit-cards"
                      key={inv.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border hover:border-slate-300 transition-colors text-xs group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0 font-bold text-[10px]"
                          style={{ backgroundColor: inv.card_color || "#1a1a2e" }}
                        >
                          <CreditCardIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate group-hover:text-primary">
                            {inv.card_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Vence em {formatDateBR(inv.due_date)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-bold text-slate-900">{formatCurrency(inv.total_amount)}</p>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                            inv.days_until_due < 0
                              ? "bg-red-100 text-red-700"
                              : inv.days_until_due <= 3
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {inv.days_until_due < 0
                            ? `Venceu há ${Math.abs(inv.days_until_due)}d`
                            : inv.days_until_due === 0
                            ? "Vence hoje"
                            : `Em ${inv.days_until_due}d`}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Saldo Disponível em Cartões */}
            <Card className="shadow-sm flex flex-col justify-between">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Limite em Cartões</span>
                  <Link to="/credit-cards" className="text-xs font-normal text-primary hover:underline">
                    Gerenciar
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Utilização de limite</span>
                    <span className="font-bold text-slate-800">
                      {dashboard.cards_summary.usage_percentage}%
                    </span>
                  </div>
                  {/* Barra de Progresso */}
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        dashboard.cards_summary.usage_percentage > 85
                          ? "bg-red-500"
                          : dashboard.cards_summary.usage_percentage > 60
                          ? "bg-amber-500"
                          : "bg-indigo-600"
                      }`}
                      style={{ width: `${Math.min(100, dashboard.cards_summary.usage_percentage)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2 text-xs border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Limite Total:</span>
                    <span className="font-semibold text-slate-800">
                      {formatCurrency(dashboard.cards_summary.total_limit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Limite Comprometido:</span>
                    <span className="font-semibold text-red-600">
                      {formatCurrency(dashboard.cards_summary.used_limit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="font-bold text-slate-900">Limite Disponível:</span>
                    <span className="font-extrabold text-green-600">
                      {formatCurrency(dashboard.cards_summary.available_limit)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
