import { getChannelBounds } from "./src/strategy";
import { getAssetBalance } from "./src/wallet";
import {
  placeLimitOrder,
  placeMarketSell,
  cancelOrder,
  getOpenOrders,
} from "./src/orders";
import {
  SYMBOL,
  QUANTITY,
  STOP_LOSS_PCT,
  MIN_NOTIONAL,
  TRADE_INTERVAL_MS,
  INTERVAL_AFTER_STOPLOSS_MS,
  ASSET_NAME,
  ORDER_TIMEOUT_MS,
  CHANNEL_TIME,
  PRICE_STEP,
} from "./src/config";
import { sleep } from "./src/utils";

export async function tradeLoop() {
  console.log("🚀 Робот запущен в Stateless-режиме.");

  while (true) {
    try {
      // ==========================================
      // 1. СБОР СВЕЖИХ ДАННЫХ С СЕРВЕРА (Каждый тик заново)
      // ==========================================
      const channel = await getChannelBounds(SYMBOL, PRICE_STEP, CHANNEL_TIME); // Канал за последние 5 минут
      const { currentBuyOrder, currentSellOrder } = await getOpenOrders(SYMBOL); // Получаем все активные ордера по паре
      const { coinBalance, usdtBalance } = await getAssetBalance(ASSET_NAME);

      if (!channel || coinBalance === null || usdtBalance === null) {
        console.log(
          "⚠️ Не удалось собрать все данные с биржи. Пропускаем тик...",
        );
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }
      const currentPrice = channel.bestBid;
      const coinValueInUsdt = coinBalance * currentPrice;

      // ==========================================
      // 2. АНАЛИЗ СОСТОЯНИЯ И ПРИНЯТИЕ РЕШЕНИЙ
      // ==========================================
      if (currentBuyOrder) {
        const buyAgeMinutes = Date.now() - currentBuyOrder.time;
        if (buyAgeMinutes >= ORDER_TIMEOUT_MS) {
          console.log(
            "⏰ Ордер BUY висит больше 3 минут без полного налива. Отменяем.",
          );
          await cancelOrder(currentBuyOrder.orderId);
          continue;
        }
      }
      if (currentSellOrder) {
        const tpAgeMinutes = Date.now() - currentSellOrder.time;
        if (tpAgeMinutes >= ORDER_TIMEOUT_MS) {
          console.log(
            "⏰ ТР висит больше 3 минут. Отменяем для перестановки по новому каналу.",
          );
          await cancelOrder(currentSellOrder.orderId);
          continue;
        }
      }
      if (currentSellOrder) {
        const stopPrice = currentSellOrder.price * (1 - STOP_LOSS_PCT / 100);
        if (currentPrice <= stopPrice) {
          console.log(
            `🚨 СТОП-ЛОСС! Цена ${currentPrice} <= ${stopPrice}. Экстренно выходим по рынку.`,
          );
          if (currentSellOrder) await cancelOrder(currentSellOrder.orderId);
          await placeMarketSell(coinBalance);
          console.log("😴 Пауза  после стоп-лосса.");
          await sleep(INTERVAL_AFTER_STOPLOSS_MS);
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
      }

      if (
        coinValueInUsdt < MIN_NOTIONAL &&
        !currentBuyOrder &&
        !currentSellOrder
      ) {
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
      }
    } catch (error) {
      console.error("💥 Критическая ошибка в цикле тика:", error);
    }

    await sleep(TRADE_INTERVAL_MS);
  }
}

tradeLoop();
