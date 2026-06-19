import { getKlines } from "./get_clines";

export interface MarketRegime {
  anchor: number;
  range: number;
  minPrice: number;
  maxPrice: number;
  currentPrice: number;
  rangePct: number;
  driftPct: number;
  trendFactor: number;
  isSideways: boolean;
  // Локальные уровни за указанное количество свечей
  localMinPrice: number;
  localMaxPrice: number;
  localRange: number;
}

export async function analyzeMarket(
  symbol: string,
  lookbackMinutes: number,
  localLookback: number, // <- НОВЫЙ ПАРАМЕТР: количество свечей для локального расчета
  minRangePct: number,
  maxRangePct: number,
  maxTrendFactor: number,
): Promise<MarketRegime | null> {
  try {
    // 1. Берём свечи 1m за последние N минут
    const klines = await getKlines(symbol, "1m", lookbackMinutes);
    if (!klines || klines.length === 0) return null;

    let minPrice = Infinity;
    let maxPrice = 0;

    // 2. Находим глобальный диапазон за указанный период (например, 15 минут)
    for (const k of klines) {
      const high = Number(k[2]);
      const low = Number(k[3]);

      if (isNaN(low) || isNaN(high)) continue;

      if (low < minPrice) minPrice = low;
      if (high > maxPrice) maxPrice = high;
    }

    if (minPrice === Infinity || maxPrice === 0) return null;

    const anchor = (minPrice + maxPrice) / 2;
    const range = maxPrice - minPrice;

    // 3. Текущая цена (последняя свеча close)
    const lastCandle = klines[klines.length - 1];
    const currentPrice = Number(lastCandle[4]);
    if (isNaN(currentPrice)) return null;

    // 4. НОВАЯ ЛОГИКА: Расчет локальных уровней за последние X свечей
    // Берем безопасный срез из конца массива (но не больше, чем есть всего свечей)
    const safeLocalLookback = Math.min(localLookback, klines.length);
    const localKlines = klines.slice(-safeLocalLookback);

    let localMinPrice = Infinity;
    let localMaxPrice = -Infinity;

    for (const k of localKlines) {
      const high = Number(k[2]);
      const low = Number(k[3]);

      if (isNaN(low) || isNaN(high)) continue;

      if (low < localMinPrice) localMinPrice = low;
      if (high > localMaxPrice) localMaxPrice = high;
    }

    // Если данные внутри среза оказались некорректными, страхуемся текущей ценой
    if (localMinPrice === Infinity || localMaxPrice === -Infinity) {
      localMinPrice = currentPrice;
      localMaxPrice = currentPrice;
    }

    const localRange = localMaxPrice - localMinPrice;

    // 5. Расчет метрик флета с защитой от деления на ноль
    const rangePct = anchor > 0 ? ((maxPrice - minPrice) / anchor) * 100 : 0;
    const driftPct =
      anchor > 0 ? (Math.abs(currentPrice - anchor) / anchor) * 100 : 0;
    const trendFactor = rangePct > 0 ? driftPct / rangePct : 0;

    // Режим рынка
    const isSideways =
      rangePct > minRangePct &&
      rangePct < maxRangePct &&
      trendFactor < maxTrendFactor;

    return {
      anchor,
      range,
      minPrice,
      maxPrice,
      currentPrice,
      rangePct,
      driftPct,
      trendFactor,
      isSideways,
      
      localMinPrice,
      localMaxPrice,
      localRange,
    };
  } catch (e: any) {
    console.error("analyzeMarket error:", e.message || e);
    return null;
  }
}
