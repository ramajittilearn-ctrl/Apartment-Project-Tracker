'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

function defaultSeed() {
  const now = new Date().toISOString();
  const phaseDefs = [
    'Site prep (edit me)',
    'Foundation (edit me)',
    'Structure (edit me)',
    'MEP (edit me)',
    'Finishing (edit me)',
    'Handover (edit me)',
  ];

  const phases = phaseDefs.map((name, i) => ({
    id: uuidv4(),
    name,
    status: 'not_started',
    plannedStart: '',
    plannedEnd: '',
    notes: '',
    order: i,
    tasks: [
      {
        id: uuidv4(),
        title: 'Task placeholder (edit or delete)',
        status: 'not_started',
        dueDate: '',
        notes: '',
      },
    ],
  }));

  return {
    project: {
      name: 'Project name (edit me)',
      address: '',
      notes: 'Replace this with your construction notes. No payment or rental data lives here.',
      updatedAt: now,
    },
    phases,
    milestones: [
      {
        id: uuidv4(),
        name: 'Milestone (edit me)',
        date: '',
        done: false,
        notes: '',
      },
      {
        id: uuidv4(),
        name: 'Milestone (edit me)',
        date: '',
        done: false,
        notes: '',
      },
    ],
    meta: {
      version: 1,
      createdAt: now,
    },
  };
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const seed = defaultSeed();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  return JSON.parse(raw);
}

function readStore() {
  return ensureStore();
}

function writeStore(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  data.project = data.project || {};
  data.project.updatedAt = new Date().toISOString();
  const tmp = STORE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_PATH);
  return data;
}

function update(mutator) {
  const data = readStore();
  mutator(data);
  return writeStore(data);
}

module.exports = {
  STORE_PATH,
  defaultSeed,
  ensureStore,
  readStore,
  writeStore,
  update,
  uuidv4,
};
