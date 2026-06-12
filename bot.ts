import { getChannelBounds } from "./src/strategy";
import { getAssetBalance } from "./src/wallet";
import { placeLimitOrder, placeMarketSell, cancelOrder } from "./src/orders";
import { SYMBOL, QUANTITY, STOP_LOSS_PCT } from "./src/config";
import { client } from "./src/client";

export async function tradeLoop() {
  const ASSET_NAME = SYMBOL.replace("USDT", "");
  const MIN_NOTIONAL = 1.1; // Минимальная стоимость ордера в USDT для торговли (с запасом)



  console.log("🚀 Робот запущен в Stateless-режиме.");

  while (true) {
    try {
      // ==========================================
      // 1. СБОР СВЕЖИХ ДАННЫХ С СЕРВЕРА (Каждый тик заново)
      // ==========================================
      const channel = await getChannelBounds();
      const openOrders = await client.openOrders(SYMBOL); // Получаем все активные ордера по паре
      const { coinBalance, usdtBalance } = await getAssetBalance(ASSET_NAME);

      if (!channel || !openOrders) {
        console.log(
          "⚠️ Не удалось собрать все данные с биржи. Пропускаем тик...",
        );
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const currentPrice = channel.bestBid;
      const coinValueInUsdt = coinBalance * currentPrice;

      // Ищем ордера на бирже по факту их наличия
      const currentBuyOrder = openOrders.find(
        (o: { side: string }) => o.side === "BUY",
      );
      const currentSellOrder = openOrders.find(
        (o: { side: string }) => o.side === "SELL",
      );
      // ==========================================
      // 2. АНАЛИЗ СОСТОЯНИЯ И ПРИНЯТИЕ РЕШЕНИЙ
      // ==========================================
      if (currentSellOrder) {
        const stopPrice = currentSellOrder.price * (1 - STOP_LOSS_PCT / 100);
        if (currentPrice <= stopPrice) {
          console.log(
            `🚨 СТОП-ЛОСС! Цена ${currentPrice} <= ${stopPrice}. Экстренно выходим по рынку.`,
          );
          if (currentSellOrder) await cancelOrder(currentSellOrder.orderId);
          await placeMarketSell(coinBalance);
          console.log("😴 Пауза 10 минут после стоп-лосса.");
          await new Promise((r) => setTimeout(r, 10 * 60 * 1000));
          continue;
        }
      }
      if (
        coinValueInUsdt >= MIN_NOTIONAL &&
        !currentBuyOrder &&
        !currentSellOrder
      ) {
          const sellOrder = await placeLimitOrder(
            "SELL",
            channel.targetSellPrice,
            coinBalance,
          );
          if (sellOrder?.orderId) {
            console.log(
              `💰 Выставлен Тейк-Профит на ${coinBalance} ${ASSET_NAME} по цене ${channel.targetSellPrice}`,
            );
          }
        

        if(currentSellOrder) {
          const tpAgeMinutes = (Date.now() - currentSellOrder.time) / 1000 / 60;
          if (tpAgeMinutes >= 3) {
            console.log(
              "⏰ ТР висит больше 3 минут. Отменяем для перестановки по новому каналу.",
            );
            await cancelOrder(currentSellOrder.orderId);
          }
        }
      }

      if(coinValueInUsdt < MIN_NOTIONAL && !currentBuyOrder && !currentSellOrder) {
          if (
            usdtBalance >= QUANTITY * channel.targetBuyPrice &&
            QUANTITY * channel.targetBuyPrice >= MIN_NOTIONAL
          ) {
            const order = await placeLimitOrder(
              "BUY",
              channel.targetBuyPrice,
              QUANTITY,
            );
            if (order?.orderId) {
              console.log(
                `🛒 Выставили новый ордер BUY по цене ${channel.targetBuyPrice}`,
              );
            }
          } else {
            console.log(
              "❌ Недостаточно USDT для выставления ордера на покупку.",
            );
          }
        
      if(currentBuyOrder) {
          const buyAgeMinutes = (Date.now() - currentBuyOrder.time) / 1000 / 60;
          if (buyAgeMinutes >= 5) {
            console.log(
              "⏰ Ордер BUY висит больше 5 минут без полного налива. Отменяем.",
            );
            await cancelOrder(currentBuyOrder.orderId);
          }
        }
      }
    } catch (error) {
      console.error("💥 Критическая ошибка в цикле тика:", error);
    }

    // Интервал между тиками
    await new Promise((r) => setTimeout(r, 5000));
  }
}

tradeLoop();
