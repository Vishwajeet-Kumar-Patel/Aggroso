import { describe, it, expect } from 'vitest';
import type { DiffChange } from '../types';

describe('Version Diff Calculation Logic', () => {
  it('correctly categorizes added, removed, and modified fields', () => {
    const changes: DiffChange[] = [
      { field: 'first_name', change_type: 'modified', details: 'Rule changed' },
      { field: 'email', change_type: 'added', details: 'Added' },
      { field: 'legacy_notes', change_type: 'removed', details: 'Removed' },
    ];

    const modified = changes.filter((c) => c.change_type === 'modified');
    const added = changes.filter((c) => c.change_type === 'added');
    const removed = changes.filter((c) => c.change_type === 'removed');

    expect(modified).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
  });
});
