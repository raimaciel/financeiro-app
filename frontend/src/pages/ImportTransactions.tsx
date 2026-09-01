import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  Workspace,
  Category,
  CreditCard,
  ImportedTransaction,
  ParseImportResponse,
  ConfirmImportPayload,
} from "@/types";
import {
  extractTextFromPdf,
  parseTransactionsFromText,
  detectReferenceYear,
} from "@/utils/pdfParser";
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
  CreditCard as CardIcon,
  Users,
} from "lucide-react";

const BANK_OPTIONS = [
  { id: "auto", name: "Auto-detectar (Padrão)" },
  { id: "nubank", name: "Nubank" },
  { id: "inter", name: "Banco Inter" },
  { id: "itau", name: "Itaú" },
  { id: "bradesco", name: "Bradesco" },
  { id: "santander", name: "Santander" },
  { id: "bb", name: "Banco do Brasil" },
  { id: "c6", name: "C6 Bank" },
  { id: "generic", name: "Extrato Genérico (Data, Descrição, Valor)" },
];

export default function ImportTransactions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados principais
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
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
  const [groupByCardView, setGroupByCardView] = useState(true);

  // Modais de confirmação e status
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Busca Workspaces
  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await api.get("/workspaces");
      return res.data;
    },
  });

  // Define workspace inicial
  React.useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, selectedWorkspaceId]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId),
    [workspaces, selectedWorkspaceId]
  );

  const canEdit = activeWorkspace?.role !== "viewer";

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

  // Helper para sugerir categoria por palavras-chave
  const suggestCategory = (description: string, type: "income" | "expense"): { id: number; name: string } | null => {
    const desc = description.toLowerCase();
    const typeCats = categories.filter((c) => c.type === type);

    for (const cat of typeCats) {
      const catName = cat.name.toLowerCase();
      if (desc.includes(catName)) return { id: cat.id, name: cat.name };
    }

    // Regras heurísticas comuns
    if (type === "expense") {
      const alimentacao = typeCats.find((c) => /alimenta|mercado|restaurante|refei/i.test(c.name));
      if (alimentacao && /mercado|supermercado|pao de acucar|carrefour|ifood|restaurante|padaria|lanche|burger/i.test(desc)) {
        return { id: alimentacao.id, name: alimentacao.name };
      }

      const transporte = typeCats.find((c) => /transporte|combust|uber|carro/i.test(c.name));
      if (transporte && /uber|99app|posto|shell|ipiranga|combustivel|gasolina|estacionamento/i.test(desc)) {
        return { id: transporte.id, name: transporte.name };
      }

      const saude = typeCats.find((c) => /saude|saúde|farmacia|medic/i.test(c.name));
      if (saude && /farmacia|droga|drogasil|pacheco|consulta|laborat|clinica/i.test(desc)) {
        return { id: saude.id, name: saude.name };
      }

      const lazer = typeCats.find((c) => /lazer|assinat|streaming/i.test(c.name));
      if (lazer && /netflix|spotify|amazon|prime|cinema|ingresso|disney/i.test(desc)) {
        return { id: lazer.id, name: lazer.name };
      }
    }

    return null;
  };

  // Processamento de Arquivo PDF no Frontend
  const processPdfFile = async (file: File) => {
    setIsParsingPdf(true);
    setErrorMessage(null);
    try {
      const text = await extractTextFromPdf(file);
      if (!text || text.trim() === "") {
        throw new Error("Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem digitalizada.");
      }

      const refYear = detectReferenceYear(text);
      const parsed = parseTransactionsFromText(text, refYear);

      if (parsed.length === 0) {
        throw new Error(
          "Nenhuma transação foi identificada no PDF. Verifique se o formato é uma fatura de cartão com datas e valores legíveis."
        );
      }

      // Mapeia para o formato padrão ImportedTransaction
      const mappedTransactions: ImportedTransaction[] = parsed.map((p, idx) => {
        const txType: "income" | "expense" = p.amount < 0 ? "expense" : "income";
        const positiveAmount = Math.abs(p.amount);
        const suggested = suggestCategory(p.description, txType);

        // Tenta associar automaticamente com um cartão existente que tenha o mesmo final
        let matchedCardId: string | null = null;
        if (p.cardLast4) {
          const found = creditCards.find(
            (c) => c.name.includes(p.cardLast4!) || (c as any).last_four_digits === p.cardLast4
          );
          if (found) matchedCardId = found.id;
        }

        if (!matchedCardId && selectedCreditCardId !== "none") {
          matchedCardId = selectedCreditCardId;
        }

        return {
          id: `pdf_tx_${idx}_${Date.now()}`,
          tempId: `pdf_tx_${idx}_${Date.now()}`,
          date: p.date,
          description: p.description,
          amount: positiveAmount,
          rawAmount: p.amount,
          type: txType,
          categoryId: suggested?.id || null,
          categoryName: suggested?.name || null,
          autoCategorized: !!suggested,
          creditCardId: matchedCardId,
          cardLast4: p.cardLast4,
          cardLabel: p.cardLabel,
          installments: p.installments || 1,
          installmentCurrent: p.installmentCurrent || 1,
          isPossibleDuplicate: false,
          selected: true,
        };
      });

      const dates = mappedTransactions.map((t) => t.date).sort();
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      setPreviewData({
        filename: file.name,
        fileType: "pdf",
        totalCount: mappedTransactions.length,
        duplicatesCount: 0,
        newCount: mappedTransactions.length,
        summary: {
          bankName: "Fatura em PDF",
          fileType: "pdf",
          startDate,
          endDate,
        },
        transactions: mappedTransactions,
      });

      setTransactions(mappedTransactions);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao processar arquivo PDF.");
    } finally {
      setIsParsingPdf(false);
    }
  };

  // Mutação: Processar Arquivo (OFX ou CSV no backend)
  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !selectedWorkspaceId) {
        throw new Error("Selecione um arquivo e um workspace");
      }

      // Se for PDF, processa no cliente com pdfjs
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") {
        await processPdfFile(selectedFile);
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("bankPreset", selectedBank);
      if (selectedCreditCardId && selectedCreditCardId !== "none") {
        formData.append("creditCardId", selectedCreditCardId);
      }

      const res = await api.post<ParseImportResponse>(
        `/workspaces/${selectedWorkspaceId}/import/parse`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data) {
        setPreviewData(data);
        setTransactions(data.transactions);
        setErrorMessage(null);
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || "Erro ao processar o arquivo.";
      setErrorMessage(msg);
    },
  });

  // Mutação: Confirmar Importação
  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId) throw new Error("Workspace não selecionado");

      const selectedItems = transactions.filter((t) => t.selected);
      if (selectedItems.length === 0) {
        throw new Error("Nenhuma transação selecionada para importação");
      }

      const payload: ConfirmImportPayload = {
        transactions: selectedItems.map((t) => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          type: t.type,
          categoryId: t.categoryId,
          creditCardId: t.creditCardId || (selectedCreditCardId !== "none" ? selectedCreditCardId : null),
          installments: t.installments || 1,
          installmentCurrent: t.installmentCurrent || 1,
          externalId: t.externalId,
        })),
      };

      const res = await api.post(`/workspaces/${selectedWorkspaceId}/import/confirm`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["credit-cards"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      setIsConfirmModalOpen(false);
      setSuccessMessage(data.message || "Transações importadas com sucesso!");
      setPreviewData(null);
      setTransactions([]);
      setSelectedFile(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || "Erro ao salvar transações.";
      setErrorMessage(msg);
      setIsConfirmModalOpen(false);
    },
  });

  // Manipulação de Seleção de Arquivo
  const handleFileSelect = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "ofx" && ext !== "csv" && ext !== "pdf") {
      setErrorMessage("Formato inválido! Por favor selecione um arquivo .ofx, .csv ou .pdf.");
      return;
    }
    setSelectedFile(file);
    setErrorMessage(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Funções de manipulação das transações no preview
  const handleToggleSelectAll = (select: boolean) => {
    setTransactions((prev) => prev.map((t) => ({ ...t, selected: select })));
  };

  const handleToggleSelect = (tempId: string) => {
    setTransactions((prev) =>
      prev.map((t) => ((t.tempId || t.id) === tempId ? { ...t, selected: !t.selected } : t))
    );
  };

  const handleCategoryChange = (tempId: string, categoryId: number | null) => {
    setTransactions((prev) =>
      prev.map((t) => ((t.tempId || t.id) === tempId ? { ...t, categoryId } : t))
    );
  };

  const handleInstallmentChange = (tempId: string, installments: number) => {
    setTransactions((prev) =>
      prev.map((t) => ((t.tempId || t.id) === tempId ? { ...t, installments } : t))
    );
  };

  const handleCardChange = (tempId: string, creditCardId: string | null) => {
    setTransactions((prev) =>
      prev.map((t) => ((t.tempId || t.id) === tempId ? { ...t, creditCardId } : t))
    );
  };

  const handleReset = () => {
    setPreviewData(null);
    setTransactions([]);
    setSelectedFile(null);
    setSuccessMessage(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Contadores do Preview
  const stats = useMemo(() => {
    const total = transactions.length;
    const selected = transactions.filter((t) => t.selected).length;
    const duplicates = transactions.filter((t) => t.isPossibleDuplicate).length;
    const autoCategorized = transactions.filter((t) => t.autoCategorized).length;
    const totalSelectedAmount = transactions
      .filter((t) => t.selected)
      .reduce((acc, t) => acc + (t.type === "income" ? t.amount : -t.amount), 0);

    return { total, selected, duplicates, autoCategorized, totalSelectedAmount };
  }, [transactions]);

  // Transações filtradas para a tabela
  const filteredTransactions = useMemo(() => {
    return transactions.filter((item) => {
      if (activeTabFilter === "selected" && !item.selected) return false;
      if (activeTabFilter === "duplicates" && !item.isPossibleDuplicate) return false;
      if (activeTabFilter === "income" && item.type !== "income") return false;
      if (activeTabFilter === "expense" && item.type !== "expense") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = item.description.toLowerCase().includes(q);
        const catMatch = item.categoryName?.toLowerCase().includes(q);
        const valMatch = String(item.amount).includes(q);
        const cardMatch = item.cardLast4?.includes(q) || item.cardLabel?.toLowerCase().includes(q);
        return descMatch || catMatch || valMatch || !!cardMatch;
      }

      return true;
    });
  }, [transactions, activeTabFilter, searchQuery]);

  // Agrupamento por Cartão
  const groupedTransactions = useMemo(() => {
    const groups: Record<
      string,
      {
        label: string;
        last4?: string;
        items: ImportedTransaction[];
        totalExpense: number;
        totalIncome: number;
      }
    > = {};

    for (const tx of filteredTransactions) {
      const key = tx.cardLast4 ? `card_${tx.cardLast4}` : "general";
      if (!groups[key]) {
        groups[key] = {
          label: tx.cardLabel || (tx.cardLast4 ? `Cartão Final ${tx.cardLast4}` : "Lançamentos Gerais"),
          last4: tx.cardLast4,
          items: [],
          totalExpense: 0,
          totalIncome: 0,
        };
      }
      groups[key].items.push(tx);
      if (tx.type === "expense") {
        groups[key].totalExpense += tx.amount;
      } else {
        groups[key].totalIncome += tx.amount;
      }
    }

    return Object.entries(groups).map(([key, group]) => ({ key, ...group }));
  }, [filteredTransactions]);

  const hasMultipleCards = useMemo(() => {
    return transactions.some((t) => !!t.cardLast4);
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            Importar Extrato Bancário
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Faça upload de extratos nos formatos OFX, CSV ou fatura em PDF. Transações com múltiplos cartões são associadas automaticamente.
          </p>
        </div>

        {/* Seletor de Workspace */}
        {workspaces.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold whitespace-nowrap">Workspace:</Label>
            <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
              <SelectTrigger className="w-[200px] bg-white">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name} ({ws.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Alerta quando nenhum workspace estiver selecionado */}
      {!selectedWorkspaceId && workspaces.length === 0 && (
        <Card className="border-amber-200 bg-amber-50 p-6 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-amber-600 mx-auto" />
          <h3 className="text-base font-bold text-amber-900">Nenhum Workspace Encontrado</h3>
          <p className="text-sm text-amber-700 max-w-md mx-auto">
            Para importar e conciliar extratos bancários, você precisa ter ao menos um workspace criado.
          </p>
          <Button onClick={() => navigate("/workspaces")} className="gap-2 font-semibold">
            <FolderKanban className="h-4 w-4" /> Criar Workspace
          </Button>
        </Card>
      )}

      {/* Alerta de Erro */}
      {errorMessage && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-3 animate-in fade-in">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1 text-sm font-medium">{errorMessage}</div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Mensagem de Sucesso */}
      {successMessage && (
        <Card className="border-emerald-200 bg-emerald-50/70 animate-in fade-in">
          <CardContent className="p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-emerald-900">Importação Concluída!</h3>
              <p className="text-emerald-700 text-sm mt-1">{successMessage}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={handleReset}>
                Importar Outro Arquivo
              </Button>
              <Button onClick={() => navigate("/transactions")} className="gap-2">
                Ver Transações <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ETAPA 1: Formulário de Upload e Configuração */}
      {!previewData && !successMessage && selectedWorkspaceId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card de Configurações */}
          <Card className="lg:col-span-1 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Configurações da Importação
              </CardTitle>
              <CardDescription>Defina onde os lançamentos serão registrados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Conta / Cartão de Destino */}
              <div className="space-y-2">
                <Label htmlFor="dest-card">Conta / Cartão de Destino</Label>
                <Select value={selectedCreditCardId} onValueChange={setSelectedCreditCardId}>
                  <SelectTrigger id="dest-card" className="bg-white">
                    <SelectValue placeholder="Selecione o destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>Conta Corrente / Dinheiro (Sem Cartão)</span>
                      </div>
                    </SelectItem>
                    {creditCards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        <div className="flex items-center gap-2">
                          <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                          <span>{card.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Para PDFs com múltiplos cartões (titular e adicionais), a associação é feita automaticamente por cartão.
                </p>
              </div>

              {/* Banco de Origem (Preset para CSV) */}
              <div className="space-y-2">
                <Label htmlFor="bank-preset">Banco de Origem (para CSV)</Label>
                <Select value={selectedBank} onValueChange={setSelectedBank}>
                  <SelectTrigger id="bank-preset" className="bg-white">
                    <SelectValue placeholder="Selecione o banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Utilizado principalmente para arquivos CSV. Extratos OFX e Faturas em PDF são detectados automaticamente.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Área de Drag and Drop */}
          <Card className="lg:col-span-2 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Upload do Arquivo de Extrato / Fatura
              </CardTitle>
              <CardDescription>Formatos aceitos: PDF (Faturas), OFX (Internet Banking) ou CSV</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".ofx,.csv,.pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
                }`}
              >
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                  {isParsingPdf ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : selectedFile?.name.endsWith(".pdf") ? (
                    <FileText className="h-6 w-6 text-rose-500" />
                  ) : (
                    <Upload className="h-6 w-6" />
                  )}
                </div>
                <h3 className="font-semibold text-slate-800">
                  {isParsingPdf
                    ? "Extraindo e analisando transações do PDF..."
                    : selectedFile
                    ? selectedFile.name
                    : "Clique para selecionar ou arraste o arquivo aqui"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedFile
                    ? `Tamanho: ${(selectedFile.size / 1024).toFixed(1)} KB • Clique para trocar`
                    : "Faturas em .PDF, Extratos bancários .OFX ou planilhas .CSV"}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileCheck className="h-4 w-4 text-emerald-600" />
                  <span>Deduplicação e associação por cartão ativadas</span>
                </div>

                <Button
                  id="btn-processar-arquivo"
                  disabled={!selectedFile || parseMutation.isPending || isParsingPdf || !canEdit}
                  onClick={() => parseMutation.mutate()}
                  className="gap-2 font-semibold w-full sm:w-auto"
                >
                  {isParsingPdf || parseMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      Processar Arquivo
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ETAPA 2: Tabela de PREVIEW e Revisão com Suporte a Múltiplos Cartões */}
      {previewData && (
        <div className="space-y-6 animate-in fade-in">
          {/* Banner de Estatísticas e Ações */}
          <Card className="bg-white border shadow-xs">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      Revisão do Extrato: {previewData.summary.bankName || "Detectado"}
                    </h3>
                    <Badge variant="outline" className="font-mono text-xs uppercase">
                      {previewData.summary.fileType}
                    </Badge>
                    {hasMultipleCards && (
                      <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200 text-xs">
                        <Users className="h-3 w-3 mr-1" /> Múltiplos Cartões
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Período: {previewData.summary.startDate || "Início"} até {previewData.summary.endDate || "Fim"} •{" "}
                    {stats.selected} de {stats.total} transações selecionadas
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {hasMultipleCards && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGroupByCardView(!groupByCardView)}
                      className="text-xs gap-1.5"
                    >
                      <CardIcon className="h-3.5 w-3.5 text-primary" />
                      {groupByCardView ? "Exibição em Lista Única" : "Agrupar por Cartão"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
                    Cancelar
                  </Button>
                  <Button
                    id="btn-confirmar-importacao"
                    size="sm"
                    disabled={stats.selected === 0 || confirmMutation.isPending || !canEdit}
                    onClick={() => setIsConfirmModalOpen(true)}
                    className="gap-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar Importação ({stats.selected})
                  </Button>
                </div>
              </div>

              {/* Badges de Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t">
                <div className="p-2.5 rounded-lg bg-slate-50 border">
                  <span className="text-[11px] text-muted-foreground block">Total Encontrado</span>
                  <span className="text-base font-bold text-slate-900">{stats.total} itens</span>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100">
                  <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Auto-categorizados
                  </span>
                  <span className="text-base font-bold text-emerald-800">{stats.autoCategorized} itens</span>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50/50 border border-amber-100">
                  <span className="text-[11px] text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Possíveis Duplicados
                  </span>
                  <span className="text-base font-bold text-amber-800">{stats.duplicates} itens</span>
                </div>

                <div className="p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">
                  <span className="text-[11px] text-indigo-700 block">Saldo Selecionado</span>
                  <span className={`text-base font-bold ${stats.totalSelectedAmount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    R$ {stats.totalSelectedAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filtros e Busca */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <Button
                variant={activeTabFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTabFilter("all")}
                className="text-xs h-8"
              >
                Todas ({stats.total})
              </Button>
              <Button
                variant={activeTabFilter === "selected" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTabFilter("selected")}
                className="text-xs h-8"
              >
                Selecionadas ({stats.selected})
              </Button>
              {stats.duplicates > 0 && (
                <Button
                  variant={activeTabFilter === "duplicates" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setActiveTabFilter("duplicates")}
                  className="text-xs h-8 gap-1"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Duplicadas ({stats.duplicates})
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar transação ou cartão..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleSelectAll(stats.selected < stats.total)}
                className="text-xs h-8 whitespace-nowrap"
              >
                {stats.selected === stats.total ? "Desmarcar Todos" : "Selecionar Todos"}
              </Button>
            </div>
          </div>

          {/* MODO AGRUPADO POR CARTÃO */}
          {hasMultipleCards && groupByCardView ? (
            <div className="space-y-6">
              {groupedTransactions.map((group) => (
                <Card key={group.key} className="shadow-xs border bg-white overflow-hidden">
                  <CardHeader className="bg-slate-50/80 border-b py-3 px-4 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                        <CardIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          {group.label}
                          {group.last4 && (
                            <Badge variant="outline" className="font-mono text-[10px] bg-white">
                              Final {group.last4}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-[11px]">
                          {group.items.length} lançamento(s) associado(s)
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-semibold">
                      {group.totalExpense > 0 && (
                        <span className="text-slate-700">
                          Total Despesas: <strong className="text-rose-600">R$ {group.totalExpense.toFixed(2)}</strong>
                        </span>
                      )}
                      {group.totalIncome > 0 && (
                        <span className="text-slate-700">
                          Pagamentos/Créditos: <strong className="text-emerald-600">R$ {group.totalIncome.toFixed(2)}</strong>
                        </span>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50/40 border-b text-slate-500 font-medium">
                          <tr>
                            <th className="p-3 w-10 text-center">#</th>
                            <th className="p-3 w-24">Data</th>
                            <th className="p-3">Descrição Original</th>
                            <th className="p-3 w-32 text-right">Valor</th>
                            <th className="p-3 w-48">Categoria Sugerida</th>
                            <th className="p-3 w-28 text-center">Parcelas</th>
                            <th className="p-3 w-24 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.items.map((tx) => {
                            const txKey = tx.tempId || tx.id || "";
                            return (
                              <tr
                                key={txKey}
                                className={`transition-colors ${
                                  !tx.selected
                                    ? "bg-slate-50/50 opacity-60"
                                    : tx.isPossibleDuplicate
                                    ? "bg-amber-50/40 hover:bg-amber-50/70"
                                    : "hover:bg-slate-50/80"
                                }`}
                              >
                                <td className="p-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={tx.selected}
                                    onChange={() => handleToggleSelect(txKey)}
                                    className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                                  />
                                </td>
                                <td className="p-3 whitespace-nowrap font-medium text-slate-600">
                                  {tx.date.split("-").reverse().join("/")}
                                </td>
                                <td className="p-3">
                                  <div className="font-semibold text-slate-800">{tx.description}</div>
                                  {tx.cardLabel && (
                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <CreditCardIcon className="h-3 w-3" /> {tx.cardLabel}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-right whitespace-nowrap">
                                  <span
                                    className={`font-bold ${
                                      tx.type === "income" ? "text-emerald-600" : "text-slate-900"
                                    }`}
                                  >
                                    {tx.type === "income" ? "+ " : "- "}
                                    R$ {tx.amount.toFixed(2)}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <Select
                                    value={tx.categoryId ? String(tx.categoryId) : "none"}
                                    onValueChange={(val) =>
                                      handleCategoryChange(txKey, val === "none" ? null : Number(val))
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-white">
                                      <SelectValue placeholder="Sem categoria" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Sem categoria</SelectItem>
                                      {categories
                                        .filter((c) => c.type === tx.type)
                                        .map((cat) => (
                                          <SelectItem key={cat.id} value={String(cat.id)}>
                                            {cat.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-3 text-center">
                                  <Select
                                    value={String(tx.installments || 1)}
                                    onValueChange={(val) => handleInstallmentChange(txKey, Number(val))}
                                  >
                                    <SelectTrigger className="h-8 text-xs w-20 mx-auto bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                        <SelectItem key={n} value={String(n)}>
                                          {n === 1 ? "À vista" : `${n}x`}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-3 text-center">
                                  {tx.isPossibleDuplicate ? (
                                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                      Duplicada?
                                    </Badge>
                                  ) : tx.autoCategorized ? (
                                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                      Auto
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-slate-500">
                                      Nova
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            /* MODO TABELA ÚNICA */
            <div className="border rounded-xl bg-white shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b text-slate-500 font-semibold">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={stats.selected === stats.total && stats.total > 0}
                          onChange={(e) => handleToggleSelectAll(e.target.checked)}
                          className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        />
                      </th>
                      <th className="p-3 w-24">Data</th>
                      <th className="p-3">Descrição Original</th>
                      {hasMultipleCards && <th className="p-3 w-32">Cartão</th>}
                      <th className="p-3 w-32 text-right">Valor</th>
                      <th className="p-3 w-48">Categoria Sugerida</th>
                      <th className="p-3 w-28 text-center">Parcelas</th>
                      <th className="p-3 w-24 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={hasMultipleCards ? 8 : 7} className="p-8 text-center text-slate-400">
                          Nenhuma transação encontrada com o filtro selecionado.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => {
                        const txKey = tx.tempId || tx.id || "";
                        return (
                          <tr
                            key={txKey}
                            className={`transition-colors ${
                              !tx.selected
                                ? "bg-slate-50/50 opacity-60"
                                : tx.isPossibleDuplicate
                                ? "bg-amber-50/40 hover:bg-amber-50/70"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={tx.selected}
                                onChange={() => handleToggleSelect(txKey)}
                                className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 whitespace-nowrap font-medium text-slate-600">
                              {tx.date.split("-").reverse().join("/")}
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-800">{tx.description}</div>
                              {tx.memo && (
                                <div className="text-[11px] text-slate-400 truncate max-w-xs">{tx.memo}</div>
                              )}
                            </td>
                            {hasMultipleCards && (
                              <td className="p-3">
                                {tx.cardLast4 ? (
                                  <Badge variant="outline" className="font-mono text-[10px] bg-slate-50">
                                    •••• {tx.cardLast4}
                                  </Badge>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">-</span>
                                )}
                              </td>
                            )}
                            <td className="p-3 text-right whitespace-nowrap">
                              <span
                                className={`font-bold ${
                                  tx.type === "income" ? "text-emerald-600" : "text-slate-900"
                                }`}
                              >
                                {tx.type === "income" ? "+ " : "- "}
                                R$ {tx.amount.toFixed(2)}
                              </span>
                            </td>
                            <td className="p-3">
                              <Select
                                value={tx.categoryId ? String(tx.categoryId) : "none"}
                                onValueChange={(val) =>
                                  handleCategoryChange(txKey, val === "none" ? null : Number(val))
                                }
                              >
                                <SelectTrigger className="h-8 text-xs bg-white">
                                  <SelectValue placeholder="Sem categoria" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Sem categoria</SelectItem>
                                  {categories
                                    .filter((c) => c.type === tx.type)
                                    .map((cat) => (
                                      <SelectItem key={cat.id} value={String(cat.id)}>
                                        {cat.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3 text-center">
                              <Select
                                value={String(tx.installments || 1)}
                                onValueChange={(val) => handleInstallmentChange(txKey, Number(val))}
                              >
                                <SelectTrigger className="h-8 text-xs w-20 mx-auto bg-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                    <SelectItem key={n} value={String(n)}>
                                      {n === 1 ? "À vista" : `${n}x`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3 text-center">
                              {tx.isPossibleDuplicate ? (
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                  Duplicada?
                                </Badge>
                              ) : tx.autoCategorized ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                  Auto
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-slate-500">
                                  Nova
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Confirmação */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Gravação de Lançamentos</DialogTitle>
            <DialogDescription>
              Você está prestes a importar <strong>{stats.selected} transações</strong> para o workspace{" "}
              <strong>{activeWorkspace?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-lg bg-slate-50 border space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total de transações:</span>
              <span className="font-bold text-slate-800">{stats.selected}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Destino Padrão:</span>
              <span className="font-bold text-slate-800">
                {selectedCreditCardId === "none"
                  ? "Conta Corrente / Dinheiro"
                  : creditCards.find((c) => c.id === selectedCreditCardId)?.name || "Cartão"}
              </span>
            </div>
            {hasMultipleCards && (
              <div className="flex justify-between text-purple-700 font-medium">
                <span>Múltiplos Cartões Detectados:</span>
                <span>{groupedTransactions.length} cartões identificados</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsConfirmModalOpen(false)}>
              Revisar Mais
            </Button>
            <Button
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
              className="bg-emerald-600 hover:bg-emerald-700 font-semibold gap-2"
            >
              {confirmMutation.isPending ? "Salvando..." : "Confirmar e Gravar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
