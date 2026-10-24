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

  if (parseFloat(formattedPrice) <= 0) {
    console.error(
      `❌ Критическая ошибка: Цена округлилась до ${formattedPrice} (исходная: ${price}). Ордер отклонен.`,
    );
    return null;
  }

  // Приводим "BUY"/"SELL" к формату Bybit: "Buy"/"Sell"
  const bybitSide = side === "BUY" ? "Buy" : "Sell";

  console.log(`[Ордер] ${side} ${formattedPrice} ${quantity}`);
  try {
    const response = await client.submitOrder({
      category: "spot",
      symbol: symbol,
      side: bybitSide,
      orderType: "Limit",
      qty: quantity,
      price: formattedPrice,
      timeInForce: "GTC",
    });

    if (response.retCode !== 0) {
      console.error(
        `Ошибка API Bybit при создании ордера:`,
        symbol,
        bybitSide,
        response.retMsg,
      );
      return null;
    }

    return response.result; // Содержит orderId и orderLinkId
  } catch (e: any) {
    console.error(`Ошибка ордера ${side}:`, e.message || e);
    return null;
  }
}

export async function placeMarketSell(quantity: number, symbol: string) {
  console.log(`[ОРДЕР] MARKET SELL ${quantity}`);
  try {
    const response = await client.submitOrder({
      category: "spot",
      symbol: symbol,
      side: "Sell",
      orderType: "Market",
      qty: quantity.toString(),
    });

    if (response.retCode !== 0) {
      console.error(`Ошибка API Bybit при маркет-продаже:`, response.retMsg);
      return null;
    }

    return response.result;
  } catch (e: any) {
    console.error(`Ошибка маркет ордера SELL:`, e.message || e);
    return null;
  }
}

// В Bybit orderId — это всегда string
export async function cancelOrder(orderId: string, symbol: string) {
  try {
    const response = await client.cancelOrder({
      category: "spot",
      symbol: symbol,
      orderId: orderId,
    });

    if (response.retCode !== 0) {
      console.error(`Не удалось отменить ордер ${orderId}:`, response.retMsg);
      return;
    }

    console.log(`Ордер ${orderId} отменен`);
  } catch (e: any) {
    console.error(`Не удалось отменить ордер ${orderId}:`, e.message || e);
  }
}

export async function getOpenOrders(symbol: string) {
  try {
    const response = await client.getActiveOrders({
      category: "spot",
      symbol: symbol,
    });

    if (response.retCode !== 0 || !response.result?.list) {
      console.error(`Ошибка получения открытых ордеров:`, response.retMsg);
      return { currentBuyOrder: [], currentSellOrder: [] };
    }

    const openOrders = response.result.list;

    // Bybit возвращает сторону как "Buy" или "Sell"
    const currentBuyOrder = openOrders.filter((o: any) => o.side === "Buy");
    const currentSellOrder = openOrders.filter((o: any) => o.side === "Sell");

    return { currentBuyOrder, currentSellOrder };
  } catch (e: any) {
    console.error(`Ошибка получения открытых ордеров:`, e.message || e);
    return { currentBuyOrder: null, currentSellOrder: null };
  }
}
