import dayjs from "dayjs";
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
export function getUsdtQtyToSymbol(symbol: string): number {
  let config = COINS_CONFIG.find((c) => c.SYMBOL === symbol);
  return config?.USDT_QUANTITY || 0;
}

export function getUsdtToTrades(): number {
  return COINS_CONFIG.reduce((ac, cu) => (ac += cu.USDT_QUANTITY), 0);
}

// 1. Карта балансов Bybit
async function getBalancesMap() {
  const response = await client.getWalletBalance({
    accountType: "UNIFIED", // Для классического аккаунта замените на 'SPOT'
  });

  const map: Record<string, number> = {};

  if (response.retCode === 0 && response.result?.list?.[0]?.coin) {
    const coins = response.result.list[0].coin;
    for (const c of coins) {
      const total = Number(c.walletBalance);
      if (total > 0) {
        map[c.coin] = total;
      }
    }
  }
  return map;
}

// 2. Карта цен Bybit
async function getPriceMap(symbols: string[]) {
  const response = await client.getTickers({
    category: "spot",
  });

  const map: Record<string, number> = {};

  if (response.retCode === 0 && response.result?.list) {
    for (const t of response.result.list) {
      if (symbols.includes(t.symbol)) {
        map[t.symbol] = Number(t.lastPrice);
      }
    }
  }
  return map;
}

// 3. Скачивание сделок с пагинацией за 7 дней (Bybit V5)
// Скачивание сделок с пагинацией за 7 дней (Исправлено под exactOptionalPropertyTypes)
async function getTradesLast7Days(symbol: string): Promise<any[]> {
  const allTrades: any[] = [];
  const endTime = Date.now();
  const startTime = endTime - 7 * 24 * 60 * 60 * 1000; // 7 дней назад

  let cursor: string | undefined = undefined;
  let hasMore = true;

  try {
    while (hasMore) {
      // 1. Формируем базовые параметры запроса
      const params: any = {
        category: "spot",
        symbol: symbol,
        startTime: startTime,
        endTime: endTime,
        limit: 100,
      };

      // 2. Добавляем cursor только в том случае, если он определен
      if (cursor !== undefined) {
        params.cursor = cursor;
      }

      const response = await client.getExecutionList(params);

      if (
        response.retCode !== 0 ||
        !response.result?.list ||
        response.result.list.length === 0
      ) {
        break;
      }

      allTrades.push(...response.result.list);

      // Проверяем наличие следующей страницы
      cursor = response.result.nextPageCursor;
      if (!cursor || response.result.list.length < 100) {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error(`Ошибка загрузки сделок для ${symbol}:`, err);
  }

  return allTrades.reverse();
}

// 4. Расчет статистики периода (поля приведены к Bybit)
function calculateStatsForPeriod(
  symbol: string,
  trades: any[],
  currentPrice: number,
  realWalletBalance: number,
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

  // Bybit поля: execPrice, execQty, side ('Buy' / 'Sell')
  const earliestPrice = Number(trades[0].execPrice);
  let rollingBuyQty = 0;
  let rollingBuyVol = 0;

  for (const t of trades) {
    const p = Number(t.execPrice);
    const q = Number(t.execQty);
    const value = p * q;

    if (t.side === "Buy") {
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
  console.log("trade pair : ", COINS_CONFIG.length);
  console.log("trade to :", getUsdtToTrades());
  const symbols = getActiveSymbols();
  const prices = await getPriceMap(symbols);
  const balances = await getBalancesMap();
  const now = Date.now();

  const periodResults: Record<number, Record<string, SymbolStats>> = {};

  INTERVALS_CONFIG.forEach((config) => {
    periodResults[config.hours] = {};
  });

  for (const symbol of symbols) {
    const allTrades7d = await getTradesLast7Days(symbol);
    if (allTrades7d.length === 0) continue;

    const currentPrice = prices[symbol] || 0;
    const baseAsset = symbol.replace(/(USDT|USD|BUSD)$/, "");
    const realWalletBalance = balances[baseAsset] || 0;

    for (const config of INTERVALS_CONFIG) {
      const cutoffTime = now - config.hours * 60 * 60 * 1000;

      // На Bybit поле времени называется execTime (строка-таймстамп в мс)
      const filteredTrades = allTrades7d.filter(
        (t) => Number(t.execTime) >= cutoffTime,
      );

      if (filteredTrades.length > 0) {
        if (!periodResults[config.hours]) {
          periodResults[config.hours] = {};
        }

        const currentPeriodMap = periodResults[config.hours] ?? {};

        currentPeriodMap[symbol] = calculateStatsForPeriod(
          symbol,
          filteredTrades,
          currentPrice,
          realWalletBalance,
        );
      }
    }
  }

  console.clear();
  console.log(
    `================================================================`,
  );
  console.log(
    `       МУЛЬТИПЕРИОДНЫЙ ОТЧЕТ (Текущее время: ${dayjs().format("HH:mm:ss")})`,
  );
  console.log(
    `================================================================\n`,
  );

  for (const config of INTERVALS_CONFIG) {
    const statsMap = periodResults[config.hours] || {};
    let totalSessionPnl = 0;

    const rows = Object.values(statsMap).map((s) => {
      totalSessionPnl += s.pnl;

      return {
        Монета: s.symbol,
        "PnL (USDT)": s.pnl.toFixed(2),
        Сделки: s.tradesCount,
        "Обьем круга (USDT) ": getUsdtQtyToSymbol(s.symbol),
      };
    });

    if (rows.length === 0) {
      console.log(`⏱️ ПЕРИОД: ${config.label} — Нет сделок за этот период.`);
      console.log(
        `----------------------------------------------------------------\n`,
      );
      continue;
    }

    console.log(`⏱️ ПЕРИОД: ${config.label}`);
    console.table(rows);
    console.log(
      `ИТОГ ЗА ${config.label}: ${totalSessionPnl >= 0 ? "+" : ""}${totalSessionPnl.toFixed(2)} USDT`,
    );
    console.log(
      `----------------------------------------------------------------\n`,
    );
  }
}

calculateMultiPeriodPnl();
