import { Role } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from './jwt';

export const ADMIN_ROLES: Role[] = ['super_admin', 'branch_admin'];
export const MANAGEMENT_ROLES: Role[] = ['super_admin', 'branch_admin', 'supervisor'];

export function isSuperAdmin(role: Role): boolean {
  return role === 'super_admin';
}

export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

export function getUserBranchId(user: JwtPayload): string {
  if (!user.branchId) {
    throw new AppError(400, 'BRANCH_REQUIRED', 'User does not have a branch assigned');
  }

  return user.branchId;
}

export function resolveBranchId(user: JwtPayload, requestedBranchId?: string | null): string {
  if (isSuperAdmin(user.role)) {
    return requestedBranchId || getUserBranchId(user);
  }

  return getUserBranchId(user);
}

export function assertBranchAccess(user: JwtPayload, branchId: string | null | undefined): void {
  if (isSuperAdmin(user.role)) return;
  if (!branchId || branchId !== getUserBranchId(user)) {
    throw new AppError(403, 'FORBIDDEN', 'Cross-branch access is not allowed');
  }
}