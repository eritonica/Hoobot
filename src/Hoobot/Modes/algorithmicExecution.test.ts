import type { Candlestick } from "../Exchanges/Candlesticks";
import type { SymbolOptions } from "../Utilities/Args";
import {
  evaluateSimAlgorithmicTickPolicy,
  resetAlgorithmicExecutionRuntime,
} from "./algorithmicExecution";

const sym = (): SymbolOptions =>
  ({
    name: "BTC/EUR",
    timeframes: ["3m", "1m"],
    scoutConfirm: { enabled: true, scoutTimeframe: "1m", confirmTimeframe: "3m" },
  }) as SymbolOptions;

const candle = (t: number, isFinal: boolean): Candlestick =>
  ({ time: t, startTime: t, open: 1, high: 1, low: 1, close: 1, volume: 1, isFinal }) as Candlestick;

describe("algorithmicExecution", () => {
  beforeEach(() => resetAlgorithmicExecutionRuntime());

  it("sim policy tracks primary series closes", () => {
    const key = "BTC/EUR";
    const series = [candle(3000, true)];
    const first = evaluateSimAlgorithmicTickPolicy(key, sym(), series, false);
    expect(first.runFullDecision).toBe(true);
    const second = evaluateSimAlgorithmicTickPolicy(key, sym(), series, false);
    expect(second.runFullDecision).toBe(false);
  });
});
