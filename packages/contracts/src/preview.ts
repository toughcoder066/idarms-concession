export const PREVIEW_PERSONAS = [
  {
    key: 'ASSEMBLY_ADMIN',
    label: 'Assembly Admin',
    description: 'Staff management, assembly audit, approvals and assembly-wide oversight.',
  },
  {
    key: 'FIELD_OPS_MANAGER',
    label: 'Field Ops Manager',
    description: 'Zones, field agents, targets and operational follow-up.',
  },
  {
    key: 'FINANCE_OFFICER',
    label: 'Finance Officer',
    description: 'Fee-fixing, billing, reconciliation and financial reporting.',
  },
  {
    key: 'SECRETARY',
    label: 'Secretary',
    description: 'Assembly records, documents and correspondence workflows.',
  },
  {
    key: 'CASHIER',
    label: 'Cashier',
    description: 'Payment collection, receipts and daily cash summaries.',
  },
  {
    key: 'FIELD_AGENT',
    label: 'Field Agent',
    description: 'Assigned properties, field tasks and zone-based data collection.',
  },
  {
    key: 'ASSEMBLY_VIEWER',
    label: 'Assembly Viewer',
    description: 'Read-only assembly overview, reports and published records.',
  },
] as const;

export type PreviewPersonaKey = (typeof PREVIEW_PERSONAS)[number]['key'];

const PREVIEW_PERSONA_KEYS = new Set<string>(PREVIEW_PERSONAS.map((persona) => persona.key));

export function isPreviewPersona(value: string): value is PreviewPersonaKey {
  return PREVIEW_PERSONA_KEYS.has(value);
}

export function previewPersonaLabel(persona: PreviewPersonaKey): string {
  return PREVIEW_PERSONAS.find((entry) => entry.key === persona)?.label ?? persona;
}
