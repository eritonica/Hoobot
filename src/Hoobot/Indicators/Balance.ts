import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ExchangeOptions } from "../Utilities/Args";
import { Filter } from "../Exchanges/Filters";
import { checkPreviousTrade } from "../Exchanges/Trades";
import { tradableBalance } from "../Exchanges/Balances";

export const checkBalanceSignals = (
  consoleLogger: ConsoleLogger,
  symbol: string,
  closePrice: number,
  exchangeOptions: ExchangeOptions,
  filter: Filter
) => {
  let check = "HOLD";
  
  // Validate symbol format
  const symbolParts = symbol?.split("/") || [];
  if (symbolParts.length !== 2 || !symbolParts[0] || !symbolParts[1]) {
    consoleLogger.push("Balance Check", `Invalid symbol format: ${symbol}. Expected BASE/QUOTE`);
    return check;
  }
  
  const [baseSymbol, quoteSymbol] = symbolParts;
  
  if (exchangeOptions.balances !== undefined) {
    if (exchangeOptions.balances[baseSymbol] == undefined) {
      exchangeOptions.balances[baseSymbol] = {
        crypto: 0,
        available: 0,
        onOrder: 0,
        usdt: 0,
      };
    }
    if (exchangeOptions.balances[quoteSymbol] == undefined) {
      exchangeOptions.balances[quoteSymbol] = {
        crypto: 0,
        available: 0,
        onOrder: 0,
        usdt: 0,
      };
    }
    const baseBalance = exchangeOptions.balances[baseSymbol].crypto;
    const quoteBalance = exchangeOptions.balances[quoteSymbol].crypto;
    const baseBalanceConverted = baseBalance * closePrice;
    const minNotional = filter?.minNotional ?? 0;
    const maxNotional = filter?.maxNotional ?? Number.POSITIVE_INFINITY;
    let tradeCheck = checkPreviousTrade(symbol, exchangeOptions);
    if (tradeCheck === "SELL") {
      if (quoteBalance > minNotional) {
        check = "BUY";
      } else {
        if (baseBalanceConverted >= minNotional) {
          check = "SELL";
        } else {
          check = "HOLD";
        }
      }
    } else if (tradeCheck === "BUY") {
      if (baseBalanceConverted > minNotional) {
        check = "SELL";
      } else {
        if (quoteBalance >= minNotional) {
          check = "BUY";
        } else {
          check = "HOLD";
        }
      }
    }
    // SELL (= sulku long): vain minNotional. maxNotional ei saa estää sulkua.
    if (check === "SELL" && baseBalanceConverted < minNotional) {
      check = "HOLD";
    } else if (check === "BUY" && (quoteBalance < minNotional || quoteBalance > maxNotional)) {
      check = "HOLD";
    }
    consoleLogger.push("Trades", {
      previous: tradeCheck,
      next: check,
      baseAvailable: baseBalance,
      quoteAvailable: quoteBalance,
    });
  }

  return check;
};
