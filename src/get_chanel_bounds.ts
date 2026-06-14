import { client } from "./client";

export interface ChannelData {
  lowerBound: number;
  midPrice: number;
  targetBuyPrice: number;
  targetSellPrice: number;
  bestBid: number;
  bestAsk: number;
  minPrice: number;
  maxPrice: number;
}

export async function getChannelBounds(
  symbol: string,
  priceStep: number,
  chanellTime: number,
): Promise<ChannelData | null> {
  try {
    const endTime = Date.now();
    const startTime = endTime - chanellTime;

    const [tradesData, tickerData] = await Promise.all([
      client.trades(symbol, { limit: 100 }),
      client.bookTicker(symbol),
    ]);

    if (!tradesData?.length || !tickerData?.bidPrice || !tickerData?.askPrice)
      return null;

    const bestBid = parseFloat(tickerData.bidPrice);
    const bestAsk = parseFloat(tickerData.askPrice);

    const recentTrades = tradesData.filter(
      (t: any) => t.time >= startTime && t.time <= endTime,
    );
    const tradesToAnalyze = recentTrades.length
      ? recentTrades
      : [tradesData[tradesData.length - 1]];

    let minPrice = parseFloat(tradesToAnalyze[0].price);
    let maxPrice = minPrice;

    for (const trade of tradesToAnalyze) {
      const price = parseFloat(trade.price);
      if (isNaN(price)) continue;
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    }
    const delta = maxPrice - minPrice;
    let targetBuyPrice = minPrice + priceStep;
    const midPrice = (minPrice + maxPrice) / 2;
    let targetSellPrice = midPrice + priceStep;
    if (delta > priceStep * 5) {
      targetSellPrice = midPrice + priceStep * 2;
    }
    if (delta > priceStep * 10) {
      targetSellPrice = midPrice + priceStep * 3;
    }

    if (targetBuyPrice >= bestAsk) targetBuyPrice = bestBid;
    if (targetSellPrice <= targetBuyPrice)
      targetSellPrice = targetBuyPrice + priceStep;

    return {
      lowerBound: minPrice,
      midPrice,
      targetBuyPrice,
      targetSellPrice,
      bestBid,
      bestAsk,
      minPrice,
      maxPrice,
    };
  } catch (e: any) {
    console.error("Ошибка расчета канала:", e.message || e);
    return null;
  }
}
