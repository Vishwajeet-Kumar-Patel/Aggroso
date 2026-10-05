import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from './components/layout/Navbar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFoundPage } from './pages/NotFoundPage';

// Code-split each route — reduces initial bundle to shared vendor + layout only
const SchemasPage   = React.lazy(() => import('./pages/SchemasPage').then(m => ({ default: m.SchemasPage })));
const ProposalPage  = React.lazy(() => import('./pages/ProposalPage').then(m => ({ default: m.ProposalPage })));
const PlanEditorPage = React.lazy(() => import('./pages/PlanEditorPage').then(m => ({ default: m.PlanEditorPage })));
const DryRunPage    = React.lazy(() => import('./pages/DryRunPage').then(m => ({ default: m.DryRunPage })));
const ExecutionPage = React.lazy(() => import('./pages/ExecutionPage').then(m => ({ default: m.ExecutionPage })));
const AuditPage     = React.lazy(() => import('./pages/AuditPage').then(m => ({ default: m.AuditPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Minimal loading fallback — a plain inline bar, no spinner animation if reduced-motion */
const PageLoader: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading page"
    style={{
      padding: '48px 16px',
      textAlign: 'center',
      color: 'var(--color-muted)',
      fontSize: '0.875rem',
    }}
  >
    Loading…
  </div>
);

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <div
            style={{
              minHeight: '100vh',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Navbar />
            <main
              style={{
                flex: 1,
                maxWidth: '1100px',
                width: '100%',
                margin: '0 auto',
                padding: '24px 16px 48px',
              }}
            >
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/"          element={<SchemasPage />} />
                  <Route path="/proposal"  element={<ProposalPage />} />
                  <Route path="/plans"     element={<PlanEditorPage />} />
                  <Route path="/dry-run"   element={<DryRunPage />} />
                  <Route path="/execution" element={<ExecutionPage />} />
                  <Route path="/audit"     element={<AuditPage />} />
                  {/* Catch-all 404 */}
                  <Route path="*"          element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
