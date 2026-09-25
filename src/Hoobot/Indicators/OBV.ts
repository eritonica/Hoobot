import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateSMA } from "./SMA";

export const calculateOBV = (
  candlesticks: Candlestick[]
): number[] => {
  const obv: number[] = [0]; 
  for (let i = 1; i < candlesticks.length; i++) {
    if (candlesticks[i].close > candlesticks[i - 1].close) {
      obv.push(obv[i - 1] + candlesticks[i].volume);
    } else if (candlesticks[i].close < candlesticks[i - 1].close) {
      obv.push(obv[i - 1] - candlesticks[i].volume);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  return obv;
}


export const logOBVSignals = (
  consoleLogger: ConsoleLogger,
  candlesticks: Candlestick[],
  obv: number[]
) => {
  if (!obv?.length || obv.length < 2 || !candlesticks?.length || candlesticks.length < 2) return;
  const currentOBV = obv[obv.length - 1];
  const prevOBV = obv[obv.length - 2];
  if (currentOBV == null || prevOBV == null || typeof currentOBV !== "number") return;
  const obvSMA = calculateSMA(obv.map((value) => ({ close: value } as Candlestick)), 50, 'close');
  if (!obvSMA?.length) return; 
  consoleLogger.push(`OBV Value`, currentOBV.toFixed(7));
  consoleLogger.push(`OBV Smoothed`, obvSMA[obvSMA.length - 1].toFixed(7));
  const isBullish = currentOBV > prevOBV;
  const isBearish = currentOBV < prevOBV;
  const smaNow = obvSMA[obvSMA.length - 1];
  const smaPrev = obvSMA.length >= 2 ? obvSMA[obvSMA.length - 2] : smaNow;
  const isBullishCrossover = currentOBV > smaNow && prevOBV < smaPrev;
  const isBearishCrossover = currentOBV < smaNow && prevOBV > smaPrev;
  const isBullishDivergence = currentOBV > prevOBV && candlesticks[candlesticks.length - 1].close < candlesticks[candlesticks.length - 2].close;
  const isBearishDivergence = currentOBV < prevOBV && candlesticks[candlesticks.length - 1].close > candlesticks[candlesticks.length - 2].close;
  let signal = "Neutral";
  if (isBullishCrossover) {
    signal = `Bullish Crossover`;
  } else if (isBearishCrossover) {
    signal = `Bearish Crossover`;
  } else if (isBullishDivergence) {
    signal = `Bullish Divergence`;
  } else if (isBearishDivergence) {
    signal = `Bearish Divergence`;
  } else if (isBullish) {
    signal = `Bullish`;
  } else if (isBearish) {
    signal = `Bearish`;
  } else {
    signal = `Neutral`;
  }
  consoleLogger.push("OBV", {
    value: currentOBV.toFixed(7),
    smoothed: obvSMA[obvSMA.length - 1].toFixed(7),
    signal: signal,
  })
};


export const checkOBVSignals = (
  candlesticks: Candlestick[], 
  obv: number[],
  symbolOptions: SymbolOptions
) => {
  let check = 'SKIP';
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.obv && symbolOptions.indicators.obv.enabled) {
      if (!obv?.length || !candlesticks?.length || obv.length < 2 || candlesticks.length < 2) {
        return "HOLD";
      }
      check = 'HOLD';
      const histLen = Math.max(1, symbolOptions.indicators.obv.length ?? 1);
      const smaPeriod = Math.min(50, obv.length);
      if (smaPeriod < 2) {
        return "HOLD";
      }
      const obvAsCandles = obv.map((value) => ({ close: value } as Candlestick));
      const obvSMA = calculateSMA(obvAsCandles, smaPeriod, "close");
      const startIdx = Math.max(smaPeriod, obv.length - histLen);
      for (let idx = obv.length - 1; idx >= startIdx; idx--) {
        const smaIdx = idx - (smaPeriod - 1);
        const prevSmaIdx = smaIdx - 1;
        if (smaIdx < 0 || prevSmaIdx < 0 || smaIdx >= obvSMA.length || prevSmaIdx >= obvSMA.length) {
          continue;
        }
        const currentOBV = obv[idx];
        const prevOBV = obv[idx - 1];
        const smaNow = obvSMA[smaIdx];
        const smaPrev = obvSMA[prevSmaIdx];
        const isBullishCrossover = currentOBV > smaNow && prevOBV < smaPrev;
        const isBearishCrossover = currentOBV < smaNow && prevOBV > smaPrev;
        const isBullishDivergence =
          currentOBV > prevOBV && candlesticks[idx].close < candlesticks[idx - 1].close;
        const isBearishDivergence =
          currentOBV < prevOBV && candlesticks[idx].close > candlesticks[idx - 1].close;
        if (isBullishCrossover) {
          check = "BUY";
          break;
        }
        if (isBearishCrossover) {
          check = "SELL";
          break;
        }
        if (isBullishDivergence) {
          check = "BUY";
          break;
        }
        if (isBearishDivergence) {
          check = "SELL";
          break;
        }
      }
    }
  }
  return check;
}