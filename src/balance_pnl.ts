import dayjs from "dayjs";
import fs from "fs";
import { client } from "./client";
import { COINS_CONFIG } from "./config";

type SymbolStats = {
  symbol: string;
  buyVolume: number;
  sellVolume: number;
  buyQty: number;
  sellQty: number;
  tradesCount: number;
  currentPrice: number;
  simulatedVolume: number;
  actualSells: number;
  winTrades: number;
  pnl: number;
};

// Все интервалы переведены в часы для единообразия расчетов
const INTERVALS_CONFIG = [
  { label: "1 час", hours: 1 },
  { label: "2 часа", hours: 2 },
  { label: "6 часов", hours: 6 },
  { label: "12 часов", hours: 12 },
  { label: "1 день", hours: 24 },
  { label: "2 дня", hours: 48 },
  { label: "3 дня", hours: 72 },
  { label: "7 дней", hours: 168 },
];

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

// Теперь функция скачивает сделки за максимальный интервал — 7 дней (168 часов)
async function getTradesLast7Days(symbol: string): Promise<any[]> {
  const allTrades: any[] = [];
  const endTime = Date.now();
  const startTime = endTime - 7 * 24 * 60 * 60 * 1000; // 7 дней назад
  const interval = 60 * 60 * 1000; // Окно запроса в 1 час

  for (let currentStart = startTime; currentStart < endTime; currentStart += interval) {
    const currentEnd = Math.min(currentStart + interval - 1, endTime);
    try {
      const trades = await client.accountTradeList(symbol, {
        startTime: currentStart,
        endTime: currentEnd,
        limit: 1000,
      });
      if (Array.isArray(trades) && trades.length > 0) {
        allTrades.push(...trades);
      }
    } catch (err) {
      console.error(
        `Ошибка загрузки сделок ${symbol} ${new Date(currentStart).toISOString()}:`,
        err,
      );
    }
  }
  return allTrades;
}

function calculateStatsForPeriod(
  symbol: string,
  trades: any[],
  currentPrice: number,
  realWalletBalance: number
): SymbolStats {
  const stats: SymbolStats = {
    symbol,
    buyVolume: 0,
    sellVolume: 0,
    buyQty: 0,
    sellQty: 0,
    tradesCount: trades.length,
    currentPrice,
    simulatedVolume: 0,
    actualSells: 0,
    winTrades: 0,
    pnl: 0,
  };

  if (trades.length === 0) return stats;

  const earliestPrice = Number(trades[0].price);
  let rollingBuyQty = 0;
  let rollingBuyVol = 0;

  for (const t of trades) {
    const p = Number(t.price);
    const q = Number(t.qty);
    const value = p * q;

    if (t.isBuyer) {
      stats.buyVolume += value;
      stats.buyQty += q;
      rollingBuyQty += q;
      rollingBuyVol += value;
    } else {
      stats.sellVolume += value;
      stats.sellQty += q;
      stats.actualSells += 1;

      const currentAvgBuyPrice = rollingBuyVol / (rollingBuyQty || 1);
      if (p > currentAvgBuyPrice) {
        stats.winTrades += 1;
      }
    }
  }

  const walletValue = realWalletBalance * currentPrice;
  const totalSellVolumeWithWallet = stats.sellVolume + walletValue;
  const totalSellQtyWithWallet = stats.sellQty + realWalletBalance;

  const qtyDelta = stats.buyQty - totalSellQtyWithWallet;
  let historyAdjustment = 0;

  if (qtyDelta > 0) {
    historyAdjustment = qtyDelta * earliestPrice;
  } else if (qtyDelta < 0) {
    historyAdjustment = -(Math.abs(qtyDelta) * earliestPrice);
  }

  stats.pnl = totalSellVolumeWithWallet - stats.buyVolume + historyAdjustment;
  stats.simulatedVolume = walletValue + historyAdjustment;

  return stats;
}

async function calculateMultiPeriodPnl() {
  const symbols = getActiveSymbols();
  const prices = await getPriceMap(symbols);
  const balances = await getBalancesMap();
  const now = Date.now();

  // Объект для хранения результатов. Ключ — количество часов интервала.
  const periodResults: Record<number, Record<string, SymbolStats>> = {};
  
  INTERVALS_CONFIG.forEach((config) => {
    periodResults[config.hours] = {};
  });

  for (const symbol of symbols) {
    // Скачиваем за 7 дней
    const allTrades7d = await getTradesLast7Days(symbol);
    if (allTrades7d.length === 0) continue;

    const currentPrice = prices[symbol] || 0;
    const baseAsset = symbol.replace(/(USDT|USD|BUSD)$/, "");
    const realWalletBalance = balances[baseAsset] || 0;

    for (const config of INTERVALS_CONFIG) {
      const cutoffTime = now - config.hours * 60 * 60 * 1000;
      const filteredTrades = allTrades7d.filter((t) => t.time >= cutoffTime);

      if (filteredTrades.length > 0) {
        // 1. Инициализируем объект, если его еще нет
        if (!periodResults[config.hours]) {
          periodResults[config.hours] = {};
        }
        
        // 2. Выносим в константу, чтобы TS гарантировал безопасность типа (не undefined)
        const currentPeriodMap = periodResults[config.hours] ?? {};
        
        currentPeriodMap[symbol] = calculateStatsForPeriod(
          symbol,
          filteredTrades,
          currentPrice,
          realWalletBalance
        );
      }
    }

  }

  console.clear();
  console.log(`================================================================`);
  console.log(`       МУЛЬТИПЕРИОДНЫЙ ОТЧЕТ (Текущее время: ${dayjs().format("HH:mm:ss")})`);
  console.log(`================================================================\n`);

  for (const config of INTERVALS_CONFIG) {
    const statsMap = periodResults[config.hours] || {};
    let totalSessionPnl = 0;

    const rows = Object.values(statsMap).map((s) => {
      totalSessionPnl += s.pnl;
      return {
        "Монета": s.symbol,
        "PnL (USDT)": s.pnl.toFixed(2),
        "Сделки": s.tradesCount,
      };
    });

    if (rows.length === 0) {
      console.log(`⏱️ ПЕРИОД: ${config.label} — Нет сделок за этот период.`);
      console.log(`----------------------------------------------------------------\n`);
      continue;
    }

    console.log(`⏱️ ПЕРИОД: ${config.label}`);
    console.table(rows);
    console.log(
      `ИТОГ ЗА ${config.label}: ${totalSessionPnl >= 0 ? "+" : ""}${totalSessionPnl.toFixed(2)} USDT`
    );
    console.log(`----------------------------------------------------------------\n`);
  }
}

calculateMultiPeriodPnl();
