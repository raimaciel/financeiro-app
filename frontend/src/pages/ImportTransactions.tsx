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
} from "@/types";
import {
  extractTextFromPdf,
  parseTransactionsFromText,
  detectReferenceYear,
} from "@/utils/pdfParser";
import { extractTransactions as extractCaixaTransactions, detectInvoiceReference } from "@/utils/caixaInvoiceParser";
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
  { id: "caixa", name: "Caixa Econômica Federal (Fatura PDF com Revisão Manual)" },
  { id: "nubank", name: "Nubank" },
  { id: "inter", name: "Banco Inter" },
  { id: "itau", name: "Itaú" },
  { id: "bradesco", name: "Bradesco" },
  { id: "santander", name: "Santander" },
  { id: "bb", name: "Banco do Brasil" },
  { id: "c6", name: "C6 Bank" },
  { id: "generic", name: "Extrato Genérico (Data, Descrição, Valor)" },
];

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
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("ws-1");
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

  // Modo de revisão manual (ex: Caixa)
  const [isManualReviewMode, setIsManualReviewMode] = useState(false);
  const [globalYear, setGlobalYear] = useState<number>(() => new Date().getFullYear());
  const [globalMonth, setGlobalMonth] = useState<number>(() => new Date().getMonth() + 1);

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

  // Helper para vincular cartão automaticamente pelos últimos 4 dígitos (Bug 3)
  const matchCreditCardByDigits = (cardDigits: string | null | undefined, cardLabelText: string = "") => {
    if (!cardDigits && !cardLabelText) return { creditCardId: null, isIdentified: false, matchedLabel: cardLabelText };

    const digits = cardDigits || (cardLabelText.match(/\d{4}/)?.[0] ?? null);

    if (digits && creditCards.length > 0) {
      const matched = creditCards.find((c) => {
        if (c.last_four_digits && c.last_four_digits.trim() === digits) return true;
        if (c.name && c.name.includes(digits)) return true;
        return false;
      });

      if (matched) {
        return {
          creditCardId: matched.id,
          isIdentified: true,
          matchedLabel: `${matched.name}${matched.last_four_digits ? ` (•••• ${matched.last_four_digits})` : ""}`,
        };
      }
    }

    return {
      creditCardId: selectedCreditCardId !== "none" ? selectedCreditCardId : null,
      isIdentified: selectedCreditCardId !== "none",
      matchedLabel: cardLabelText || "Cartão não identificado",
    };
  };

  // Processamento de Arquivo PDF no Frontend com suporte a Caixa / Revisão Manual
  const processPdfFile = async (file: File) => {
    setIsParsingPdf(true);
    setErrorMessage(null);
    try {
      const text = await extractTextFromPdf(file);
      if (!text || text.trim() === "") {
        throw new Error("Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem digitalizada.");
      }

      const isCaixaSelected = selectedBank === "caixa";
      const isCaixaDetected = /caixa\s+econ[oô]mica/i.test(text) || (/\(cart[aã]o\s+\d+\)/i.test(text) && !detectReferenceYear(text));

      if (isCaixaSelected || isCaixaDetected) {
        let caixaItems: any[] = [];
        let invoiceRef: any = {};

        try {
          const previewRes = await api.post("/api/import/preview", {
            pdfText: text,
            workspaceId: selectedWorkspaceId,
          });
          caixaItems = previewRes.data.transactions || [];
          invoiceRef = {
            ano: previewRes.data.anoFatura,
            mes: previewRes.data.mesFatura,
            mesReferencia: previewRes.data.mesReferenciaFatura,
          };
        } catch {
          caixaItems = extractCaixaTransactions(text);
          invoiceRef = detectInvoiceReference(text);
        }

        if (caixaItems.length === 0) {
          throw new Error("Nenhuma transação identificada no formato de fatura Caixa. Verifique o arquivo.");
        }

        const effectiveYear = invoiceRef.ano || new Date().getFullYear();
        const effectiveMonth = invoiceRef.mes || new Date().getMonth() + 1;
        setGlobalYear(effectiveYear);
        setGlobalMonth(effectiveMonth);

        const mappedTransactions: ImportedTransaction[] = caixaItems.map((it: any, index: number) => {
          const type: "income" | "expense" = it.tipo === "C" ? "income" : "expense";
          const fullDescription = it.descricao || it.description; // Preservação integral (Bug 1)
          const cat = suggestCategory(fullDescription, type);

          // Bug 3: Vinculação de cartão existente
          const cardMatch = matchCreditCardByDigits(it.cartaoDigitos, it.cartao || it.cardLabel);
          const finalCreditCardId = it.creditCardId || cardMatch.creditCardId;
          const isIdentified = it.cartaoIdentificado !== undefined ? it.cartaoIdentificado : cardMatch.isIdentified;

          // Bug 2: Data de competência da fatura
          const dataTransacao = it.dataTransacao || it.dataParcial || "01/01";
          const [dd] = dataTransacao.split("/");
          const dataCompetencia = it.dataCompetencia || `${effectiveYear}-${String(effectiveMonth).padStart(2, "0")}-${dd.padStart(2, "0")}`;

          return {
            id: it.id || `caixa-${index}-${Date.now()}`,
            tempId: `caixa-${index}`,
            date: dataCompetencia,
            dataTransacao,
            dataParcial: dataTransacao,
            dataCompetencia,
            ano: effectiveYear,
            mes: effectiveMonth,
            mesReferenciaFatura: invoiceRef.mesReferencia,
            precisaRevisao: true,
            description: fullDescription,
            cleanDescription: fullDescription,
            amount: it.valor || it.amount,
            type,
            tipo: it.tipo || (type === "income" ? "C" : "D"),
            cartao: cardMatch.matchedLabel,
            cardLabel: cardMatch.matchedLabel,
            cartaoDigitos: it.cartaoDigitos,
            cartaoIdentificado: isIdentified,
            creditCardId: finalCreditCardId,
            categoryId: cat?.id || it.categoryId || null,
            categoryName: cat?.name || it.categoryName || null,
            selected: true,
          };
        });

        setIsManualReviewMode(true);
        setTransactions(mappedTransactions);
        setPreviewData({
          filename: file.name,
          fileType: "pdf",
          totalCount: mappedTransactions.length,
          duplicatesCount: 0,
          newCount: mappedTransactions.length,
          summary: {
            bankName: "Caixa Econômica Federal",
            fileType: "Fatura PDF (Revisão Manual)",
          },
          transactions: mappedTransactions,
        });

        setIsParsingPdf(false);
        return;
      }

      // Outros PDFs com detecção de ano
      const refYear = detectReferenceYear(text);
      const parsedItems = parseTransactionsFromText(text, refYear);

      if (parsedItems.length === 0) {
        throw new Error("Nenhum lançamento financeiro identificado no PDF. Verifique se é uma fatura ou extrato compatível.");
      }

      const mappedTransactions: ImportedTransaction[] = parsedItems.map((it, index) => {
        const type: "income" | "expense" = it.amount > 0 ? "income" : "expense";
        const cat = suggestCategory(it.description, type);
        const cardMatch = matchCreditCardByDigits(it.cardLast4, it.cardLabel);

        return {
          id: `pdf-${index}-${Date.now()}`,
          tempId: `pdf-${index}`,
          date: it.date,
          dataCompetencia: it.date,
          description: it.description,
          cleanDescription: it.description,
          amount: Math.abs(it.amount),
          type,
          categoryId: cat?.id || null,
          categoryName: cat?.name || null,
          creditCardId: cardMatch.creditCardId || (selectedCreditCardId !== "none" ? selectedCreditCardId : null),
          cardLast4: it.cardLast4,
          cardLabel: cardMatch.matchedLabel,
          cartaoIdentificado: cardMatch.isIdentified,
          installments: it.installments || 1,
          installmentCurrent: it.installmentCurrent || 1,
          selected: true,
        };
      });

      setIsManualReviewMode(false);
      setTransactions(mappedTransactions);
      setPreviewData({
        filename: file.name,
        fileType: "pdf",
        totalCount: mappedTransactions.length,
        duplicatesCount: 0,
        newCount: mappedTransactions.length,
        summary: {
          bankName: "Fatura em PDF",
          fileType: "PDF",
        },
        transactions: mappedTransactions,
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

      if (isManualReviewMode) {
        const payload = selected.map((t) => {
          const year = t.ano || globalYear;
          const month = t.mes || globalMonth;
          const day = (t.dataTransacao || t.dataParcial || "01/01").split("/")[0].padStart(2, "0");
          const competenceDate = t.dataCompetencia || `${year}-${String(month).padStart(2, "0")}-${day}`;

          return {
            date: competenceDate,
            dataCompetencia: competenceDate,
            dataTransacao: t.dataTransacao,
            dataParcial: t.dataParcial,
            ano: year,
            mes: month,
            descricao: t.description, // Descrição completa sem truncamento (Bug 1)
            description: t.description,
            valor: Number(t.amount),
            amount: Number(t.amount),
            tipo: t.type === "income" ? "C" : "D",
            type: t.type,
            cartao: t.cartao || t.cardLabel,
            creditCardId: t.creditCardId || null, // Vinculação com cartão do workspace (Bug 3)
            categoryId: t.categoryId || null,
          };
        });

        const res = await api.post("/api/import/confirm", {
          workspaceId: selectedWorkspaceId,
          transactions: payload,
        });
        return res.data;
      }

      const payload = {
        creditCardId: selectedCreditCardId !== "none" ? selectedCreditCardId : null,
        transactions: selected.map((t) => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          type: t.type,
          categoryId: t.categoryId || null,
          creditCardId: t.creditCardId || (selectedCreditCardId !== "none" ? selectedCreditCardId : null),
          installments: t.installments || 1,
          installmentCurrent: t.installmentCurrent || 1,
        })),
      };

      const res = await api.post(`/workspaces/${selectedWorkspaceId}/import/confirm`, payload);
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

    if (ext === "pdf" || selectedBank === "caixa") {
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
        const matchDesc = t.description.toLowerCase().includes(q);
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
            Importe extratos OFX/CSV ou faturas em PDF (Caixa, Nubank, Inter, etc.) com revisão manual antes de salvar.
          </p>
        </div>

        {/* Seletor de Workspace */}
        {workspaces.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Workspace:</Label>
            <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
              <SelectTrigger className="w-[200px] bg-white text-xs font-medium">
                <SelectValue placeholder="Selecione o Workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id} className="text-xs">
                    {ws.name} ({ws.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
                      <p className="text-xs text-muted-foreground mt-1">OFX, CSV ou PDF de qualquer banco ou fatura</p>
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
                  Selecione <strong>Caixa</strong> para faturas com vinculação de cartão e competência automática.
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
                <FileCheck className="h-5 w-5 text-primary" /> Revisão do Extrato
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

          {/* Banner de Revisão Manual com Competência da Fatura (Bug 2) */}
          {isManualReviewMode && (
            <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Fatura com Revisão Manual Obrigatória</h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Revise os lançamentos antes de salvar. Compras parceladas têm sua competência atribuída ao mês da fatura.
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

                        {/* Competência e Data Original (Bug 2) */}
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

                        {/* Descrição Completa Editável sem truncamento (Bug 1) */}
                        <td className="p-3">
                          {isManualReviewMode ? (
                            <Input
                              value={tx.description}
                              title={tx.description}
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
                              value={tx.amount}
                              onChange={(e) =>
                                handleUpdateTransactionField(targetIdx, "amount", parseFloat(e.target.value) || 0)
                              }
                              className="h-8 w-28 text-xs font-bold text-right bg-white border-slate-300"
                            />
                          ) : (
                            <span className={`font-bold ${tx.type === "income" ? "text-emerald-600" : "text-slate-900"}`}>
                              {tx.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
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

                        {/* Cartão Vinculado - SELECT com cartões cadastrados (Bug 3) */}
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
