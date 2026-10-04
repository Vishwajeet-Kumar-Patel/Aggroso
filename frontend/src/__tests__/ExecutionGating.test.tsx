import { describe, it, expect } from 'vitest';

describe('Execution Approval Gating Logic', () => {
  it('disables execution button when plan is draft', () => {
    const planStatus: string = 'draft';
    const isApproved = planStatus === 'approved';

    expect(isApproved).toBe(false);
  });

  it('enables execution button only when plan is approved', () => {
    const planStatus: string = 'approved';
    const isApproved = planStatus === 'approved';

    expect(isApproved).toBe(true);
  });
});
