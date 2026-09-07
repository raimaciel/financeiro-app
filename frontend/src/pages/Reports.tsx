import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import api from "@/lib/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";
function formatCurrency(val: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(val || 0);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
import type {
  ReportSummaryResponse,
  BankAccount,
  Category,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Calendar,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  TrendingDown,
  Scale,
  Hash,
  Loader2,
  Landmark,
  Tags,
  AlertCircle,
  Filter,
} from "lucide-react";

// ── Helpers de Período ──────────────────────────────────────────────────────

type PeriodPreset = "this_month" | "last_month" | "last_30" | "this_year" | "custom";

function getPresetDates(preset: PeriodPreset): { start: string; end: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = now.getMonth();

  if (preset === "this_month") {
    const firstDay = new Date(yyyy, mm, 1);
    const lastDay = new Date(yyyy, mm + 1, 0);
    return {
      start: firstDay.toISOString().split("T")[0],
      end: lastDay.toISOString().split("T")[0],
    };
  }

  if (preset === "last_month") {
    const firstDay = new Date(yyyy, mm - 1, 1);
    const lastDay = new Date(yyyy, mm, 0);
    return {
      start: firstDay.toISOString().split("T")[0],
      end: lastDay.toISOString().split("T")[0],
    };
  }

  if (preset === "last_30") {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    return {
      start: past.toISOString().split("T")[0],
      end: now.toISOString().split("T")[0],
    };
  }

  if (preset === "this_year") {
    return {
      start: `${yyyy}-01-01`,
      end: `${yyyy}-12-31`,
    };
  }

  return { start: "", end: "" };
}

export default function Reports() {
  const { selectedWorkspaceId, selectedWorkspace, workspaces } = useWorkspace();
  const activeWorkspaceId = selectedWorkspaceId || selectedWorkspace?.id;
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Estados dos Filtros
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const defaultDates = useMemo(() => getPresetDates("this_month"), []);
  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Consulta de Contas Bancárias
  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts", activeWorkspaceId],
    queryFn: async () => {
      if (!activeWorkspaceId) return [];
      const res = await api.get(`/workspaces/${activeWorkspaceId}/bank-accounts`);
      return res.data;
    },
    enabled: !!activeWorkspaceId,
  });

  // Consulta de Categorias
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories", activeWorkspaceId],
    queryFn: async () => {
      if (!activeWorkspaceId) return [];
      const res = await api.get(`/workspaces/${activeWorkspaceId}/categories`);
      return res.data;
    },
    enabled: !!activeWorkspaceId,
  });

  // Alterar Preset de Período
  const handlePresetChange = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset !== "custom") {
      const dates = getPresetDates(preset);
      setStartDate(dates.start);
      setEndDate(dates.end);
    }
  };

  // Consulta do Relatório Analítico
  const { data: reportData, isLoading, isFetching } = useQuery<ReportSummaryResponse>({
    queryKey: [
      "reports-summary",
      activeWorkspaceId,
      startDate,
      endDate,
      selectedAccountId,
      selectedCategoryId,
      selectedType,
    ],
    queryFn: async () => {
      if (!activeWorkspaceId) throw new Error("Workspace não selecionado");
      const params = new URLSearchParams();
      if (startDate) params.append("start", startDate);
      if (endDate) params.append("end", endDate);
      if (selectedAccountId && selectedAccountId !== "all") params.append("account_id", selectedAccountId);
      if (selectedCategoryId && selectedCategoryId !== "all") params.append("category_id", selectedCategoryId);
      if (selectedType && selectedType !== "all") params.append("type", selectedType);

      const res = await api.get(`/workspaces/${activeWorkspaceId}/reports/summary?${params.toString()}`);
      return res.data;
    },
    enabled: !!activeWorkspaceId,
  });

  // Formatação para Gráficos
  const categoryChartData = useMemo(() => {
    if (!reportData?.by_category) return [];
    return reportData.by_category
      .filter((c) => c.type === "expense" && c.total > 0)
      .slice(0, 8)
      .map((c) => ({
        name: c.name,
        value: c.total,
        color: c.color || "#64748b",
      }));
  }, [reportData]);

  const accountChartData = useMemo(() => {
    if (!reportData?.by_account) return [];
    return reportData.by_account.map((a) => ({
      name: a.name,
      Receitas: a.total_income,
      Despesas: a.total_expense,
    }));
  }, [reportData]);

  // Nomes dos filtros para relatórios
  const getFilterLabels = () => {
    const acc = selectedAccountId === "all" ? "Todas as Contas" : bankAccounts.find((b) => b.id === selectedAccountId)?.name || selectedAccountId;
    const cat = selectedCategoryId === "all" ? "Todas as Categorias" : categories.find((c) => String(c.id) === selectedCategoryId)?.name || selectedCategoryId;
    const typ = selectedType === "all" ? "Todas (Receitas e Despesas)" : selectedType === "income" ? "Somente Receitas" : "Somente Despesas";
    return { acc, cat, typ };
  };

  // ── Exportação para Excel (.xlsx) ──────────────────────────────────────────

  const handleExportExcel = () => {
    if (!reportData) return;
    setIsExportingExcel(true);
    try {
      const { acc, cat, typ } = getFilterLabels();
      const wb = XLSX.utils.book_new();

      // Aba 1: Transações Detalhadas
      const transactionsHeader = [
        ["RELATÓRIO FINANCEIRO ANALÍTICO"],
        [`Workspace: ${activeWorkspace?.name || "Workspace"}`],
        [`Período: ${startDate || "Início"} até ${endDate || "Hoje"}`],
        [`Filtros: Conta: ${acc} | Categoria: ${cat} | Tipo: ${typ}`],
        [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
        [],
        ["RESUMO CONSOLIDADO"],
        ["Total de Receitas", reportData.totals.income],
        ["Total de Despesas", reportData.totals.expense],
        ["Saldo Líquido", reportData.totals.balance],
        ["Quantidade de Lançamentos", reportData.totals.count],
        [],
        ["LISTA DE TRANSAÇÕES"],
        ["ID", "Data", "Descrição", "Tipo", "Categoria", "Conta Bancária", "Cartão", "Valor (R$)"],
      ];

      const transactionRows = reportData.transactions.map((t) => [
        t.id,
        t.date,
        t.description,
        t.type === "income" ? "Receita" : "Despesa",
        t.category_name || "Sem Categoria",
        t.account_name || "Sem Conta",
        t.credit_card_name || "-",
        t.type === "expense" ? -t.amount : t.amount,
      ]);

      const wsTransactions = XLSX.utils.aoa_to_sheet([
        ...transactionsHeader,
        ...transactionRows,
        [],
        ["TOTAIS", "", "", "", "", "", "", reportData.totals.balance],
      ]);

      XLSX.utils.book_append_sheet(wb, wsTransactions, "Transações");

      // Aba 2: Por Categoria
      const categoryRows = [
        ["AGRUPAMENTO POR CATEGORIA"],
        ["Categoria", "Tipo", "Total (R$)", "Participação (%)"],
        ...reportData.by_category.map((c) => [
          c.name,
          c.type === "income" ? "Receita" : "Despesa",
          c.total,
          `${c.percentage}%`,
        ]),
      ];
      const wsCategories = XLSX.utils.aoa_to_sheet(categoryRows);
      XLSX.utils.book_append_sheet(wb, wsCategories, "Por Categoria");

      // Aba 3: Por Conta Bancária
      const accountRows = [
        ["AGRUPAMENTO POR CONTA BANCÁRIA"],
        ["Conta", "Banco", "Receitas (R$)", "Despesas (R$)", "Resultado Líquido (R$)"],
        ...reportData.by_account.map((a) => [
          a.name,
          a.bank_name,
          a.total_income,
          a.total_expense,
          a.net_total,
        ]),
      ];
      const wsAccounts = XLSX.utils.aoa_to_sheet(accountRows);
      XLSX.utils.book_append_sheet(wb, wsAccounts, "Por Conta");

      const filename = `Relatorio_Financeiro_${startDate || "inicio"}_a_${endDate || "hoje"}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("Erro ao exportar Excel:", err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // ── Exportação para PDF (.pdf) ─────────────────────────────────────────────

  const handleExportPdf = () => {
    if (!reportData) return;
    setIsExportingPdf(true);
    try {
      const { acc, cat, typ } = getFilterLabels();
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

      // Cabeçalho Institucional
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text("Relatório Financeiro Analítico", 40, 45);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Workspace: ${activeWorkspace?.name || "Workspace"}`, 40, 62);
      doc.text(`Período: ${startDate ? formatDate(startDate) : "Início"} até ${endDate ? formatDate(endDate) : "Hoje"}`, 40, 76);
      doc.text(`Filtros: Conta: ${acc} | Categoria: ${cat} | Tipo: ${typ}`, 40, 90);
      doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 40, 104);

      // Caixa de Totais Resumo
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setFillColor(248, 250, 252); // slate-50
      doc.roundedRect(40, 115, 515, 50, 4, 4, "FD");

      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("RECEITAS", 60, 133);
      doc.text("DESPESAS", 200, 133);
      doc.text("SALDO LÍQUIDO", 340, 133);
      doc.text("LANÇAMENTOS", 470, 133);

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(34, 197, 94); // green-500
      doc.text(formatCurrency(reportData.totals.income), 60, 150);

      doc.setTextColor(239, 68, 68); // red-500
      doc.text(formatCurrency(reportData.totals.expense), 200, 150);

      const bal = reportData.totals.balance;
      doc.setTextColor(bal >= 0 ? 37 : 239, bal >= 0 ? 99 : 68, bal >= 0 ? 235 : 68);
      doc.text(formatCurrency(bal), 340, 150);

      doc.setTextColor(30, 41, 59);
      doc.text(String(reportData.totals.count), 470, 150);

      // Tabela de Transações
      const tableRows = reportData.transactions.map((t) => [
        formatDate(t.date),
        t.description,
        t.category_name || "-",
        t.account_name || "-",
        t.type === "income" ? "Receita" : "Despesa",
        (t.type === "expense" ? "-" : "+") + " " + formatCurrency(t.amount),
      ]);

      autoTable(doc, {
        startY: 180,
        head: [["Data", "Descrição", "Categoria", "Conta", "Tipo", "Valor"]],
        body: tableRows,
        theme: "striped",
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
        },
        styles: {
          fontSize: 8,
          cellPadding: 4,
          textColor: [51, 65, 85],
        },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 150 },
          2: { cellWidth: 90 },
          3: { cellWidth: 85 },
          4: { cellWidth: 50 },
          5: { cellWidth: 80, halign: "right" },
        },
        foot: [
          [
            "Total Geral",
            "",
            "",
            "",
            "",
            formatCurrency(reportData.totals.balance),
          ],
        ],
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: "bold",
          fontSize: 9,
          halign: "right",
        },
      });

      const filename = `Relatorio_Financeiro_${startDate || "inicio"}_a_${endDate || "hoje"}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("Erro ao exportar PDF:", err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página e Ações de Exportação */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Relatórios Financeiros
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise detalhada de receitas, despesas e saldos consolidados com exportação para PDF e Excel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            id="export-excel-btn"
            variant="outline"
            className="flex items-center gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={handleExportExcel}
            disabled={!reportData || reportData.transactions.length === 0 || isExportingExcel}
          >
            {isExportingExcel ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            )}
            Exportar Excel
          </Button>

          <Button
            id="export-pdf-btn"
            variant="outline"
            className="flex items-center gap-2 border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={handleExportPdf}
            disabled={!reportData || reportData.transactions.length === 0 || isExportingPdf}
          >
            {isExportingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 text-rose-600" />
            )}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3 pt-4 px-4 sm:px-6 border-b bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter className="h-4 w-4 text-primary" />
              Filtros do Relatório
            </div>
            {isFetching && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Atualizando dados...
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* Atalhos Rápidos de Período */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Atalhos de Período
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={periodPreset === "this_month" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetChange("this_month")}
              >
                Este Mês
              </Button>
              <Button
                variant={periodPreset === "last_month" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetChange("last_month")}
              >
                Mês Passado
              </Button>
              <Button
                variant={periodPreset === "last_30" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetChange("last_30")}
              >
                Últimos 30 Dias
              </Button>
              <Button
                variant={periodPreset === "this_year" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetChange("this_year")}
              >
                Este Ano
              </Button>
              <Button
                variant={periodPreset === "custom" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetChange("custom")}
              >
                Personalizado
              </Button>
            </div>
          </div>

          {/* Grid de Seletores e Intervalos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
            <div>
              <Label htmlFor="start-date" className="text-xs font-medium text-slate-700 mb-1 block">
                Data Inicial
              </Label>
              <div className="relative">
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPeriodPreset("custom");
                  }}
                  className="h-9"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="end-date" className="text-xs font-medium text-slate-700 mb-1 block">
                Data Final
              </Label>
              <div className="relative">
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPeriodPreset("custom");
                  }}
                  className="h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1 block">
                Conta Bancária
              </Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger id="report-account-select" className="h-9">
                  <SelectValue placeholder="Todas as contas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Contas</SelectItem>
                  {bankAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: acc.color || "#0284c7" }}
                        />
                        <span>{acc.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1 block">
                Categoria
              </Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger id="report-category-select" className="h-9">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Categorias</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: cat.color || "#64748b" }}
                        />
                        <span>{cat.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1 block">
                Tipo de Lançamento
              </Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger id="report-type-select" className="h-9">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="income">Somente Receitas</SelectItem>
                  <SelectItem value="expense">Somente Despesas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Métricas Consolidadas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receitas</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-7 w-24 bg-slate-100 rounded animate-pulse" />
            ) : (
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrency(reportData?.totals.income || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Total de entradas no período</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Despesas</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-7 w-24 bg-slate-100 rounded animate-pulse" />
            ) : (
              <div className="text-2xl font-bold text-rose-600">
                {formatCurrency(reportData?.totals.expense || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Total de saídas no período</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo do Período</CardTitle>
            <Scale className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-7 w-24 bg-slate-100 rounded animate-pulse" />
            ) : (
              <div
                className={`text-2xl font-bold ${
                  (reportData?.totals.balance || 0) >= 0 ? "text-blue-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(reportData?.totals.balance || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Receitas menos despesas</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lançamentos</CardTitle>
            <Hash className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-7 w-16 bg-slate-100 rounded animate-pulse" />
            ) : (
              <div className="text-2xl font-bold text-slate-800">
                {reportData?.totals.count || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Transações correspondentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Seção de Gráficos Analíticos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Despesas por Categoria */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-800">
              Despesas por Categoria
            </CardTitle>
            <CardDescription className="text-xs">
              Distribuição proporcional das despesas no período selecionado
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : categoryChartData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm">
                <AlertCircle className="h-8 w-8 text-slate-300 mb-2" />
                Nenhuma despesa categorizada neste período
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => formatCurrency(Number(val))}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(val) => <span className="text-xs text-slate-700">{val}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico Comparativo por Conta Bancária */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-800">
              Movimentação por Conta Bancária
            </CardTitle>
            <CardDescription className="text-xs">
              Comparativo de receitas e despesas por conta no período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : accountChartData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm">
                <Landmark className="h-8 w-8 text-slate-300 mb-2" />
                Nenhuma movimentação por conta neste período
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={accountChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${v}`} />
                    <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela Detalhada de Transações */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="border-b bg-slate-50/50 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-800">
                Lançamentos Detalhados ({reportData?.transactions.length || 0})
              </CardTitle>
              <CardDescription className="text-xs">
                Lista de transações que compõem os totais do período
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !reportData || reportData.transactions.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <AlertCircle className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              Nenhum lançamento encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Descrição</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4">Conta Bancária</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap text-xs">
                        {formatDate(t.date)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {t.description}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className="text-xs font-normal"
                          style={{
                            borderColor: t.category_color || "#cbd5e1",
                            color: t.category_color || "#334155",
                          }}
                        >
                          {t.category_name || "Sem Categoria"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {t.account_name ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-700">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: t.account_color || "#0284c7" }}
                            />
                            <span className="truncate">{t.account_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          className={
                            t.type === "income"
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                              : "bg-rose-100 text-rose-800 hover:bg-rose-100"
                          }
                        >
                          {t.type === "income" ? "Receita" : "Despesa"}
                        </Badge>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold whitespace-nowrap ${
                          t.type === "income" ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {t.type === "expense" ? "-" : "+"} {formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
