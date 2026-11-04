// Runs scheduled agents' standing tasks when they're due.
// Browser-based: it works while SCALVS.ai is open; on open it catches up
// with at most one run per agent (missed runs are not replayed).

import { getState, update } from './store.js';
import { startRun } from './runner.js';
import { toast } from './ui.js';

export const INTERVALS = { hourly: 3_600_000, daily: 86_400_000, weekly: 604_800_000 };
const TICK = 30_000;

export function nextRunAt(agent) {
  const every = INTERVALS[agent.schedule];
  if (!every || !agent.standingTask) return null;
  return (agent.lastScheduledAt || Date.now()) + every;
}

export function runStandingTask(agentId, { scheduled = false } = {}) {
  const agent = getState().agents.find((a) => a.id === agentId);
  if (!agent?.standingTask) return { error: 'This agent has no standing task.' };
  const res = startRun({
    task: agent.standingTask,
    agentIds: [agent.id],
    title: `${agent.name} · ${scheduled ? `${agent.schedule} run` : 'standing task'}`,
  });
  update((st) => {
    const a = st.agents.find((x) => x.id === agentId);
    if (!a) return;
    a.lastScheduledAt = Date.now();
    a.lastScheduleError = res.error || null;
  });
  return res;
}

export function tick() {
  const now = Date.now();
  const due = getState().agents.filter((a) => {
    const at = nextRunAt(a);
    return at != null && at <= now;
  });
  due.forEach((a) => {
    const res = runStandingTask(a.id, { scheduled: true });
    if (res.error) toast(`${a.name}'s scheduled run was skipped: ${res.error}`);
  });
  return due.length;
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  tick();
  timer = setInterval(tick, TICK);
}
