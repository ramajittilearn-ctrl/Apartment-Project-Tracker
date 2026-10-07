'use strict';

const STATUS_PCT = {
  not_started: 0,
  in_progress: 50,
  done: 100,
  blocked: 0,
};

function taskPct(task) {
  if (typeof task.percent === 'number' && !Number.isNaN(task.percent)) {
    return Math.max(0, Math.min(100, task.percent));
  }
  return STATUS_PCT[task.status] ?? 0;
}

/** Phase % = average of its tasks; 0 if no tasks and not done; 100 if done with no tasks. */
function phasePct(phase) {
  if (!phase.tasks || phase.tasks.length === 0) {
    if (phase.status === 'done') return 100;
    return 0;
  }
  const sum = phase.tasks.reduce((acc, t) => acc + taskPct(t), 0);
  return Math.round(sum / phase.tasks.length);
}

/**
 * Project % = average of phase percentages (equal weight per phase).
 * Documented in README.
 */
function projectPct(phases) {
  if (!phases || phases.length === 0) return 0;
  const sum = phases.reduce((acc, p) => acc + phasePct(p), 0);
  return Math.round(sum / phases.length);
}

function statusLabel(status) {
  const map = {
    not_started: 'Not started',
    in_progress: 'In progress',
    done: 'Done',
    blocked: 'Blocked',
  };
  return map[status] || status;
}

function upcomingMilestones(milestones, limit = 5) {
  const today = new Date().toISOString().slice(0, 10);
  return (milestones || [])
    .filter((m) => !m.done)
    .map((m) => {
      const overdue = m.date && m.date < today;
      return { ...m, overdue };
    })
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    })
    .slice(0, limit);
}

module.exports = {
  STATUS_PCT,
  taskPct,
  phasePct,
  projectPct,
  statusLabel,
  upcomingMilestones,
};
