/* Indicators are calculated from the closed candles plus the current candle, as received from the listener. */

import { listenForCandlesticks, type Candlestick, type Candlesticks } from "../Exchanges/Candlesticks";
import { calculateCMF } from "../Indicators/CMF";
import { calculateMACD } from "../Indicators/MACD";
import { clearIndicatorCalcCache } from "../Indicators/indicatorCalcCache";
import type { CandlestickInterval, SymbolOptions } from "../Utilities/Args";
import { consoleLogger } from "../Utilities/ConsoleLogger";
import { calculateIndicators } from "./Algorithmic";

const BAR = 1800000;
const T0 = 1793804400000;
const HISTORY = 60;

const options = {
  name: "BTC/USDC",
  timeframes: ["30m"],
  source: "close",
  algorithmicAdaptive: { enabled: false },
  indicators: {
    macd: { enabled: true, fast: 12, slow: 26, signal: 9, weight: 1 },
    cmf: { enabled: true, length: 20, history: 2, tresholds: { overbought: 0.1, oversold: -0.1 }, weight: 0.8 },
  },
} as unknown as SymbolOptions;

const restRows = () =>
  Array.from({ length: HISTORY }, (_, i) => {
    const start = T0 - (HISTORY - i) * BAR;
    return [start, "100", "110", "90", String(100 + (i % 7)), "10", start + BAR - 1, "10", 5, "5", "5", "0"];
  });

const wsTick = (start: number, close: number, volume: number, isFinal: boolean) => ({
  e: "kline",
  E: start + 1000,
  s: "BTCUSDC",
  k: { t: start, o: "100", h: "110", l: "90", c: String(close), v: String(volume), n: 5, i: "30m", x: isFinal, q: "10", V: "5", Q: "5" },
});

const startListener = async () => {
  let onTick!: (tick: ReturnType<typeof wsTick>) => Promise<void>;
  const exchange = {
    candlesticks: (_s: string, _i: string, cb: (e: null, t: unknown[][], s: string, i: string) => void) =>
      cb(null, restRows(), "BTCUSDC", "30m"),
    websockets: {
      candlesticks: (_s: string, _i: string, cb: typeof onTick) => {
        onTick = cb;
      },
      terminate: () => {},
    },
  };
  const store: Candlesticks = {};
  await listenForCandlesticks(exchange as never, "BTC/USDC", ["30m"] as CandlestickInterval[], store, 1000, options, async () => {});
  return { onTick, store, series: (): Candlestick[] => store["BTCUSDC"]["30m"] };
};

const indicatorsFor = (store: Candlesticks) =>
  calculateIndicators("BTC/USDC", store, options, consoleLogger(), { logIndicators: false });

describe("algorithmic indicator input", () => {
  beforeEach(() => {
    clearIndicatorCalcCache();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("uses one candle per closed period plus the current candle", async () => {
    const { onTick, store, series } = await startListener();
    await onTick(wsTick(T0, 101, 5, false));
    await onTick(wsTick(T0, 102, 8, true));
    await onTick(wsTick(T0 + BAR, 103, 2, false));

    expect(series()).toHaveLength(HISTORY + 2);
    expect(series()[series().length - 2]).toMatchObject({ startTime: T0, close: 102, isFinal: true });
    expect(series()[series().length - 1]).toMatchObject({ startTime: T0 + BAR, close: 103, isFinal: false });

    const indicators = indicatorsFor(store);
    expect(indicators.cmf["30m"]).toEqual(calculateCMF(series(), 20));
    expect(indicators.macd["30m"].histogram).toEqual(calculateMACD(series(), 12, 26, 9, "close").histogram);
  });

  it("recalculates when only the current candle's volume changes", async () => {
    const { onTick, store, series } = await startListener();
    await onTick(wsTick(T0, 105, 5, false));
    const before = indicatorsFor(store).cmf["30m"];
    await onTick(wsTick(T0, 105, 50, false));
    const after = indicatorsFor(store).cmf["30m"];

    expect(after).toEqual(calculateCMF(series(), 20));
    expect(after[after.length - 1]).not.toBe(before[before.length - 1]);
  });
});
