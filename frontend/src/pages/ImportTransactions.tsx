import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type {
  Category,
  CreditCard,
  ImportedTransaction,
  ParseImportResponse,
} from "@/types";
import {
  extractTextFromPdf,
  parseTransactionsFromText,
  detectReferenceYear,
} from "@/utils/pdfParser";
import { parseInvoiceByBank, detectBankFromText } from "@/utils/bankInvoiceParsers";
import { normalizeInvoiceTransactions } from "@/utils/invoiceCompetenceEngine";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Building2,
  CreditCard as CreditCardIcon,
  Tag,
  ArrowRight,
  Filter,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  Trash2,
  FolderKanban,
  X,
  AlertCircle,
  FileText,
  Loader2,
  Calendar,
  CreditCard as CardIcon,
  Users,
  Check,
  RotateCcw,
  Info,
} from "lucide-react";

const BANK_OPTIONS = [
  { id: "auto", name: "Auto-detectar (Padrão)" },
  { id: "caixa", name: "Caixa Econômica Federal (Fatura PDF)" },
  { id: "nubank", name: "Nubank" },
  { id: "inter", name: "Banco Inter" },
  { id: "itau", name: "Itaú" },
  { id: "bradesco", name: "Bradesco" },
  { id: "santander", name: "Santander" },
  { id: "bb", name: "Banco do Brasil" },
  { id: "c6", name: "C6 Bank" },
  { id: "generic", name: "Extrato Genérico (Data, Descrição, Valor)" },
];

const BANK_NAMES_MAP: Record<string, string> = {
  caixa: "Caixa Econômica Federal",
  nubank: "Nubank",
  inter: "Banco Inter",
  itau: "Itaú",
  bradesco: "Bradesco",
  santander: "Santander",
  bb: "Banco do Brasil",
  c6: "C6 Bank",
  generic: "Extrato Genérico",
};

const MONTHS_LIST = [
  { value: 1, label: "01 - Janeiro" },
  { value: 2, label: "02 - Fevereiro" },
  { value: 3, label: "03 - Março" },
  { value: 4, label: "04 - Abril" },
  { value: 5, label: "05 - Maio" },
  { value: 6, label: "06 - Junho" },
  { value: 7, label: "07 - Julho" },
  { value: 8, label: "08 - Agosto" },
  { value: 9, label: "09 - Setembro" },
  { value: 10, label: "10 - Outubro" },
  { value: 11, label: "11 - Novembro" },
  { value: 12, label: "12 - Dezembro" },
];

export default function ImportTransactions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados principais
  const [selectedCreditCardId, setSelectedCreditCardId] = useState<string>("none");
  const [selectedBank, setSelectedBank] = useState<string>("auto");

  // Estado do arquivo e processamento
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsingPdf, setIsParsingPdf] = useState(false);

  // Dados do parse / preview
  const [previewData, setPreviewData] = useState<ParseImportResponse | null>(null);
  const [transactions, setTransactions] = useState<ImportedTransaction[]>([]);
  const [activeTabFilter, setActiveTabFilter] = useState<"all" | "selected" | "duplicates" | "income" | "expense">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modo de revisão manual
  const [isManualReviewMode, setIsManualReviewMode] = useState(false);
  const [globalYear, setGlobalYear] = useState<number>(() => new Date().getFullYear());
  const [globalMonth, setGlobalMonth] = useState<number>(() => new Date().getMonth() + 1);

  // Modais de confirmação e status
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { selectedWorkspaceId, selectedWorkspace } = useWorkspace();
  const activeWorkspace = selectedWorkspace;
  const canEdit = selectedWorkspace?.role !== "viewer";

  // 2. Busca Categorias do Workspace
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/categories`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  // 3. Busca Cartões de Crédito do Workspace
  const { data: creditCards = [] } = useQuery<CreditCard[]>({
    queryKey: ["credit-cards", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/credit-cards`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  // Processamento de Arquivo PDF no Frontend com suporte Multi-Banco e Camada 2
  const processPdfFile = async (file: File) => {
    setIsParsingPdf(true);
    setErrorMessage(null);
    try {
      const text = await extractTextFromPdf(file);
      if (!text || text.trim() === "") {
        throw new Error("Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem digitalizada.");
      }

      let normalizedList: ImportedTransaction[] = [];
      let invoiceYear = new Date().getFullYear();
      let invoiceMonth = new Date().getMonth() + 1;
      let detectedBankName = "Extrato / Fatura";

      try {
        // 1. Envia para o endpoint de preview multi-banco do backend
        const previewRes = await api.post("/api/import/preview", {
          pdfText: text,
          workspaceId: selectedWorkspaceId,
          bank: selectedBank,
        });

        normalizedList = previewRes.data.transactions || [];
        invoiceYear = previewRes.data.anoFatura || invoiceYear;
        invoiceMonth = previewRes.data.mesFatura || invoiceMonth;
        const bKey = previewRes.data.detectedBank || selectedBank;
        detectedBankName = BANK_NAMES_MAP[bKey] || "Fatura Multi-Banco";
      } catch {
        // 2. Fallback client-side usando Camada 1 + Camada 2
        const { header, rawTransactions, detectedBank } = parseInvoiceByBank(text, selectedBank);
        if (rawTransactions.length === 0) {
          throw new Error(`Não foi possível identificar transações válidas para ${BANK_NAMES_MAP[detectedBank] || "o banco selecionado"}. Verifique o formato do arquivo.`);
        }

        const normalized = normalizeInvoiceTransactions(
          rawTransactions,
          header,
          creditCards,
          categories,
          selectedCreditCardId
        );

        normalizedList = normalized.transactions as ImportedTransaction[];
        invoiceYear = normalized.anoFatura;
        invoiceMonth = normalized.mesFatura;
        detectedBankName = BANK_NAMES_MAP[detectedBank] || "Fatura Multi-Banco";
      }

      if (normalizedList.length === 0) {
        throw new Error("Nenhuma transação financeira identificada no documento. Verifique se o arquivo possui lançamentos legíveis.");
      }

      setGlobalYear(invoiceYear);
      setGlobalMonth(invoiceMonth);
      setIsManualReviewMode(true);
      setTransactions(normalizedList);
      setPreviewData({
        filename: file.name,
        fileType: "pdf",
        totalCount: normalizedList.length,
        duplicatesCount: 0,
        newCount: normalizedList.length,
        summary: {
          bankName: detectedBankName,
          fileType: "Fatura PDF (Revisão de Competência)",
        },
        transactions: normalizedList,
      });
    } catch (err: any) {
      console.error("Erro no processamento do PDF:", err);
      setErrorMessage(err.message || "Falha ao processar o arquivo PDF.");
    } finally {
      setIsParsingPdf(false);
    }
  };

  // Mutação para arquivos OFX ou CSV via Backend
  const parseMutation = useMutation({
    mutationFn: async ({ file, bank, creditCardId }: { file: File; bank: string; creditCardId: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bank", bank);
      if (creditCardId !== "none") {
        formData.append("creditCardId", creditCardId);
      }

      const res = await api.post(`/workspaces/${selectedWorkspaceId}/import/parse`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data as ParseImportResponse;
    },
    onSuccess: (data) => {
      setIsManualReviewMode(false);
      setPreviewData(data);
      setTransactions(data.transactions || []);
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.error || "Erro ao processar o arquivo. Tente outro formato.");
    },
  });

  // Mutação de Confirmação e Gravação em Lote no Banco
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const selected = transactions.filter((t) => t.selected);
      if (selected.length === 0) {
        throw new Error("Selecione ao menos uma transação para importar.");
      }

      const payload = selected.map((t) => {
        const competenceDate = t.dataCompetencia || t.date;
        return {
          date: competenceDate,
          dataCompetencia: competenceDate,
          dataTransacao: t.dataTransacao,
          dataParcial: t.dataParcial,
          ano: t.ano || globalYear,
          mes: t.mes || globalMonth,
          descricao: t.description || t.descricao,
          description: t.description || t.descricao,
          valor: Number(t.amount !== undefined ? t.amount : t.valor),
          amount: Number(t.amount !== undefined ? t.amount : t.valor),
          tipo: t.type === "income" ? "C" : "D",
          type: t.type,
          cartao: t.cartao || t.cardLabel,
          creditCardId: t.creditCardId || (selectedCreditCardId !== "none" ? selectedCreditCardId : null),
          categoryId: t.categoryId || null,
          installments: t.installments || 1,
          installmentCurrent: t.installmentCurrent || 1,
        };
      });

      const res = await api.post("/api/import/confirm", {
        workspaceId: selectedWorkspaceId,
        transactions: payload,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });

      setIsConfirmModalOpen(false);
      setSuccessMessage(data.message || `${data.count} transação(ões) importada(s) com sucesso!`);

      setTimeout(() => {
        setPreviewData(null);
        setSelectedFile(null);
        setTransactions([]);
        setIsManualReviewMode(false);
      }, 2000);
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.error || err.message || "Erro ao salvar transações no banco.");
    },
  });

  const handleFileSelect = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["ofx", "csv", "pdf"].includes(ext || "")) {
      setErrorMessage("Formato de arquivo não suportado. Envie um arquivo .OFX, .CSV ou .PDF");
      return;
    }

    setSelectedFile(file);
    setPreviewData(null);
    setTransactions([]);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleStartParsing = () => {
    if (!selectedFile) return;
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();

    if (ext === "pdf") {
      processPdfFile(selectedFile);
    } else {
      parseMutation.mutate({
        file: selectedFile,
        bank: selectedBank,
        creditCardId: selectedCreditCardId,
      });
    }
  };

  const handleToggleSelectAll = (select: boolean) => {
    setTransactions((prev) => prev.map((t) => ({ ...t, selected: select })));
  };

  const handleToggleSelect = (index: number) => {
    setTransactions((prev) => {
      const copy = [...prev];
      copy[index].selected = !copy[index].selected;
      return copy;
    });
  };

  const handleUpdateCategory = (index: number, categoryId: string) => {
    const catIdNum = categoryId === "none" ? null : Number(categoryId);
    const catObj = categories.find((c) => c.id === catIdNum);

    setTransactions((prev) => {
      const copy = [...prev];
      copy[index].categoryId = catIdNum;
      copy[index].categoryName = catObj?.name || null;
      return copy;
    });
  };

  const handleUpdateCard = (index: number, cardId: string) => {
    const selected = creditCards.find((c) => c.id === cardId);
    setTransactions((prev) => {
      const copy = [...prev];
      if (cardId === "none" || !selected) {
        copy[index].creditCardId = null;
        copy[index].cartaoIdentificado = false;
      } else {
        copy[index].creditCardId = selected.id;
        copy[index].cartao = `${selected.name}${selected.last_four_digits ? ` (•••• ${selected.last_four_digits})` : ""}`;
        copy[index].cardLabel = copy[index].cartao;
        copy[index].cartaoIdentificado = true;
      }
      return copy;
    });
  };

  const handleUpdateTransactionField = (index: number, field: string, value: any) => {
    setTransactions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Aplica competência (Mês e Ano) a todas as linhas da tabela
  const handleApplyCompetenceToAll = () => {
    if (!globalYear || isNaN(globalYear) || globalYear < 1970 || globalYear > 2100) return;
    setTransactions((prev) =>
      prev.map((t) => {
        const day = (t.dataTransacao || t.dataParcial || "01/01").split("/")[0].padStart(2, "0");
        const newCompetenceDate = `${globalYear}-${String(globalMonth).padStart(2, "0")}-${day}`;
        return {
          ...t,
          ano: globalYear,
          mes: globalMonth,
          date: newCompetenceDate,
          dataCompetencia: newCompetenceDate,
        };
      })
    );
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (activeTabFilter === "selected" && !t.selected) return false;
      if (activeTabFilter === "duplicates" && !t.isPossibleDuplicate) return false;
      if (activeTabFilter === "income" && t.type !== "income") return false;
      if (activeTabFilter === "expense" && t.type !== "expense") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = (t.description || t.descricao || "").toLowerCase().includes(q);
        const matchCat = (t.categoryName || "").toLowerCase().includes(q);
        const matchCard = (t.cardLabel || t.cartao || "").toLowerCase().includes(q);
        const matchDate = t.dataCompetencia ? t.dataCompetencia.includes(q) : t.date.includes(q);
        if (!matchDesc && !matchCat && !matchCard && !matchDate) return false;
      }

      return true;
    });
  }, [transactions, activeTabFilter, searchQuery]);

  const cardGroups = useMemo(() => {
    const groups: Record<string, ImportedTransaction[]> = {};
    for (const tx of filteredTransactions) {
      const label = tx.cardLabel || tx.cartao || (tx.cardLast4 ? `Cartão final •••• ${tx.cardLast4}` : "Transações Gerais");
      if (!groups[label]) groups[label] = [];
      groups[label].push(tx);
    }
    return groups;
  }, [filteredTransactions]);

  const hasMultipleCards = Object.keys(cardGroups).length > 1;
  const selectedCount = transactions.filter((t) => t.selected).length;
  const isAllSelected = filteredTransactions.length > 0 && filteredTransactions.every((t) => t.selected);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            Importar Extrato Bancário
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importe extratos OFX/CSV ou faturas em PDF (Caixa, Nubank, Inter, Itaú, Bradesco, Santander, BB, C6, etc.) com auto-detecção e revisão manual.
          </p>
        </div>


      </div>

      {/* Alertas */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 shadow-xs animate-in fade-in-50">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="font-semibold text-sm">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3 shadow-xs animate-in fade-in-50">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span className="font-semibold text-sm">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-auto text-rose-500 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ETAPA 1: SELEÇÃO E CONFIGURAÇÃO DO ARQUIVO */}
      {!previewData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-xs border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" /> Enviar Arquivo de Extrato ou Fatura
              </CardTitle>
              <CardDescription className="text-xs">
                Arraste o arquivo ou clique para selecionar. Formatos suportados: <strong>.OFX</strong>, <strong>.CSV</strong> ou <strong>.PDF</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isDragOver
                    ? "border-primary bg-primary/5 scale-[0.99]"
                    : selectedFile
                    ? "border-emerald-400 bg-emerald-50/40"
                    : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ofx,.csv,.pdf,application/pdf,text/csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />

                {selectedFile ? (
                  <>
                    <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
                      <FileCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(selectedFile.size / 1024).toFixed(1)} KB • Clique ou arraste para trocar
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">Clique para selecionar ou arraste o arquivo aqui</p>
                      <p className="text-xs text-muted-foreground mt-1">OFX, CSV ou PDF (Caixa, Nubank, Inter, Itaú, Bradesco, etc.)</p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  disabled={!selectedFile || !canEdit || isParsingPdf || parseMutation.isPending}
                  onClick={handleStartParsing}
                  className="gap-2 font-bold px-6"
                >
                  {(isParsingPdf || parseMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  Processar Arquivo <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Configurações de Origem e Cartão */}
          <Card className="shadow-xs border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" /> Conta / Cartão de Destino
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="bank-select" className="font-bold text-slate-700">Banco / Formato:</Label>
                <Select value={selectedBank} onValueChange={setSelectedBank}>
                  <SelectTrigger id="bank-select" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Com <strong>Auto-detectar</strong>, o sistema reconhece automaticamente o formato do banco.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="card-select" className="font-bold text-slate-700">Associar a Cartão de Crédito:</Label>
                <Select value={selectedCreditCardId} onValueChange={setSelectedCreditCardId}>
                  <SelectTrigger id="card-select" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (Extrato de Conta Corrente/Pix)</SelectItem>
                    {creditCards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.brand || "Cartão"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ETAPA 2: TABELA DE PREVIEW E REVISÃO MANUAL ANTES DE SALVAR */}
      {previewData && (
        <div className="space-y-4">
          {/* Banner do Extrato / Fatura */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-primary" /> Revisão do Extrato: {previewData.summary?.bankName || "Fatura"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {previewData.filename} • {previewData.totalCount} lançamentos identificados
              </p>
            </div>

            {hasMultipleCards && (
              <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs font-bold gap-1 px-3 py-1">
                <CardIcon className="h-3.5 w-3.5" /> Múltiplos Cartões Detectados
              </Badge>
            )}
          </div>

          {/* Banner de Revisão Manual com Competência da Fatura */}
          {isManualReviewMode && (
            <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Fatura com Revisão Manual de Competência</h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Revise os lançamentos antes de salvar. Compras parceladas têm sua competência contábil atribuída ao mês da fatura.
                  </p>
                </div>
              </div>

              {/* Ferramenta de Competência Global (Mês e Ano da Fatura) */}
              <div className="flex items-center gap-2 shrink-0 bg-white/90 p-2 rounded-lg border border-amber-200 flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="global-month-select" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                    Competência:
                  </Label>
                  <Select
                    value={String(globalMonth)}
                    onValueChange={(val) => setGlobalMonth(parseInt(val, 10))}
                  >
                    <SelectTrigger id="global-month-select" className="h-8 w-36 text-xs font-bold bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS_LIST.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)} className="text-xs">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <Label htmlFor="global-year-input" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                    Ano:
                  </Label>
                  <Input
                    id="global-year-input"
                    type="number"
                    min={1970}
                    max={2100}
                    value={globalYear}
                    onChange={(e) => setGlobalYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                    className="h-8 w-20 text-xs font-bold bg-white"
                  />
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleApplyCompetenceToAll}
                  className="h-8 text-xs font-semibold bg-white shrink-0"
                  title="Aplica este mês e ano de competência a todas as linhas da tabela"
                >
                  Aplicar a todos
                </Button>
              </div>
            </div>
          )}

          {/* Barra de Controles e Filtros */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <Button
                variant={isAllSelected ? "default" : "outline"}
                size="sm"
                onClick={() => handleToggleSelectAll(!isAllSelected)}
                className="gap-1.5 text-xs font-semibold h-9"
              >
                {isAllSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {isAllSelected ? "Desmarcar Todos" : "Selecionar Todos"}
              </Button>

              <Badge variant="secondary" className="font-bold text-xs bg-slate-100">
                {selectedCount} de {transactions.length} selecionados
              </Badge>
            </div>

            <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <Input
                placeholder="Buscar por descrição, cartão..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-xs bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreviewData(null);
                  setSelectedFile(null);
                  setTransactions([]);
                  setIsManualReviewMode(false);
                }}
                className="text-xs h-9"
              >
                Trocar Arquivo
              </Button>

              <Button
                disabled={selectedCount === 0 || confirmMutation.isPending || !canEdit}
                onClick={() => setIsConfirmModalOpen(true)}
                className="gap-2 font-bold text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {confirmMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Check className="h-4 w-4" /> Confirmar Importação ({selectedCount})
              </Button>
            </div>
          </div>

          {/* TABELA DE REVISÃO */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <div className="overflow-x-auto max-h-[65vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      />
                    </th>
                    <th className="p-3 w-36">Competência (Data)</th>
                    {isManualReviewMode && <th className="p-3 w-20">Ano</th>}
                    <th className="p-3 min-w-[280px]">Descrição Completa</th>
                    <th className="p-3 w-28">Valor (R$)</th>
                    <th className="p-3 w-28">Tipo</th>
                    <th className="p-3 min-w-[200px]">Cartão Vinculado</th>
                    <th className="p-3 min-w-[170px]">Categoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx, idx) => {
                    const originalIndex = transactions.findIndex((t) => t === tx || (t.id && t.id === tx.id));
                    const targetIdx = originalIndex !== -1 ? originalIndex : idx;

                    return (
                      <tr
                        key={tx.id || idx}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          tx.selected ? "bg-white" : "bg-slate-50/50 opacity-60"
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={!!tx.selected}
                            onChange={() => handleToggleSelect(targetIdx)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                          />
                        </td>

                        {/* Competência e Data Original */}
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className="font-mono text-xs font-bold bg-slate-50 w-fit">
                              <Calendar className="h-3 w-3 mr-1 text-slate-500" />
                              {tx.dataCompetencia || tx.date}
                            </Badge>
                            {tx.dataTransacao && tx.dataTransacao !== (tx.dataCompetencia ? tx.dataCompetencia.slice(5).split("-").reverse().join("/") : "") && (
                              <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1" title="Data original em que a compra parcelada foi realizada">
                                📅 Compra: {tx.dataTransacao}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Campo ANO Editável (se modo manual) */}
                        {isManualReviewMode && (
                          <td className="p-3">
                            <Input
                              type="number"
                              min={1970}
                              max={2100}
                              value={tx.ano || globalYear}
                              onChange={(e) => {
                                const newYear = parseInt(e.target.value, 10) || globalYear;
                                handleUpdateTransactionField(targetIdx, "ano", newYear);
                                const day = (tx.dataTransacao || tx.dataParcial || "01/01").split("/")[0].padStart(2, "0");
                                const month = String(tx.mes || globalMonth).padStart(2, "0");
                                const newDate = `${newYear}-${month}-${day}`;
                                handleUpdateTransactionField(targetIdx, "dataCompetencia", newDate);
                                handleUpdateTransactionField(targetIdx, "date", newDate);
                              }}
                              className="h-8 w-20 text-xs font-bold text-center bg-white border-slate-300"
                            />
                          </td>
                        )}

                        {/* Descrição Completa Editável */}
                        <td className="p-3">
                          {isManualReviewMode ? (
                            <Input
                              value={tx.description || tx.descricao || ""}
                              title={tx.description || tx.descricao || ""}
                              onChange={(e) => handleUpdateTransactionField(targetIdx, "description", e.target.value)}
                              className="h-8 text-xs font-medium bg-white border-slate-300 min-w-[260px]"
                            />
                          ) : (
                            <span className="font-semibold text-slate-800 block truncate max-w-xs" title={tx.description}>
                              {tx.description}
                            </span>
                          )}
                        </td>

                        {/* Valor Editável */}
                        <td className="p-3">
                          {isManualReviewMode ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={tx.amount !== undefined ? tx.amount : tx.valor}
                              onChange={(e) =>
                                handleUpdateTransactionField(targetIdx, "amount", parseFloat(e.target.value) || 0)
                              }
                              className="h-8 w-28 text-xs font-bold text-right bg-white border-slate-300"
                            />
                          ) : (
                            <span className={`font-bold ${tx.type === "income" ? "text-emerald-600" : "text-slate-900"}`}>
                              {(tx.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          )}
                        </td>

                        {/* Tipo Débito (D) / Crédito (C) Editável */}
                        <td className="p-3">
                          {isManualReviewMode ? (
                            <Select
                              value={tx.type}
                              onValueChange={(val: "income" | "expense") => {
                                handleUpdateTransactionField(targetIdx, "type", val);
                                handleUpdateTransactionField(targetIdx, "tipo", val === "income" ? "C" : "D");
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs font-bold bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="expense">🔴 Débito (D)</SelectItem>
                                <SelectItem value="income">🟢 Crédito (C)</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={tx.type === "income" ? "default" : "secondary"} className="text-[11px] font-bold">
                              {tx.type === "income" ? "Receita" : "Despesa"}
                            </Badge>
                          )}
                        </td>

                        {/* Cartão Vinculado - SELECT com cartões cadastrados */}
                        <td className="p-3">
                          {creditCards.length > 0 ? (
                            <div className="space-y-1">
                              <Select
                                value={tx.creditCardId || "none"}
                                onValueChange={(val) => handleUpdateCard(targetIdx, val)}
                              >
                                <SelectTrigger
                                  className={`h-8 text-xs font-semibold bg-white ${
                                    !tx.creditCardId ? "border-amber-400 bg-amber-50/30 text-amber-900" : "border-slate-300"
                                  }`}
                                >
                                  <SelectValue placeholder="Selecione o cartão..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-amber-800 font-semibold">
                                    ⚠️ Selecionar Cartão...
                                  </SelectItem>
                                  {creditCards.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name} {c.last_four_digits ? `(•••• ${c.last_four_digits})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              {tx.cartaoIdentificado ? (
                                <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                                  <Check className="h-3 w-3" /> Vinculado automaticamente
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                                  ⚠️ Cartão não identificado no PDF
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 font-medium">
                              {tx.cardLabel || (tx.cardLast4 ? `•••• ${tx.cardLast4}` : "Conta")}
                            </span>
                          )}
                        </td>

                        {/* Categoria */}
                        <td className="p-3">
                          <Select
                            value={tx.categoryId ? String(tx.categoryId) : "none"}
                            onValueChange={(val) => handleUpdateCategory(targetIdx, val)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                              <SelectValue placeholder="Selecione categoria" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem categoria</SelectItem>
                              {categories
                                .filter((c) => c.type === tx.type)
                                .map((c) => (
                                  <SelectItem key={c.id} value={String(c.id)}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO FINAL */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Confirmar Gravação no Banco
            </DialogTitle>
            <DialogDescription className="text-xs">
              Você está prestes a gravar <strong>{selectedCount}</strong> transações revisadas no workspace <strong>{activeWorkspace?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 text-xs space-y-2 bg-slate-50 p-3 rounded-lg border">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total de itens:</span>
              <strong className="font-bold">{selectedCount}</strong>
            </div>
            {isManualReviewMode && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Competência aplicada:</span>
                <strong className="font-bold">{String(globalMonth).padStart(2, "0")}/{globalYear}</strong>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Workspace destino:</span>
              <strong className="font-bold">{activeWorkspace?.name}</strong>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setIsConfirmModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
              className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {confirmMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Transações no Banco
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
