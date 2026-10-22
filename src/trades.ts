import { client } from "./client";

export async function getLastBuyPrice(
  symbol: string
): Promise<number | null> {
  try {
    // 1. Для получения истории сделок по конкретному symbol используется getExecutionList
    const response = await client.getExecutionList({
      category: "spot",
      symbol: symbol,
      limit: 50,
    });

    if (response.retCode !== 0 || !response.result?.list || response.result.list.length === 0) {
      if (response.retCode !== 0) {
        console.error("Ошибка API Bybit при запросе сделок:", response.retMsg);
      }
      return null;
    }

    const trades = response.result.list;

    // 2. Фильтруем только покупки
    const buyTrades = trades.filter((t: any) => t.side === "Buy");

    if (buyTrades.length === 0) {
      return null;
    }

    // Сортируем сделки от более свежих к старым
    buyTrades.sort(
      (a: any, b: any) => Number(b.execTime) - Number(a.execTime)
    );

    // 3. Безопасно извлекаем первый элемент, предотвращая ошибку 'possibly undefined'
    const lastBuy = buyTrades[0];
    if (!lastBuy) {
      return null;
    }

    // В ответе getExecutionList цена исполнения лежит в поле execPrice
    return Number(lastBuy.execPrice);

  } catch (e: any) {
    console.error(
      `Ошибка получения последней покупки ${symbol}:`,
      e.message || e
    );
    return null;
  }
}
