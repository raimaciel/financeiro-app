import React, { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  BankAccount,
  Category,
  StatementImportItem,
  StatementImportPreviewResponse,
  StatementImportConfirmResponse,
} from "@/types";
import { useWorkspace } from "@/contexts/WorkspaceContext";
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
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Trash2,
  Sparkles,
  Loader2,
  Landmark,
  ArrowRight,
  RefreshCw,
  X,
  FileCode,
} from "lucide-react";

const fetchAccounts = async (workspaceId: string): Promise<BankAccount[]> => {
  const res = await api.get(`/workspaces/${workspaceId}/accounts`);
  return res.data;
};

const fetchCategories = async (workspaceId: string): Promise<Category[]> => {
  const res = await api.get(`/workspaces/${workspaceId}/categories`);
  return res.data;
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.slice(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

export default function ImportStatement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { selectedWorkspaceId, selectedWorkspace } = useWorkspace();
  const isViewer = selectedWorkspace?.role === "viewer";

  // Estados do Wizard
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Dados do Preview
  const [previewData, setPreviewData] = useState<StatementImportPreviewResponse | null>(null);
  const [editableRows, setEditableRows] = useState<StatementImportItem[]>([]);

  // Resultado da Confirmação
  const [confirmResult, setConfirmResult] = useState<StatementImportConfirmResponse | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Queries
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<BankAccount[]>({
    queryKey: ["accounts", selectedWorkspaceId],
    queryFn: () => fetchAccounts(selectedWorkspaceId),
    enabled: !!selectedWorkspaceId,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories", selectedWorkspaceId],
    queryFn: () => fetchCategories(selectedWorkspaceId),
    enabled: !!selectedWorkspaceId,
  });

  // Inicializar accountId pela URL ou pelo primeiro ativo
  useEffect(() => {
    const fromUrl = searchParams.get("accountId");
    if (fromUrl && accounts.some((a) => a.id === fromUrl)) {
      setSelectedAccountId(fromUrl);
    } else if (!selectedAccountId && accounts.length > 0) {
      const firstActive = accounts.find((a) => a.status === "active");
      if (firstActive) {
        setSelectedAccountId(firstActive.id);
      }
    }
  }, [accounts, searchParams, selectedAccountId]);

  const activeAccounts = accounts.filter((a) => a.status === "active");
  const currentAccount = accounts.find((a) => a.id === selectedAccountId);

  // Mutação: Enviar Extrato para Preview
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId || !selectedAccountId || !file) {
        throw new Error("Selecione uma conta bancária e um arquivo de extrato.");
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post(
        `/workspaces/${selectedWorkspaceId}/accounts/${selectedAccountId}/import`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      return res.data as StatementImportPreviewResponse;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setEditableRows(data.transactions || []);
      setStep(2);
      showToast(`Extrato processado! ${data.totalCount} transações encontradas.`, "success");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.error || "Erro ao processar arquivo de extrato.", "error");
    },
  });

  // Mutação: Confirmar Importação
  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId || !selectedAccountId) {
        throw new Error("Dados de conta inválidos.");
      }

      const payload = {
        transactions: editableRows.map((row) => ({
          date: row.date,
          amount: row.amount,
          description: row.description,
          type: row.type,
          category_id: row.category_id ? Number(row.category_id) : null,
        })),
      };

      const res = await api.post(
        `/workspaces/${selectedWorkspaceId}/accounts/${selectedAccountId}/import/confirm`,
        payload
      );
      return res.data as StatementImportConfirmResponse;
    },
    onSuccess: (data) => {
      setConfirmResult(data);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      showToast(data.message || "Transações importadas com sucesso!", "success");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.error || "Erro ao gravar transações.", "error");
    },
  });

  // Manipulação de Arquivos
  const handleFileSelected = (selectedFile: File | null) => {
    if (!selectedFile) return;

    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext !== "ofx" && ext !== "csv") {
      showToast("Por favor, selecione um arquivo válido com extensão .ofx ou .csv.", "error");
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  // Edição na Tabela de Revisão
  const handleRowChange = (id: string, field: keyof StatementImportItem, value: any) => {
    setEditableRows((prev) =>
      prev.map((row) => {
        if (row.id === id) {
          return { ...row, [field]: value };
        }
        return row;
      })
    );
  };

  const handleRemoveRow = (id: string) => {
    setEditableRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setPreviewData(null);
    setEditableRows([]);
    setConfirmResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Toast Notificação */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link to="/accounts" className="hover:text-primary transition-colors flex items-center gap-1">
              <Landmark className="h-3.5 w-3.5" />
              Contas e Bancos
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-medium">Importação de Extrato</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Upload className="h-7 w-7 text-primary" />
            Importar Extrato Bancário
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Importe lançamentos em lote via arquivos OFX ou CSV e vincule automaticamente à conta bancária.
          </p>
        </div>

        <Link to="/accounts">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Contas
          </Button>
        </Link>
      </div>

      {/* Indicador de Passos (Wizard) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-2xl mx-auto py-2">
        <div
          className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
            step === 1
              ? "bg-primary/10 border-primary text-primary"
              : step > 1
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-slate-50 border-slate-200 text-slate-400"
          }`}
        >
          <div
            className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              step > 1 ? "bg-emerald-600 text-white" : step === 1 ? "bg-primary text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            {step > 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : "1"}
          </div>
          <span className="hidden sm:inline">1. Seleção & Upload</span>
          <span className="sm:hidden">Upload</span>
        </div>

        <div
          className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
            step === 2
              ? "bg-primary/10 border-primary text-primary"
              : step > 2
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-slate-50 border-slate-200 text-slate-400"
          }`}
        >
          <div
            className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              step > 2 ? "bg-emerald-600 text-white" : step === 2 ? "bg-primary text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            {step > 2 ? <CheckCircle2 className="h-3.5 w-3.5" /> : "2"}
          </div>
          <span className="hidden sm:inline">2. Revisão & Categorização</span>
          <span className="sm:hidden">Revisão</span>
        </div>

        <div
          className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
            step === 3
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-slate-50 border-slate-200 text-slate-400"
          }`}
        >
          <div
            className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              step === 3 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            3
          </div>
          <span className="hidden sm:inline">3. Conclusão</span>
          <span className="sm:hidden">Sucesso</span>
        </div>
      </div>

      {/* ── PASSO 1: UPLOAD & CONTA ────────────────────────────────────────── */}
      {step === 1 && (
        <Card className="shadow-sm border-slate-200 max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-900">
              Selecionar Conta e Arquivo
            </CardTitle>
            <CardDescription className="text-xs">
              Escolha a conta bancária de destino e faça o upload do arquivo de extrato (.ofx ou .csv).
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Seleção de Conta */}
            <div className="space-y-2">
              <Label htmlFor="account-select" className="text-xs font-semibold text-slate-700">
                Conta Bancária de Destino <span className="text-red-500">*</span>
              </Label>
              {loadingAccounts ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" /> Carregando contas...
                </div>
              ) : activeAccounts.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Nenhuma conta bancária ativa encontrada. Cadastre uma conta em Contas e Bancos antes de importar.</span>
                </div>
              ) : (
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger id="account-select" className="w-full">
                    <SelectValue placeholder="Selecione uma conta bancária..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full inline-block shrink-0"
                            style={{ backgroundColor: acc.color || "#2563eb" }}
                          />
                          <span className="font-semibold">{acc.name}</span>
                          {acc.bank_name && (
                            <span className="text-xs text-slate-400">({acc.bank_name})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Upload Zone */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">
                Arquivo do Extrato (.OFX ou .CSV) <span className="text-red-500">*</span>
              </Label>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
                  dragOver
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : file
                    ? "border-emerald-400 bg-emerald-50/40"
                    : "border-slate-300 hover:border-primary/60 bg-slate-50/60 hover:bg-slate-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ofx,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                />

                {file ? (
                  <div className="space-y-1">
                    <div className="h-10 w-10 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <FileText className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB · Clique ou arraste para substituir
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        Clique para selecionar ou arraste o arquivo aqui
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Extratos em formato OFX (Recomendado) ou planilhas CSV
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Dica de Formato */}
            <div className="rounded-lg bg-blue-50/70 border border-blue-200/70 p-3 text-xs text-blue-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-blue-950">
                <FileCode className="h-4 w-4 text-blue-600" />
                Formatos compatíveis:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-800 text-[11px] pl-1">
                <li><strong>OFX (Open Financial Exchange):</strong> Padrão oficial fornecido pelo Internet Banking da maioria dos bancos brasileiros.</li>
                <li><strong>CSV (Texto delimitado):</strong> Arquivo com colunas de Data, Valor e Descrição separadas por vírgula ou ponto-e-vírgula.</li>
              </ul>
            </div>

            {/* Ação */}
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || !selectedAccountId || !file || isViewer}
              className="w-full font-bold gap-2 shadow-xs"
            >
              {previewMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analisando Extrato...
                </>
              ) : (
                <>
                  Analisar Extrato e Avançar <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── PASSO 2: REVISÃO & CATEGORIZAÇÃO ────────────────────────────────── */}
      {step === 2 && previewData && (
        <div className="space-y-4">
          {/* Barra de Resumo / KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="shadow-xs p-3">
              <span className="text-xs text-muted-foreground uppercase font-semibold">Conta de Destino</span>
              <p className="text-base font-black text-slate-900 truncate mt-0.5">
                {previewData.account_name}
              </p>
            </Card>

            <Card className="shadow-xs p-3">
              <span className="text-xs text-muted-foreground uppercase font-semibold">Total no Arquivo</span>
              <p className="text-2xl font-black text-slate-900 mt-0.5">
                {editableRows.length} <span className="text-xs font-normal text-slate-400">itens</span>
              </p>
            </Card>

            <Card className="shadow-xs p-3">
              <span className="text-xs text-emerald-700 uppercase font-semibold">Novas Transações</span>
              <p className="text-2xl font-black text-emerald-600 mt-0.5">
                {editableRows.filter((r) => !r.is_duplicate).length}
              </p>
            </Card>

            <Card className="shadow-xs p-3">
              <span className="text-xs text-amber-700 uppercase font-semibold">Possíveis Duplicadas</span>
              <p className="text-2xl font-black text-amber-600 mt-0.5">
                {editableRows.filter((r) => r.is_duplicate).length}
              </p>
            </Card>
          </div>

          {/* Aviso sobre Duplicadas se houver */}
          {editableRows.some((r) => r.is_duplicate) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Atenção: </span>
                Identificamos lançamentos que coincidem com transações já registradas nesta conta bancária.
                Linhas duplicadas estão marcadas com aviso e serão ignoradas automaticamente na gravação caso mantidas.
              </div>
            </div>
          )}

          {/* Tabela de Transações Editáveis */}
          <Card className="shadow-xs overflow-hidden border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-32">Data</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Descrição</th>
                    <th className="py-2.5 px-3 w-28">Tipo</th>
                    <th className="py-2.5 px-3 w-32">Valor (R$)</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Categoria Sugerida</th>
                    <th className="py-2.5 px-3 w-28 text-center">Status</th>
                    <th className="py-2.5 px-3 w-12 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editableRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        row.is_duplicate ? "bg-amber-50/30" : ""
                      }`}
                    >
                      {/* Data */}
                      <td className="py-2 px-3">
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) => handleRowChange(row.id, "date", e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </td>

                      {/* Descrição */}
                      <td className="py-2 px-3">
                        <Input
                          value={row.description}
                          onChange={(e) => handleRowChange(row.id, "description", e.target.value)}
                          className="h-8 text-xs font-medium"
                        />
                      </td>

                      {/* Tipo: Receita / Despesa */}
                      <td className="py-2 px-3">
                        <Select
                          value={row.type}
                          onValueChange={(val) => handleRowChange(row.id, "type", val as "income" | "expense")}
                        >
                          <SelectTrigger className="h-8 text-xs font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="income">
                              <span className="text-emerald-700 font-bold">Entrada (+)</span>
                            </SelectItem>
                            <SelectItem value="expense">
                              <span className="text-rose-700 font-bold">Saída (-)</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Valor */}
                      <td className="py-2 px-3">
                        <div className="font-bold text-xs">
                          <span
                            className={row.type === "income" ? "text-emerald-700" : "text-rose-700"}
                          >
                            {row.type === "income" ? "+" : "-"} {formatCurrency(row.amount)}
                          </span>
                        </div>
                      </td>

                      {/* Categoria Sugerida */}
                      <td className="py-2 px-3">
                        <Select
                          value={row.category_id ? String(row.category_id) : "none"}
                          onValueChange={(val) =>
                            handleRowChange(row.id, "category_id", val === "none" ? null : Number(val))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Sem categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem categoria</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={String(cat.id)}>
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="h-2 w-2 rounded-full inline-block shrink-0"
                                    style={{ backgroundColor: cat.color || "#64748B" }}
                                  />
                                  <span>{cat.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Status / Duplicata */}
                      <td className="py-2 px-3 text-center">
                        {row.is_duplicate ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold"
                            title={row.duplicate_reason || "Possível duplicata"}
                          >
                            Duplicada
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold"
                          >
                            Nova
                          </Badge>
                        )}
                      </td>

                      {/* Ação: Remover */}
                      <td className="py-2 px-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRow(row.id)}
                          className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Remover linha"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editableRows.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                Todas as transações foram removidas desta revisão.
              </div>
            )}
          </Card>

          {/* Botões de Ação do Passo 2 */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={handleReset} className="gap-1.5 text-xs">
              <ArrowLeft className="h-4 w-4" /> Cancelar / Outro Arquivo
            </Button>

            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || editableRows.length === 0 || isViewer}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-xs"
            >
              {confirmMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Confirmando e Gravando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Confirmar Importação ({editableRows.length} itens)
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── PASSO 3: CONCLUSÃO & SUCESSO ──────────────────────────────────── */}
      {step === 3 && confirmResult && (
        <Card className="shadow-md border-emerald-200 max-w-xl mx-auto text-center p-6 space-y-5 bg-gradient-to-b from-white to-emerald-50/20">
          <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-in zoom-in-50">
            <CheckCircle2 className="h-9 w-9" />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900">
              Importação Concluída com Sucesso!
            </h2>
            <p className="text-xs text-slate-500">
              As transações válidas do extrato foram gravadas e vinculadas à sua conta bancária.
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-2 text-left text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-600 font-medium">Conta Destino:</span>
              <span className="font-bold text-slate-900">{currentAccount?.name || "Conta Bancária"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-600 font-medium">Lançamentos Gravados:</span>
              <span className="font-black text-emerald-600 text-sm">{confirmResult.imported_count}</span>
            </div>
            {confirmResult.duplicates_ignored > 0 && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600 font-medium">Duplicatas Ignoradas:</span>
                <span className="font-bold text-amber-600 text-sm">{confirmResult.duplicates_ignored}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              onClick={() => navigate("/accounts")}
              variant="outline"
              className="w-full sm:w-auto font-semibold text-xs"
            >
              Ver Contas e Bancos
            </Button>
            <Button
              onClick={() => navigate(`/transactions?accountId=${selectedAccountId}`)}
              className="w-full sm:w-auto font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white"
            >
              Ver Transações Importadas
            </Button>
            <Button
              onClick={handleReset}
              variant="ghost"
              className="w-full sm:w-auto text-xs text-primary"
            >
              Importar Outro Extrato
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
