import dayjs from "dayjs";
import fs from "fs";
import { client } from "./client";
import { COINS_CONFIG } from "./config";

type SymbolStats = {
  symbol: string;

  buyVolume: number;
  sellVolume: number;

  buyCount: number;
  sellCount: number;

  trades: number;

  pnl: number;
};

// ----------------------------
// 1. получаем активные монеты
// ----------------------------
export function getActiveSymbols(): string[] {
  return COINS_CONFIG.map((c) => c.SYMBOL);
}
async function getBalancesMap() {
  const acc = await client.accountInfo();

  const map: Record<string, number> = {};

  for (const b of acc.balances) {
    const total = Number(b.free) + Number(b.locked);
    if (total > 0) {
      map[b.asset] = total;
    }
  }

  return map;
}
async function getPriceMap(symbols: string[]) {
  const tickers = await client.ticker24hr();

  const map: Record<string, number> = {};

  for (const t of tickers) {
    if (symbols.includes(t.symbol)) {
      map[t.symbol] = Number(t.lastPrice);
    }
  }

  return map;
}
// ----------------------------
// 2. расчет статистики
// ----------------------------
async function calculateStats() {
  const symbols = getActiveSymbols();
  const balance = await getBalancesMap();
  const price = await getPriceMap(symbols);
  console.log(balance, price);
  const result: Record<string, SymbolStats> = {};

  for (const symbol of symbols) {
    let trades: any[] = [];
    const baseAsset = symbol.replace(/(USDT|USD|BUSD)$/, "");
    const coinBalance = balance[baseAsset];
    const coinPrice = price[symbol];
    const coinPriseUSDT = (coinPrice || 0) * (coinBalance || 0);
    console.log(coinBalance, coinPrice, coinPriseUSDT);
    try {
      trades = await client.accountTradeList(symbol, {
        limit: 1000,
      });
     
    } catch {
      continue;
    }
    if (!Array.isArray(trades) || trades.length === 0) continue;

    result[symbol] ??= {
      symbol,
      buyVolume: 0,
      sellVolume: 0,
      buyCount: 0,
      sellCount: 0,
      trades: 0,
      pnl: 0,
    };

    for (const t of trades) {
      const price = Number(t.price);
      const qty = Number(t.qty);
      const value = price * qty;

      result[symbol].trades += 1;

      if (t.isBuyer) {
        result[symbol].buyVolume += value;
        result[symbol].buyCount += 1;
        result[symbol].pnl -= value;
      } else {
        result[symbol].sellVolume += value;
        result[symbol].sellCount += 1;
        result[symbol].pnl += value;
      }
    }
    result[symbol].pnl += coinPriseUSDT;
    result[symbol].sellVolume += coinPriseUSDT;
    result[symbol].sellCount += 1;
  }

  const rows = Object.values(result).map((s) => {
    const avgTrade = s.trades ? (s.buyVolume + s.sellVolume) / s.trades : 0;

    const profitFactor = s.buyVolume > 0 ? s.sellVolume / s.buyVolume : 0;

    const winRate = s.trades ? (s.sellCount / s.trades) * 100 : 0;

    return {
      symbol: s.symbol,
      pnl: s.pnl.toFixed(2),
      buyVolume: s.buyVolume.toFixed(2),
      sellVolume: s.sellVolume.toFixed(2),
      trades: s.trades,
      winRate: winRate.toFixed(2) + "%",
      profitFactor: profitFactor.toFixed(2),
      avgTrade: avgTrade.toFixed(2),
    };
  });

  console.table(rows);
}

calculateStats();
