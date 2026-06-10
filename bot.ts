import { getChannelBounds } from "./src/strategy";
import { getAssetBalance } from "./src/wallet";
import { placeLimitOrder, placeMarketSell, cancelOrder } from "./src/orders";
import { SYMBOL, QUANTITY, STOP_LOSS_PCT } from "./src/config";
import { client } from "./src/client";

export async function tradeLoop() {
  let inPosition = false;
  let buyOrderId: number | null = null;
  let sellOrderId: number | null = null;
  let entryPrice = 0;

  let buyOrderTimestamp = 0;
  let sellOrderTimestamp = 0;

  const ASSET_NAME = SYMBOL.replace("USDT", "");

  while (true) {
    const channel = await getChannelBounds();
    if (!channel) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    // 1. Вход в сделку
    if (!inPosition && !buyOrderId) {
      const order = await placeLimitOrder(
        "BUY",
        channel.targetBuyPrice,
        QUANTITY,
      );
      if (order?.orderId) {
        buyOrderId = order.orderId;
        entryPrice = channel.targetBuyPrice;
        buyOrderTimestamp = Date.now();
      }
    }
    // 2. Проверка исполнения ордера
    if (buyOrderId && !inPosition) {
      const status = await client.queryOrder(SYMBOL, { orderId: buyOrderId });
      if (status?.status === "FILLED") {
        inPosition = true;
        buyOrderId = null;

        const balance = await getAssetBalance(ASSET_NAME);
        if (balance > 0) {
          const sellOrder = await placeLimitOrder(
            "SELL",
            channel.targetSellPrice,
            balance,
          );
          if (sellOrder?.orderId) {
            sellOrderId = sellOrder.orderId;
            sellOrderTimestamp = Date.now();
          }
        }
      }
    }
    if (buyOrderId && !inPosition) {
      const buyAgeMinutes = (Date.now() - buyOrderTimestamp) / 1000 / 60;

      if (buyAgeMinutes >= 1) {
        console.log("⏰ BUY висит больше минуты. Переставляем.");

        try {
          await cancelOrder(buyOrderId);

          buyOrderId = null;

          const freshChannel = await getChannelBounds();

          if (freshChannel) {
            const newOrder = await placeLimitOrder(
              "BUY",
              freshChannel.targetBuyPrice,
              QUANTITY,
            );

            if (newOrder?.orderId) {
              buyOrderId = newOrder.orderId;
              buyOrderTimestamp = Date.now();

              console.log(
                `Новый BUY выставлен по ${freshChannel.targetBuyPrice}`,
              );
            }
          }
        } catch (e) {
          console.error("Ошибка перестановки BUY:", e);
        }
      }
    }
    if (sellOrderId && inPosition) {
      const status = await client.queryOrder(SYMBOL, { orderId: sellOrderId });

      if (status?.status === "FILLED") {
        console.log("TP исполнен");

        inPosition = false;
        sellOrderId = null;
        sellOrderTimestamp = 0;
        entryPrice = 0;
      }
    }
    // 3. Стоп-лосс по рынку
    if (inPosition && sellOrderId) {
      const ticker = await client.bookTicker(SYMBOL);
      const currentPrice = parseFloat(ticker.bidPrice);
      const stopPrice = entryPrice * (1 - STOP_LOSS_PCT / 100);
      if (currentPrice <= stopPrice) {
        await cancelOrder(sellOrderId);
        const balance = await getAssetBalance(ASSET_NAME);
        if (balance > 0) await placeMarketSell(balance);
        inPosition = false;
        sellOrderId = null;
        sellOrderTimestamp = 0;
        buyOrderTimestamp = 0;
        entryPrice = 0;
        await new Promise((r) => setTimeout(r, 10 * 60 * 1000)); // пауза после стопа
      }
    }
    if (inPosition && sellOrderId) {
      const tpAgeMinutes = (Date.now() - sellOrderTimestamp) / 1000 / 60;

      if (tpAgeMinutes >= 3) {
        console.log("⏰ TP висит больше 3 минут. Переставляем.");

        try {
          await cancelOrder(sellOrderId);

          const balance = await getAssetBalance(ASSET_NAME);

          const freshChannel = await getChannelBounds();

          if (balance > 0 && freshChannel) {
            const newOrder = await placeLimitOrder(
              "SELL",
              freshChannel.targetSellPrice,
              balance,
            );

            if (newOrder?.orderId) {
              sellOrderId = newOrder.orderId;
              sellOrderTimestamp = Date.now();

              console.log(
                `Новый TP выставлен по ${freshChannel.targetSellPrice}`,
              );
            }
          }
        } catch (e) {
          console.error("Ошибка перестановки TP:", e);
        }
      }
    }

    await new Promise((r) => setTimeout(r, 1500));
  }
}

tradeLoop();
