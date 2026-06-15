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
}

export async function analyzeMarket(
  symbol: string,
  lookbackMinutes: number = 5,
): Promise<MarketRegime | null> {
  try {
    // 1. Берём свечи 1m
    const klines = await getKlines(symbol, "1m", lookbackMinutes);
    if (!klines || klines.length === 0) return null;

    let minPrice = Infinity;
    let maxPrice = 0;

    // 2. Находим диапазон
    for (const k of klines) {
      const high = Number(k[2]);
      const low = Number(k[3]);

      if (isNaN(low) || isNaN(high)) continue;

      if (low < minPrice) minPrice = low;
      if (high > maxPrice) maxPrice = high;
    }

    if (minPrice === Infinity || maxPrice === 0) return null;

    // 3. Центр рынка
    const anchor = (minPrice + maxPrice) / 2;
    const range = maxPrice - minPrice;
    // 4. Текущая цена (последняя свеча close)
    const lastCandle = klines[klines.length - 1];
    const currentPrice = Number(lastCandle[4]);

    if (isNaN(currentPrice)) return null;

    // 5. rangePct — волатильность диапазона
    const rangePct = ((maxPrice - minPrice) / anchor) * 100;

    // 6. driftPct — смещение от центра
    const driftPct = (Math.abs(currentPrice - anchor) / anchor) * 100;

    // 7. trendFactor — ключевой индикатор
    const trendFactor = rangePct > 0 ? driftPct / rangePct : 0;

    // 8. режим рынка
    const isSideways = rangePct > 0.05 && rangePct < 1 && trendFactor < 0.4;

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
    };
  } catch (e: any) {
    console.error("analyzeMarket error:", e.message || e);
    return null;
  }
}
