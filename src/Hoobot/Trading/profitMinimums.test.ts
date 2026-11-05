import type { SymbolOptions } from "../Utilities/Args";
import {
  isPnlGateExpired,
  passesProfitMinimumForSide,
  resolveEffectiveProfitMinimums,
  shouldBlockForProfitMinimum,
  shouldBlockLossBuy,
} from "./profitMinimums";

describe("profitMinimums", () => {
  const sym = (over: Partial<SymbolOptions> = {}): SymbolOptions =>
    ({
      name: "BTC/EUR",
      trend: { enabled: true, current: "LONG", timeframe: "4h", ema: { short: 9, long: 21 } },
      profit: { enabled: true, minimumSell: 3, minimumBuy: 2 },
      ...over,
    }) as SymbolOptions;

  it("swaps mins in SHORT trend", () => {
    const mins = resolveEffectiveProfitMinimums(sym(), { effectiveTrend: "SHORT" });
    expect(mins.minSell).toBe(2);
    expect(mins.minBuy).toBe(3);
  });

  it("inactive when profit.enabled false", () => {
    const mins = resolveEffectiveProfitMinimums(sym({ profit: { enabled: false, minimumSell: 5, minimumBuy: 5 } }));
    expect(mins.active).toBe(false);
    expect(passesProfitMinimumForSide(0.1, "SELL", mins)).toBe(true);
  });

  it("shouldBlockForProfitMinimum respects side", () => {
    expect(shouldBlockForProfitMinimum(1, "SELL", sym(), "SELL", false)).toBe(true);
    expect(shouldBlockForProfitMinimum(4, "SELL", sym(), "SELL", false)).toBe(false);
    expect(shouldBlockForProfitMinimum(1, "SELL", sym(), "TAKE_PROFIT", false)).toBe(false);
  });

  it("shouldBlockLossBuy allows a loss buy only with an enabled minimumBuy of 0", () => {
    const zero = sym({ profit: { enabled: true, minimumSell: 0.3, minimumBuy: 0 } });
    expect(shouldBlockLossBuy(-0.37, zero)).toBe(false);
    expect(shouldBlockForProfitMinimum(-0.37, "BUY", zero, "BUY", false)).toBe(false);
    expect(shouldBlockLossBuy(-0.37, sym())).toBe(true);
    expect(shouldBlockLossBuy(-0.37, sym({ profit: { enabled: false, minimumSell: 0, minimumBuy: 0 } }))).toBe(true);
    expect(shouldBlockLossBuy(0.1, sym())).toBe(false);
  });

  it("isPnlGateExpired after ignorePnlAfterDays since the last trade", () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 100 * day;
    expect(isPnlGateExpired(sym({ ignorePnlAfterDays: 30 }), now - 30 * day, now)).toBe(true);
    expect(isPnlGateExpired(sym({ ignorePnlAfterDays: 30 }), now - 29 * day, now)).toBe(false);
    expect(isPnlGateExpired(sym(), now - 365 * day, now)).toBe(false);
    expect(isPnlGateExpired(sym({ ignorePnlAfterDays: 30 }), 0, now)).toBe(false);
    expect(isPnlGateExpired(sym({ ignorePnlAfterDays: 30 }), undefined, now)).toBe(false);
  });
});
