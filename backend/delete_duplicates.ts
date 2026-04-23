import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Fetching duplicates...");
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'asc' }
  });
  
  const seen = new Set();
  const toDelete = [];
  
  for (const lead of leads) {
    const key = `${lead.campaignId}_${lead.phone}`;
    if (seen.has(key)) {
      toDelete.push(lead.id);
    } else {
      seen.add(key);
    }
  }
  
  console.log(`Deleting ${toDelete.length} duplicates...`);
  if (toDelete.length > 0) {
    // Delete in chunks to avoid issues
    for (let i = 0; i < toDelete.length; i += 500) {
      const chunk = toDelete.slice(i, i + 500);
      
      // Need to delete related records first (call_logs, follow_ups, comments)
      await prisma.callLog.deleteMany({ where: { leadId: { in: chunk } } });
      await prisma.followUp.deleteMany({ where: { leadId: { in: chunk } } });
      await prisma.leadComment.deleteMany({ where: { leadId: { in: chunk } } });
      
      await prisma.lead.deleteMany({
        where: { id: { in: chunk } }
      });
    }
  }
  console.log("Done.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
