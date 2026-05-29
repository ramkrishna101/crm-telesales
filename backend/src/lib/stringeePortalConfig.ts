import { StringeePortalConfig } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { decryptCredential, encryptCredential, isStringeeEnabled } from './stringee';
import { prisma } from './prisma';

export interface StringeePortalSummary {
  id: string;
  branchId: string;
  portalName: string;
  tenant: string;
  adminEmailMasked: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedStringeePortalConfig extends StringeePortalSummary {
  apiSid: string;
  apiSecret: string;
  adminEmail: string;
  adminPassword: string;
}

export interface StringeePortalInput {
  portalName: string;
  apiSid: string;
  apiSecret: string;
  tenant: string;
  adminEmail: string;
  adminPassword: string;
}

type PortalRecord = Pick<
  StringeePortalConfig,
  'id' | 'branchId' | 'portalName' | 'tenant' | 'apiSidEnc' | 'apiSecretEnc' | 'adminEmailEnc' | 'adminPasswordEnc' | 'createdAt' | 'updatedAt'
>;

function resolveLegacyStringeePortalConfig(branchId: string | null | undefined): ResolvedStringeePortalConfig | null {
  const apiSid = process.env.STRINGEE_API_SID?.trim();
  const apiSecret = process.env.STRINGEE_API_SECRET?.trim();
  const tenant = process.env.STRINGEEX_TENANT?.trim();
  const adminEmail = process.env.STRINGEEX_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.STRINGEEX_ADMIN_PASSWORD;

  if (!isStringeeEnabled()) return null;
  if (!apiSid || !apiSecret || !tenant || !adminEmail || !adminPassword) return null;

  return {
    id: 'legacy-global-stringee',
    branchId: branchId || 'legacy-global-branch',
    portalName: 'Legacy Global Stringee',
    tenant,
    adminEmailMasked: maskEmail(adminEmail),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    apiSid,
    apiSecret,
    adminEmail,
    adminPassword,
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'Configured';
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export function toStringeePortalSummary(record: PortalRecord): StringeePortalSummary {
  let adminEmailMasked = 'Configured';
  try {
    adminEmailMasked = maskEmail(decryptCredential(record.adminEmailEnc));
  } catch {
    adminEmailMasked = 'Configured';
  }

  return {
    id: record.id,
    branchId: record.branchId,
    portalName: record.portalName,
    tenant: record.tenant,
    adminEmailMasked,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function encryptStringeePortalInput(input: StringeePortalInput) {
  return {
    portalName: input.portalName.trim(),
    tenant: input.tenant.trim(),
    apiSidEnc: encryptCredential(input.apiSid.trim()),
    apiSecretEnc: encryptCredential(input.apiSecret.trim()),
    adminEmailEnc: encryptCredential(input.adminEmail.trim()),
    adminPasswordEnc: encryptCredential(input.adminPassword),
  };
}

export function resolveStringeePortalSecrets(record: PortalRecord): ResolvedStringeePortalConfig {
  const summary = toStringeePortalSummary(record);
  return {
    ...summary,
    apiSid: decryptCredential(record.apiSidEnc),
    apiSecret: decryptCredential(record.apiSecretEnc),
    adminEmail: decryptCredential(record.adminEmailEnc),
    adminPassword: decryptCredential(record.adminPasswordEnc),
  };
}

export async function resolveStringeePortalAssignmentId(branchId: string, requestedPortalConfigId?: string | null): Promise<string | null> {
  if (requestedPortalConfigId) {
    const portal = await prisma.stringeePortalConfig.findUnique({
      where: { id: requestedPortalConfigId },
      select: { id: true, branchId: true },
    });
    if (!portal) {
      throw new AppError(404, 'STRINGEE_PORTAL_NOT_FOUND', 'Stringee portal configuration not found');
    }
    if (portal.branchId !== branchId) {
      throw new AppError(400, 'STRINGEE_PORTAL_BRANCH_MISMATCH', 'Selected Stringee portal belongs to a different branch');
    }
    return portal.id;
  }

  const configs = await prisma.stringeePortalConfig.findMany({
    where: { branchId },
    select: { id: true },
    take: 2,
    orderBy: { createdAt: 'asc' },
  });

  return configs.length === 1 ? configs[0].id : null;
}

export async function resolveAssignedStringeePortalForUser(userId: string): Promise<ResolvedStringeePortalConfig> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      branchId: true,
      stringeePortalConfigId: true,
      stringeePortalConfig: {
        select: {
          id: true,
          branchId: true,
          portalName: true,
          tenant: true,
          apiSidEnc: true,
          apiSecretEnc: true,
          adminEmailEnc: true,
          adminPasswordEnc: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  if (!user.stringeePortalConfigId || !user.stringeePortalConfig) {
    const legacyConfig = resolveLegacyStringeePortalConfig(user.branchId);
    if (legacyConfig) return legacyConfig;
    throw new AppError(503, 'NO_DIALER_AVAILABLE', 'No dialer available');
  }
  if (!user.branchId || user.stringeePortalConfig.branchId !== user.branchId) {
    throw new AppError(503, 'NO_DIALER_AVAILABLE', 'No dialer available');
  }

  return resolveStringeePortalSecrets(user.stringeePortalConfig);
}
