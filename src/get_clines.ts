import { client } from "./client";

export async function getKlines(symbol: string, interval = "1", limit = 15) {
  try {
    const response = await client.getKline({
      category: "spot",
      symbol: symbol,
      interval: interval as any, // Передаем интервал напрямую в формате Bybit
      limit: limit,
    });

    if (response.retCode !== 0 || !response.result?.list) {
      throw new Error(`Ошибка API Bybit: ${response.retMsg}`);
    }

    // Разворачиваем массив, чтобы он шел от старых свечей к новым (как на MEXC)
    return response.result.list.reverse();
    
  } catch (e: any) {
    console.error(`Ошибка при получении свечей для ${symbol}:`, e.message || e);
    throw e;
  }
}
