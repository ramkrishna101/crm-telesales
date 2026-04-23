"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
const SYSTEM_TAGS = [
    { name: 'RNR', colour: '#f59e0b', isSystem: true },
    { name: 'Busy', colour: '#f97316', isSystem: true },
    { name: 'Interested', colour: '#22c55e', isSystem: true },
    { name: 'Not Interested', colour: '#ef4444', isSystem: true },
    { name: 'Callback', colour: '#6366f1', isSystem: true },
    { name: 'DND', colour: '#64748b', isSystem: true },
    { name: 'Invalid Number', colour: '#dc2626', isSystem: true },
];
async function main() {
    console.log('🌱 Seeding database...');
    // ── System Disposition Tags ──────────────────────────────────────
    for (const tag of SYSTEM_TAGS) {
        await prisma.dispositionTag.upsert({
            where: { name: tag.name },
            update: {},
            create: tag,
        });
    }
    console.log('✅ System tags seeded');
    // ── Admin User ───────────────────────────────────────────────────
    const adminPassword = await bcryptjs_1.default.hash('admin@123', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@crm.com' },
        update: {},
        create: {
            name: 'Super Admin',
            email: 'admin@crm.com',
            passwordHash: adminPassword,
            role: client_1.Role.admin,
        },
    });
    console.log('✅ Admin created: admin@crm.com / admin@123');
    // ── Team ─────────────────────────────────────────────────────────
    const supervisorPassword = await bcryptjs_1.default.hash('supervisor@123', 12);
    const supervisor = await prisma.user.upsert({
        where: { email: 'supervisor@crm.com' },
        update: {},
        create: {
            name: 'Team Lead Alpha',
            email: 'supervisor@crm.com',
            passwordHash: supervisorPassword,
            role: client_1.Role.supervisor,
        },
    });
    const team = await prisma.team.upsert({
        where: { id: 'team-alpha-001' },
        update: {},
        create: {
            id: 'team-alpha-001',
            name: 'Team Alpha',
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
    const agentPassword = await bcryptjs_1.default.hash('agent@123', 12);
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
                role: client_1.Role.agent,
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
            type: client_1.CampaignType.standard,
            status: client_1.CampaignStatus.active,
            priority: client_1.Priority.normal,
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
//# sourceMappingURL=seed.js.map