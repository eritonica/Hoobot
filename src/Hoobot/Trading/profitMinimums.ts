import type { SymbolOptions } from "../Utilities/Args";
import { withAdaptiveProfitScaling } from "../Modes/algorithmicAdaptive";
import type { AlgorithmicAdaptiveConfig } from "../Modes/algorithmicAdaptive";

export type EffectiveProfitMinimums = {
  active: boolean;
  minSell: number;
  minBuy: number;
};

/** Yksi lähde trendi-swappaukselle + optional adaptive-skaalaukselle. */
export const resolveEffectiveProfitMinimums = (
  symbolOptions: SymbolOptions,
  opts?: {
    effectiveTrend?: string;
    volMult?: number;
    adaptiveCfg?: AlgorithmicAdaptiveConfig & { enabled: boolean };
  }
): EffectiveProfitMinimums => {
  let sym = symbolOptions;
  if (opts?.adaptiveCfg?.enabled) {
    sym = withAdaptiveProfitScaling(symbolOptions, opts.volMult!, opts.adaptiveCfg);
  }
  const active = sym.profit?.enabled === true;
  const baseMinSell = sym.profit?.minimumSell ?? 0;
  const baseMinBuy = sym.profit?.minimumBuy ?? 0;
  const trend = opts?.effectiveTrend ?? sym.trend?.current ?? "LONG";
  if (!active) {
    return { active: false, minSell: 0, minBuy: 0 };
  }
  const minSell = trend === "SHORT" ? baseMinBuy : baseMinSell;
  const minBuy = trend === "SHORT" ? baseMinSell : baseMinBuy;
  return { active, minSell, minBuy };
};

export const passesProfitMinimumForSide = (
  unrealizedPnl: number,
  side: "SELL" | "BUY",
  mins: EffectiveProfitMinimums
): boolean => {
  if (!mins.active) return true;
  const threshold = side === "SELL" ? mins.minSell : mins.minBuy;
  if (threshold === 0) return true;
  return unrealizedPnl >= threshold;
};

/**
 * `ignorePnlAfterDays`: kun edellisestä kaupasta on kulunut vähintään näin monta vuorokautta,
 * PNL-portit (profit.minimum* ja miinuskauppaesto) eivät estä seuraavaa kauppaa. 0 / puuttuu = pois.
 */
export const isPnlGateExpired = (
  symbolOptions: SymbolOptions,
  lastTradeTimeMs: number | undefined,
  nowMs: number = Date.now()
): boolean => {
  const days = Number(symbolOptions.ignorePnlAfterDays);
  if (!Number.isFinite(days) || days <= 0) return false;
  if (lastTradeTimeMs == null || !Number.isFinite(lastTradeTimeMs) || lastTradeTimeMs <= 0) return false;
  return nowMs - lastTradeTimeMs >= days * 24 * 60 * 60 * 1000;
};

export const shouldBlockForProfitMinimum = (
  unrealizedPnl: number,
  side: "SELL" | "BUY",
  symbolOptions: SymbolOptions,
  profit: string,
  forceSkipped: boolean
): boolean => {
  if (forceSkipped) return false;
  if (profit === "TAKE_PROFIT" || profit === "TAKE_PROFIT_FORCE" || profit === "STALE_EXIT") return false;
  const mins = resolveEffectiveProfitMinimums(symbolOptions);
  if (!mins.active) return false;
  return !passesProfitMinimumForSide(unrealizedPnl, side, mins);
};
