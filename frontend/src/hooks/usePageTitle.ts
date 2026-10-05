import { useEffect } from 'react';

const SITE_NAME = 'Migration Workbench';

const ROUTE_DESCRIPTIONS: Record<string, string> = {
  'Schemas': 'Inspect source CSV schemas, column types, and sample data records before planning a migration.',
  'Proposal': 'Review AI-proposed schema mappings, transformation rules, and clarify ambiguous field conversions.',
  'Plan Versions': 'Manage versioned migration plans, inspect diffs, edit mapping rules, and sign off approval gates.',
  'Plans': 'Manage versioned migration plans, inspect diffs, edit mapping rules, and sign off approval gates.',
  'Dry Run': 'Validate transformations against sample data, quarantine invalid records, and review validation errors.',
  'Execution': 'Execute approved migration plans into the target database with automated three-point reconciliation.',
  'Audit Log': 'Inspect the append-only audit trail and cryptographic provenance log of all migration operations.',
  'Page Not Found': 'The requested page could not be found. Return to the Migration Workbench dashboard to continue.',
};

/**
 * Sets document title and meta description per route.
 */
export function usePageTitle(pageTitle: string, customDescription?: string): void {
  useEffect(() => {
    // Title
    document.title = pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;

    // Meta Description
    const description = customDescription || ROUTE_DESCRIPTIONS[pageTitle] ||
      'Plan, validate, execute, reconcile and roll back data migrations with AI agent proposals and human approval gating.';

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    // OpenGraph Title & Description
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', document.title);

    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', description);

    return () => {
      document.title = SITE_NAME;
    };
  }, [pageTitle, customDescription]);
}
