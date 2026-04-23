"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFollowUpReminderJob = startFollowUpReminderJob;
exports.stopFollowUpReminderJob = stopFollowUpReminderJob;
const prisma_1 = require("../lib/prisma");
let intervalId = null;
/**
 * Checks for overdue follow-ups every 5 minutes and emits
 * a Socket.io reminder to the assigned agent.
 */
function startFollowUpReminderJob(io) {
    if (intervalId)
        return; // Don't start twice
    console.log('🔔 Follow-up reminder job started (every 5 min)');
    const check = async () => {
        try {
            const now = new Date();
            const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
            // Find follow-ups that became overdue in the last 5 minutes
            const overdue = await prisma_1.prisma.followUp.findMany({
                where: {
                    status: 'pending',
                    scheduledAt: { gte: fiveMinAgo, lte: now },
                },
                include: {
                    lead: { select: { id: true, name: true } },
                    agent: { select: { id: true, name: true } },
                },
            });
            for (const fu of overdue) {
                const minutesOverdue = Math.round((now.getTime() - fu.scheduledAt.getTime()) / 60000);
                io.to(`user:${fu.agentId}`).emit('follow_up:reminder', {
                    followUpId: fu.id,
                    leadName: fu.lead.name,
                    leadId: fu.leadId,
                    minutesOverdue: Math.max(0, minutesOverdue),
                    scheduledAt: fu.scheduledAt,
                });
                console.log(`🔔 Reminder sent to ${fu.agent.name} for lead ${fu.lead.name}`);
            }
        }
        catch (err) {
            console.error('Follow-up reminder job error:', err);
        }
    };
    // Run immediately, then every 5 minutes
    check();
    intervalId = setInterval(check, 5 * 60 * 1000);
}
function stopFollowUpReminderJob() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}
//# sourceMappingURL=followUpReminder.job.js.map