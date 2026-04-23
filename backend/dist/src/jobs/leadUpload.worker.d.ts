import { Queue, Worker } from 'bullmq';
export declare const leadUploadQueue: Queue<any, any, string, any, any, string>;
export declare function setUploadProgress(jobId: string, data: Record<string, unknown>): Promise<void>;
export declare function getUploadProgress(jobId: string): Promise<any>;
export declare function startLeadUploadWorker(): Worker<LeadUploadJobData, any, string>;
export interface LeadUploadJobData {
    campaignId: string;
    filePath: string;
    fileExt: string;
    uploadedBy: string;
}
//# sourceMappingURL=leadUpload.worker.d.ts.map