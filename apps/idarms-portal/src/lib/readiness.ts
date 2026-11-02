import type { AssemblySummary, GisZone } from './concessions';

export interface ReadinessCheck {
  key: string;
  label: string;
  complete: boolean;
  detail: string;
  href?: string;
  warning?: boolean;
}

export function assemblyReadiness(assembly: AssemblySummary, zones: GisZone[]): {
  checks: ReadinessCheck[];
  complete: number;
  total: number;
  percent: number;
  billingReady: boolean;
} {
  const assemblyZones = zones.filter((zone) => zone.assemblyId === assembly.id);
  const blockCount = assemblyZones.reduce((total, zone) => total + (zone._count?.blocks ?? 0), 0);
  const missingGeometry = assemblyZones.filter((zone) => (zone._count?.blocks ?? 0) === 0).length;
  const brandingComplete = Boolean(assembly.logoUrl && assembly.signatureUrl && assembly.billNotice && assembly.brandingApprovedAt);
  const ratesComplete = assembly.totalCombinations > 0 && assembly.rateCount >= assembly.totalCombinations;

  const checks: ReadinessCheck[] = [
    {
      key: 'contract',
      label: 'Contract linked',
      complete: Boolean(assembly.contract),
      detail: assembly.contract
        ? `${assembly.contract.concessionCode} · ${assembly.contract.stateRevenueShare}/${assembly.contract.concessionaireShare} split`
        : 'No concession contract is linked to this assembly.',
      href: '/concessions/contracts',
    },
    {
      key: 'croip',
      label: 'CROIP ID recorded',
      complete: Boolean(assembly.croipAssemblyId),
      detail: assembly.croipAssemblyId ?? 'Add the CROIP assembly identifier.',
      href: `/concessions/assemblies/${assembly.id}`,
    },
    {
      key: 'branding',
      label: 'Branding assets',
      complete: brandingComplete,
      detail: brandingComplete
        ? 'Logo, signature and bill notice are approved.'
        : 'Add the assembly logo, signature and bill notice, then record approval.',
      href: `/concessions/assemblies/${assembly.id}#branding`,
    },
    {
      key: 'gis',
      label: 'GIS boundaries',
      complete: assemblyZones.length > 0 && blockCount > 0,
      warning: missingGeometry > 0,
      detail: assemblyZones.length
        ? `${assemblyZones.length} zones · ${blockCount} blocks${missingGeometry ? ` · ${missingGeometry} zones without blocks` : ''}`
        : 'No spatial zones have been imported for this assembly.',
      href: '/concessions/zones',
    },
    {
      key: 'admin',
      label: 'Assembly administrator recorded',
      complete: Boolean(assembly.adminEmail),
      detail: assembly.adminEmail ?? 'Record the administrator who will approve rates.',
      href: `/concessions/assemblies/${assembly.id}#administration`,
    },
    {
      key: 'rates',
      label: 'Fee-fixing resolution',
      complete: ratesComplete,
      detail: assembly.totalCombinations
        ? `${assembly.rateCount} of ${assembly.totalCombinations} rate combinations configured`
        : 'Property type and usage lookups are not loaded.',
      href: `/concessions/rates?assembly=${assembly.id}`,
    },
    {
      key: 'target',
      label: 'Revenue target',
      complete: Boolean(assembly.target),
      detail: assembly.target
        ? `GHS ${assembly.target.targetAmount.toLocaleString('en-GH')} for FY${assembly.target.fiscalYear}`
        : 'No revenue target has been set for this fiscal year.',
      href: `/concessions/targets?assembly=${assembly.id}`,
    },
    {
      key: 'agents',
      label: 'Field agents assigned',
      complete: assembly.agentCount > 0,
      detail: assembly.agentCount
        ? `${assembly.agentCount} ${assembly.agentCount === 1 ? 'agent' : 'agents'} assigned`
        : 'No field agents are assigned to this assembly.',
      href: `/concessions/zones?assembly=${assembly.id}`,
    },
  ];

  const complete = checks.filter((check) => check.complete).length;
  const percent = Math.round((complete / checks.length) * 100);
  return { checks, complete, total: checks.length, percent, billingReady: complete === checks.length };
}
