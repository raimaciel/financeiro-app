import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useOverflowNav, type NavItem } from "@/hooks/useOverflowNav";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import {
  LayoutDashboard,
  FolderKanban,
  Tags,
  CreditCard,
  Landmark,
  ArrowLeftRight,
  BarChart3,
  FileSpreadsheet,
  Repeat,
  Target,
  PieChart,
  ShieldCheck,
  GitMerge,
  LogOut,
  Briefcase,
  Plus,
  Loader2,
  ChevronDown,
} from "lucide-react";

const allNavItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "workspaces", label: "Workspaces", href: "/workspaces", icon: FolderKanban },
  { id: "categories", label: "Categorias", href: "/categories", icon: Tags },
  { id: "accounts", label: "Contas", href: "/accounts", icon: Landmark },
  { id: "credit-cards", label: "Cartões", href: "/credit-cards", icon: CreditCard },
  { id: "budgets", label: "Orçamentos", href: "/budgets", icon: PieChart },
  { id: "goals", label: "Metas", href: "/goals", icon: Target },
  { id: "recurring", label: "Recorrências", href: "/recurring", icon: Repeat },
  { id: "import", label: "Importar Extrato", href: "/import", icon: FileSpreadsheet },
  { id: "transactions", label: "Transações", href: "/transactions", icon: ArrowLeftRight },
  { id: "reports", label: "Relatórios", href: "/reports", icon: BarChart3 },
  { id: "reconciliation", label: "Conciliar", href: "/reconciliation", icon: GitMerge },
  { id: "admin-users", label: "Usuários (Admin)", href: "/admin/usuarios", icon: ShieldCheck, isAdminOnly: true },
];

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = user?.is_admin || (user as any)?.isAdmin;

  const navItems = React.useMemo(() => {
    return allNavItems.filter((item) => !item.isAdminOnly || isAdmin);
  }, [isAdmin]);

  const {
    containerRef,
    measureRef,
    visibleItems,
    overflowItems,
    hasOverflow,
    isItemActive,
  } = useOverflowNav({ items: navItems, gap: 8 });

  const {
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
    hasWorkspace,
    isLoading: loadingWorkspaces,
  } = useWorkspace();
  const activeWorkspaceId = selectedWorkspaceId;

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    : "US";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-white shadow-xs overflow-x-hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 w-full overflow-x-hidden gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <span className="text-xl font-extrabold tracking-tight text-primary shrink-0">
              Financeiro App
            </span>

            {/* Menu Horizontal Adaptativo */}
            <nav
              ref={containerRef}
              className="hidden md:flex items-center gap-2 min-w-0 flex-1 overflow-hidden"
            >
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.href}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? "bg-slate-100 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}

              {hasOverflow && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        overflowItems.some(isItemActive)
                          ? "bg-slate-100 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                      }`}
                    >
                      <span>Mais</span>
                      <ChevronDown className="h-4 w-4 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
                    {overflowItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.id} asChild className="cursor-pointer">
                          <NavLink
                            to={item.href}
                            className={({ isActive }) =>
                              `flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md transition-colors ${
                                isActive
                                  ? "bg-slate-100 text-primary font-semibold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-primary"
                              }`
                            }
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </NavLink>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </nav>

            {/* Container invisível para medição exata no DOM */}
            <div
              ref={measureRef}
              aria-hidden="true"
              className="fixed -top-[9999px] -left-[9999px] invisible opacity-0 pointer-events-none flex items-center gap-2"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    data-nav-item
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
              <div
                data-more-btn
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0"
              >
                <span>Mais</span>
                <ChevronDown className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Seletor Global de Workspace */}
            {loadingWorkspaces ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground bg-slate-50 border rounded-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Carregando...</span>
              </div>
            ) : hasWorkspace ? (
              <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                <SelectTrigger
                  id="global-workspace-select"
                  className="h-9 w-36 sm:w-44 bg-white border-slate-200 text-xs sm:text-sm font-medium"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{selectedWorkspace?.name || "Workspace"}</span>
                  </div>
                </SelectTrigger>
                <SelectContent align="end">
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id} className="text-xs sm:text-sm">
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span>{ws.name}</span>
                        {ws.role && (
                          <span className="text-[10px] text-muted-foreground uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                            {ws.role}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <NavLink
                to="/workspaces"
                className="text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-md border border-amber-200 transition-colors flex items-center gap-1.5"
                title="Nenhum workspace selecionado. Clique para criar um."
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Criar Workspace</span>
              </NavLink>
            )}

            {/* Sino de Notificações Global */}
            {activeWorkspaceId && (
              <NotificationsPopover workspaceId={activeWorkspaceId} />
            )}

            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-slate-200 text-slate-700 font-semibold">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-sm font-semibold leading-none">{user?.name}</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
              <LogOut className="h-5 w-5 text-slate-600 hover:text-red-600" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
