import { api } from './api';

// ── Auth ──────────────────────────────────────────────────────────────
export const authService = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
};

// ── Users ─────────────────────────────────────────────────────────────
export const usersService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => api.post('/users', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/users/${id}`, data),
  deactivate: (id: string) => api.delete(`/users/${id}`),
  stats: (id: string, params?: Record<string, string>) =>
    api.get(`/users/${id}/stats`, { params }),
};

// ── Teams ─────────────────────────────────────────────────────────────
export const teamsService = {
  list: () => api.get('/teams'),
  get: (id: string) => api.get(`/teams/${id}`),
  create: (data: Record<string, unknown>) => api.post('/teams', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/teams/${id}`, data),
  addMembers: (id: string, agentIds: string[]) =>
    api.post(`/teams/${id}/members`, { agentIds }),
  removeMembers: (id: string, agentIds: string[]) =>
    api.delete(`/teams/${id}/members`, { data: { agentIds } }),
};

// ── Campaigns ─────────────────────────────────────────────────────────
export const campaignsService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/campaigns', { params }),
  get: (id: string) => api.get(`/campaigns/${id}`),
  create: (data: Record<string, unknown>) => api.post('/campaigns', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/campaigns/${id}`, data),
  stats: (id: string) => api.get(`/campaigns/${id}/stats`),
  addAgents: (id: string, agentIds: string[]) =>
    api.post(`/campaigns/${id}/agents`, { agentIds }),
  removeAgents: (id: string, agentIds: string[]) =>
    api.delete(`/campaigns/${id}/agents`, { data: { agentIds } }),
};

// ── Leads ─────────────────────────────────────────────────────────────
export const leadsService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/leads', { params }),
  get: (id: string) => api.get(`/leads/${id}`),
  upload: (campaignId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/leads/upload/${campaignId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadStatus: (jobId: string) => api.get(`/leads/upload/status/${jobId}`),
  assign: (leadIds: string[], agentId: string) =>
    api.post('/leads/assign', { leadIds, agentId }),
  reclaim: (leadIds: string[]) =>
    api.post('/leads/reclaim', { leadIds }),
  updateStatus: (id: string, status: string) =>
    api.put(`/leads/${id}/status`, { status }),
};

// ── Calls ─────────────────────────────────────────────────────────────
export const callsService = {
  log: (data: Record<string, unknown>) => api.post('/calls', data),
  list: (params?: Record<string, string | number>) =>
    api.get('/calls', { params }),
  summary: (params?: Record<string, string>) =>
    api.get('/calls/summary', { params }),
};

// ── Tags ──────────────────────────────────────────────────────────────
export const tagsService = {
  list: () => api.get('/tags'),
  create: (name: string, colour: string) => api.post('/tags', { name, colour }),
  update: (id: string, data: Record<string, unknown>) => api.put(`/tags/${id}`, data),
  delete: (id: string) => api.delete(`/tags/${id}`),
};

// ── Follow-ups ────────────────────────────────────────────────────────
export const followUpsService = {
  list: (params?: Record<string, string>) =>
    api.get('/follow-ups', { params }),
  create: (data: Record<string, unknown>) => api.post('/follow-ups', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/follow-ups/${id}`, data),
  delete: (id: string) => api.delete(`/follow-ups/${id}`),
};

// ── Agent Workspace ───────────────────────────────────────────────────
export const agentService = {
  dashboard: () => api.get('/agent/dashboard'),
  nextLead: (campaignId?: string) =>
    api.get('/agent/next-lead', { params: campaignId ? { campaignId } : {} }),
  breakStart: () => api.post('/agent/break/start'),
  breakEnd: () => api.post('/agent/break/end'),
  breakHistory: () => api.get('/agent/break-history'),
  initiateCall: (leadId: string) =>
    api.post('/agent/call/initiate', { leadId }),
};
