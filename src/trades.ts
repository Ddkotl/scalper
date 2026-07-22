import { client } from "./client";

export async function getLastBuyPrice(
  symbol: string
): Promise<number | null> {
  try {
    const trades = await client.accountTradeList(symbol, {
      limit: 50,
    });

    if (!trades || trades.length === 0) {
      return null;
    }

    const lastBuy = trades
      .filter((t: any) => t.isBuyer === true)
      .sort(
        (a: any, b: any) =>
          Number(b.time) - Number(a.time)
      )[0];

    if (!lastBuy) {
      return null;
    }

    return Number(lastBuy.price);

  } catch (e: any) {
    console.error(
      `Ошибка получения последней покупки ${symbol}:`,
      e.message || e
    );

    return null;
  }
}