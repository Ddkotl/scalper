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

// Расширенный конфиг интервалов (добавлены 2, 3 и 4 недели)
const INTERVALS_CONFIG = [
  { label: "1 час", hours: 1 },
  { label: "2 часа", hours: 2 },
  { label: "6 часов", hours: 6 },
  { label: "12 часов", hours: 12 },
  { label: "1 день", hours: 24 },
  { label: "2 дня", hours: 48 },
  { label: "3 дня", hours: 72 },
  { label: "7 дней", hours: 168 },
  { label: "2 недели", hours: 336 },  // 14 дней
  { label: "3 недели", hours: 504 },  // 21 день
  { label: "4 недели", hours: 672 },  // 28 дней
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
    accountType: "UNIFIED",
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

// 3. Скачивание сделок с пагинацией пошаговыми окнами по 7 дней (Решает проблему лимитов Bybit)
async function getTradesLastDays(symbol: string, daysWindow = 30): Promise<any[]> {
  const allTrades: any[] = [];
  const now = Date.now();
  const targetStartTime = now - daysWindow * 24 * 60 * 60 * 1000; // Целевая точка в прошлом (например, 30 дней назад)

  // Разбиваем запрос на отрезки максимум по 7 дней, так как Bybit не примет окно больше 7 дней
  const STEP_MS = 7 * 24 * 60 * 60 * 1000; 
  
  // Начинаем с текущего момента и идем назад
  let currentEndTime = now;

  while (currentEndTime > targetStartTime) {
    // Рассчитываем startTime для текущего шага, но не дальше, чем общая целевая точка
    let currentStartTime = currentEndTime - STEP_MS;
    if (currentStartTime < targetStartTime) {
      currentStartTime = targetStartTime;
    }

    let cursor: string | undefined = undefined;
    let hasMoreInPeriod = true;

    try {
      while (hasMoreInPeriod) {
        const params: any = {
          category: "spot",
          symbol: symbol,
          startTime: currentStartTime,
          endTime: currentEndTime,
          limit: 100,
        };

        if (cursor !== undefined) {
          params.cursor = cursor;
        }

        const response = await client.getExecutionList(params);
        
        if (response.retCode !== 0) {
          console.error(`API Error для ${symbol} [код ${response.retCode}]: ${response.retMsg}`);
          break;
        }

        const list = response.result?.list || [];
        if (list.length === 0) {
          break;
        }

        allTrades.push(...list);

        // Проверяем пагинацию внутри текущего 7-дневного окна
        cursor = response.result?.nextPageCursor;
        if (!cursor || list.length < 100) {
          hasMoreInPeriod = false;
        }
      }
    } catch (err) {
      console.error(`Ошибка загрузки сегмента сделок для ${symbol}:`, err);
      break; 
    }

    // Сдвигаем временное окно дальше в прошлое для следующей итерации цикла
    currentEndTime = currentStartTime;
  }

  // Сортируем от старых сделок к новым, как ожидает функция calculateStatsForPeriod
  return allTrades.sort((a, b) => Number(a.execTime) - Number(b.execTime));
}

// 4. Расчет статистики периода с учетом спотовой комиссии Bybit (0.1%)
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

  const FEE_RATE = 0.001; 
  const earliestPrice = Number(trades[0].execPrice);
  let rollingBuyQtyWithFee = 0;
  let rollingBuyVol = 0;

  for (const t of trades) {
    const p = Number(t.execPrice);
    const q = Number(t.execQty);
    const rawValue = p * q;

    if (t.side === "Buy") {
      stats.buyVolume += rawValue;
      const netQty = q * (1 - FEE_RATE);
      stats.buyQty += netQty;
      rollingBuyQtyWithFee += netQty;
      rollingBuyVol += rawValue;
    } else {
      const netValue = rawValue * (1 - FEE_RATE);
      stats.sellVolume += netValue;
      stats.sellQty += q;
      stats.actualSells += 1;

      const currentAvgBuyPrice = rollingBuyVol / (rollingBuyQtyWithFee || 1);
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
    // Скачиваем историю за 30 дней, чтобы хватило на расчет 4-х недель
    const allTrades30d = await getTradesLastDays(symbol, 30);
    if (allTrades30d.length === 0) continue;

    const currentPrice = prices[symbol] || 0;
    const baseAsset = symbol.replace(/(USDT|USD|BUSD)$/, "");
    const realWalletBalance = balances[baseAsset] || 0;

    for (const config of INTERVALS_CONFIG) {
      const cutoffTime = now - config.hours * 60 * 60 * 1000;
      const filteredTrades = allTrades30d.filter(
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
    ` МУЛЬТИПЕРИОДНЫЙ ОТЧЕТ (Текущее время: ${dayjs().format("HH:mm:ss")})`,
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
