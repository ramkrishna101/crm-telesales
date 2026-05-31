import { PrismaClient } from '@prisma/client';

export const SYSTEM_TAGS = [
  { name: 'New lead', colour: '#0ea5e9', isSystem: true },
  { name: 'RNR', colour: '#f59e0b', isSystem: true },
  { name: 'Busy', colour: '#f97316', isSystem: true },
  { name: 'Interested', colour: '#22c55e', isSystem: true },
  { name: 'Not Interested', colour: '#ef4444', isSystem: true },
  { name: 'Callback', colour: '#6366f1', isSystem: true },
  { name: 'DND', colour: '#64748b', isSystem: true },
  { name: 'Invalid Number', colour: '#dc2626', isSystem: true },
] as const;

export async function ensureSystemDispositionTags(prisma: PrismaClient) {
  await Promise.all(
    SYSTEM_TAGS.map((tag) => prisma.dispositionTag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    })),
  );
}