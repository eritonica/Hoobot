import type { Trade } from "../Exchanges/Trades";
import type { SymbolOptions } from "../Utilities/Args";
import { hasOpenPositionFromTradeHistory } from "../Trading/positionState";
import { getLastCompletedCandle } from "./scoutConfirm";

export { hasOpenPositionFromTradeHistory };

export type AlgorithmicTickPolicy = {
  runFullDecision: boolean;
  confirmBarStart?: number;
  reason: string;
};

const symbolLocks = new Map<string, Promise<void>>();
const lastProcessedConfirmBar = new Map<string, number>();

export const resetAlgorithmicExecutionRuntime = (symbolKey?: string): void => {
  if (symbolKey) {
    lastProcessedConfirmBar.delete(symbolKey);
    return;
  }
  lastProcessedConfirmBar.clear();
};

/** Serialize live algorithmic() per symbol (multi-TF websocket). */
export const withSymbolAlgorithmicLock = async <T>(symbolKey: string, fn: () => Promise<T>): Promise<T> => {
  const prev = symbolLocks.get(symbolKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  symbolLocks.set(symbolKey, prev.then(() => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (symbolLocks.get(symbolKey) === gate) {
      symbolLocks.delete(symbolKey);
    }
  }
};

const closedBarStart = (series: ReturnType<typeof getLastCompletedCandle>): number | undefined => {
  if (!series) return undefined;
  return series.startTime ?? series.time;
};

/** Sim replay only: its feed has closed candles alone. Live decides on every tick and has no such gate. */
export const evaluateSimAlgorithmicTickPolicy = (
  symbolKey: string,
  _symbolOptions: SymbolOptions,
  primarySeries: { startTime?: number; time: number; isFinal?: boolean }[] | undefined,
  hasOpenPosition: boolean
): AlgorithmicTickPolicy => {
  const closed = getLastCompletedCandle(primarySeries as never);
  const start = closedBarStart(closed);
  if (start == null) {
    return { runFullDecision: false, reason: "no closed primary candle" };
  }
  const prev = lastProcessedConfirmBar.get(symbolKey);
  const isNewClose = prev !== start;
  if (isNewClose) {
    lastProcessedConfirmBar.set(symbolKey, start);
    return { runFullDecision: true, confirmBarStart: start, reason: "sim confirm close" };
  }
  if (hasOpenPosition) {
    return { runFullDecision: true, confirmBarStart: start, reason: "sim open position" };
  }
  return { runFullDecision: false, confirmBarStart: start, reason: "sim wait close" };
};
