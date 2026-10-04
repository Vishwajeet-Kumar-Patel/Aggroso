import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from './components/layout/Navbar';
import { SchemasPage } from './pages/SchemasPage';
import { ProposalPage } from './pages/ProposalPage';
import { PlanEditorPage } from './pages/PlanEditorPage';
import { DryRunPage } from './pages/DryRunPage';
import { ExecutionPage } from './pages/ExecutionPage';
import { AuditPage } from './pages/AuditPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col">
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <Routes>
              <Route path="/" element={<SchemasPage />} />
              <Route path="/proposal" element={<ProposalPage />} />
              <Route path="/plans" element={<PlanEditorPage />} />
              <Route path="/dry-run" element={<DryRunPage />} />
              <Route path="/execution" element={<ExecutionPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
};
