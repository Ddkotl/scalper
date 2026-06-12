import { client } from "./client";
import { SYMBOL, PRICE_STEP } from "./config";

export async function placeLimitOrder(
  side: "BUY" | "SELL",
  price: number,
  quantity: number,
) {
  const decimals = PRICE_STEP.toString().split(".")[1]?.length || 0;
  const formattedPrice = price.toFixed(decimals);

  console.log(`[Ордер] ${side} ${formattedPrice} ${quantity}`);
  try {
    const order = await client.newOrder(SYMBOL, side, "LIMIT", {
      quantity: quantity.toString(),
      price: formattedPrice,
      timeInForce: "GTC",
    });
    return order;
  } catch (e: any) {
    console.error(`Ошибка ордера ${side}:`, e.message || e);
    return null;
  }
}

export async function placeMarketSell(quantity: number) {
  console.log(`[ОРДЕР] MARKET SELL ${quantity}`);
  return client.newOrder(SYMBOL, "SELL", "MARKET", {
    quantity: quantity.toString(),
  });
}

export async function cancelOrder(orderId: number) {
  try {
    await client.cancelOrder(SYMBOL, { orderId });
    console.log(`Ордер ${orderId} отменен`);
  } catch (e: any) {
    console.error(`Не удалось отменить ордер ${orderId}:`, e.message || e);
  }
}
