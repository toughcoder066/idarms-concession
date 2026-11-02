import { describe, expect, it } from 'vitest';
import { AssemblyImportError, planAssemblyImport, type StoredAssembly } from './import';

const CONCESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONCESSION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const AMA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KMA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const amaEntry = { assemblyId: AMA, code: 'AMA', name: 'Accra Metropolitan Assembly', contractEnd: '2027-10-25' };
const kmaEntry = { assemblyId: KMA, code: 'KMA', name: 'Kumasi Metropolitan Assembly', contractEnd: '2027-12-31' };

function stored(entry: typeof amaEntry, overrides: Partial<StoredAssembly> = {}): StoredAssembly {
  return {
    assemblyId: entry.assemblyId,
    concessionId: CONCESSION,
    regionId: null,
    code: entry.code,
    name: entry.name,
    category: null,
    contractStart: null,
    contractEnd: new Date(`${entry.contractEnd}T00:00:00Z`),
    status: 'ACTIVE',
    polygonGeoJson: null,
    ...overrides,
  };
}

function issuesOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AssemblyImportError);
    return [(err as AssemblyImportError).message, ...(err as AssemblyImportError).issues];
  }
  throw new Error('expected the import to be refused');
}

describe('assigned assembly import plan', () => {
  it('creates every assembly on a first import', () => {
    const plan = planAssemblyImport({ concessionId: CONCESSION, assemblies: [amaEntry, kmaEntry] }, CONCESSION, []);
    expect(plan.create.map((entry) => entry.code)).toEqual(['AMA', 'KMA']);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('changes nothing when the same file is imported again', () => {
    const plan = planAssemblyImport(
      { concessionId: CONCESSION, assemblies: [amaEntry, kmaEntry] },
      CONCESSION,
      [stored(amaEntry), stored(kmaEntry)],
    );
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.unchanged).toEqual([AMA, KMA]);
  });

  it('marks an assembly missing from the new list as removed', () => {
    const plan = planAssemblyImport({ concessionId: CONCESSION, assemblies: [amaEntry] }, CONCESSION, [stored(amaEntry), stored(kmaEntry)]);
    expect(plan.remove).toEqual([KMA]);
  });

  it('does not remove an assembly twice', () => {
    const plan = planAssemblyImport(
      { concessionId: CONCESSION, assemblies: [amaEntry] },
      CONCESSION,
      [stored(amaEntry), stored(kmaEntry, { status: 'REMOVED' })],
    );
    expect(plan.remove).toEqual([]);
  });

  it('reactivates a removed assembly that is listed again', () => {
    const plan = planAssemblyImport(
      { concessionId: CONCESSION, assemblies: [amaEntry, kmaEntry] },
      CONCESSION,
      [stored(amaEntry), stored(kmaEntry, { status: 'REMOVED' })],
    );
    expect(plan.update.map((entry) => entry.assemblyId)).toEqual([KMA]);
  });

  it('updates an assembly whose contract end changed', () => {
    const plan = planAssemblyImport(
      { concessionId: CONCESSION, assemblies: [{ ...amaEntry, contractEnd: '2028-01-31' }] },
      CONCESSION,
      [stored(amaEntry)],
    );
    expect(plan.update.map((entry) => entry.assemblyId)).toEqual([AMA]);
  });

  it('refuses a file for another concession', () => {
    const issues = issuesOf(() => planAssemblyImport({ concessionId: OTHER_CONCESSION, assemblies: [amaEntry] }, CONCESSION, []));
    expect(issues[0]).toMatch(/this installation serves/);
  });

  it('refuses when stored rows belong to another concession', () => {
    issuesOf(() => planAssemblyImport(
      { concessionId: CONCESSION, assemblies: [amaEntry] },
      CONCESSION,
      [stored(kmaEntry, { concessionId: OTHER_CONCESSION })],
    ));
  });

  it('refuses an empty list instead of removing every assembly', () => {
    issuesOf(() => planAssemblyImport({ concessionId: CONCESSION, assemblies: [] }, CONCESSION, [stored(amaEntry)]));
  });

  it('refuses duplicate ids or codes, bad dates and unknown fields, and reports each problem', () => {
    const issues = issuesOf(() => planAssemblyImport({
      concessionId: CONCESSION,
      assemblies: [
        amaEntry,
        { ...amaEntry, code: 'AMA2' },
        { ...kmaEntry, code: 'AMA', contractStart: '2028-01-01' },
        { ...kmaEntry, assemblyId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', code: 'X', contractEnd: '2027-02-30x' },
        { ...kmaEntry, assemblyId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', code: 'Y', owner: 'someone' },
      ],
    }, CONCESSION, []));

    expect(issues.join('\n')).toMatch(/Duplicate assemblyId/);
    expect(issues.join('\n')).toMatch(/Duplicate assembly code/);
    expect(issues.join('\n')).toMatch(/contractStart must not be after contractEnd/);
    expect(issues.join('\n')).toMatch(/YYYY-MM-DD/);
    expect(issues.join('\n')).toMatch(/Unrecognized key/);
  });
});
