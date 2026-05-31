import { PrismaClient, Role, CampaignType, CampaignStatus, Priority, BranchStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ensureSystemDispositionTags } from '../src/modules/calls/systemTags';

const prisma = new PrismaClient();
const DEFAULT_BRANCH_CODE = 'primary';

async function main() {
  console.log('🌱 Seeding database...');

  const defaultBranch = await prisma.branch.upsert({
    where: { code: DEFAULT_BRANCH_CODE },
    update: {},
    create: {
      name: 'Primary',
      code: DEFAULT_BRANCH_CODE,
      status: BranchStatus.active,
    },
  });
  console.log('✅ Default branch seeded');

  // ── System Disposition Tags ──────────────────────────────────────
  await ensureSystemDispositionTags(prisma);
  console.log('✅ System tags seeded');

  // ── Admin User ───────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@crm.com' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'admin@crm.com',
      passwordHash: adminPassword,
      role: Role.super_admin,
      branchId: defaultBranch.id,
    },
  });
  console.log('✅ Admin created: admin@crm.com / admin@123');

  // ── Team ─────────────────────────────────────────────────────────
  const supervisorPassword = await bcrypt.hash('supervisor@123', 12);
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@crm.com' },
    update: {},
    create: {
      name: 'Team Lead Alpha',
      email: 'supervisor@crm.com',
      passwordHash: supervisorPassword,
      role: Role.supervisor,
      branchId: defaultBranch.id,
    },
  });

  const team = await prisma.team.upsert({
    where: { id: 'team-alpha-001' },
    update: {},
    create: {
      id: 'team-alpha-001',
      name: 'Team Alpha',
      branchId: defaultBranch.id,
      supervisorId: supervisor.id,
    },
  });

  // Update supervisor with team
  await prisma.user.update({
    where: { id: supervisor.id },
    data: { teamId: team.id },
  });
  console.log('✅ Supervisor + Team created: supervisor@crm.com / supervisor@123');

  // ── Agents ───────────────────────────────────────────────────────
  const agentPassword = await bcrypt.hash('agent@123', 12);
  const agents = [
    { email: 'agent1@crm.com', name: 'Agent One' },
    { email: 'agent2@crm.com', name: 'Agent Two' },
    { email: 'agent3@crm.com', name: 'Agent Three' },
  ];

  for (const agentData of agents) {
    await prisma.user.upsert({
      where: { email: agentData.email },
      update: {},
      create: {
        name: agentData.name,
        email: agentData.email,
        passwordHash: agentPassword,
        role: Role.agent,
        branchId: defaultBranch.id,
        teamId: team.id,
      },
    });
  }
  console.log('✅ 3 Agents created: agent1-3@crm.com / agent@123');

  // ── Sample Campaign ──────────────────────────────────────────────
  await prisma.campaign.upsert({
    where: { id: 'campaign-demo-001' },
    update: {},
    create: {
      id: 'campaign-demo-001',
      name: 'Demo Campaign',
      description: 'Sample campaign for testing',
      type: CampaignType.standard,
      status: CampaignStatus.active,
      priority: Priority.normal,
      branchId: defaultBranch.id,
      createdById: admin.id,
    },
  });
  console.log('✅ Demo campaign created');

  console.log('\n🎉 Seed complete!\n');
  console.log('Login credentials:');
  console.log('  Admin:      admin@crm.com       / admin@123');
  console.log('  Supervisor: supervisor@crm.com  / supervisor@123');
  console.log('  Agent:      agent1@crm.com      / agent@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
