import type { CoinConfig } from "./config";
import { getChannelBounds } from "./get_chanel_bounds";
import {
  cancelOrder,
  getOpenOrders,
  placeLimitOrder,
  placeMarketSell,
} from "./orders";
import { sleep } from "./utils";
import { getAssetBalance } from "./wallet";

export async function tradeLoop(config: CoinConfig) {
  const {
    SYMBOL,
    USDT_QUANTITY,
    QTY_STEP,
    PRICE_STEP,
    STOP_LOSS_PCT,
    MIN_NOTIONAL,
    ASSET_NAME,
    CHANNEL_TIME,
    INTERVAL_AFTER_STOPLOSS_MS,
    ORDER_TIMEOUT_MS,
    TRADE_INTERVAL_MS,
  } = config;

  console.log(`🚀 Робот запущен для пары ${SYMBOL} в Stateless-режиме.`);

  while (true) {
    try {
      // ==========================================
      // 1. СБОР СВЕЖИХ ДАННЫХ С СЕРВЕРА
      // ==========================================
      const channel = await getChannelBounds(SYMBOL, PRICE_STEP, CHANNEL_TIME);
      const { currentBuyOrder, currentSellOrder } = await getOpenOrders(SYMBOL);
      const { coinBalance, usdtBalance } = await getAssetBalance(ASSET_NAME);

      if (!channel || coinBalance === null || usdtBalance === null) {
        console.log(
          `⚠️ [${SYMBOL}] Не удалось собрать все данные с биржи. Пропускаем тик...`,
        );
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }
      const currentPrice = channel.bestBid;
      const coinValueInUsdt = coinBalance * currentPrice;

      // ==========================================
      // 2. АНАЛИЗ СОСТОЯНИЯ И ПРИНЯТИЕ РЕШЕНИЙ
      // ==========================================
      if (currentBuyOrder.length > 0) {
        for (const order of currentBuyOrder) {
          const buyAgeMinutes = Date.now() - order.time;
          if (buyAgeMinutes >= ORDER_TIMEOUT_MS) {
            console.log(
              `⏰ [${SYMBOL}] Ордер BUY висит больше 3 минут без полного налива. Отменяем.`,
            );
            await cancelOrder(order.orderId, SYMBOL);
          }
        }
      }

      if (currentSellOrder.length > 0) {
        for (const order of currentSellOrder) {
          const tpAge = Date.now() - order.time;
          if (tpAge >= ORDER_TIMEOUT_MS) {
            console.log(
              `⏰ [${SYMBOL}] ТР висит больше 3 минут. Отменяем для перестановки по новому каналу.`,
            );
            await cancelOrder(order.orderId, SYMBOL);
          }
        }
      }
      if (currentSellOrder.length > 0) {
        const stopPrice = currentSellOrder[0].price * (1 - STOP_LOSS_PCT / 100);
        if (currentPrice <= stopPrice) {
          console.log(
            `🚨 [${SYMBOL}] СТОП-ЛОСС! Цена ${currentPrice} <= ${stopPrice}. Экстренно выходим по рынку.`,
          );
          for (const order of currentBuyOrder) {
            await cancelOrder(order.orderId, SYMBOL);
          }
          await placeMarketSell(coinBalance, SYMBOL);
          console.log(`😴 [${SYMBOL}] Пауза после стоп-лосса.`);
          await sleep(INTERVAL_AFTER_STOPLOSS_MS);
          continue;
        }
      }
      if (coinValueInUsdt >= MIN_NOTIONAL ) { 
        const sellOrder = await placeLimitOrder(
          "SELL",
          channel.targetSellPrice,
          coinBalance.toString(),
          SYMBOL,
          PRICE_STEP,
        );
        if (sellOrder?.orderId) {
          console.log(
            `💰 [${SYMBOL}] Выставлен Тейк-Профит на ${coinBalance} ${ASSET_NAME} по цене ${channel.targetSellPrice}`,
          );
        }
      }

      if ( usdtBalance >= MIN_NOTIONAL) {
        const usdt_to_trade = Math.min(usdtBalance, USDT_QUANTITY);
        const coinQty = (usdt_to_trade * 0.99) / channel.targetBuyPrice;
        const decimals_qty = QTY_STEP.toString().split(".")[1]?.length || 0;
        const formatedQty = coinQty.toFixed(decimals_qty);
        const order = await placeLimitOrder(
          "BUY",
          channel.targetBuyPrice,
          formatedQty,
          SYMBOL,
          PRICE_STEP,
        );
        if (order?.orderId) {
          console.log(
            `🛒 [${SYMBOL}] Выставили новый ордер BUY по цене ${channel.targetBuyPrice}`,
          );
        }
      }
    } catch (error) {
      console.error(`💥 Критическая ошибка в цикле тика для ${SYMBOL}:`, error);
    }

    await sleep(TRADE_INTERVAL_MS);
  }
}
