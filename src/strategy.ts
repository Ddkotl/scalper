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
import { getLastBuyPrice } from "./trades";

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
    ANALIZE_INTERVAL_CANDLES,
    CANDLES_INTERVAL,
    MAX_RANGE_PCT,
    MAX_TREND_FACTOR,
    MIN_RANGE_PCT,
    BUY_RANGE,
    SELL_RANGE,
    LOOCAL_LOOKBACK,
  } = config;

  console.log(
    `🚀 Робот запущен для пары ${SYMBOL} в Stateless-режиме под Bybit V5.`,
  );

  while (true) {
    try {
      // ==========================================
      // 1. СБОР СВЕЖИХ ДАННЫХ С СЕРВЕРА
      // ==========================================
      const market = await analyzeMarket(
        SYMBOL,
        ANALIZE_INTERVAL_CANDLES,
        LOOCAL_LOOKBACK,
        MIN_RANGE_PCT,
        MAX_RANGE_PCT,
        MAX_TREND_FACTOR,
        CANDLES_INTERVAL,
      );

      if (!market) continue;
      const { currentBuyOrder, currentSellOrder } = await getOpenOrders(SYMBOL);
      const { coinBalance, usdtBalance } = await getAssetBalance(ASSET_NAME);

      if (
        coinBalance === null ||
        usdtBalance === null ||
        currentBuyOrder === null ||
        currentSellOrder === null
      ) {
        console.log(
          `⚠️ [${SYMBOL}] Не удалось собрать все данные с биржи. Пропускаем тик...`,
        );
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }

      // Гарантируем, что если балансы пришли как undefined/null, они станут равны 0
      const safeCoinBalance = coinBalance || 0;

      const currentPrice = market.currentPrice;

      // Теперь тут гарантированно будет число, а не NaN
      const coinValueInUsdt = safeCoinBalance * currentPrice;

      // На Bybit объем ордера лежит в qty, цена в price
      const usdtToBuyOrders = currentBuyOrder.reduce(
        (sum: number, order: { qty: string; price: string }) =>
          sum + Number(order.qty) * Number(order.price),
        0,
      );
      const usdtToSellOrders = currentSellOrder.reduce(
        (sum: number, order: { qty: string; price: string }) =>
          sum + Number(order.qty) * Number(order.price),
        0,
      );

      // ==========================================
      // 2. АНАЛИЗ СОСТОЯНИЯ И ПРИНЯТИЕ РЕШЕНИЙ
      // ==========================================
      if (coinValueInUsdt >= MIN_NOTIONAL) {
        const buyPrice = await getLastBuyPrice(SYMBOL);

        const stopPrice = Number(buyPrice) * (1 - STOP_LOSS_PCT / 100);
        if (currentPrice <= stopPrice) {
          console.log(
            `🚨 [${SYMBOL}] СТОП-ЛОСС! Цена ${currentPrice} <= ${stopPrice}. Экстренно выходим по рынку.`,
          );
          for (const order of currentBuyOrder) {
            await cancelOrder(order.orderId, SYMBOL);
          }
          for (const order of currentSellOrder) {
            await cancelOrder(order.orderId, SYMBOL);
          }

          // Округляем перед экстренным маркет-селлом
          const qtyStepNum = Number(QTY_STEP);
          const decimals_qty =
            qtyStepNum < 1 && qtyStepNum > 0
              ? Math.round(-Math.log10(qtyStepNum))
              : 0;
          const formattedStopQty = safeCoinBalance.toFixed(decimals_qty);

          if (Number(formattedStopQty) > 0) {
            await placeMarketSell(Number(formattedStopQty), SYMBOL); // Передаем число/строку в зависимости от вашей функции
          }

          console.log(`😴 [${SYMBOL}] Пауза после стоп-лосса.`);
          await sleep(INTERVAL_AFTER_STOPLOSS_MS);
          continue;
        }
      }

      // Проверка таймаута лимитных ордеров на покупку
      if (currentBuyOrder.length > 0) {
        for (const order of currentBuyOrder) {
          // Bybit возвращает строку времени в createdTime (мс)
          const buyAgeMinutes = Date.now() - Number(order.createdTime);
          if (buyAgeMinutes >= ORDER_TIMEOUT_MS) {
            console.log(
              `⏰ [${SYMBOL}] Ордер BUY висит слишком долго без полного налива. Отменяем.`,
            );
            await cancelOrder(order.orderId, SYMBOL);
          }
        }
      }

      // Проверка таймаута лимитных ордеров на продажу
      if (currentSellOrder.length > 0) {
        for (const order of currentSellOrder) {
          const tpAge = Date.now() - Number(order.createdTime);
          if (tpAge >= ORDER_TIMEOUT_MS) {
            console.log(
              `⏰ [${SYMBOL}] ТР висит слишком долго. Отменяем для перестановки по новому каналу.`,
            );
            await cancelOrder(order.orderId, SYMBOL);
          }
        }
      }

      // Если есть монеты, выставляем Тейк-Профит (если нет активного ордера на продажу)
      if (coinValueInUsdt >= MIN_NOTIONAL && currentSellOrder.length === 0) {
        let targetSellPrice =
          market.localMinPrice + market.localRange * SELL_RANGE;
        const minAllowedSellPrice = market.currentPrice + PRICE_STEP;
        if (targetSellPrice < minAllowedSellPrice) {
          targetSellPrice = minAllowedSellPrice;
        }

        // --- НОВЫЙ БЛОК: Округляем объем продажи по QTY_STEP ---
               // Находим количество знаков после запятой
        const qtyStepNum = Number(QTY_STEP);
        const decimals_qty = qtyStepNum < 1 && qtyStepNum > 0 
          ? Math.round(-Math.log10(qtyStepNum)) 
          : 0;

        // Жесткое округление ВНИЗ, чтобы никогда не превысить баланс и не плодить лишние знаки
        const factor = Math.pow(10, decimals_qty);
        const formattedSellQty = (Math.floor(safeCoinBalance * factor) / factor).toFixed(decimals_qty);

        if (Number(formattedSellQty) <= 0) {
          console.log(`⚠️ [${SYMBOL}] Слишком маленький баланс для округления вниз (${safeCoinBalance}). Пропускаем...`);
          await sleep(TRADE_INTERVAL_MS);
          continue;
        }


        const sellOrder = await placeLimitOrder(
          "SELL",
          targetSellPrice,
          formattedSellQty, // Передаем округленную строку вместо coinBalance.toString()
          SYMBOL,
          PRICE_STEP,
        );
        if (sellOrder?.orderId) {
          console.log(
            `💰 [${SYMBOL}] Выставлен Тейк-Профит на ${formattedSellQty} ${ASSET_NAME} по цене ${targetSellPrice}`,
          );
        }
      }

      // Логика выставления ордера на покупку во флете
      if (
        usdtBalance >= MIN_NOTIONAL &&
        market.isSideways &&
        currentBuyOrder.length === 0
      ) {
        const usdt_to_trade =
          Math.min(usdtBalance, USDT_QUANTITY) -
          usdtToBuyOrders -
          usdtToSellOrders -
          coinValueInUsdt;
        if (usdt_to_trade < MIN_NOTIONAL) {
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
