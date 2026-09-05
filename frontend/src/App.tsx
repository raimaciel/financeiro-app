import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "./hooks/useAuth";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Workspaces from "./pages/Workspaces";
import Accounts from "./pages/Accounts";
import Categories from "./pages/Categories";
import CreditCards from "./pages/CreditCards";
import Transactions from "./pages/Transactions";
import ImportTransactions from "./pages/ImportTransactions";
import RecurringTransactions from "./pages/RecurringTransactions";
import BudgetsAndGoals from "./pages/BudgetsAndGoals";
import AdminUsers from "./pages/AdminUsers";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Rotas Públicas */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Rotas Protegidas com Layout */}
            <Route element={<ProtectedRoute />}>
              <Route element={<WorkspaceProvider><Layout /></WorkspaceProvider>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/workspaces" element={<Workspaces />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/credit-cards" element={<CreditCards />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/import" element={<ImportTransactions />} />
                <Route path="/recurring" element={<RecurringTransactions />} />
                <Route path="/budgets" element={<BudgetsAndGoals />} />
                <Route path="/admin/usuarios" element={<AdminUsers />} />
              </Route>
            </Route>

            {/* Redirecionamento Padrão para Dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
