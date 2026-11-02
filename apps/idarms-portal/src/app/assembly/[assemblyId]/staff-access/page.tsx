import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ShieldAlert } from 'lucide-react';
import { allowedRolesToManage, getRoleDefinition } from '@idarms/contracts';
import { auth } from '@/auth';
import { StaffAccessWorkspace } from '@/components/staff/staff-access-workspace';
import { getConcessionAccess } from '@/lib/access';
import { idarmsRequest } from '@/lib/api';
import {
  displayRole,
  staffErrorMessage,
  type AccessDirectoryEntry,
  type StaffMember,
  type StaffNotification,
  type StaffRoleOption,
} from '@/lib/staff';

export default async function AssemblyStaffAccessPage({
  params,
}: {
  params: Promise<{ assemblyId: string }>;
}) {
  const { assemblyId } = await params;
  const [access, session] = await Promise.all([getConcessionAccess(), auth()]);
  const isSuperAdmin = access.roles.includes('CONCESSION_SUPER_ADMIN');
  const isAssemblyAdmin = access.roles.includes('ASSEMBLY_ADMIN');
  const actorRole = isSuperAdmin
    ? 'CONCESSION_SUPER_ADMIN'
    : isAssemblyAdmin ? 'ASSEMBLY_ADMIN' : null;

  if (!actorRole) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel">
          <span className="staff-access-icon"><ShieldAlert size={24} aria-hidden="true" /></span>
          <h1>Staff management is not available</h1>
          <p>This screen is limited to Assembly Admins and Concession Super Admins with an explicit grant in the selected assembly.</p>
          <Link href="/dashboard" className="button button-secondary" prefetch={false}><ArrowLeft size={14} aria-hidden="true" /> Back to dashboard</Link>
        </div>
      </section>
    );
  }

  const staffResult = await idarmsRequest<StaffMember[]>('concessions', `/assemblies/${assemblyId}/staff`);
  if (!staffResult.ok) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel" role="alert">
          <span className="staff-access-icon error"><AlertTriangle size={24} aria-hidden="true" /></span>
          <h1>{staffResult.code === 'org_forbidden' ? 'No access to this assembly' : 'Staff directory unavailable'}</h1>
          <p>{staffErrorMessage(staffResult.code, staffResult.message)}</p>
          {staffResult.code === 'org_forbidden' && access.assemblyId && access.assemblyId !== assemblyId && (
            <p className="staff-access-hint">Your own assembly workspace is available at the link below.</p>
          )}
          <div className="staff-access-actions">
            {access.assemblyId && access.assemblyId !== assemblyId && (
              <Link href={`/assembly/${access.assemblyId}/staff-access`} className="button" prefetch={false}>Go to my assembly</Link>
            )}
            <Link href="/dashboard" className="button button-secondary" prefetch={false}>Back to dashboard</Link>
          </div>
        </div>
      </section>
    );
  }

  let assemblyName = 'Assembly';
  let assemblyCode = assemblyId.slice(0, 8);
  let assemblyOptions: Array<{ assemblyId: string; assemblyName: string | null; assemblyCode: string | null }> = [];
  let directoryWarning: string | null = null;

  if (isSuperAdmin) {
    const directory = await idarmsRequest<AccessDirectoryEntry[]>('concessions', '/access-directory/assemblies');
    if (directory.ok) {
      assemblyOptions = (directory.data ?? []).map((entry) => ({
        assemblyId: entry.assemblyId,
        assemblyName: entry.assemblyName,
        assemblyCode: entry.assemblyCode,
      }));
      const current = (directory.data ?? []).find((entry) => entry.assemblyId === assemblyId);
      assemblyName = current?.assemblyName ?? 'Assembly';
      assemblyCode = current?.assemblyCode ?? assemblyCode;
    } else {
      directoryWarning = staffErrorMessage(directory.code, directory.message);
    }
  } else {
    const assembly = await idarmsRequest<{ assemblyName: string; assemblyCode: string }>('concessions', `/assemblies/${assemblyId}`);
    if (assembly.ok && assembly.data) {
      assemblyName = assembly.data.assemblyName;
      assemblyCode = assembly.data.assemblyCode;
    }
  }

  const notificationsResult = await idarmsRequest<StaffNotification[]>('concessions', `/assemblies/${assemblyId}/staff/notifications`);
  const notifications = notificationsResult.ok ? notificationsResult.data ?? [] : [];
  const roleOptions: StaffRoleOption[] = allowedRolesToManage(actorRole).map((role) => ({
    key: role,
    label: getRoleDefinition(role)?.displayName ?? displayRole(role),
  }));

  return (
    <>
      {directoryWarning && (
        <div className="staff-page-warning" role="status">
          <AlertTriangle size={14} aria-hidden="true" /> Access Directory context could not be loaded: {directoryWarning}
        </div>
      )}
      <StaffAccessWorkspace
        assemblyId={assemblyId}
        assemblyName={assemblyName}
        assemblyCode={assemblyCode}
        staff={staffResult.data ?? []}
        assemblyOptions={assemblyOptions}
        canSwitchAssemblies={isSuperAdmin && assemblyOptions.length > 0}
        actorRole={actorRole}
        allowedRoles={roleOptions}
        currentUserId={session?.userId}
        notifications={notifications}
        isSuperAdmin={isSuperAdmin}
      />
    </>
  );
}
