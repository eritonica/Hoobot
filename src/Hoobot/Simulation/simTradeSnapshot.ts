import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

export type SimTradeSnapshot = {
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  price: number;
  balances: unknown;
  tradeHistory: unknown;
};

const SNAPSHOT_FLUSH_DELAY_MS = 1000;
const pending = new Map<string, SimTradeSnapshot>();
let timer: NodeJS.Timeout | undefined;

/** Folder-safe run key from ISO start time. */
export const simRunKeyFromStartTime = (startTime: string): string => startTime.replace(/:/g, "-");

const writeSnapshot = (runKey: string, snapshot: SimTradeSnapshot): void => {
  const filePath = `./simulation/${runKey}/trades.json`;
  const directory = path.dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
};

/** Write all queued snapshots to disk immediately (also called on shutdown). */
export const flushSimTradeSnapshots = (): void => {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  for (const [runKey, snapshot] of pending) {
    try {
      writeSnapshot(runKey, snapshot);
    } catch (error: unknown) {
      console.warn("[sim] trades.json write failed:", error instanceof Error ? error.message : String(error));
    }
  }
  pending.clear();
};

/**
 * Debounced trades.json write: the simulation can fill thousands of trades per second, so only the latest
 * snapshot per run is persisted.
 */
export const queueSimTradeSnapshot = (runKey: string, snapshot: SimTradeSnapshot): void => {
  pending.set(runKey, snapshot);
  if (timer === undefined) {
    timer = setTimeout(flushSimTradeSnapshots, SNAPSHOT_FLUSH_DELAY_MS);
    timer.unref?.();
  }
};
