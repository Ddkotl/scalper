import { client } from "./client";

export async function placeLimitOrder(
  side: "BUY" | "SELL",
  price: number,
  quantity: string,
  symbol: string,
  priceStep: number,
) {
  const decimals = priceStep < 1 ? Math.round(-Math.log10(priceStep)) : 0;

  const formattedPrice = price.toFixed(decimals);

  // Страховка от отправки нулевой или отрицательной цены
  if (parseFloat(formattedPrice) <= 0) {
    console.error(
      `❌ Критическая ошибка: Цена округлилась до ${formattedPrice} (исходная: ${price}). Ордер отклонен.`,
    );
    return null;
  }

  console.log(`[Ордер] ${side} ${formattedPrice} ${quantity}`);
  try {
    const order = await client.newOrder(symbol, side, "LIMIT", {
      quantity: quantity,
      price: formattedPrice,
      timeInForce: "GTC",
    });
    return order;
  } catch (e: any) {
    console.error(`Ошибка ордера ${side}:`, e.message || e);
    return null;
  }
}

export async function placeMarketSell(quantity: number, symbol: string) {
  console.log(`[ОРДЕР] MARKET SELL ${quantity}`);
  return client.newOrder(symbol, "SELL", "MARKET", {
    quantity: quantity.toString(),
  });
}

export async function cancelOrder(orderId: number, symbol: string) {
  try {
    await client.cancelOrder(symbol, { orderId });
    console.log(`Ордер ${orderId} отменен`);
  } catch (e: any) {
    console.error(`Не удалось отменить ордер ${orderId}:`, e.message || e);
  }
}

export async function getOpenOrders(symbol: string) {
  try {
    const openOrders = await client.openOrders(symbol);
    // Ищем ордера на бирже по факту их наличия
    const currentBuyOrder = openOrders.filter(
      (o: { side: string }) => o.side === "BUY",
    );
    const currentSellOrder = openOrders.filter(
      (o: { side: string }) => o.side === "SELL",
    );
    return { currentBuyOrder, currentSellOrder };
  } catch (e: any) {
    console.error(`Ошибка получения открытых ордеров:`, e.message || e);
    return { currentBuyOrder: null, currentSellOrder: null };
  }
}
