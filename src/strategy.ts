import type { CoinConfig } from "./config";
import { analyzeMarket } from "./analize_market";
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
    INTERVAL_AFTER_STOPLOSS_MS,
    ORDER_TIMEOUT_MS,
    TRADE_INTERVAL_MS,
    ANALIZE_INTERVAL_MIN,
    MAX_RANGE_PCT,
    MAX_TREND_FACTOR,
    MIN_RANGE_PCT,
    BUY_RANGE,
    SELL_RANGE,
    LOOCAL_LOOKBACK,
  } = config;

  console.log(`🚀 Робот запущен для пары ${SYMBOL} в Stateless-режиме.`);

  while (true) {
    try {
      // ==========================================
      // 1. СБОР СВЕЖИХ ДАННЫХ С СЕРВЕРА
      // ==========================================
      const market = await analyzeMarket(
        SYMBOL,
        ANALIZE_INTERVAL_MIN,
        LOOCAL_LOOKBACK,
        MIN_RANGE_PCT,
        MAX_RANGE_PCT,
        MAX_TREND_FACTOR,
      );

      if (!market) continue;
      const { currentBuyOrder, currentSellOrder } = await getOpenOrders(SYMBOL);
      const { coinBalance, usdtBalance } = await getAssetBalance(ASSET_NAME);

      if (coinBalance === null || usdtBalance === null) {
        console.log(
          `⚠️ [${SYMBOL}] Не удалось собрать все данные с биржи. Пропускаем тик...`,
        );
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }
      const currentPrice = market.currentPrice;
      const coinValueInUsdt = coinBalance * currentPrice;
      const usdtToBuyOrders = currentBuyOrder.reduce(
        (sum: number, order: { origQty: string; price: string }) =>
          sum + Number(order.origQty) * Number(order.price),
        0,
      );
      const usdtToSellOrders = currentSellOrder.reduce(
        (sum: number, order: { origQty: string; price: string }) =>
          sum + Number(order.origQty) * Number(order.price),
        0,
      );
      // ==========================================
      // 2. АНАЛИЗ СОСТОЯНИЯ И ПРИНЯТИЕ РЕШЕНИЙ
      // ==========================================
      if (currentSellOrder.length > 0) {
        const stopPrice = currentSellOrder.price * (1 - STOP_LOSS_PCT / 100);
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

      if (coinValueInUsdt >= MIN_NOTIONAL) {
        let targetSellPrice =
          market.localMinPrice + market.localRange * SELL_RANGE;
        const minAllowedSellPrice = market.currentPrice + PRICE_STEP;
        if (targetSellPrice < minAllowedSellPrice) {
          targetSellPrice = minAllowedSellPrice;
        }
        const sellOrder = await placeLimitOrder(
          "SELL",
          targetSellPrice,
          coinBalance.toString(),
          SYMBOL,
          PRICE_STEP,
        );
        if (sellOrder?.orderId) {
          console.log(
            `💰 [${SYMBOL}] Выставлен Тейк-Профит на ${coinBalance} ${ASSET_NAME} по цене ${targetSellPrice}`,
          );
        }
      }

      if (usdtBalance >= MIN_NOTIONAL && market.isSideways) {
        const usdt_to_trade = Math.min(usdtBalance, USDT_QUANTITY);
        if (
        usdt_to_trade-  usdtToBuyOrders - usdtToSellOrders  >
          USDT_QUANTITY
        ) {
          console.log(
            `⚠️ [${SYMBOL}] Превышен лимит на открытые ордера BUY. Пропускаем тик...`,
          );
          await sleep(TRADE_INTERVAL_MS);
          continue;
        }
        const coinQty = (usdt_to_trade * 0.99) / market.currentPrice;
        const decimals_qty = QTY_STEP.toString().split(".")[1]?.length || 0;
        const formatedQty = coinQty.toFixed(decimals_qty);
        let targetBuyPrice =
          market.localMinPrice + market.localRange * BUY_RANGE;
        const maxAllowedBuyPrice = market.currentPrice - PRICE_STEP;
        if (targetBuyPrice > maxAllowedBuyPrice) {
          targetBuyPrice = maxAllowedBuyPrice;
        }
        console.log(
          `📈 [${SYMBOL}] Выставляем ордер BUY на ${formatedQty} ${ASSET_NAME} по цене ${targetBuyPrice}`,
        );
        const order = await placeLimitOrder(
          "BUY",
          targetBuyPrice,
          formatedQty,
          SYMBOL,
          PRICE_STEP,
        );
        if (order?.orderId) {
          console.log(
            `🛒 [${SYMBOL}] Выставили новый ордер BUY по цене ${targetBuyPrice}`,
          );
        }
      }
    } catch (error) {
      console.error(`💥 Критическая ошибка в цикле тика для ${SYMBOL}:`, error);
    }

    await sleep(TRADE_INTERVAL_MS);
  }
}
