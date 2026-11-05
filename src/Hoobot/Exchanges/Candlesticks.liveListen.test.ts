/* listenForCandlesticks (Binance): one stored candle per period, whatever the websocket sends. */

import { listenForCandlesticks, type Candlestick, type Candlesticks } from "./Candlesticks";
import type { CandlestickInterval, SymbolOptions } from "../Utilities/Args";

const BAR = 1800000;
const T0 = 1793804400000;

const restRow = (start: number, close: number) => [start, "1", "2", "0.5", String(close), "10", start + BAR - 1, "10", 5, "5", "5", "0"];

const wsTick = (start: number, close: number, isFinal: boolean) => ({
  e: "kline",
  E: start + 1000,
  s: "BTCUSDC",
  k: { t: start, o: "1", h: "2", l: "0.5", c: String(close), v: "10", n: 5, i: "30m", x: isFinal, q: "10", V: "5", Q: "5" },
});

const startListener = async (rest: unknown[][]) => {
  let onTick!: (tick: ReturnType<typeof wsTick>) => Promise<void>;
  const exchange = {
    candlesticks: (_s: string, _i: string, cb: (e: null, t: unknown[][], s: string, i: string) => void) =>
      cb(null, rest, "BTCUSDC", "30m"),
    websockets: {
      candlesticks: (_s: string, _i: string, cb: typeof onTick) => {
        onTick = cb;
      },
      terminate: () => {},
    },
  };
  const store: Candlesticks = {};
  const callback = jest.fn(async () => {});
  await listenForCandlesticks(
    exchange as never,
    "BTC/USDC",
    ["30m"] as CandlestickInterval[],
    store,
    1000,
    { name: "BTC/USDC" } as SymbolOptions,
    callback
  );
  const series = (): Candlestick[] => store["BTCUSDC"]["30m"];
  return { onTick, series, callback };
};

describe("listenForCandlesticks live store", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("does not duplicate the forming candle the REST preload already contains", async () => {
    const { onTick, series } = await startListener([restRow(T0 - BAR, 100), restRow(T0, 101)]);
    await onTick(wsTick(T0, 102, false));
    expect(series().map((c) => c.startTime)).toEqual([T0 - BAR, T0]);
    expect(series()[1].close).toBe(102);
  });

  it("appends the first tick when the preload ends on an earlier period", async () => {
    const { onTick, series } = await startListener([restRow(T0 - BAR, 100)]);
    await onTick(wsTick(T0, 102, false));
    expect(series().map((c) => c.startTime)).toEqual([T0 - BAR, T0]);
  });

  it("replaces the forming candle with the final tick instead of storing both", async () => {
    const { onTick, series } = await startListener([restRow(T0 - BAR, 100)]);
    await onTick(wsTick(T0, 101, false));
    await onTick(wsTick(T0, 102, false));
    await onTick(wsTick(T0, 103, true));
    expect(series().map((c) => c.startTime)).toEqual([T0 - BAR, T0]);
    expect(series()[1]).toMatchObject({ close: 103, isFinal: true });
  });

  it("keeps one candle per period across several closes and calls back on every tick", async () => {
    const { onTick, series, callback } = await startListener([restRow(T0 - BAR, 100)]);
    let ticks = 0;
    for (let bar = 0; bar < 5; bar++) {
      const start = T0 + bar * BAR;
      await onTick(wsTick(start, 101, false));
      await onTick(wsTick(start, 102, false));
      await onTick(wsTick(start, 103, true));
      ticks += 3;
    }
    const starts = series().map((c) => c.startTime);
    expect(starts).toHaveLength(6);
    expect(new Set(starts).size).toBe(6);
    expect(callback).toHaveBeenCalledTimes(ticks);
  });
});
