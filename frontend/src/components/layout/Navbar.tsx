import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Menu, X, RotateCcw } from 'lucide-react';
import { api } from '../../api/client';

const navLinks = [
  { to: '/',          label: 'Schemas',   title: 'Schemas and sample data' },
  { to: '/proposal',  label: 'Proposal',  title: 'AI migration proposal' },
  { to: '/plans',     label: 'Plan versions', title: 'Plan versions and approval' },
  { to: '/dry-run',   label: 'Dry run',   title: 'Dry run and quarantine' },
  { to: '/execution', label: 'Execution', title: 'Execution and reconciliation' },
  { to: '/audit',     label: 'Audit log', title: 'Append-only audit log' },
];

export const Navbar: React.FC = () => {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const { data: plan } = useQuery({
    queryKey: ['activePlan'],
    queryFn: api.getActivePlan,
    refetchInterval: 5000,
  });

  const resetMutation = useMutation({
    mutationFn: api.resetDemo,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowResetModal(false);
    },
  });

  const activeVersion = plan?.active_version;
  const isApproved = activeVersion?.status === 'approved';

  return (
    <>
      {/* Demo notice bar */}
      <div className="demo-bar" role="note" aria-label="Demo environment notice">
        Demo data. The target is a mock database.
        {activeVersion && (
          <span style={{ marginLeft: '16px', color: 'var(--color-text)' }}>
            Active plan: v{activeVersion.version_num}
            {' '}
            <span
              className={isApproved ? 'approval-unlocked' : 'approval-locked'}
              aria-label={`Plan status: ${activeVersion.status}`}
            >
              {activeVersion.status}
            </span>
          </span>
        )}
      </div>

      {/* Main top bar */}
      <header
        style={{
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '52px',
          }}
        >
          {/* Brand */}
          <span
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
            }}
          >
            Migration Workbench
          </span>

          {/* Desktop nav */}
          <nav
            aria-label="Main navigation"
            style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
            className="hidden-mobile"
          >
            {navLinks.map(({ to, label, title }) => (
              <NavLink
                key={to}
                to={to}
                title={title}
                end={to === '/'}
                style={({ isActive }) => ({
                  display: 'inline-block',
                  padding: '6px 12px',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-accent)' : 'var(--color-muted)',
                  textDecoration: isActive ? 'underline' : 'none',
                  textUnderlineOffset: '3px',
                  borderRadius: 'var(--radius)',
                  whiteSpace: 'nowrap',
                  transition: 'color 150ms',
                })}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  if (!el.getAttribute('aria-current')) {
                    el.style.color = 'var(--color-text)';
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  if (!el.getAttribute('aria-current')) {
                    el.style.color = 'var(--color-muted)';
                  }
                }}
              >
                {label}
              </NavLink>
            ))}

            {/* Reset demo button */}
            <button
              onClick={() => setShowResetModal(true)}
              className="btn btn-tertiary btn-sm"
              style={{ marginLeft: '8px', color: 'var(--color-danger)' }}
              aria-label="Reset demo to initial state"
              title="Reset demo databases to clean initial state"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset
            </button>
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="show-mobile btn btn-tertiary"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>

        {/* Mobile nav drawer */}
        {menuOpen && (
          <nav
            id="mobile-menu"
            aria-label="Mobile navigation"
            style={{
              background: 'var(--color-bg)',
              borderTop: '1px solid var(--color-border)',
              padding: '8px 16px 16px',
            }}
          >
            {navLinks.map(({ to, label, title }) => (
              <NavLink
                key={to}
                to={to}
                title={title}
                end={to === '/'}
                onClick={() => setMenuOpen(false)}
                style={({ isActive }) => ({
                  display: 'block',
                  padding: '10px 0',
                  fontSize: '0.9375rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
                  textDecoration: isActive ? 'underline' : 'none',
                  textUnderlineOffset: '3px',
                  borderBottom: '1px solid var(--color-border)',
                })}
              >
                {label}
              </NavLink>
            ))}
            <button
              onClick={() => { setMenuOpen(false); setShowResetModal(true); }}
              style={{
                display: 'block',
                marginTop: '12px',
                padding: '8px 0',
                fontSize: '0.875rem',
                color: 'var(--color-danger)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              aria-label="Reset demo to initial state"
            >
              <RotateCcw size={14} aria-hidden="true" style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Reset demo
            </button>
          </nav>
        )}
      </header>

      {/* Reset confirmation dialog */}
      {showResetModal && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-dialog-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowResetModal(false); }}
        >
          <div className="dialog">
            <div className="dialog-header">
              <h2 id="reset-dialog-title" className="dialog-title">
                Reset demo environment?
              </h2>
              <button
                onClick={() => setShowResetModal(false)}
                className="btn btn-tertiary btn-sm"
                aria-label="Close dialog"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '8px' }}>
              This drops and recreates all tables in{' '}
              <code>app.db</code> and <code>target.db</code>, clearing all plans,
              executions, and audit history, then reloads the 60 source records.
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-warning)', marginBottom: '20px' }}>
              All visitors share this demo state.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowResetModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="btn btn-danger"
                aria-busy={resetMutation.isPending}
              >
                {resetMutation.isPending ? 'Resetting…' : 'Yes, reset everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 640px) {
          .hidden-mobile { display: flex !important; }
          .show-mobile   { display: none !important; }
        }
        @media (max-width: 639px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
        }
      `}</style>
    </>
  );
};
