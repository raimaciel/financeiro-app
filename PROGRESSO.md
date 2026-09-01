# PROGRESSO DO PROJETO: FINANCEIRO-APP
> **Status: ✅ Todas as funcionalidades principais concluídas!**

---

## 1. VISÃO GERAL DO PROJETO
O **financeiro-app** é uma plataforma completa de gestão financeira pessoal, compartilhada e empresarial. O sistema foi projetado com arquitetura multi-tenant baseada em **Workspaces**, permitindo controle de contas individuais, finanças de casal ou pequenos negócios, com categorização de despesas e receitas, cartões de crédito com cálculo automático de faturas, controle detalhado de transações parceladas, dashboard com gráficos e upload de comprovantes em Cloudflare R2.

---

## 2. STACK TECNOLÓGICA E PADRÕES UTILIZADOS

### Backend
- **Runtime**: Cloudflare Workers / Node.js
- **Framework Web**: [Hono](https://hono.dev/) v4 (alta performance, tipagem TypeScript nativa)
- **Banco de Dados**: Cloudflare D1 (SQLite distribuído Serverless)
- **Armazenamento de Objetos**: Cloudflare R2 (bucket `financeiro-comprovantes`, binding: `financeiro_comprovantes`)
- **Autenticação**: JWT com algoritmo `HS256` (`hono/jwt`) e criptografia de senhas com `bcryptjs`
- **Controle de Acesso / Permissões**: Middleware baseado em roles por workspace (`owner`, `editor`, `viewer`)
- **CORS**: Middleware configurado no Hono para permitir chamadas do frontend em desenvolvimento e produção

### Frontend
- **Bundler & Framework**: [Vite](https://vitejs.dev/) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Gráficos & Visualização**: [Recharts](https://recharts.org/) para gráficos responsivos de linha/área e pizza/donut
- **Estilização**: [Tailwind CSS](https://tailwindcss.com/) v3 + [shadcn/ui](https://ui.shadcn.com/) (Radix UI primitives)
- **Gerenciamento de Estado do Servidor**: [TanStack Query v5 (React Query)](https://tanstack.com/query/latest) para cache, refetching e sincronização assíncrona
- **Roteamento**: [React Router DOM v7](https://reactrouter.com/) com rotas públicas (`/login`, `/register`) e privadas protegidas por `<ProtectedRoute>` e layout com Navbar
- **Cliente HTTP**: [Axios](https://axios-http.com/) com interceptor automático para inclusão do header `Authorization: Bearer <token>`
- **Ícones**: [Lucide React](https://lucide.dev/)

---

## 3. ESTRUTURA DE ARQUIVOS DO PROJETO

```text
financeiro-app/
├── PROGRESSO.md
├── backend/
│   ├── PROGRESSO.md
│   ├── package.json
│   ├── tsconfig.json
│   ├── wrangler.jsonc
│   ├── migrations/
│   │   ├── 0001_create_users.sql
│   │   ├── 0001_init.sql
│   │   ├── 0002_workspaces_and_cards.sql
│   │   ├── 0003_add_installment_group.sql
│   │   ├── 0004_invoices_enhancements.sql
│   │   └── 0005_attachments.sql
│   └── src/
│       ├── auth.ts
│       ├── index.ts
│       └── routes/
│           ├── categories.ts
│           ├── credit-cards.ts
│           ├── dashboard.ts
│           ├── invoices.ts
│           ├── transactions.ts
│           └── workspaces.ts
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── components.json
    └── src/
        ├── App.tsx
        ├── index.css
        ├── main.tsx
        ├── components/
        │   ├── Layout.tsx
        │   ├── ProtectedRoute.tsx
        │   └── ui/ (button, card, dialog, input, label, select, table, badge, dropdown-menu, avatar)
        ├── hooks/
        │   └── useAuth.ts
        ├── lib/
        │   ├── api.ts
        │   └── utils.ts
        ├── pages/
        │   ├── Categories.tsx
        │   ├── CreditCards.tsx
        │   ├── Dashboard.tsx
        │   ├── Login.tsx
        │   ├── Register.tsx
        │   ├── Transactions.tsx
        │   └── Workspaces.tsx
        └── types/
            └── index.ts
```

---

## 4. BANCO DE DADOS (SCHEMA ATUALIZADO)

### Tabela: `users`
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `name` (TEXT NOT NULL)
- `email` (TEXT NOT NULL UNIQUE)
- `password_hash` (TEXT NOT NULL)
- `created_at` (TEXT DEFAULT (datetime('now')))

### Tabela: `workspaces`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `type` (TEXT CHECK(type IN ('personal','couple','business')) DEFAULT 'personal')
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Tabela: `workspace_members`
- `id` (TEXT PRIMARY KEY)
- `workspace_id` (TEXT NOT NULL, FK -> `workspaces.id`)
- `user_id` (TEXT NOT NULL, FK -> `users.id`)
- `role` (TEXT CHECK(role IN ('owner','editor','viewer')) DEFAULT 'editor')
- `invited_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Tabela: `categories`
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER NOT NULL, FK -> `users.id` ON DELETE CASCADE)
- `workspace_id` (TEXT, FK -> `workspaces.id`)
- `name` (TEXT NOT NULL)
- `icon` (TEXT DEFAULT 'circle')
- `color` (TEXT DEFAULT '#999999')
- `type` (TEXT NOT NULL CHECK(type IN ('income', 'expense')))
- `created_at` (TEXT DEFAULT (datetime('now')))

### Tabela: `credit_cards`
- `id` (TEXT PRIMARY KEY)
- `workspace_id` (TEXT NOT NULL, FK -> `workspaces.id`)
- `name` (TEXT NOT NULL)
- `brand` (TEXT)
- `limit_amount` (REAL)
- `closing_day` (INTEGER NOT NULL)
- `due_day` (INTEGER NOT NULL)
- `best_purchase_day` (INTEGER)
- `color` (TEXT DEFAULT '#000000')
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Tabela: `invoices`
- `id` (TEXT PRIMARY KEY)
- `credit_card_id` (TEXT NOT NULL, FK -> `credit_cards.id`)
- `reference_month` (TEXT NOT NULL)
- `closing_date` (DATE NOT NULL)
- `due_date` (DATE NOT NULL)
- `total_amount` (REAL DEFAULT 0)
- `status` (TEXT CHECK(status IN ('open','closed','paid')) DEFAULT 'open')
- `paid_at` (DATETIME)
- `workspace_id` (TEXT)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### Tabela: `transactions`
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `workspace_id` (TEXT, FK -> `workspaces.id`)
- `user_id` (INTEGER NOT NULL, FK -> `users.id` ON DELETE CASCADE)
- `category_id` (INTEGER, FK -> `categories.id` ON DELETE SET NULL)
- `credit_card_id` (TEXT, FK -> `credit_cards.id`)
- `type` (TEXT NOT NULL CHECK(type IN ('income', 'expense')))
- `amount` (REAL NOT NULL)
- `description` (TEXT)
- `installments` (INTEGER DEFAULT 1)
- `installment_current` (INTEGER DEFAULT 1)
- `installment_group_id` (TEXT)
- `date` (TEXT NOT NULL)
- `receipt_url` (TEXT) — **chave do objeto no R2**
- `attachment_name` (TEXT) — nome original do arquivo *(Migration 0005)*
- `attachment_type` (TEXT) — MIME type *(Migration 0005)*
- `attachment_size` (INTEGER) — tamanho em bytes *(Migration 0005)*
- `created_at` (TEXT DEFAULT (datetime('now')))

---

## 5. ROTAS / ENDPOINTS DA API

### Autenticação (`src/index.ts`)
| Método | Caminho | Descrição |
| :--- | :--- | :--- |
| `POST` | `/register` | Cadastro de usuário com hash bcrypt e retorno de JWT |
| `POST` | `/login` | Autenticação do usuário e emissão do JWT |
| `GET` | `/me` | Retorna o ID e E-mail do usuário autenticado |

### Workspaces (`src/routes/workspaces.ts`)
| Método | Caminho | Permissão | Descrição |
| :--- | :--- | :--- | :--- |
| `POST` | `/workspaces` | Autenticado | Cria workspace e insere criador como `owner` |
| `GET` | `/workspaces` | Membro | Lista workspaces do usuário e seus papéis (`role`) |
| `PUT` | `/workspaces/:id` | Owner | Atualiza nome e tipo do workspace |
| `DELETE` | `/workspaces/:id` | Owner | Exclui workspace e remove membros vinculados |
| `POST` | `/workspaces/:id/members` | Owner | Adiciona novo membro por e-mail |
| `GET` | `/workspaces/:id/members` | Membro | Lista membros do workspace |
| `DELETE` | `/workspaces/:id/members/:userId` | Owner | Remove membro |

### Categorias (`src/routes/categories.ts`)
| Método | Caminho | Permissão | Descrição |
| :--- | :--- | :--- | :--- |
| `POST` | `/workspaces/:workspaceId/categories` | Owner/Editor | Cria categoria com ícone e cor |
| `GET` | `/workspaces/:workspaceId/categories` | Membro | Lista categorias (filtro `?type=income|expense`) |
| `PUT` | `/workspaces/:workspaceId/categories/:id` | Owner/Editor | Atualiza categoria |
| `DELETE` | `/workspaces/:workspaceId/categories/:id` | Owner/Editor | Exclui (bloqueia se em uso) |

### Cartões de Crédito (`src/routes/credit-cards.ts`)
| Método | Caminho | Permissão | Descrição |
| :--- | :--- | :--- | :--- |
| `POST` | `/workspaces/:workspaceId/credit-cards` | Owner/Editor | Cria cartão |
| `GET` | `/workspaces/:workspaceId/credit-cards` | Membro | Lista com campos computados |
| `GET` | `/workspaces/:workspaceId/credit-cards/:id` | Membro | Detalhes de um cartão |
| `PUT` | `/workspaces/:workspaceId/credit-cards/:id` | Owner/Editor | Atualiza cartão |
| `DELETE` | `/workspaces/:workspaceId/credit-cards/:id` | Owner/Editor | Remove cartão |

### Faturas de Cartão (`src/routes/invoices.ts`)
| Método | Caminho | Permissão | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/workspaces/:workspaceId/cards/:cardId/invoices` | Membro | Lista faturas do cartão |
| `GET` | `/invoices/:id` | Membro | Detalhes com transações |
| `PATCH` | `/invoices/:id/pay` | Owner/Editor | Marca como paga |
| `PATCH` | `/invoices/:id/reopen` | Owner/Editor | Reabre fatura paga |

### Dashboard & Métricas (`src/routes/dashboard.ts`)
| Método | Caminho | Permissão | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/workspaces/:workspaceId/dashboard` | Membro | Métricas consolidadas, gráficos e resumos |

### Transações (`src/routes/transactions.ts`)
| Método | Caminho | Permissão | Descrição |
| :--- | :--- | :--- | :--- |
| `POST` | `/workspaces/:workspaceId/transactions` | Owner/Editor | Cria transação (parcelas automáticas) |
| `GET` | `/workspaces/:workspaceId/transactions` | Membro | Lista com filtros |
| `GET` | `/workspaces/:workspaceId/transactions/summary` | Membro | Resumo do mês |
| `PUT` | `/workspaces/:workspaceId/transactions/:id` | Owner/Editor | Edita transação |
| `DELETE` | `/workspaces/:workspaceId/transactions/:id` | Owner/Editor | Exclui (individual ou grupo) |
| `POST` | `/workspaces/:workspaceId/transactions/:id/attachment` | Owner/Editor | Upload de comprovante no R2 |
| `GET` | `/workspaces/:workspaceId/transactions/:id/attachment` | Membro | Visualizar/baixar comprovante do R2 |
| `DELETE` | `/workspaces/:workspaceId/transactions/:id/attachment` | Owner/Editor | Remove comprovante do R2 |

---

## 6. FUNCIONALIDADES CONCLUÍDAS ✅

### 1. Autenticação & Sessão ✅
- JWT HS256, hash bcrypt, rota `/me`, persistência em localStorage, rotas protegidas por `<ProtectedRoute>`.

### 2. Workspaces ✅
- CRUD completo com roles (owner, editor, viewer), gestão de membros, badges de tipo e role.

### 3. Categorias ✅
- CRUD vinculado ao workspace, paleta de 16 cores, grade de 28 ícones Lucide, preview em tempo real, abas Income/Expense.

### 4. Cartões de Crédito ✅
- CRUD com cálculo de best_purchase_day, próximo fechamento, próximo vencimento e dias restantes.
- Visual de cartão real com auto-contraste de texto.

### 5. Faturas de Cartão (Invoices) ✅
- Cálculo dinâmico da fatura com base no closing_day. Navegação por mês, badges de status (Aberta/Fechada/Paga).
- Ações de Marcar como Paga e Reabrir Fatura com confirmação.

### 6. Transações ✅ (Etapa Central)
- Parcelamento automático com installment_group_id. Filtros avançados (mês, tipo, categoria, forma de pagamento).
- KPI cards de receitas/despesas/saldo. Listagem agrupada por data. Exclusão individual ou de grupo.

### 7. Dashboard com Gráficos ✅
- Endpoint consolidado retornando resumo, evolução de 6 meses, distribuição por categoria, top 5 gastos, faturas e limite.
- Frontend com Recharts: AreaChart (evolução), PieChart donut (categorias), cards de métricas e KPIs.
- Barra de progresso de utilização de limite em cartões.

### 8. Comprovantes / Anexos com Cloudflare R2 ✅ *(Novo!)*
- **Bucket R2**: `financeiro-comprovantes` (binding `financeiro_comprovantes`), já existente e configurado no `wrangler.jsonc`.
- **Migration 0005**: Adicionadas colunas `attachment_name`, `attachment_type`, `attachment_size` na tabela `transactions`. Migração aplicada local e remoto.
- **Backend**:
  - `POST /transactions/:id/attachment`: Upload multipart/form-data, validação de tipo (JPG, PNG, WEBP, PDF) e tamanho (5MB), geração de chave única (`workspaces/{wsId}/transactions/{txId}/{timestamp}-{filename}`), substituição automática de arquivo anterior, atualização do D1.
  - `GET /transactions/:id/attachment`: Proxy transparente do R2 com Content-Type e Content-Disposition corretos para visualização in-browser.
  - `DELETE /transactions/:id/attachment`: Remove o objeto do R2 e limpa os campos no D1.
  - Segurança: verificação de membro do workspace em todas as rotas; apenas owner/editor pode fazer upload/remoção.
- **Frontend** (Transactions.tsx):
  - Campo de upload no modal de criação/edição com **zona de drag-and-drop** clicável.
  - Preview de imagem em tempo real antes do envio; ícone de PDF para documentos.
  - Validações no cliente antes do envio: tipo e tamanho com mensagem de erro inline.
  - Indicador de progresso "Enviando comprovante..." durante o upload.
  - **Ícone de clipe 📎** na linha da transação indicando que há comprovante.
  - Badge "Comprovante" clicável na listagem.
  - **Modal de visualização** dedicado: exibe imagem em fullwidth ou botão de download para PDF.
  - Botão "Remover Comprovante" com mutation e toast de confirmação.
  - Link "Abrir em nova aba" com autenticação Bearer.

---

## 7. PRÓXIMOS PASSOS (SUGESTÕES)
- [ ] **Relatórios Exportáveis**: Exportação de extratos e resumos em PDF e Excel/CSV.
- [ ] **Testes Automatizados**: Suíte de testes unitários e de integração (Vitest / Playwright).
- [ ] **Notificações / Alertas**: Avisos de vencimento próximo de faturas e estouro de limites.
- [ ] **Deploy em Produção**: Publicar backend no Cloudflare Workers e frontend em Pages.
- [ ] **Multiple Attachments**: Suporte a múltiplos comprovantes por transação (tabela separada).

---

## 8. DADOS DE TESTE ATUAIS
- **Usuário de Teste**: `teste2@teste.com` / Senha: `123456`
- **Workspace de Teste**: `Casa Raimundo` (`b4ce70e9-b206-40c0-9c91-71459b271120`)
- **Cartão de Teste**: `Nubank Roxinho` (`43911ef7-41b2-473f-a463-67f42ac724b1`)
- **Categoria de Teste**: `Alimentação` (Despesa, icon: `utensils`, color: `#FF5733`)



### 10. Importação em Massa de Extratos (OFX & CSV) ✅ *(Novo!)*
- **Backend**:
  - **Parser OFX Nativo** (`src/utils/ofxParser.ts`): Leitura de blocos `<STMTTRN>`, tags `<DTPOSTED>`, `<TRNAMT>`, `<MEMO>`, `<NAME>`, `<FITID>`, decodificação de entidades SGML/XML e normalização para ISO `YYYY-MM-DD`.
  - **Parser CSV Multi-Banco** (`src/utils/csvParser.ts`): Autodetecção de delimitadores (`;`, `,`, `\t`), presets configuráveis para Nubank, Banco Inter, Itaú, Bradesco, Santander, Banco do Brasil, C6 Bank e heurística de autodetecção de colunas. Tratamento de números no padrão brasileiro e internacional.
  - **Motor de Categorização Automática** (`src/utils/categoryRules.ts`): Regras por palavras-chave (Uber, 99, Ifood, Restaurante, Mercado, Carrefour, Netflix, Spotify, Drogasil, Enel, Salário, etc.) com correspondência automática com as categorias reais cadastradas no workspace.
  - **Detecção de Parcelamento** (`src/utils/installmentDetector.ts`): Reconhecimento de padrões como `02/06`, `PARC 03/10`, `(2/6)`, `PARCELA 04 DE 12`.
  - **Deduplicação Inteligente** (`src/utils/deduplication.ts`): Hash determinístico e comparação com tolerância de fuso horário de compensação bancária (1 dia) contra lançamentos existentes no banco de dados.
  - **Rotas de API**:
    - `POST /workspaces/:workspaceId/import/parse`: Processa o arquivo, detecta duplicatas e sugere categorias/parcelas sem gravar nada no banco.
    - `POST /workspaces/:workspaceId/import/confirm`: Grava em lote as transações revisadas pelo usuário com suporte a chunking para o Cloudflare D1.
- **Frontend**:
  - **Página `ImportTransactions.tsx`** (`/import`):
    - Seletor de workspace, conta/cartão de destino e banco de origem.
    - Zona de drag & drop para arquivos `.ofx` e `.csv`.
    - Tabela de preview interativa com edição inline: data, descrição, valor com `CurrencyInput`, tipo, categoria e parcelamento.
    - Indicador visual e badge de duplicata com aviso explicativo (desmarcado por padrão para segurança).
    - Filtros por abas: Todas, Selecionadas, Duplicatas, Receitas, Despesas e busca textual em tempo real.
    - Ações em massa: Selecionar Todas, Desmarcar Todas, Desmarcar Duplicatas.
    - Modal de confirmação final exibindo totais de receitas e despesas selecionadas.
  - **Integração de Navegação**:
    - Link "Importar Extrato" no menu superior (`Layout.tsx`).
    - Botão "Importar Extrato" no cabeçalho de Transações (`Transactions.tsx`).
    - Botão de atalho rápido no Dashboard (`Dashboard.tsx`).
- **Testes Automatizados**:
  - Suíte completa de testes unitários para os parsers OFX/CSV, motor de regras, detector de parcelas e deduplicador.
  - Testes de integração para as rotas da API e componente React de importação.


### 11. Transações Recorrentes & Automação de Contas Fixas ✅ *(Novo!)*
- **Backend**:
  - **Tabela D1** (`migrations/0006_recurring_transactions.sql`): Criação da tabela `recurring_transactions` com suporte a frequência (mensal, semanal, anual), dia do mês, data de início/fim, status (`active`, `paused`, `cancelled`) e controle de `last_generated_date`.
  - **Detector Automático de Padrões** (`src/utils/recurringDetector.ts`): Análise histórica de transações em múltiplos meses, tolerância para variações leves de valor (&plusmn;15% para contas de consumo) e dia do mês, gerando sugestões inteligentes com grau de confiança (`high` / `medium`).
  - **Gerador de Lançamentos Futuros** (`src/utils/recurringGenerator.ts`): Cálculo preciso de ocorrências pendentes respeitando datas de início, fim e última geração, prevenindo duplicações.
  - **Rotas de API** (`src/routes/recurring.ts`):
    - `GET /workspaces/:workspaceId/recurring`: Listagem com sumário financeiro mensal (despesas fixas, receitas fixas e balanço comprometido).
    - `GET /workspaces/:workspaceId/recurring/suggestions`: Sugestões de recorrências detectadas automaticamente.
    - `POST /workspaces/:workspaceId/recurring`: Cadastro manual ou a partir de sugestão com validações rigorosas.
    - `PUT /workspaces/:workspaceId/recurring/:id`: Edição completa de regras.
    - `PATCH /workspaces/:workspaceId/recurring/:id/pause`: Alternância de status entre ativo e pausado.
    - `DELETE /workspaces/:workspaceId/recurring/:id`: Exclusão de regra.
    - `POST /workspaces/:workspaceId/recurring/generate`: Execução em lote para criar transações reais na tabela `transactions`.
- **Frontend**:
  - **Nova Página `RecurringTransactions.tsx`** (`/recurring`):
    - Seção de **Sugestões Detectadas** no topo com botão de confirmação em 1 clique ou descarte.
    - 4 Cards de métricas KPI: Recorrências Ativas/Pausadas, Despesas Fixas/mês, Receitas Fixas/mês e Saldo Comprometido.
    - Tabela completa de gestão com status, dia do vencimento, categoria com cor, cartão/conta e menu de ações (Gerar Agora, Pausar/Reativar, Editar, Excluir).
    - Modal de criação/edição utilizando o componente `CurrencyInput` para os valores monetários.
    - Botão de ação rápida "Gerar Pendentes" com feedback visual de transações criadas.
  - **Dashboard Não-Invasivo** (`Dashboard.tsx`):
    - Adicionado card sutil e elegante "Recorrências Ativas" informando o total de contas fixas e o valor mensal comprometido, com link de acesso rápido para `/recurring`.
  - **Navegação Integrada**:
    - Link "Recorrências" adicionado na barra de navegação principal (`Layout.tsx`).
    - Rota `/recurring` registrada no `App.tsx`.
- **Testes Automatizados**:
  - Suíte de 101 testes no backend (cobindo detecção de padrões, cálculo de datas pendentes e endpoints da API).
  - Suíte de 28 testes no frontend (cobrindo renderização, cards de KPI, sugestões e modais de criação).


### 12. Metas de Economia & Orçamentos por Categoria ✅ *(Novo!)*
- **Backend**:
  - **Tabelas D1** (`migrations/0007_budgets_and_goals.sql`):
    - `budgets`: Criação de orçamentos por categoria com suporte a limite mensal, mês de referência (ou padrão recorrente anual/mensal) e percentual de alerta de atenção (`alert_threshold_percent`).
    - `savings_goals`: Criação de metas financeiras com valor alvo, valor atual guardado, data limite e status (`active`, `completed`, `cancelled`).
  - **Rotas de API** (`src/routes/budgets.ts`):
    - `GET /workspaces/:workspaceId/budgets`: Lista orçamentos com gastos reais agregados das transações do mês, percentual consumido, valor restante e status (`ok`, `warning`, `exceeded`).
    - `POST /workspaces/:workspaceId/budgets`: Define ou atualiza orçamento para uma categoria.
    - `PUT /workspaces/:workspaceId/budgets/:id`: Edita limites e percentuais de alerta.
    - `DELETE /workspaces/:workspaceId/budgets/:id`: Remove orçamento.
    - `GET /workspaces/:workspaceId/goals`: Lista metas com progresso calculado (`progress_percentage`), saldo faltante e contagem regressiva de dias.
    - `POST /workspaces/:workspaceId/goals`: Cria nova meta de economia.
    - `PUT /workspaces/:workspaceId/goals/:id`: Edita meta.
    - `PATCH /workspaces/:workspaceId/goals/:id/deposit`: Endpoint de depósito incremental com conclusão automática ao atingir 100% do alvo.
    - `DELETE /workspaces/:workspaceId/goals/:id`: Remove meta.
- **Frontend**:
  - **Nova Página `BudgetsAndGoals.tsx`** (`/budgets`):
    - Seletor de workspace e seletor de mês de referência (`YYYY-MM`).
    - **Aba 1 (Orçamentos por Categoria)**:
      - 4 Cards de métricas KPI: Total Orçado, Gasto no Mês, Saldo Disponível e Categorias em Alerta.
      - Grid de cards de orçamento com barras de progresso dinâmicas (Verde <80%, Amarelo 80-99.9%, Vermelho >=100%), badges de estado e comparativo de limites.
      - Modal com seletor de categoria, `CurrencyInput` para valor monetário e seletor de gatilho de alerta.
    - **Aba 2 (Metas de Economia)**:
      - 4 Cards de métricas KPI: Metas Ativas/Concluídas, Total Alvo Acumulado, Total Guardado e Progresso Geral.
      - Grid de metas com barra de progresso, contagem regressiva de dias até a data limite e botão de ação rápida "Depositar".
      - Modal de depósito com `CurrencyInput` e cálculo prévio do novo saldo.
      - Modal de criação e edição com data alvo opcional.
  - **Dashboard Integrado Não-Invasivo** (`Dashboard.tsx`):
    - Novo card sutil "Orçamentos por Categoria" alertando em tempo real se há categorias excedidas ou confirmando 100% de conformidade com link rápido para `/budgets`.
  - **Navegação**:
    - Link "Orçamentos" adicionado ao menu superior (`Layout.tsx`).
    - Rota `/budgets` registrada no `App.tsx`.
- **Testes Automatizados**:
  - Suíte de 107 testes no backend cobrindo agregações de transações do mês, status de alerta e depósitos em metas.
  - Suíte de 31 testes no frontend cobrindo renderização, cálculo visual e alternância entre abas.


### 13. Gestão Avançada de Faturas de Cartão de Crédito & Previsão Futura ✅ *(Novo!)*
- **Backend**:
  - **Módulo Utilitário de Faturas** (`src/utils/invoiceCalculator.ts`):
    - `calculateInvoicePeriod`: Cálculo preciso de período de fechamento, data de início, data de fechamento, data de vencimento (com suporte para `due_day <= closing_day` no mês seguinte), contagem regressiva de dias até fechamento/vencimento e ajuste seguro de dias para meses menores (Fevereiro, meses de 30 dias).
    - `getInvoiceMonthForTransaction`: Mapeamento determinístico da fatura (`YYYY-MM`) em que cada compra cai com base no `closing_day`.
    - `calculateInvoiceForecast`: Algoritmo de projeção de parcelas futuras para os próximos N meses (padrão 6 meses), agrupando lançamentos e totalizando valores comprometidos.
  - **Rotas de API** (`src/routes/invoices.ts`):
    - `GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/current`: Detalhamento da fatura vigente com separação de compras fechadas no ciclo vs. compras em aberto que entram no próximo mês.
    - `GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/history`: Histórico de faturas fechadas anteriores com valor total e status.
    - `GET /workspaces/:workspaceId/credit-cards/:cardId/invoice/forecast`: Previsão de parcelas e valores comprometidos mês a mês nos próximos 6 meses.
- **Frontend**:
  - **Tela de Cartões e Faturas** (`CreditCards.tsx`):
    - Resumo dinâmico em cada card com valor da fatura atual e dias restantes para o vencimento.
    - Modal de visualização de faturas expandido com duas abas:
      - **Aba 1 (Faturas por Mês)**: Seletor de mês, card de destaque com valor total, período de compras, data de vencimento e botão "Marcar como Paga".
      - **Aba 2 (Previsão Futura - 6 Meses)**: Total comprometido no semestre e lista mês a mês com discriminativo das compras parceladas.
    - Formulário de cadastro/edição atualizado com `CurrencyInput` e seletores de Dia de Fechamento (1 a 31) e Dia de Vencimento (1 a 31).
- **Testes Automatizados**:
  - Suíte de 111 testes no backend cobrindo cálculo de datas de fechamento/vencimento e novos endpoints de fatura.
  - Suíte de 33 testes no frontend cobrindo renderização de cartões, faturas e modais de criação.


### 14. Sistema de Notificações e Alertas em Tempo Real ✅ *(Novo!)*
- **Arquitetura Escolhida (Tempo Real / Sem Persistência)**:
  - Optou-se pelo cálculo dinâmico das notificações em tempo real no backend, sem criar tabelas adicionais no SQLite/D1.
  - **Justificativa**: Garante que o estado dos alertas sempre reflita 100% da realidade atual das despesas, orçamentos, faturas e metas sem necessidade de triggers, jobs assíncronos ou sincronizações complexas. O controle de "lida/não lida" é gerenciado de forma leve e determinística no `localStorage` do navegador através do ID único de cada alerta gerado.
- **Regras de Notificação Cobertas**:
  1. `budget_warning`: Categoria atingiu ou superou 80% do limite de orçamento mensal (`severity: warning`).
  2. `budget_exceeded`: Categoria ultrapassou 100% do limite orçamentário (`severity: danger`).
  3. `invoice_due_soon`: Fatura de cartão de crédito fechada com vencimento em até 3 dias, no dia do vencimento ou vencida (`severity: warning` / `severity: danger`).
  4. `goal_achieved`: Meta de economia atingida (`severity: info`).
  5. `goal_deadline_near`: Meta de economia ativa com prazo para os próximos 7 dias e ainda pendente (`severity: warning`).
  6. `recurring_pending`: Transações recorrentes ativas com datas pendentes aguardando geração (`severity: info`).
  7. `import_reminder`: Lembrete de conciliação quando a última transação tiver mais de 30 dias (`severity: info`).
- **Backend**:
  - `src/utils/notificationGenerator.ts`: Módulo utilitário gerador de notificações com ordenação por severidade e data.
  - `src/routes/notifications.ts`: Endpoint `GET /workspaces/:workspaceId/notifications`.
- **Frontend**:
  - `src/components/NotificationsPopover.tsx`: Componente com ícone de sino (🔔), badge numérico de não lidas, menu dropdown detalhado com ícones contextuais, marcação de lida ao clicar com redirecionamento de rota, e botão "Marcar todas como lidas".
  - `src/components/Layout.tsx`: Integração global do sino no cabeçalho visível em todas as telas da aplicação com polling automático a cada 5 minutos.
- **Testes Automatizados**:
  - Suíte de 119 testes no backend cobrindo regras de cálculo e endpoints.
  - Suíte de 36 testes no frontend cobrindo renderização, badge numérico, abertura de painel e marcação de lida.

## [Correção] Máscara de moeda BRL nos inputs

**Data:** 31/08/2026

**Problema identificado:**
Os campos de input "Valor (R$)" (Novo Lançamento) e "Limite (R$)" (Cadastro de Cartão) exibiam números sem formatação brasileira (ex: 9300 em vez de 9.300,00), enquanto os cards do Dashboard já exibiam corretamente com Intl.NumberFormat('pt-BR').

**Solução aplicada:**
- Criado componente reutilizável CurrencyInput
- Formatação em tempo real usando Intl.NumberFormat('pt-BR')
- Valor numérico puro mantido internamente para envio à API/D1 (sem alteração de schema)
- Substituídos os inputs de Valor (Lançamento) e Limite (Cartão) pelo novo componente

**Status:** Resolvido e testado em produção

---

## 10. LEITURA DE PDFS DE FATURAS E ASSOCIAÇÃO POR CARTÃO (NOVO)

### 10.1. Objetivo e Escopo
Permitir a importação direta de faturas de cartão de crédito e extratos em formato PDF no frontend, extraindo automaticamente as transações via `pdfjs-dist`, agrupando itens por linha com base em coordenadas espaciais (Y/X), identificando múltiplos cartões (titular, adicionais e virtuais) a partir de cabeçalhos contextuais (`5555****6768`, `543882*******1711`, `CARTÃO 4203 **** **** 7380`, etc.), e oferecendo um preview organizado por cartão antes da gravação.

### 10.2. Componentes e Módulos Implementados

1. **`frontend/src/utils/pdfParser.ts`**:
   - **`extractTextFromPdf(file: File)`**: Extrai fragmentos de texto do PDF via `pdfjs-dist` e agrupa linhas considerando tolerância vertical de 4px e ordenação horizontal por coordenada X.
   - **`detectCardHeader(line: string)`**: Detecta máscaras e rótulos de cartões no fluxo sequencial do documento, mantendo o "cartão em contexto" para as transações seguintes.
   - **3 Estratégias de Layout**:
     - **Layout 1 (DD/MM)**: Faturas digitais modernas (Nubank, Inter, C6, Itaú).
     - **Layout 2 (DD/MM/AAAA ou DD/MM/AA)**: Faturas tradicionais (Bradesco, Santander, Banco do Brasil).
     - **Layout 3 (DD mês. AAAA)**: Faturas com nomes de meses em português (ex: `15 ago 2026`).
   - **`parseTransactionsFromText(text, referenceYear)`**: Detecta o ano de referência, executa os 3 parsers e seleciona o resultado com mais transações válidas, aplicando desduplicação.
   - **`parseAmountValue` & `extractInstallments`**: Converte valores para float (negativo para débito/compra, positivo para créditos/estornos/pagamentos) e detecta parcelamentos (`02/05`, `3/10`, `PARC 01/12`).

2. **`frontend/src/pages/ImportTransactions.tsx`**:
   - Aceite de arquivos `.pdf` no dropzone e seletor de arquivos.
   - Processamento de PDF no cliente com feedback visual de carregamento (`Loader2`).
   - Auto-associação com cartões de crédito cadastrados no Workspace caso os 4 últimos dígitos coincidam.
   - Visualização agrupada por cartão (`groupByCardView`) com subtotais por cartão e badges visuais.

3. **`frontend/src/types/index.ts`**:
   - Atualizados `ImportedTransaction` e `ParseImportResponse` com suporte a `cardLast4`, `cardLabel`, `fileType: "pdf"`.

4. **Testes Automatizados**:
   - `frontend/src/tests/pdfParser.test.ts`: 12 testes unitários cobrindo detecção de cabeçalhos, conversão de valores, 3 layouts e parcelamento.
   - `frontend/src/tests/ImportTransactions.test.tsx`: Teste de integração de upload de PDF com múltiplos cartões.

---

## 11. CONTROLE DE ACESSO: CÓDIGO DE CONVITE E BLOQUEIO DE USUÁRIOS (NOVO)

### 11.1. Objetivo e Escopo
Implementar mecanismos de segurança e moderação de contas:
1. **Código de Convite no Cadastro**: Exigir uma chave de autorização (`INVITE_CODE`) enviada no corpo do cadastro (`POST /register`), retornando 403 se ausente ou incorreta.
2. **Bloqueio e Desbloqueio de Usuários**: Adicionar controle de status (`is_active`) e perfil de administração (`is_admin`), bloqueando o login e requisições autenticadas de contas desativadas e fornecendo um painel administrativo completo em `/admin/usuarios`.

### 11.2. Modificações de Banco de Dados e Backend
- **Migration `0006_user_access_control.sql`**:
  - `ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`
  - `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;`
- **`backend/src/auth.ts`**:
  - `authMiddleware`: Consulta `users` e rejeita com 403 (`"Sua conta foi bloqueada. Contate o administrador."`) se `is_active === 0`. Define `isAdmin` no contexto.
- **`backend/src/index.ts`**:
  - `POST /register`: Valida `inviteCode` contra `c.env.INVITE_CODE`. Cria o usuário com `is_active = 1` e `is_admin = 0`.
  - `POST /login`: Verifica se `user.is_active === 0`, impedindo a emissão de token com erro 403.
  - `GET /me`: Retorna `is_admin` e `is_active`.
- **`backend/src/routes/admin.ts`**:
  - `GET /admin/users`: Lista todos os usuários cadastrados (protegido para administradores).
  - `PATCH /admin/users/:id/toggle-status`: Inverte o status de ativação do usuário alvo (impede auto-bloqueio de administradores).
- **`backend/wrangler.jsonc` & `backend/.dev.vars`**:
  - Definida variável de ambiente `INVITE_CODE = "FINANCEIRO2026"`.

### 11.3. Modificações no Frontend
- **`frontend/src/pages/Register.tsx`**:
  - Campo obrigatório **"Código de Convite"** posicionado entre a senha e o botão de submit.
  - Validação de entrada e exibição de alerta em caso de código inválido.
- **`frontend/src/pages/AdminUsers.tsx`**:
  - Página administrativa com resumo por KPIs (Total, Ativos, Bloqueados, Administradores).
  - Filtro em tempo real por nome ou e-mail.
  - Tabela com Avatares, Badges de Status (Verde Ativo / Vermelho Bloqueado) e botões de ação **Bloquear** / **Desbloquear**.
  - Proteção de acesso caso usuário não possua privilégios de administrador.
- **`frontend/src/components/Layout.tsx`**:
  - Item de navegação **"Usuários (Admin)"** com ícone `ShieldCheck` exibido apenas para administradores.
- **`frontend/src/App.tsx`**:
  - Rota `/admin/usuarios` registrada sob o layout protegido.

### 11.4. Testes Automatizados
- **Backend (`backend/tests/admin.test.ts` & `backend/tests/auth.test.ts`)**: 132 testes passando 100% cobrindo convite, bloqueio de login, bloqueio no middleware e rotas administrativas.
- **Frontend (`frontend/src/tests/Register.test.tsx` & `frontend/src/tests/AdminUsers.test.tsx`)**: 55 testes passando 100% cobrindo formulário de cadastro com código de convite e ações da tabela de administração.

---

## 12. CÓDIGOS DE CONVITE DINÂMICOS COM EXPIRAÇÃO E LIMITE DE USOS (NOVO)

### 12.1. Objetivo e Escopo
Substituir o código de convite fixo por um sistema dinâmico e seguro de convites gerenciados pelo administrador, com prazo de validade temporal (ex: 24h, 48h, 7 dias, 30 dias) e limite de utilizações (ex: 1 uso, 5 usos, 10 usos, ilimitado).

### 12.2. Modificações de Banco de Dados e Backend
- **Migration `0007_invite_codes.sql`**:
  - Criação da tabela `invite_codes` (`id`, `code UNIQUE`, `expires_at`, `used_at`, `used_by_user_id`, `created_by_admin_id`, `max_uses`, `uses_count`, `created_at`).
- **`backend/src/index.ts` (`POST /register`)**:
  - Busca o código na tabela `invite_codes`.
  - Rejeita se `expires_at < now` com 403 (`"Este código de convite está expirado"`).
  - Rejeita se `uses_count >= max_uses` com 403 (`"Este código de convite já esgotou o limite de utilizações"`).
  - Atualiza `uses_count`, `used_at` e `used_by_user_id` após a criação do usuário.
  - Mantém fallback para `INVITE_CODE` caso configurado.
- **`backend/src/routes/admin.ts`**:
  - `GET /admin/invite-codes`: Lista todos os convites com status computado (`ativo`, `expirado`, `esgotado`) e usuário que utilizou.
  - `POST /admin/invite-codes`: Gera convite com código aleatório (ex: `INV-A8F2K9`) ou customizado, prazo de validade e limite de utilizações.
  - `DELETE /admin/invite-codes/:id`: Revoga/exclui convites existentes.

### 12.3. Modificações no Frontend
- **`frontend/src/pages/AdminUsers.tsx`**:
  - Implementada navegação por abas (**Usuários Cadastrados** e **Códigos de Convite**).
  - Modal **"Gerar Novo Convite"** com seletores de validade (24h a 30 dias), limite de utilizações e código personalizado opcional.
  - Tabela de convites com botão de cópia rápida com feedback (`Check` animado), badges de status e botão de exclusão.
  - Cards de KPIs dedicados a convites (*Total*, *Ativos*, *Utilizados/Esgotados*, *Expirados*).
- **`frontend/src/types/index.ts`**:
  - Adicionada interface `InviteCode`.

### 12.4. Testes Automatizados
- **Backend**: **137 testes passando (100%)** cobrindo convites dinâmicos, códigos expirados, limites de usos, listagem e revogação.
- **Frontend**: **55 testes passando (100%)** cobrindo formulário de cadastro com convite e painel administrativo com abas.

### 12.5. Melhorias de Segurança e Usabilidade nos Convites (Implementado)
1. **Modal de Confirmação para Revogação**:
   - Adicionado diálogo de confirmação seguro antes de executar `DELETE /admin/invite-codes/:id`.
   - Mensagem: *"Deseja realmente revogar o convite [CÓDIGO]? Esta ação não pode ser desfeita."* com botões *"Cancelar"* e *"Sim, revogar"* (destrutivo).
2. **Remoção Segura do Fallback INVITE_CODE do .env**:
   - O endpoint `POST /register` agora valida **exclusivamente** contra os códigos dinâmicos da tabela `invite_codes` no D1.
   - Variável `INVITE_CODE` removida do `wrangler.jsonc`, `.dev.vars` e `Bindings` em `auth.ts`.
   - Garantido código inicial ativo (`FIN-ADMIN2026`) no D1 para continuidade operacional.
3. **Alerta Visual de Expiração Iminente**:
   - Convites ativos com prazo de expiração $\le$ 2 horas exibem badge em destaque: `⚠️ Expira em Xh` ou `⚠️ Expira em Xmin` (se $< 1$ hora).
   - Adicionado novo card KPI de resumo: **"Expirando em Breve"** no topo da aba de convites.

---

## 13. EDIÇÃO DE USUÁRIOS E GESTÃO DE PERMISSÕES PELO ADMINISTRADOR (NOVO)

### 13.1. Objetivo e Escopo
Permitir que os administradores editem o nome completo, status de ativação da conta e permissões de administrador de qualquer usuário cadastrado diretamente pelo painel administrativo, com confirmação obrigatória e alerta visual de destaque ao promover usuários a administrador.

### 13.2. Implementação no Backend
- **Endpoint `PATCH /admin/users/:id`** em `backend/src/routes/admin.ts`:
  - Recebe `{ name?, is_active?, is_admin? }` no corpo da requisição.
  - Ignora qualquer campo `email` ou `password_hash` enviado no payload por segurança.
  - Valida a existência do usuário (retorna 404 caso inexistente).
  - Valida o tamanho mínimo do nome (mínimo de 2 caracteres, retorna 400 se inválido).
  - Constrói a consulta `UPDATE` dinâmica em SQL puro no Cloudflare D1.
  - Retorna o usuário atualizado com as propriedades normalizadas (`is_admin`, `isAdmin`, `is_active`, `isActive`).
  - Protegido pelo `authMiddleware` e verificação de privilégios de administrador.

### 13.3. Implementação no Frontend
- **Página `frontend/src/pages/AdminUsers.tsx`**:
  - Botão **"Editar"** com ícone de lápis em cada linha da tabela de usuários.
  - **Modal de Edição**:
    - Campo de **Nome Completo** (editável).
    - Campo de **E-mail** desabilitado/somente leitura com aviso explicativo.
    - Checkbox de **Conta Ativa** (bloqueia/desbloqueia acesso).
    - Checkbox de **Privilégios de Administrador** com badge e ícone de escudo.
  - **Modal de Confirmação antes de Salvar**:
    - Resumo das alterações a serem aplicadas.
    - **Aviso especial em destaque âmbar/laranja** ao conceder privilégios de administrador: *"Atenção: Você está concedendo privilégios de Administrador a este usuário..."*.
    - Botões *"Voltar / Ajustar"* e *"Sim, confirmar e salvar"*.

### 13.4. Testes e Validação
- **Backend**: **142 testes passando (100%)** com cobertura para edição de nome, status, promoção a admin, proteção do campo e-mail, validações 400/404 e restrição de acesso 403.
- **Frontend**: **55 testes passando (100%)** com cobertura do fluxo de abertura do modal, edição de campos, exibição do alerta de promoção e salvamento via API.

---

## 14. [2026-09-01 15:45] - Adição de Campos de Identificação aos Cartões de Crédito

### O que foi feito
- **Migração do Banco de Dados (`migrations/0008_card_identification.sql`)**:
  - Adicionadas as colunas `card_type` (padrão `'physical'`, restrito a `'physical'` ou `'virtual'`), `last_four_digits` (máximo 4 dígitos numéricos), `bank_name` (nome do banco/emissor), `institution` (instituição financeira) e `card_tier` (padrão `'standard'`) na tabela `credit_cards`.
  - Requisito de segurança atendido: nunca armazenar o número completo do cartão, validando rigorosamente que `last_four_digits` contenha exatamente 4 números.
- **Atualização do Router de Cartões de Crédito (`src/routes/credit-cards.ts`)**:
  - `POST /workspaces/:workspaceId/credit-cards`: Suporte à criação com todos os novos campos e validações (retorno 400 caso `card_type` não seja `'physical'`/`'virtual'` ou se `last_four_digits` não tiver exatamente 4 dígitos).
  - `GET /workspaces/:workspaceId/credit-cards` e `GET /workspaces/:workspaceId/credit-cards/:id`: Retorno de todos os campos de identificação com suporte a snake_case e aliases camelCase (`cardType`, `lastFourDigits`, `bankName`, `cardTier`).
  - `PUT` e `PATCH /workspaces/:workspaceId/credit-cards/:id` e `PATCH /cards/:id`: Edição centralizada com validação e atualização segura no banco de dados.
- **Suíte de Testes Automatizados (`tests/credit-cards.test.ts`)**:
  - Implementados 10 testes cobrindo criação, validação de regras de segurança (rejeição de número completo ou inválido), valores padrão, listagem, busca por ID, edição direta e restrições de permissão/roles (403 para viewer e não-membro).

### Arquivos criados
- `migrations/0008_card_identification.sql`: Script de migração com as novas colunas na tabela `credit_cards`.
- `tests/credit-cards.test.ts`: Suíte de testes automatizados para cartões de crédito e campos de identificação.

### Arquivos modificados
- `src/routes/credit-cards.ts`: Adicionadas funções de validação (`validateCardType`, `validateLastFourDigits`), helper de formatação (`formatCreditCardResponse`), suporte aos novos campos no `POST`, `GET`, `PUT`, `PATCH` e endpoints diretos `/cards/:id`.
- `tests/helpers/mocks.ts`: Ajustado mock do Cloudflare D1 (`createD1Mock`) para suportar matching de multi-condições em `workspace_members` e queries `UPDATE` com chaves compostas.

### Pendências
- Nenhuma pendência no backend. Pronto para integração com componentes do frontend (`CardForm` e `CardDisplay`).

---

## 15. [2026-09-01 16:15] - Frontend dos Campos de Identificação dos Cartões de Crédito

### O que foi feito
- **Tipagem TypeScript (`frontend/src/types/index.ts`)**:
  - Atualizada a interface `CreditCard` adicionando os campos opcionais `cardType`, `card_type`, `lastFourDigits`, `last_four_digits`, `bankName`, `bank_name`, `institution`, `cardTier` e `card_tier`.
- **Formulário de Criação e Edição (`frontend/src/pages/CreditCards.tsx`)**:
  - Adicionado campo de **Tipo de Cartão** (Select com opções Físico / Virtual).
  - Adicionado campo de **Últimos 4 Dígitos** com máscara e filtragem automática de caracteres não numéricos (`replace(/\D/g, '').slice(0, 4)`), além de validação inline de comprimento mínimo de 4 dígitos.
  - Adicionado campo de **Banco / Emissor** com destaque visual e ícone de `Building2`.
  - Adicionado seletor de **Bandeira** com opções (Mastercard, Visa, Elo, American Express, Hipercard, Outra).
  - Adicionado campo opcional de **Instituição** e seletor de **Tier do Cartão** (Standard, Gold, Platinum, Black, Infinite).
  - Pré-preenchimento completo dos campos ao abrir o modal de edição de cartão existente.
  - Envio padronizado em `camelCase` no payload de `createMutation` e `updateMutation`.
- **Exibição Visual do Cartão (`CardItem` em `frontend/src/pages/CreditCards.tsx`)**:
  - Adicionado badge de tipo do cartão (`💳 Virtual` ou `🏦 Físico`).
  - Exibição sutil e segura dos últimos 4 dígitos no formato `•••• 1234` com tipografia monoespaçada.
  - Exibição do nome do banco emissor com ícone.
  - Exibição de badge de tier em destaque (ex: `BLACK`, `PLATINUM`, `GOLD`, `INFINITE`), ocultado quando for `standard`.
  - Exibição da bandeira em destaque no topo do cartão.
- **Suíte de Testes Automatizados (`frontend/src/tests/CreditCards.test.tsx`)**:
  - Adicionados testes cobrindo a renderização dos cartões com dados de identificação (badges, banco, 4 dígitos, tier), abertura do modal com todos os campos novos, validação de 4 dígitos numéricos e edição de cartão pré-preenchido.
  - **12 arquivos de teste e 57 testes passando no frontend (100%)**.

### Arquivos criados
- Nenhum arquivo novo criado no frontend (estendidos os componentes e testes já existentes).

### Arquivos modificados
- `frontend/src/types/index.ts`: Adicionados os novos atributos de identificação na interface `CreditCard`.
- `frontend/src/pages/CreditCards.tsx`: Estendido o componente visual `CardItem`, o estado do formulário `FormState`, as validações de input e os controles no modal de criação/edição.
- `frontend/src/tests/CreditCards.test.tsx`: Atualizada e expandida a suíte de testes do frontend para cobrir todos os novos cenários.

### Pendências
- Nenhuma pendência identificada. Integração completa e funcional entre frontend e backend.

---

## 16. [2026-09-01 16:45] - Upload de Foto do Cartão, Ícones de Bandeira e Atualização do Bundle de Produção

### O que foi feito
- **Investigação de Divergência Visual**:
  - Verificado que o único componente responsável pelo modal e listagem de cartões de crédito em todo o repositório é `frontend/src/pages/CreditCards.tsx` (rota `/credit-cards`).
  - Identificado que o bundle compilado em `frontend/dist` estava desatualizado em relação às edições recentes, gerando divergência caso a aplicação fosse executada a partir de arquivos estáticos compilados ou cache de build. O bundle foi recompilado com sucesso via `npm run build`.
- **Backend: Armazenamento e Endpoints de Imagem do Cartão**:
  - Criada a migração `migrations/0009_card_image.sql` adicionando a coluna `card_image_url TEXT` na tabela `credit_cards`.
  - Integrado o bucket Cloudflare R2 (`financeiro_comprovantes`) para upload e gerenciamento de fotos dos cartões.
  - Criados os endpoints:
    - `POST /workspaces/:workspaceId/credit-cards/:id/image` e `POST /cards/:id/image`: Upload de imagens (JPG, PNG, WEBP), limite de 5MB e deleção automática de imagem anterior.
    - `GET /workspaces/:workspaceId/credit-cards/:id/image` e `GET /cards/:id/image`: Streaming da imagem com headers de cache e inline.
    - `DELETE /workspaces/:workspaceId/credit-cards/:id/image` e `DELETE /cards/:id/image`: Remoção da imagem no R2 e atualização do banco.
  - Atualizadas as queries `SELECT` de listagem e detalhe de cartões para incluir `card_image_url`, `cardImageUrl` e `imageUrl`.
- **Frontend: Ícones Oficiais de Bandeira (`frontend/src/components/BrandIcons.tsx`)**:
  - Criados componentes SVG embutidos (sem dependência de assets ou CDNs externos) para as bandeiras: **Mastercard**, **Visa**, **Elo**, **American Express (Amex)** e **Hipercard**.
  - Criado o componente `BrandBadge` que exibe o logo oficial da bandeira ou badge estilizado como fallback.
- **Frontend: Formulário Reordenado e Campo de Imagem (`frontend/src/pages/CreditCards.tsx`)**:
  - Organizados os 12 campos rigorosamente na ordem solicitada:
    1. Nome do Cartão *
    2. Tipo de Cartão (Físico / Virtual)
    3. Banco / Emissor
    4. Bandeira (Opcional com logos visuais dentro do Select)
    5. Últimos 4 dígitos (com filtro e validação)
    6. Instituição (Opcional)
    7. Tier do Cartão (Standard, Gold, Platinum, Black, Infinite)
    8. Limite Total (R$)
    9. Dia do Fechamento (1-31) *
    10. Dia do Vencimento (1-31) *
    11. Foto do Cartão (Opcional) — input file com preview imediato, validação client de 5MB e botão de remover/trocar foto.
    12. Cor de Fundo do Cartão (paleta de 16 cores).
  - Fluxo assíncrono completo: salvar dados do cartão e enviar/remover imagem no storage R2.
- **Frontend: Card Visual com Background e Overlay (`CardItem` em `frontend/src/pages/CreditCards.tsx`)**:
  - Renderização da foto do cartão como imagem de fundo com gradiente e overlay escuro quando `card_image_url` estiver presente, garantindo máxima legibilidade de textos, números e badges.
  - Exibição do logo da bandeira via `BrandBadge`.
- **Suíte de Testes Automatizados**:
  - **Backend**: **155 testes passando (100%) em 21 arquivos** (incluindo upload, validação de mimetype e remoção de imagem).
  - **Frontend**: **57 testes passando (100%) em 12 arquivos** (incluindo badges, logos de bandeira, preview de foto e modal de 12 campos).
  - **Build de Produção**: `npm run build` executado com sucesso e zero erros.

### Arquivos criados
- `migrations/0009_card_image.sql`: Migração da coluna `card_image_url`.
- `frontend/src/components/BrandIcons.tsx`: Componentes SVG das bandeiras Mastercard, Visa, Elo, Amex e Hipercard.

### Arquivos modificados
- `backend/src/routes/credit-cards.ts`: Inclusão de rotas de upload, download e deleção de imagem de cartões de crédito e retorno de campos no `formatCreditCardResponse`.
- `backend/tests/credit-cards.test.ts`: Novos testes para upload de imagem, validação de tamanho/tipo e deleção.
- `frontend/src/types/index.ts`: Adicionados campos `card_image_url`, `cardImageUrl` e `imageUrl` na interface `CreditCard`.
- `frontend/src/pages/CreditCards.tsx`: Implementada ordenação dos 12 campos no formulário, upload/preview de fotos, logos visuais de bandeira e background com overlay no `CardItem`.
- `frontend/src/tests/CreditCards.test.tsx`: Testes unitários atualizados cobrindo os 12 campos, logos e upload de imagem.

### Pendências
- Nenhuma pendência identificada.

---

## 17. [2026-09-01 17:00] - Diagnóstico Profundo de Cache do Vite e Validação Textual no DOM

### Causa Raiz Identificada
- **Busca Global**: Executado `grep` em toda a base de código por `"Novo Cartão de Crédito"`. O único arquivo que contém a definição do modal e da listagem é `frontend/src/pages/CreditCards.tsx` (montado diretamente na rota `/credit-cards` pelo `frontend/src/App.tsx`). Não há componentes duplicados ou modais externos.
- **Origem do Problema**: O servidor de desenvolvimento Vite manteve arquivos pre-bundled no diretório de cache `frontend/node_modules/.vite`, fazendo com que sessões de navegador conectadas continuassem servindo os módulos em cache antes das alterações. Além disso, a pasta `frontend/dist` mantinha artefatos compilados de um build anterior.
- **Ação de Limpeza**:
  - Removido o diretório de cache do Vite (`frontend/node_modules/.vite`).
  - Recompilado o bundle estático de produção (`frontend/dist`) via `npm run build` com 100% de sucesso.

### Validação Textual Automatizada no DOM
- Atualizado `frontend/src/tests/CreditCards.test.tsx` com asserções explícitas comprovando que todos os 12 campos solicitados estão presentes no DOM renderizado no modal `"Novo Cartão de Crédito"` e `"Editar Cartão de Crédito"`:
  1. `Nome do Cartão *` (`getByLabelText`)
  2. `Tipo de Cartão` (`getByLabelText`)
  3. `Banco / Emissor` (`getByLabelText`)
  4. `Bandeira (Opcional)` (`getByLabelText`)
  5. `Últimos 4 dígitos` (`getByLabelText`)
  6. `Instituição (Opcional)` (`getByLabelText`)
  7. `Tier do Cartão` (`getByLabelText`)
  8. `Limite Total (R$)` (`getByLabelText`)
  9. `Dia do Fechamento (1-31) *` (`getByLabelText`)
  10. `Dia do Vencimento (1-31) *` (`getByLabelText`)
  11. `Foto / Imagem do Cartão (Opcional)` (`getByLabelText`)
  12. `Cor de Fundo do Cartão` (`getByText`)
- **Status dos Testes**:
  - **Backend**: **155 testes passando (100%) em 21 arquivos**.
  - **Frontend**: **57 testes passando (100%) em 12 arquivos**.
  - **Build de Produção**: `npm run build` concluído com zero erros.

### Arquivos criados
- Nenhum arquivo novo.

### Arquivos modificados
- `frontend/src/tests/CreditCards.test.tsx`: Testes de DOM com asserções textuais para todos os 12 campos nos modos de criação e edição.
- `backend/PROGRESSO.md` e `PROGRESSO.md`: Documentação da causa raiz e validação.

### Pendências
- Nenhuma pendência.

---

## 18. [2026-09-01 17:10] - Deploy em Produção (Cloudflare Pages, Worker e D1) e Commit Git

### O que foi feito
1. **Banco de Dados Cloudflare D1 Remoto (`financeiro_db`)**:
   - Executada a migração remota adicionando as novas colunas à tabela `credit_cards`:
     - `card_type VARCHAR(10) DEFAULT 'physical'`
     - `last_four_digits VARCHAR(4)`
     - `bank_name VARCHAR(100)`
     - `institution VARCHAR(100)`
     - `card_tier VARCHAR(50) DEFAULT 'standard'`
     - `card_image_url TEXT`
2. **Backend Cloudflare Worker**:
   - Executado o deploy do Worker via `wrangler deploy --minify` para o endpoint de produção `https://backend.raimaciel.workers.dev`.
3. **Frontend Cloudflare Pages (`financeiro-app-6wf.pages.dev`)**:
   - Gerado build estático de produção otimizado com `npm run build`.
   - Publicado diretamente no Cloudflare Pages via `wrangler pages deploy dist --project-name financeiro-app --branch main`.
   - Deploy ativo e disponível no domínio principal `https://financeiro-app-6wf.pages.dev` e preview `https://0256e1bc.financeiro-app-6wf.pages.dev`.
4. **Git Version Control**:
   - Criado `.gitignore` na raiz do repositório protegendo `node_modules`, `dist`, `.wrangler`, `.env` e `.dev.vars`.
   - Criado commit com todas as modificações: `feat: atualiza modal de novo cartão com 12 campos`.

### Arquivos criados
- `.gitignore`: Arquivo de ignore na raiz do projeto.

### Arquivos modificados
- `backend/PROGRESSO.md` e `PROGRESSO.md`: Registro da publicação em produção.

### Pendências
- Nenhuma pendência identificada. Produção 100% atualizada e operacional.

---

## 19. [2026-09-01 17:18] - Compactação e Reorganização do Modal de Cartão de Crédito (Grid Responsivo)

### O que foi feito
- **Reorganização do Formulário em Grid de 2 Colunas (`frontend/src/pages/CreditCards.tsx`)**:
  - `Nome do Cartão *`: Mantido em largura total no topo.
  - Linha 2 (`grid grid-cols-1 sm:grid-cols-2 gap-3`): **Tipo de Cartão** (Físico/Virtual) + **Tier do Cartão** (Standard, Gold, Platinum, Black, Infinite).
  - Linha 3 (`grid grid-cols-1 sm:grid-cols-2 gap-3`): **Banco / Emissor** + **Bandeira (Opcional com logos visuais)**.
  - Linha 4 (`grid grid-cols-1 sm:grid-cols-2 gap-3`): **Últimos 4 dígitos** + **Instituição (Opcional)**.
  - Linha 5: **Limite Total (R$)** em largura total.
  - Linha 6 (`grid grid-cols-2 gap-3`): **Dia do Fechamento (1-31) \*** + **Dia do Vencimento (1-31) \***.
  - Linha 7: **Foto / Imagem do Cartão (Opcional)** com preview compacto e botão de upload.
  - Linha 8: **Cor de Fundo do Cartão** com seletores de cor otimizados.
- **Benefícios**:
  - Redução de ~35% na altura vertical do modal.
  - Responsividade completa em mobile e telas menores (`sm:grid-cols-2`).
- **Validação e Deploy**:
  - Testes do frontend passando: **57 testes em 12 arquivos (100%)**.
  - Build de produção gerado e deploy publicado no Cloudflare Pages: `https://financeiro-app-6wf.pages.dev` e preview `https://b75ff115.financeiro-app-6wf.pages.dev`.

### Arquivos modificados
- `frontend/src/pages/CreditCards.tsx`: Ajustado o layout do formulário para grid de 2 colunas compacto.
- `backend/PROGRESSO.md` e `PROGRESSO.md`: Registro da compactação e novo deploy.

### Pendências
- Nenhuma pendência.






