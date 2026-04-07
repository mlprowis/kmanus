// Cursor state persisted to disk so the notifier can survive restarts
// without re-sending the entire history. Tiny JSON file — no SQLite needed
// for ~5 fields. State directory must be writable by the notifier user.

import fs from 'node:fs';
import path from 'node:path';
import { childLogger } from './logger.js';

const log = childLogger('state');

export interface NotifierState {
  // Last paired_roundtrips.id we've notified about. Anything > this is "new".
  lastRoundtripId: number;
  // Last bot status we observed per bot id, to detect transitions.
  lastBotStatus: Record<string, string>;
  // High water mark for equity (used for drawdown alerts).
  equityHwm: number;
  // Last day we sent a summary (YYYY-MM-DD UTC), to avoid double-sends.
  lastSummaryDate: string | null;
  // Last error we surfaced, to avoid spamming on the same one.
  lastErrorHash: string | null;
}

const DEFAULT_STATE: NotifierState = {
  lastRoundtripId: 0,
  lastBotStatus: {},
  equityHwm: 0,
  lastSummaryDate: null,
  lastErrorHash: null,
};

export class StateStore {
  private readonly filePath: string;
  private state: NotifierState;

  constructor(stateDir: string) {
    this.filePath = path.join(stateDir, 'cursor.json');
    this.state = this.load();
  }

  private load(): NotifierState {
    try {
      if (!fs.existsSync(this.filePath)) {
        // Ensure the dir exists; the systemd unit also handles this via
        // StateDirectory= but be defensive when running locally.
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        return { ...DEFAULT_STATE };
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<NotifierState>;
      return { ...DEFAULT_STATE, ...parsed };
    } catch (err) {
      log.error({ err: (err as Error).message }, 'failed to load state, starting fresh');
      return { ...DEFAULT_STATE };
    }
  }

  get(): Readonly<NotifierState> {
    return this.state;
  }

  /**
   * Update fields and persist atomically (write tmp + rename).
   */
  update(patch: Partial<NotifierState>): void {
    this.state = { ...this.state, ...patch };
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.filePath);
  }
}
