"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadUploadQueue = void 0;
exports.setUploadProgress = setUploadProgress;
exports.getUploadProgress = getUploadProgress;
exports.startLeadUploadWorker = startLeadUploadWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
const prisma_1 = require("../lib/prisma");
const fs_1 = __importDefault(require("fs"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const XLSX = __importStar(require("xlsx"));
// ── Queue Definition ─────────────────────────────────────────────────
exports.leadUploadQueue = new bullmq_1.Queue('lead-upload', {
    connection: redis_1.redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
    },
});
// ── Job Progress Tracking in Redis ───────────────────────────────────
async function setUploadProgress(jobId, data) {
    await redis_1.redis.setex(`upload:progress:${jobId}`, 3600, JSON.stringify(data));
}
async function getUploadProgress(jobId) {
    const raw = await redis_1.redis.get(`upload:progress:${jobId}`);
    return raw ? JSON.parse(raw) : null;
}
// ── Row Normaliser ────────────────────────────────────────────────────
function normaliseRow(row) {
    // Flexible column mapping — handle CSV variations
    const phone = row['phone'] || row['Phone'] || row['mobile'] || row['Mobile'] || row['phone_number'] || '';
    const email = row['email'] || row['Email'] || row['e-mail'] || '';
    const name = row['name'] || row['Name'] || row['full_name'] || row['FullName'] || '';
    // Everything else goes into customFields
    const knownKeys = new Set(['phone', 'Phone', 'mobile', 'Mobile', 'phone_number',
        'email', 'Email', 'e-mail', 'name', 'Name', 'full_name', 'FullName']);
    const customFields = {};
    for (const [key, val] of Object.entries(row)) {
        if (!knownKeys.has(key) && val)
            customFields[key] = val;
    }
    return { phone: phone.trim(), email: email.trim() || null, name: name.trim() || null, customFields };
}
// ── File Parser ───────────────────────────────────────────────────────
async function parseFile(filePath, ext) {
    if (ext === '.csv') {
        return new Promise((resolve, reject) => {
            const rows = [];
            fs_1.default.createReadStream(filePath)
                .pipe((0, csv_parser_1.default)())
                .on('data', (row) => rows.push(row))
                .on('end', () => resolve(rows))
                .on('error', reject);
        });
    }
    else {
        // XLSX / XLS
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { raw: false });
        return rows;
    }
}
// ── Worker ────────────────────────────────────────────────────────────
function startLeadUploadWorker() {
    const worker = new bullmq_1.Worker('lead-upload', async (job) => {
        const { campaignId, filePath, fileExt, uploadedBy } = job.data;
        console.log(`📂 Processing upload job ${job.id} for campaign ${campaignId}`);
        await setUploadProgress(job.id, { status: 'parsing', progress: 0 });
        let rows = [];
        try {
            rows = await parseFile(filePath, fileExt);
        }
        catch (err) {
            await setUploadProgress(job.id, { status: 'error', error: 'File parse failed' });
            throw err;
        }
        const total = rows.length;
        let inserted = 0;
        let skipped = 0;
        let invalid = 0;
        await setUploadProgress(job.id, { status: 'importing', total, inserted: 0, skipped: 0 });
        // ── Distribution Logic ──────────────────────────────────────────
        // Fetch all agents assigned to this campaign for auto-distribution
        const campaignAgents = await prisma_1.prisma.campaignAgent.findMany({
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
            if (leadsToInsert.length === 0)
                continue;
            // Check DND blocklist
            const phones = leadsToInsert.map((l) => l.phone);
            const blocked = await prisma_1.prisma.dndBlocklist.findMany({
                where: { phone: { in: phones } },
                select: { phone: true },
            });
            const blockedSet = new Set(blocked.map((b) => b.phone));
            const cleanLeads = leadsToInsert.filter((l) => {
                if (blockedSet.has(l.phone)) {
                    skipped++;
                    return false;
                }
                return true;
            });
            if (cleanLeads.length === 0)
                continue;
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
            const createResult = await prisma_1.prisma.lead.createMany({
                data: finalData,
                skipDuplicates: true,
            });
            inserted += createResult.count;
            skipped += (cleanLeads.length - createResult.count);
            const progress = Math.round(((i + CHUNK_SIZE) / total) * 100);
            await job.updateProgress(progress);
            await setUploadProgress(job.id, {
                status: 'importing', total, inserted, skipped, invalid, progress,
            });
        }
        // Cleanup uploaded file
        try {
            fs_1.default.unlinkSync(filePath);
        }
        catch { }
        const result = { status: 'done', total, inserted, skipped, invalid, campaignId };
        await setUploadProgress(job.id, result);
        console.log(`✅ Upload job ${job.id} complete: ${inserted}/${total} inserted`);
        return result;
    }, {
        connection: redis_1.redis,
        concurrency: 2, // Max 2 parallel uploads
    });
    worker.on('failed', async (job, err) => {
        console.error(`❌ Upload job ${job?.id} failed:`, err.message);
        if (job?.id) {
            await setUploadProgress(job.id, { status: 'error', error: err.message });
        }
    });
    console.log('🔄 Lead upload worker started');
    return worker;
}
//# sourceMappingURL=leadUpload.worker.js.map