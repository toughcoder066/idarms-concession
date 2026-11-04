import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../generated/prisma';
import type {
  ZitadelHumanUser,
  ZitadelProjectUserGrant,
  ZitadelSessionInfo,
  ZitadelStaffClient,
} from '../provisioning/zitadel-client';
import type { AuthContext } from '../../types/global';
import type { StaffActionDeps } from './staff-service';

export const AMA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const LADMA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const CONCESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const ORG_AMA = 'org-ama';
export const ORG_LADMA = 'org-ladma';
export const PROJECT_ID = 'project-1';

export interface HarnessState {
  assemblies: Map<string, any>;
  staffMembers: Map<string, any>;
  batches: Map<string, any>;
  notifications: any[];
  audits: any[];
}

export interface Harness {
  state: HarnessState;
  prisma: PrismaClient;
  zitadel: FakeZitadel;
  deps: StaffActionDeps;
}

export interface FakeZitadel {
  client: ZitadelStaffClient;
  users: Map<string, Map<string, ZitadelHumanUser>>;
  grants: Map<string, Map<string, string[]>>;
  sessions: Map<string, Map<string, ZitadelSessionInfo[]>>;
  calls: {
    inviteHumanUser: any[];
    addUserGrant: any[];
    setUserGrantRoles: any[];
    deactivateUser: any[];
    revokeUserSessions: any[];
    resendInvitation: any[];
  };
  addUser: (orgId: string, user: Partial<ZitadelHumanUser> & { userId: string }) => ZitadelHumanUser;
  addGrant: (orgId: string, userId: string, roles: string[]) => void;
  addSession: (orgId: string, userId: string, id?: string, changeDate?: string) => ZitadelSessionInfo;
}

export function createHarness(options: { failInvite?: boolean; failDeactivate?: boolean } = {}): Harness {
  const state: HarnessState = {
    assemblies: new Map(),
    staffMembers: new Map(),
    batches: new Map(),
    notifications: [],
    audits: [],
  };

  state.assemblies.set(AMA_ID, {
    id: AMA_ID,
    assemblyCode: 'AMA',
    assemblyName: 'Accra Metropolitan Assembly',
    zitadelOrgId: ORG_AMA,
    concessions: [{ concessionId: CONCESSION_ID }],
  });
  state.assemblies.set(LADMA_ID, {
    id: LADMA_ID,
    assemblyCode: 'LADMA',
    assemblyName: 'Ledzokuku Municipal Assembly',
    zitadelOrgId: ORG_LADMA,
    concessions: [{ concessionId: CONCESSION_ID }],
  });

  let staffSequence = 0;
  const prisma: any = {
    assembly: {
      findUnique: async ({ where }: any) => state.assemblies.get(where.id) ?? null,
    },
    staffMember: {
      findMany: async ({ where }: any) =>
        [...state.staffMembers.values()].filter((row) => row.assemblyId === where.assemblyId),
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.assemblyId_userId.assemblyId}:${where.assemblyId_userId.userId}`;
        const existing = state.staffMembers.get(key);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        staffSequence += 1;
        const row = {
          id: `staff-${staffSequence}`,
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.staffMembers.set(key, row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of state.staffMembers.values()) {
          if (row.assemblyId === where.assemblyId && row.userId === where.userId) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    staffImportBatch: {
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          ...data,
          results: data.results ?? null,
          createdAt: new Date(),
          committedAt: data.committedAt ?? null,
          updatedAt: new Date(),
        };
        state.batches.set(row.id, row);
        return row;
      },
      findFirst: async ({ where }: any) => {
        const row = state.batches.get(where.id);
        return row && row.assemblyId === where.assemblyId ? row : null;
      },
      updateMany: async ({ where, data }: any) => {
        const row = state.batches.get(where.id);
        if (!row) return { count: 0 };
        if (where.assemblyId && row.assemblyId !== where.assemblyId) return { count: 0 };
        if (where.status && row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ where, data }: any) => {
        const row = state.batches.get(where.id);
        if (!row) throw new Error('batch not found');
        Object.assign(row, data);
        return row;
      },
    },
    staffNotification: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data, createdAt: new Date() };
        state.notifications.push(row);
        return row;
      },
      findMany: async ({ where, take }: any) =>
        state.notifications
          .filter((row) => row.assemblyId === where.assemblyId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, take ?? 50),
    },
    $transaction: async (fn: any) => fn(prisma),
  };

  const zitadel = createFakeZitadel(options);
  setupFixtures(zitadel, state);

  return {
    state,
    prisma: prisma as PrismaClient,
    zitadel,
    deps: {
      prisma: prisma as PrismaClient,
      zitadel: zitadel.client,
      projectId: PROJECT_ID,
      audit: async (_tx, input) => {
        state.audits.push(input);
      },
    },
  };
}

export function createFakeZitadel(options: { failInvite?: boolean; failDeactivate?: boolean } = {}): FakeZitadel {
  const users = new Map<string, Map<string, ZitadelHumanUser>>();
  const grants = new Map<string, Map<string, string[]>>();
  const sessions = new Map<string, Map<string, ZitadelSessionInfo[]>>();
  const calls: FakeZitadel['calls'] = {
    inviteHumanUser: [],
    addUserGrant: [],
    setUserGrantRoles: [],
    deactivateUser: [],
    revokeUserSessions: [],
    resendInvitation: [],
  };
  let userSequence = 1000;

  const ensureOrg = <T>(map: Map<string, Map<string, T>>, orgId: string): Map<string, T> => {
    if (!map.has(orgId)) map.set(orgId, new Map());
    return map.get(orgId)!;
  };

  const addUser: FakeZitadel['addUser'] = (orgId, input) => {
    const user: ZitadelHumanUser = {
      userId: input.userId,
      userName: input.userName ?? input.email ?? input.userId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName ?? [input.firstName, input.lastName].filter(Boolean).join(' '),
      state: input.state ?? 'USER_STATE_ACTIVE',
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    ensureOrg(users, orgId).set(user.userId, user);
    return user;
  };

  const addGrant: FakeZitadel['addGrant'] = (orgId, userId, roles) => {
    ensureOrg(grants, orgId).set(userId, [...roles]);
  };

  const addSession: FakeZitadel['addSession'] = (
    orgId,
    userId,
    id = `session-${orgId}-${userId}-${Math.random().toString(16).slice(2)}`,
    changeDate = new Date().toISOString(),
  ) => {
    const session: ZitadelSessionInfo = {
      id,
      userId,
      creationDate: changeDate,
      changeDate,
    };
    const orgSessions = ensureOrg(sessions, orgId);
    const userSessions = orgSessions.get(userId) ?? [];
    userSessions.push(session);
    orgSessions.set(userId, userSessions);
    return session;
  };

  const client = {
    findUserByEmail: async ({ orgId, email }: { orgId: string; email: string }) => {
      const user = [...(users.get(orgId)?.values() ?? [])].find(
        (candidate) => (candidate.email ?? candidate.userName).toLowerCase() === email.toLowerCase(),
      );
      return user ? { userId: user.userId, userName: user.userName } : null;
    },
    getUser: async (orgId: string, userId: string) => users.get(orgId)?.get(userId) ?? null,
    listHumanUsers: async (orgId: string) => [...(users.get(orgId)?.values() ?? [])],
    listProjectUserGrants: async ({ orgId }: { orgId: string }) =>
      [...(grants.get(orgId)?.entries() ?? [])].map(([userId, roleKeys]) => ({
        id: `grant-${orgId}-${userId}`,
        userId,
        userName: users.get(orgId)?.get(userId)?.userName,
        roleKeys: [...roleKeys],
      } satisfies ZitadelProjectUserGrant)),
    listUserGrants: async ({ orgId, userId }: { orgId: string; userId: string }) => {
      const roleKeys = grants.get(orgId)?.get(userId);
      return roleKeys
        ? [{
          id: `grant-${orgId}-${userId}`,
          userId,
          roleKeys: [...roleKeys],
          orgId,
          projectId: PROJECT_ID,
        }]
        : [];
    },
    addUserGrant: async ({ orgId, userId, roleKeys }: any) => {
      calls.addUserGrant.push({ orgId, userId, roleKeys: [...roleKeys] });
      const current = grants.get(orgId)?.get(userId) ?? [];
      ensureOrg(grants, orgId).set(userId, [...new Set([...current, ...roleKeys])]);
    },
    setUserGrantRoles: async ({ orgId, userId, roleKeys }: any) => {
      calls.setUserGrantRoles.push({ orgId, userId, roleKeys: [...roleKeys] });
      ensureOrg(grants, orgId).set(userId, [...roleKeys]);
    },
    inviteHumanUser: async ({ orgId, email, firstName, lastName }: any) => {
      calls.inviteHumanUser.push({ orgId, email, firstName, lastName });
      if (options.failInvite) throw new Error('invite failed');
      userSequence += 1;
      const userId = String(userSequence);
      addUser(orgId, {
        userId,
        userName: email,
        email,
        firstName,
        lastName,
        state: 'USER_STATE_INITIAL',
      });
      return { userId, userName: email };
    },
    deactivateUser: async ({ orgId, userId }: any) => {
      calls.deactivateUser.push({ orgId, userId });
      if (options.failDeactivate) throw new Error('deactivate failed');
      const user = users.get(orgId)?.get(userId);
      if (user) user.state = 'USER_STATE_INACTIVE';
    },
    reactivateUser: async ({ orgId, userId }: any) => {
      const user = users.get(orgId)?.get(userId);
      if (user) user.state = 'USER_STATE_ACTIVE';
    },
    listUserSessions: async ({ orgId, userId }: any) =>
      [...(sessions.get(orgId)?.get(userId) ?? [])],
    listOrgSessions: async (orgId: string) =>
      [...(sessions.get(orgId)?.values() ?? [])].flat(),
    deleteSession: async ({ orgId, sessionId }: any) => {
      const orgSessions = sessions.get(orgId);
      if (!orgSessions) return;
      for (const [userId, list] of orgSessions) {
        orgSessions.set(userId, list.filter((session) => session.id !== sessionId));
      }
    },
    revokeUserSessions: async ({ orgId, userId }: any) => {
      calls.revokeUserSessions.push({ orgId, userId });
      const current = sessions.get(orgId)?.get(userId) ?? [];
      sessions.get(orgId)?.set(userId, []);
      return current.length;
    },
    resendInvitation: async ({ orgId, userId }: any) => {
      calls.resendInvitation.push({ orgId, userId });
      const user = users.get(orgId)?.get(userId);
      if (user && user.state !== 'USER_STATE_INITIAL') {
        throw new Error('User is not in invited state.');
      }
    },
  } as unknown as ZitadelStaffClient;

  return {
    client,
    users,
    grants,
    sessions,
    calls,
    addUser,
    addGrant,
    addSession,
  };
}

function setupFixtures(zitadel: FakeZitadel, state: HarnessState): void {
  zitadel.addUser(ORG_AMA, {
    userId: 'ama-admin',
    userName: 'ama-admin@ama.local',
    email: 'ama-admin@ama.local',
    firstName: 'Ama',
    lastName: 'Admin',
  });
  zitadel.addGrant(ORG_AMA, 'ama-admin', ['ASSEMBLY_ADMIN']);

  zitadel.addUser(ORG_AMA, {
    userId: 'finance',
    userName: 'finance@ama.local',
    email: 'finance@ama.local',
    firstName: 'Fiona',
    lastName: 'Finance',
  });
  zitadel.addGrant(ORG_AMA, 'finance', ['FINANCE_OFFICER']);

  zitadel.addUser(ORG_AMA, {
    userId: 'ops',
    userName: 'ops@ama.local',
    email: 'ops@ama.local',
    firstName: 'Oscar',
    lastName: 'Ops',
  });
  zitadel.addGrant(ORG_AMA, 'ops', ['FIELD_OPS_MANAGER']);

  zitadel.addUser(ORG_AMA, {
    userId: 'agent',
    userName: 'agent@ama.local',
    email: 'agent@ama.local',
    firstName: 'Ada',
    lastName: 'Agent',
  });
  zitadel.addGrant(ORG_AMA, 'agent', ['FIELD_AGENT']);
  zitadel.addSession(ORG_AMA, 'agent', 'session-agent', '2026-10-22T10:00:00.000Z');

  zitadel.addUser(ORG_AMA, {
    userId: 'invited',
    userName: 'invited@ama.local',
    email: 'invited@ama.local',
    firstName: 'Ivy',
    lastName: 'Invited',
    state: 'USER_STATE_INITIAL',
  });
  zitadel.addGrant(ORG_AMA, 'invited', ['SECRETARY']);

  zitadel.addUser(ORG_LADMA, {
    userId: 'ladma-admin',
    userName: 'ladma-admin@ladma.local',
    email: 'ladma-admin@ladma.local',
    firstName: 'Ladi',
    lastName: 'Admin',
  });
  zitadel.addGrant(ORG_LADMA, 'ladma-admin', ['ASSEMBLY_ADMIN']);

  zitadel.addUser(ORG_LADMA, {
    userId: 'ladma-agent',
    userName: 'ladma-agent@ladma.local',
    email: 'ladma-agent@ladma.local',
    firstName: 'Lara',
    lastName: 'Agent',
  });
  zitadel.addGrant(ORG_LADMA, 'ladma-agent', ['FIELD_AGENT']);

  state.staffMembers.set(`${AMA_ID}:finance`, {
    id: 'staff-finance',
    assemblyId: AMA_ID,
    orgId: ORG_AMA,
    userId: 'finance',
    email: 'finance@ama.local',
    name: 'Fiona Finance',
    phone: null,
    role: 'FINANCE_OFFICER',
    invitedBy: 'ama-admin',
    invitedAt: new Date('2026-10-01T09:00:00.000Z'),
    lastKnownStatus: 'ACTIVE',
    lastLoginAt: null,
  });
  state.staffMembers.set(`${AMA_ID}:agent`, {
    id: 'staff-agent',
    assemblyId: AMA_ID,
    orgId: ORG_AMA,
    userId: 'agent',
    email: 'agent@ama.local',
    name: 'Ada Agent',
    phone: null,
    role: 'FIELD_AGENT',
    invitedBy: 'ama-admin',
    invitedAt: new Date('2026-10-03T09:00:00.000Z'),
    lastKnownStatus: 'ACTIVE',
    lastLoginAt: null,
  });
  state.staffMembers.set(`${AMA_ID}:invited`, {
    id: 'staff-invited',
    assemblyId: AMA_ID,
    orgId: ORG_AMA,
    userId: 'invited',
    email: 'invited@ama.local',
    name: 'Ivy Invited',
    phone: null,
    role: 'SECRETARY',
    invitedBy: 'ama-admin',
    invitedAt: new Date('2026-10-02T09:00:00.000Z'),
    lastKnownStatus: 'INVITED',
  });
}

export function assemblyAdminAuth(
  orgId = ORG_AMA,
  subject = 'ama-admin',
): AuthContext {
  return {
    subject,
    roles: ['ASSEMBLY_ADMIN'],
    permissions: [],
    roleGrants: [{ role: 'ASSEMBLY_ADMIN', orgId }],
    authorizedOrgIds: [orgId],
    homeOrgId: orgId,
    concessionId: CONCESSION_ID,
  };
}

export function superAdminAuth(
  orgIds = [ORG_AMA, ORG_LADMA],
  subject = 'super-1',
): AuthContext {
  return {
    subject,
    roles: ['CONCESSION_SUPER_ADMIN'],
    permissions: [],
    roleGrants: orgIds.map((orgId) => ({ role: 'CONCESSION_SUPER_ADMIN', orgId })),
    authorizedOrgIds: orgIds,
    homeOrgId: 'org-concession',
    concessionId: CONCESSION_ID,
  };
}

export function fieldOpsAuth(): AuthContext {
  return {
    subject: 'ops',
    roles: ['FIELD_OPS_MANAGER'],
    permissions: [],
    roleGrants: [{ role: 'FIELD_OPS_MANAGER', orgId: ORG_AMA }],
    authorizedOrgIds: [ORG_AMA],
    homeOrgId: ORG_AMA,
    concessionId: CONCESSION_ID,
  };
}

export function noGrantAuth(): AuthContext {
  return {
    subject: 'stranger',
    roles: [],
    permissions: [],
    roleGrants: [],
    authorizedOrgIds: [],
    homeOrgId: 'org-other',
    concessionId: CONCESSION_ID,
  };
}

export function actor(actorId = 'ama-admin', actorRole = 'ASSEMBLY_ADMIN'): {
  actorId: string;
  actorRole: string;
  requestId: string;
} {
  return { actorId, actorRole, requestId: 'request-1' };
}
