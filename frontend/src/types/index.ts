export interface AccountBalance {
  id: string;
  name: string;
  bank_name?: string | null;
  color?: string | null;
  account_type: AccountType | string;
  initial_balance: number;
  current_balance: number;
}

export interface User {
  id: number | string;
  name: string;
  email: string;
  created_at?: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: "personal" | "couple" | "business";
  created_at?: string;
  role?: "owner" | "editor" | "viewer";
}

export interface WorkspaceMember {
  id: string;
  userId: number | string;
  name: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  invitedAt?: string;
}

export interface Category {
  id: number;
  workspaceId?: string;
  userId?: string | number;
  name: string;
  icon: string;
  color: string;
  type: "income" | "expense";
  createdAt?: string;
}

export type CardType = "physical" | "virtual" | "virtual_permanent" | "virtual_temporary" | "virtual_app_linked";

export interface CreditCard {
  id: string;
  workspace_id: string;
  name: string;
  brand?: string;
  limit_amount?: number;
  limit?: number;
  closing_day: number;
  closingDay?: number;
  due_day: number;
  dueDay?: number;
  best_purchase_day?: number;
  bestPurchaseDay?: number;
  color?: string;
  card_type?: CardType;
  cardType?: CardType;
  last_four_digits?: string;
  lastFourDigits?: string;
  bank_name?: string;
  bankName?: string;
  bank?: string;
  institution?: string;
  card_tier?: "standard" | "gold" | "platinum" | "black" | "infinite" | string;
  cardTier?: "standard" | "gold" | "platinum" | "black" | "infinite" | string;
  registered_for?: string | null;
  registeredFor?: string | null;
  expires_at?: string | null;
  expiresAt?: string | null;
  card_image_url?: string | null;
  cardImageUrl?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  created_at?: string;
  next_closing_date?: string;
  next_due_date?: string;
  days_until_due?: number;
}

export interface Invoice {
  id: string;
  card_id: string;
  workspace_id: string;
  reference_month: string;
  month: number;
  year: number;
  start_date: string;
  closing_date: string;
  due_date: string;
  days_until_due: number;
  total_amount: number;
  status: "open" | "closed" | "paid";
  paid_at: string | null;
  payment_account_id?: string | null;
  payment_account_name?: string | null;
  payment_account_color?: string | null;
  transactions_count: number;
  card_name?: string;
  card_brand?: string;
  card_color?: string;
  transactions?: Transaction[];
}

export interface Transaction {
  id: number;
  workspace_id?: string;
  user_id?: number | string;
  category_id?: number | null;
  credit_card_id?: string | null;
  type: "income" | "expense";
  description?: string;
  amount: number;
  installments?: number;
  installment_current?: number;
  installment_group_id?: string | null;
  date: string;
  receipt_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
  created_at?: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  credit_card_name?: string;
  account_id?: string | null;
  accountId?: string | null;
  account_name?: string | null;
  account_color?: string | null;
  account_bank_name?: string | null;
  reconciled?: number | boolean;
  external_id?: string | null;
}

export interface TransactionSummary {
  month: string;
  total_income: number;
  total_expense: number;
  balance: number;
  by_category: Array<{
    category_id: number;
    name: string;
    icon: string;
    color: string;
    total: number;
  }>;
}

export interface DashboardData {
  month: string;
  summary: {
    total_income: number;
    total_expense: number;
    balance: number;
    income_change_percent: number;
    expense_change_percent: number;
  };
  evolution_last_6_months: Array<{
    month: string;
    label: string;
    income: number;
    expense: number;
    balance: number;
  }>;
  expenses_by_category: Array<{
    category_id: number;
    name: string;
    color: string;
    icon: string;
    total: number;
    percentage: number;
  }>;
  top_expenses: Array<{
    id: number;
    description: string;
    amount: number;
    date: string;
    installments?: number;
    installmentCurrent?: number;
    category_name?: string;
    category_color?: string;
    category_icon?: string;
    credit_card_name?: string;
  }>;
  cards_summary: {
    total_limit: number;
    used_limit: number;
    available_limit: number;
    usage_percentage: number;
    cards_count: number;
  };
  invoices_summary: {
    total_invoices_due: number;
    invoices_due_count: number;
    upcoming_invoices: Array<{
      id: string;
      card_id: string;
      card_name: string;
      card_brand?: string;
      card_color?: string;
      reference_month: string;
      total_amount: number;
      due_date: string;
      days_until_due: number;
      status: "open" | "closed" | "paid";
    }>;
  };
  accounts_balance?: AccountBalance[];
  total_accounts_balance?: number;
}

export interface ImportedTransaction {
  id?: string;
  tempId?: string;
  date: string;
  dataTransacao?: string;
  dataCompetencia?: string;
  mesReferenciaFatura?: string;
  dataParcial?: string;
  ano?: number;
  mes?: number;
  precisaRevisao?: boolean;
  cartao?: string;
  cartaoDigitos?: string | null;
  cartaoIdentificado?: boolean;
  descricao?: string;
  valor?: number;
  tipo?: "D" | "C" | "income" | "expense";
  dataParcial?: string;
  ano?: number;
  precisaRevisao?: boolean;
  cartao?: string;
  descricao?: string;
  valor?: number;
  tipo?: "D" | "C" | "income" | "expense";
  description: string;
  cleanDescription?: string;
  amount: number;
  rawAmount?: number;
  type: "income" | "expense";
  categoryId?: number | null;
  categoryName?: string | null;
  creditCardId?: string | null;
  cardLast4?: string;
  cardLabel?: string;
  installments?: number;
  installmentCurrent?: number;
  duplicateHash?: string;
  isPossibleDuplicate?: boolean;
  duplicateReason?: string | null;
  autoCategorized?: boolean;
  memo?: string;
  externalId?: string;
  selected?: boolean;
}

export interface ParseImportResponse {
  filename: string;
  fileType: "ofx" | "csv" | "pdf";
  totalCount: number;
  duplicatesCount: number;
  newCount: number;
  summary: {
    bankName?: string;
    fileType: string;
    startDate?: string;
    endDate?: string;
  };
  transactions: ImportedTransaction[];
}

export interface RecurringTransaction {
  id: string;
  workspace_id: string;
  user_id: number | string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category_id?: number | null;
  credit_card_id?: string | null;
  frequency: "monthly" | "weekly" | "yearly";
  day_of_month?: number | null;
  day_of_week?: number | null;
  start_date: string;
  end_date?: string | null;
  status: "active" | "paused" | "cancelled";
  last_generated_date?: string | null;
  created_at?: string;
  updated_at?: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  credit_card_name?: string;
  credit_card_color?: string;
}

export interface SuggestedRecurring {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  frequency: "monthly" | "weekly" | "yearly";
  day_of_month: number;
  category_id?: number | null;
  credit_card_id?: string | null;
  confidence: "high" | "medium";
  occurrencesCount: number;
  sampleDates: string[];
  explanation: string;
}

export interface RecurringListResponse {
  workspace_id: string;
  summary: {
    active_count: number;
    paused_count: number;
    total_count: number;
    monthly_expenses_total: number;
    monthly_income_total: number;
    monthly_balance: number;
  };
  recurrings: RecurringTransaction[];
}

export interface Budget {
  id: string;
  workspace_id: string;
  category_id: number;
  category_name: string;
  category_icon?: string;
  category_color?: string;
  limit_amount?: number;
  monthly_limit: number;
  month?: string | null;
  month_reference?: string | null;
  alert_threshold_percent: number;
  spent_amount: number;
  total_spent?: number;
  remaining_amount: number;
  percentage_used: number;
  percentage?: number;
  status: "ok" | "warning" | "exceeded";
}

export interface BudgetListResponse {
  workspace_id: string;
  month: string;
  summary: {
    total_budgeted: number;
    total_spent: number;
    total_remaining: number;
    total_count: number;
    ok_count: number;
    warning_count: number;
    exceeded_count: number;
    in_alert_count: number;
  };
  budgets: Budget[];
}

export type BudgetsResponse = BudgetListResponse;

export interface FinancialGoal {
  id: string;
  workspace_id: string;
  user_id?: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null;
  target_date?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  account_color?: string | null;
  account_bank_name?: string | null;
  color?: string;
  icon?: string;
  status: "active" | "completed" | "archived" | "cancelled";
  progress_percentage: number;
  percentage?: number;
  remaining_amount: number;
  days_remaining?: number | null;
  created_at?: string;
  updated_at?: string;
}

export type SavingsGoal = FinancialGoal;

export interface FinancialGoalListResponse {
  workspace_id: string;
  summary: {
    total_goals: number;
    active_goals: number;
    completed_goals: number;
    total_target_amount: number;
    total_saved_amount: number;
    overall_percentage: number;
  };
  goals: FinancialGoal[];
}

export type SavingsGoalListResponse = FinancialGoalListResponse;
export type GoalsResponse = FinancialGoalListResponse;

export interface ForecastItem {
  transaction_id: string | number;
  description: string;
  amount: number;
  installments: number;
  installment_current: number;
  category_name?: string | null;
  category_color?: string | null;
  original_date: string;
}

export interface InvoiceForecastMonth {
  reference_month: string;
  month_label: string;
  closing_date: string;
  due_date: string;
  days_until_due: number;
  predicted_total: number;
  installments_count: number;
  items: ForecastItem[];
}

export interface InvoiceForecastResponse {
  card_id: string;
  card_name: string;
  limit_amount: number;
  total_committed_future: number;
  months_ahead: number;
  forecast: InvoiceForecastMonth[];
}

export type NotificationType =
  | "invoice_due"
  | "invoice_overdue"
  | "low_balance"
  | "transfer_completed"
  | "budget_warning"
  | "budget_exceeded"
  | "invoice_due_soon"
  | "goal_achieved"
  | "goal_deadline_near"
  | "recurring_pending"
  | "import_reminder";

export type NotificationSeverity = "danger" | "warning" | "info";

export interface NotificationItem {
  id: string;
  workspace_id?: string;
  user_id?: string;
  type: NotificationType | string;
  title: string;
  message: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  severity?: NotificationSeverity;
  related_link?: string;
  is_read?: boolean | number;
  created_at?: string;
  created_context_date?: string;
}

export interface NotificationsResponse {
  workspace_id: string;
  total_count: number;
  total?: number;
  unread_count?: number;
  notifications: NotificationItem[];
  items?: NotificationItem[];
}


export interface AdminUser {
  id: number | string;
  name: string;
  email: string;
  is_active: boolean;
  isActive: boolean;
  is_admin: boolean;
  isAdmin: boolean;
  created_at?: string;
}


export interface InviteCode {
  id: number;
  code: string;
  expires_at: string;
  used_at?: string | null;
  used_by_user_id?: number | null;
  used_by_user_name?: string | null;
  used_by_user_email?: string | null;
  created_by_admin_id?: number | null;
  max_uses: number;
  uses_count: number;
  created_at: string;
  is_expired?: boolean;
  is_exhausted?: boolean;
  status?: "ativo" | "expirado" | "esgotado";
}


export type AccountType = "checking" | "savings" | "investment" | "cash";

export interface BankAccount {
  id: string;
  workspace_id: string;
  name: string;
  bank_name?: string | null;
  account_type: AccountType;
  initial_balance: number;
  color?: string;
  status: "active" | "archived";
  created_at?: string;
  updated_at?: string;
}

export interface AccountTransfer {
  id: string;
  workspace_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  description?: string | null;
  date: string;
  from_account_name?: string | null;
  from_account_bank_name?: string | null;
  from_account_color?: string | null;
  to_account_name?: string | null;
  to_account_bank_name?: string | null;
  to_account_color?: string | null;
  created_at?: string;
  updated_at?: string;
}


export interface StatementImportItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category_id?: number | null;
  category_name?: string | null;
  is_duplicate?: boolean;
  duplicate_reason?: string | null;
}

export interface StatementImportPreviewResponse {
  account_id: string;
  account_name: string;
  bank_name?: string | null;
  filename: string;
  fileType: "ofx" | "csv";
  totalCount: number;
  duplicatesCount: number;
  newCount: number;
  transactions: StatementImportItem[];
}

export interface StatementImportConfirmResponse {
  success: boolean;
  imported_count: number;
  duplicates_ignored: number;
  message: string;
}

export interface ReportCategorySummary {
  category_id: number | null;
  name: string;
  color: string;
  icon: string;
  type: "income" | "expense";
  total: number;
  percentage: number;
}

export interface ReportAccountSummary {
  account_id: string | null;
  name: string;
  bank_name: string;
  color: string;
  total_income: number;
  total_expense: number;
  net_total: number;
}

export interface ReportTransactionItem {
  id: number;
  workspace_id: string;
  user_id: number | string;
  category_id?: number | null;
  account_id?: string | null;
  credit_card_id?: string | null;
  type: "income" | "expense";
  description: string;
  amount: number;
  date: string;
  installments?: number;
  installment_current?: number;
  category_name?: string;
  category_color?: string;
  category_icon?: string;
  account_name?: string;
  account_bank_name?: string;
  account_color?: string;
  credit_card_name?: string | null;
}

export interface ReportSummaryResponse {
  period: {
    start: string | null;
    end: string | null;
  };
  filters: {
    account_id: string | null;
    category_id: number | null;
    type: string | null;
  };
  totals: {
    income: number;
    expense: number;
    balance: number;
    count: number;
  };
  by_category: ReportCategorySummary[];
  by_account: ReportAccountSummary[];
  transactions: ReportTransactionItem[];
}

export type ReconciliationStatus = "matched_exact" | "matched_approximate" | "unmatched";
export type ReconciliationAction = "ignore" | "link_existing" | "create_new";

export interface ReconciliationMatchItem {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: "income" | "expense";
  category_id?: number | null;
  category_name?: string | null;
  external_id?: string | null;
  status: ReconciliationStatus;
  confidence: "high" | "medium" | "none";
  suggested_action: ReconciliationAction;
  selected_action?: ReconciliationAction;
  matched_transaction?: {
    id: number;
    date: string;
    amount: number;
    description: string;
    type: "income" | "expense";
    category_id?: number | null;
    reconciled?: number | boolean;
    external_id?: string | null;
  } | null;
  difference_days?: number;
}

export interface ReconciliationMatchResponse {
  account: {
    id: string;
    name: string;
    bank_name?: string | null;
  };
  total_items: number;
  matched_exact_count: number;
  matched_approximate_count: number;
  unmatched_count: number;
  items: ReconciliationMatchItem[];
}

export interface ReconciliationConfirmPayload {
  decisions: Array<{
    action: ReconciliationAction;
    transaction_id?: number | null;
    statement_item: {
      id?: string;
      date: string;
      amount: number;
      description: string;
      type: "income" | "expense";
      category_id?: number | null;
      external_id?: string | null;
    };
  }>;
}

export interface ReconciliationConfirmResponse {
  success: boolean;
  linked_count: number;
  created_count: number;
  ignored_count: number;
  total_processed: number;
  message: string;
}
