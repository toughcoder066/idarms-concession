import { describe, expect, it } from 'vitest';
import { isAssignedOn } from './boundary-provider';

const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe('is an assembly ours on a given day', () => {
  const contract = { status: 'ACTIVE', contractStart: day('2026-10-25'), contractEnd: day('2027-10-25') };

  it('is ours inside the contract dates, including the last day', () => {
    expect(isAssignedOn(contract, new Date('2026-11-02T09:00:00Z'))).toBe(true);
    expect(isAssignedOn(contract, new Date('2027-10-25T23:59:00Z'))).toBe(true);
  });

  it('is not ours after the contract ends, even while CROIP still says ACTIVE', () => {
    expect(isAssignedOn(contract, new Date('2027-10-26T00:00:00Z'))).toBe(false);
  });

  it('is not ours before the contract starts', () => {
    expect(isAssignedOn(contract, new Date('2026-10-24T12:00:00Z'))).toBe(false);
  });

  it('is not ours once removed', () => {
    expect(isAssignedOn({ ...contract, status: 'REMOVED' }, new Date('2026-11-02T09:00:00Z'))).toBe(false);
  });

  it('is ours from the first import when CROIP gave no start date', () => {
    expect(isAssignedOn({ ...contract, contractStart: null }, new Date('2020-01-01T00:00:00Z'))).toBe(true);
  });
});
