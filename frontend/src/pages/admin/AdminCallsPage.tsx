import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock3, PhoneCall, PhoneForwarded, RefreshCw, Search, TimerReset } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import DateRangeFilter, { computeRange, type DateRangeValue } from '../../components/ui/DateRangeFilter';
import Dropdown from '../../components/ui/Dropdown';
import { callsService, tagsService, usersService } from '../../services/crm.service';

interface AgentOption {
  id: string;
  name: string;
}

interface TagOption {
  id: string;
  name: string;
  colour?: string | null;
}

interface CallLogRow {
  id: string;
  calledAt: string;
  dispositionTag?: string | null;
  durationSeconds?: number | null;
  notes?: string | null;
  agent?: { id: string; name: string } | null;
  lead?: {
    id: string;
    name?: string | null;
    phoneMasked?: string | null;
    campaign?: { id: string; name: string } | null;
  } | null;
}

const PAGE_SIZE = 20;

function SummaryCard({
  icon,
  label,
  value,
  sub,
  colour,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  colour: string;
}) {
  return (
    <div className="stat-card" style={{ '--card-accent': colour } as React.CSSProperties}>
      <div className="stat-card__icon" style={{ background: `${colour}22`, color: colour }}>
        {icon}
      </div>
      <div className="stat-card__body">
        <div className="stat-card__value">{value}</div>
        <div className="stat-card__label">{label}</div>
        <div className="stat-card__sub">{sub}</div>
      </div>
    </div>
  );
}

function formatDuration(value?: number | null) {
  const totalSeconds = Math.max(0, value || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ${seconds}s`;
  }
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatCallTime(value: string) {
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminCallsPage() {
  const [page, setPage] = useState(1);
  const [agentId, setAgentId] = useState('');
  const [callResult, setCallResult] = useState('');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const range = computeRange('last_7_days');
    return { preset: 'last_7_days', from: range.from, to: range.to };
  });
  const trimmedSearch = search.trim();

  useEffect(() => {
    setPage(1);
  }, [agentId, callResult, search, dateRange.from, dateRange.to]);

  const { data: usersData } = useQuery({
    queryKey: ['users', 'admin-calls-filter'],
    queryFn: () => usersService.list({ limit: 500 }),
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags', 'admin-calls-filter'],
    queryFn: () => tagsService.list(),
  });

  const { data: callsData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-calls', page, agentId, callResult, trimmedSearch, dateRange.from, dateRange.to],
    queryFn: () => callsService.list({
      page,
      limit: PAGE_SIZE,
      from: dateRange.from,
      to: dateRange.to,
      ...(agentId ? { agentId } : {}),
      ...(callResult ? { callResult } : {}),
      ...(trimmedSearch ? { search: trimmedSearch } : {}),
    }),
  });

  const { data: summaryData, isFetching: isSummaryFetching } = useQuery({
    queryKey: ['admin-calls-summary', agentId, callResult, trimmedSearch, dateRange.from, dateRange.to],
    queryFn: () => callsService.summary({
      from: dateRange.from,
      to: dateRange.to,
      ...(agentId ? { agentId } : {}),
      ...(callResult ? { callResult } : {}),
      ...(trimmedSearch ? { search: trimmedSearch } : {}),
    }),
  });

  const agents = useMemo(() => {
    const rawUsers = (usersData?.data?.data?.users || []) as Array<Record<string, unknown>>;
    return rawUsers
      .filter((user) => user.role === 'agent')
      .map((user) => ({ id: String(user.id), name: String(user.name) }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [usersData]);

  const resultTags = useMemo(() => {
    const rawTags = (tagsData?.data?.data?.tags || tagsData?.data?.data || tagsData?.data || []) as Array<Record<string, unknown>>;
    return rawTags
      .map((tag) => ({
        id: String(tag.id ?? tag.name),
        name: String(tag.name),
        colour: typeof tag.colour === 'string' ? tag.colour : typeof tag.color === 'string' ? tag.color : undefined,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [tagsData]);

  const logData = callsData?.data?.data;
  const summary = summaryData?.data?.data;
  const logs = (logData?.logs || []) as CallLogRow[];
  const total = Number(logData?.total || 0);
  const currentPage = Number(logData?.page || page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = total === 0 ? 0 : Math.min(total, currentPage * PAGE_SIZE);
  const totalCalls = summary?.dailyTotals?.reduce((sum: number, day: { count: number }) => sum + day.count, 0) || 0;
  const connectedCalls = summary?.agentLeaderboard?.reduce((sum: number, agent: { connected: number }) => sum + agent.connected, 0) || 0;
  const callbackCalls = summary?.tagBreakdown?.find((item: { tag: string; count: number }) => item.tag === 'Callback')?.count || 0;
  const avgTalkTimeSeconds = summary?.dailyTotals?.length
    ? Math.round(
        summary.dailyTotals.reduce((sum: number, day: { avgDuration: number }) => sum + (day.avgDuration || 0), 0)
        / summary.dailyTotals.length,
      )
    : 0;
  const connectRate = totalCalls ? `${Math.round((connectedCalls / totalCalls) * 100)}%` : '0%';

  const agentOptions = [{ value: '', label: 'All Agents' }].concat(
    agents.map((agent: AgentOption) => ({ value: agent.id, label: agent.name })),
  );
  const resultOptions = [{ value: '', label: 'All Results' }].concat(
    resultTags.map((tag: TagOption) => ({ value: tag.name, label: tag.name, colour: tag.colour || undefined })),
  );

  return (
    <AppLayout>
      <div className="page-container">
        <section className="page-header">
          <div>
            <div className="section-eyebrow">Call operations</div>
            <h1 className="page-title">All Agent Calls</h1>
            <p className="page-subtitle" style={{ marginTop: 6 }}>
              Review recent call activity, outcomes, and talk time across all accessible agents.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} className={isFetching ? 'spin' : ''} /> Refresh
          </button>
        </section>

        <section className="stats-grid">
          <SummaryCard
            icon={<PhoneCall size={22} />}
            label="Total Calls"
            value={totalCalls}
            sub="matching the current filters"
            colour="#5b8def"
          />
          <SummaryCard
            icon={<PhoneForwarded size={22} />}
            label="Connected Calls"
            value={connectedCalls}
            sub={`connect rate ${connectRate}`}
            colour="#22c55e"
          />
          <SummaryCard
            icon={<TimerReset size={22} />}
            label="Callbacks"
            value={callbackCalls}
            sub="follow-up pressure in this range"
            colour="#f59e0b"
          />
          <SummaryCard
            icon={<Clock3 size={22} />}
            label="Avg Talk Time"
            value={formatDuration(avgTalkTimeSeconds)}
            sub={isSummaryFetching ? 'updating summary...' : 'average matched call duration'}
            colour="#7c6cff"
          />
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="filter-bar">
            <div className="search-box" style={{ maxWidth: 320 }}>
              <Search size={15} className="search-icon" />
              <input
                className="search-input"
                placeholder="Search mobile number..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div style={{ minWidth: 220, flex: '1 1 220px' }}>
              <Dropdown
                value={agentId}
                onChange={setAgentId}
                options={agentOptions}
                placeholder="All Agents"
                height={38}
              />
            </div>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            <div style={{ minWidth: 220, flex: '1 1 220px' }}>
              <Dropdown
                value={callResult}
                onChange={setCallResult}
                options={resultOptions}
                placeholder="All Results"
                height={38}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div className="table-header" style={{ minWidth: 1120 }}>
              <div className="table-col" style={{ flex: 1.2 }}>Call Time</div>
              <div className="table-col" style={{ flex: 1.1 }}>Agent</div>
              <div className="table-col" style={{ flex: 1.3 }}>Lead</div>
              <div className="table-col" style={{ flex: 1 }}>Campaign</div>
              <div className="table-col" style={{ flex: 0.9 }}>Call Result</div>
              <div className="table-col" style={{ flex: 0.8 }}>Talk Time</div>
              <div className="table-col" style={{ flex: 1.7 }}>Notes</div>
            </div>

            <div style={{ minWidth: 1120 }}>
              {isLoading ? (
                <div className="empty-state"><RefreshCw className="spin" size={24} /><p>Loading call logs...</p></div>
              ) : logs.length === 0 ? (
                <div className="empty-state"><PhoneCall size={36} style={{ opacity: 0.2 }} /><p>No call logs match the selected filters.</p></div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="table-row" style={{ minWidth: 1120 }}>
                    <div className="table-cell" style={{ flex: 1.2, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {formatCallTime(log.calledAt)}
                    </div>
                    <div className="table-cell" style={{ flex: 1.1 }}>
                      {log.agent?.name || '-'}
                    </div>
                    <div className="table-cell" style={{ flex: 1.3, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.lead?.name || '-'}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{log.lead?.phoneMasked || '-'}</div>
                    </div>
                    <div className="table-cell" style={{ flex: 1 }}>
                      {log.lead?.campaign?.name || '-'}
                    </div>
                    <div className="table-cell" style={{ flex: 0.9 }}>
                      <span className="badge" style={{ background: '#eef2ff', color: '#4338ca' }}>
                        {log.dispositionTag || '-'}
                      </span>
                    </div>
                    <div className="table-cell" style={{ flex: 0.8, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatDuration(log.durationSeconds)}
                    </div>
                    <div
                      className="table-cell"
                      style={{
                        flex: 1.7,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--text-secondary)',
                      }}
                      title={log.notes || '-'}
                    >
                      {log.notes || '-'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {!isLoading && total > 0 && (
          <div className="pagination" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Showing {showingFrom}-{showingTo} of {total}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="btn btn-secondary"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}