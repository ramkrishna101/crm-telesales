import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import fs from 'fs';
import csv from 'csv-parser';
import * as XLSX from 'xlsx';

// ── Queue Definition ─────────────────────────────────────────────────

export const leadUploadQueue = new Queue('lead-upload', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

// ── Job Progress Tracking in Redis ───────────────────────────────────

export async function setUploadProgress(jobId: string, data: Record<string, unknown>) {
  await redis.setex(`upload:progress:${jobId}`, 3600, JSON.stringify(data));
}

export async function getUploadProgress(jobId: string) {
  const raw = await redis.get(`upload:progress:${jobId}`);
  return raw ? JSON.parse(raw) : null;
}

// ── Row Normaliser ────────────────────────────────────────────────────

function normaliseRow(row: Record<string, string>) {
  // Flexible column mapping — handle CSV variations
  const phone =
    row['phone'] || row['Phone'] || row['mobile'] || row['Mobile'] || row['phone_number'] || '';
  const email = row['email'] || row['Email'] || row['e-mail'] || '';
  const name = row['name'] || row['Name'] || row['full_name'] || row['FullName'] || '';

  // Everything else goes into customFields
  const knownKeys = new Set(['phone', 'Phone', 'mobile', 'Mobile', 'phone_number',
    'email', 'Email', 'e-mail', 'name', 'Name', 'full_name', 'FullName']);
  const customFields: Record<string, string> = {};
  for (const [key, val] of Object.entries(row)) {
    if (!knownKeys.has(key) && val) customFields[key] = val;
  }

  return { phone: phone.trim(), email: email.trim() || null, name: name.trim() || null, customFields };
}

// ── File Parser ───────────────────────────────────────────────────────

async function parseFile(filePath: string, ext: string): Promise<Record<string, string>[]> {
  if (ext === '.csv') {
    return new Promise((resolve, reject) => {
      const rows: Record<string, string>[] = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: Record<string, string>) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
    });
  } else {
    // XLSX / XLS
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false });
    return rows;
  }
}

// ── Worker ────────────────────────────────────────────────────────────

export function startLeadUploadWorker() {
  const worker = new Worker<LeadUploadJobData>(
    'lead-upload',
    async (job: Job<LeadUploadJobData>) => {
      const { campaignId, filePath, fileExt, uploadedBy } = job.data;
      console.log(`📂 Processing upload job ${job.id} for campaign ${campaignId}`);

      await setUploadProgress(job.id!, { status: 'parsing', progress: 0 });

      let rows: Record<string, string>[] = [];
      try {
        rows = await parseFile(filePath, fileExt);
      } catch (err) {
        await setUploadProgress(job.id!, { status: 'error', error: 'File parse failed' });
        throw err;
      }

      const total = rows.length;
      let inserted = 0;
      let skipped = 0;
      let invalid = 0;

      await setUploadProgress(job.id!, { status: 'importing', total, inserted: 0, skipped: 0 });

      // ── Distribution Logic ──────────────────────────────────────────
      // Fetch all agents assigned to this campaign for auto-distribution
      const campaignAgents = await prisma.campaignAgent.findMany({
        where: { campaignId },
        select: { agentId: true },
      });
      const agentIds = campaignAgents.map(ca => ca.agentId);
      let agentIndex = 0;

      // Process in chunks of 500 for memory efficiency
      const CHUNK_SIZE = 500;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);

        const leadsToInsert = chunk
          .map((row) => normaliseRow(row))
          .filter((r) => {
            if (!r.phone || r.phone.length < 7) {
              invalid++;
              return false;
            }
            return true;
          });

        if (leadsToInsert.length === 0) continue;

        // Check DND blocklist
        const phones = leadsToInsert.map((l) => l.phone);
        const blocked = await prisma.dndBlocklist.findMany({
          where: { phone: { in: phones } },
          select: { phone: true },
        });
        const blockedSet = new Set(blocked.map((b) => b.phone));

        const cleanLeads = leadsToInsert.filter((l) => {
          if (blockedSet.has(l.phone)) { skipped++; return false; }
          return true;
        });

        if (cleanLeads.length === 0) continue;

        // Prepare data with Round Robin assignment
        const finalData = cleanLeads.map((l) => {
          const assignedToId = agentIds.length > 0 ? agentIds[agentIndex] : null;
          if (agentIds.length > 0) {
            agentIndex = (agentIndex + 1) % agentIds.length;
          }
          
          return {
            campaignId,
            phone: l.phone,
            email: l.email,
            name: l.name,
            assignedToId,
            customFields: Object.keys(l.customFields).length > 0 ? l.customFields : undefined,
          };
        });

        const createResult = await prisma.lead.createMany({
          data: finalData,
          skipDuplicates: true,
        });

        inserted += createResult.count;
        skipped += (cleanLeads.length - createResult.count);
        const progress = Math.round(((i + CHUNK_SIZE) / total) * 100);
        await job.updateProgress(progress);
        await setUploadProgress(job.id!, {
          status: 'importing', total, inserted, skipped, invalid, progress,
        });
      }

      // Cleanup uploaded file
      try { fs.unlinkSync(filePath); } catch {}

      const result = { status: 'done', total, inserted, skipped, invalid, campaignId };
      await setUploadProgress(job.id!, result);

      console.log(`✅ Upload job ${job.id} complete: ${inserted}/${total} inserted`);
      return result;
    },
    {
      connection: redis,
      concurrency: 2, // Max 2 parallel uploads
    },
  );

  worker.on('failed', async (job, err) => {
    console.error(`❌ Upload job ${job?.id} failed:`, err.message);
    if (job?.id) {
      await setUploadProgress(job.id, { status: 'error', error: err.message });
    }
  });

  console.log('🔄 Lead upload worker started');
  return worker;
}

export interface LeadUploadJobData {
  campaignId: string;
  filePath: string;
  fileExt: string;
  uploadedBy: string;
}
