import { describe, expect, it } from 'vitest';
import {
  isPreviewPersona,
  PREVIEW_PERSONAS,
  previewPersonaLabel,
} from './preview';

describe('preview personas', () => {
  it('defines the seven generic role previews, never concrete users', () => {
    expect(PREVIEW_PERSONAS.map((persona) => persona.key)).toEqual([
      'ASSEMBLY_ADMIN',
      'FIELD_OPS_MANAGER',
      'FINANCE_OFFICER',
      'SECRETARY',
      'CASHIER',
      'FIELD_AGENT',
      'ASSEMBLY_VIEWER',
    ]);
    expect(PREVIEW_PERSONAS.every((persona) => !('email' in persona))).toBe(true);
  });

  it('validates persona keys and provides display labels', () => {
    expect(isPreviewPersona('FINANCE_OFFICER')).toBe(true);
    expect(isPreviewPersona('CONCESSION_SUPER_ADMIN')).toBe(false);
    expect(isPreviewPersona('jane@example.test')).toBe(false);
    expect(previewPersonaLabel('FIELD_AGENT')).toBe('Field Agent');
  });
});
