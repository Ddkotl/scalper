import { Spot } from "mexc-api-sdk";
import * as dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.MEXC_API_KEY || "";
const SECRET_KEY = process.env.MEXC_SECRET_KEY || "";

if (!API_KEY || !SECRET_KEY) {
  console.error(
    "❌ Ошибка: Укажите ключи MEXC_API_KEY и MEXC_SECRET_KEY в файле .env",
  );
  process.exit(1);
}
// Инициализируем клиент SDK
const client = new Spot(API_KEY, SECRET_KEY);

// Настройки торговой стратегии
const SYMBOL = "PLBUSDT";
const QUANTITY = 6; // Минимальный объем для тестов
const PRICE_STEP = 0.0001; // Шаг цены для монеты PLBUSDT
const STOP_LOSS_PCT = 0.2; // Защитный стоп-лосс в процентах

interface ChannelData {
  lowerBound: number;
  midPrice: number;
  targetBuyPrice: number;
  targetSellPrice: number;
}

// Получение реального свободного баланса монеты на спотовом кошельке
async function getAssetBalance(assetName: string): Promise<number> {
  try {
    const accountInfo = await client.accountInfo();
    if (!accountInfo || !accountInfo.balances) return 0;

    // Ищем строку с нашей монетой (например, "PLB")
    const asset = accountInfo.balances.find((b: any) => b.asset === assetName);
    return asset ? parseFloat(asset.free) : 0;
  } catch (e: any) {
    console.error(
      `Ошибка при получении баланса кошелька ${assetName}:`,
      e.message || e,
    );
    return 0;
  }
}

// Расчет параметров канала
async function getChannelBounds(): Promise<ChannelData | null> {
  try {
    const endTime = Date.now();
    const startTime = endTime - 30000; // 15 секунд назад

    // ИСПРАВЛЕНО: client.bookTicker принимает СТРОКУ, а client.trades принимает (строку, объект)
    const [tradesData, tickerData] = await Promise.all([
      client.trades(SYMBOL, { limit: 100 }),
      client.bookTicker(SYMBOL),
    ]);

    if (!tradesData || !Array.isArray(tradesData) || !tradesData.length)
      return null;
    if (!tickerData || !tickerData.bidPrice || !tickerData.askPrice)
      return null;

    const bestBid = parseFloat(tickerData.bidPrice); // Лучший покупатель в стакане
    const bestAsk = parseFloat(tickerData.askPrice); // Лучший продавец в стакане

    // Отбираем трейды за последние 15 секунд
    const recentTrades = tradesData.filter(
      (trade: any) => trade.time >= startTime && trade.time <= endTime,
    );
    const tradesToAnalyze =
      recentTrades.length > 0
        ? recentTrades
        : [tradesData[tradesData.length - 1]];

    // ИСПРАВЛЕНО: Правильный обход массива объектов сделок
    let minPrice = parseFloat(tradesToAnalyze[0].price);
    let maxPrice = parseFloat(tradesToAnalyze[0].price);

    for (const trade of tradesToAnalyze) {
      const price = parseFloat(trade.price);
      if (isNaN(price)) continue;
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    }

    // Логика: покупка от минимума + 1 шаг, продажа посередине
    let targetBuyPrice = minPrice + PRICE_STEP;
    const midPrice = (minPrice + maxPrice) / 2;
    let targetSellPrice = midPrice + PRICE_STEP; // Тейк-Профит чуть выше середины

    // Защита от Taker-исполнения: лимитка на покупку не должна быть на уровне или выше Ask
    if (targetBuyPrice >= bestAsk) {
      targetBuyPrice = bestBid;
    }

    // Гарантируем, что тейк-профит будет выше покупки хотя бы на 1 шаг цены
    if (targetSellPrice <= targetBuyPrice) {
      targetSellPrice = targetBuyPrice + PRICE_STEP;
    }

    return {
      lowerBound: minPrice,
      midPrice,
      targetBuyPrice,
      targetSellPrice,
    };
  } catch (error: any) {
    console.error(
      "⚠️ Ошибка при получении рыночных данных:",
      error.message || error,
    );
    return null;
  }
}

// Выставление лимитного ордера через SDK
async function placeOrder(
  side: "BUY" | "SELL",
  price: number,
  quantity: number,
) {
  const stepStr = PRICE_STEP.toString();
  const decimals = stepStr.includes(".") ? stepStr.split(".")[1]?.length : 0;
  const formattedPrice = price.toFixed(decimals);

  console.log(
    `[Ордер] Отправка ${side} по цене ${formattedPrice}, объем: ${quantity}`,
  );

  try {
    // Создание ордера через SDK
    const order = await client.newOrder(SYMBOL, side, "LIMIT", {
      quantity: quantity.toString(),
      price: formattedPrice,
      timeInForce: "GTC",
    });
    return order;
  } catch (error: any) {
    console.error(
      `❌ Ошибка при отправке ордера ${side}:`,
      error.message || error,
    );
    return null;
  }
}

// Бесконечный торговый цикл
async function tradeLoop() {
  let inPosition = false;
  let buyOrderId = null;
  let sellOrderId = null;
  let entryPrice = 0;
  let buyOrderTimestamp = 0;

  const ASSET_NAME = SYMBOL.replace("USDT", "");

  console.log("=== Бот на базе MEXC SDK успешно перезапущен ===");

  while (true) {
    const channel = await getChannelBounds();
    if (!channel || isNaN(channel.targetBuyPrice)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }

    const stepStr = PRICE_STEP.toString();
    const decimals = stepStr.includes(".") ? stepStr.split(".")[1]?.length : 4;

    // 1. Попытка входа в сделку
    if (!inPosition && !buyOrderId && !sellOrderId) {
      const targetBuyPrice = channel.targetBuyPrice;
      const expectedStopPrice = targetBuyPrice * (1 - STOP_LOSS_PCT / 100);

      console.log(
        `[Канал] Мин 15с: ${channel.lowerBound.toFixed(decimals)} | ` +
          `Вход: ${targetBuyPrice.toFixed(decimals)} | ` +
          `Выход (TP): ${channel.targetSellPrice.toFixed(decimals)} | ` +
          `План Стопа: ${expectedStopPrice.toFixed(decimals)}`,
      );

      const order = await placeOrder("BUY", targetBuyPrice, QUANTITY);
      if (order && order.orderId) {
        buyOrderId = order.orderId;
        entryPrice = targetBuyPrice;
        buyOrderTimestamp = Date.now();
        console.log(
          `Лимитный ордер на покупку успешно выставлен. ID: ${buyOrderId}`,
        );
      }
    }

    // Сброс зависшего ордера по времени или расстоянию (ДОБАВЛЕН ФИЛЬТР НА 1 USDT)
    if (buyOrderId && !inPosition) {
      const orderAgeSeconds = (Date.now() - buyOrderTimestamp) / 1000;
      const priceDeviation = channel.targetBuyPrice - entryPrice;

      if (orderAgeSeconds >= 60 || priceDeviation > PRICE_STEP * 2) {
        console.log(`⏳ Сброс зависшего ордера на покупку...`);
        try {
          await client.cancelOrder(SYMBOL, { orderId: buyOrderId });
          console.log(`Ордер ${buyOrderId} отменен.`);

          const currentWalletBalance = await getAssetBalance(ASSET_NAME);

          if (currentWalletBalance > 0) {
            const takeProfitPrice = channel.targetSellPrice;
            // Вычисляем примерную стоимость остатка на балансе в USDT
            const estimatedValueUSDT = currentWalletBalance * takeProfitPrice;

            // ИСПРАВЛЕНИЕ: Если стоимость меньше 1.05 USDT, игнорируем её
            if (estimatedValueUSDT < 1.05) {
              console.log(
                `⚠️ На балансе пыль: ${currentWalletBalance} ${ASSET_NAME} (~${estimatedValueUSDT.toFixed(2)} USDT). Это меньше лимита биржи 1 USDT. Игнорируем и идем дальше.`,
              );
              buyOrderId = null;
              entryPrice = 0;
              continue;
            }

            console.log(
              `⚠️ На балансе обнаружен крупный остаток ${currentWalletBalance} ${ASSET_NAME}. Выставляем Тейк-Профит.`,
            );
            inPosition = true;
            buyOrderId = null;

            const sellOrder = await placeOrder(
              "SELL",
              takeProfitPrice,
              currentWalletBalance,
            );
            if (sellOrder && sellOrder.orderId) sellOrderId = sellOrder.orderId;
            continue;
          }
        } catch (e: any) {
          console.error("Не удалось отменить ордер:", e.message || e);
        }

        buyOrderId = null;
        continue;
      }
    }

    // 2. Ожидание полного исполнения ордера на покупку (ДОБАВЛЕН ФИЛЬТР НА 1 USDT)
    if (buyOrderId && !inPosition) {
      try {
        const orderStatus = await client.queryOrder(SYMBOL, {
          orderId: buyOrderId,
        });

        if (orderStatus && orderStatus.status === "FILLED") {
          console.log(`🎉 Покупка ИСПОЛНЕНА.`);
          inPosition = true;
          buyOrderId = null;

          const walletBalance = await getAssetBalance(ASSET_NAME);
          const takeProfitPrice = channel.targetSellPrice;
          const estimatedValueUSDT = walletBalance * takeProfitPrice;

          // ИСПРАВЛЕНИЕ: Защитная проверка стоимости при штатном исполнении
          if (walletBalance > 0 && estimatedValueUSDT >= 1.05) {
            const sellOrder = await placeOrder(
              "SELL",
              takeProfitPrice,
              walletBalance,
            );
            if (sellOrder && sellOrder.orderId) {
              sellOrderId = sellOrder.orderId;
              console.log(
                `Лимитный ордер на продажу (TP) выставлен на весь баланс. ID: ${sellOrderId}`,
              );
            }
          } else {
            console.log(
              `⚠️ Объем на балансе (${walletBalance} ${ASSET_NAME} ~${estimatedValueUSDT.toFixed(2)} USDT) слишком мал для создания Тейк-Профита. Пропускаем позицию.`,
            );
            inPosition = false;
            entryPrice = 0;
          }
        } else if (
          orderStatus &&
          (orderStatus.status === "CANCELED" ||
            orderStatus.status === "REJECTED")
        ) {
          console.log("Ордер на покупку был отменен или отклонен биржей.");
          buyOrderId = null;
        }
      } catch (e: any) {
        console.error(
          "Ошибка проверки статуса ордера на покупку:",
          e.message || e,
        );
      }
    }

    // 3. Ожидание исполнения Тейк-Профита
    if (sellOrderId && inPosition) {
      try {
        const orderStatus = await client.queryOrder(SYMBOL, {
          orderId: sellOrderId,
        });

        if (orderStatus && orderStatus.status === "FILLED") {
          console.log("💰 Тейк-Профит ИСПОЛНЕН! Позиция полностью закрыта.");
          inPosition = false;
          sellOrderId = null;
          entryPrice = 0;
        } else if (
          orderStatus &&
          (orderStatus.status === "CANCELED" ||
            orderStatus.status === "REJECTED")
        ) {
          console.log("🚨 Тейк-Профит был отменен или отклонен!");
          inPosition = false;
          sellOrderId = null;
          entryPrice = 0;
        }
      } catch (e: any) {
        console.error(
          "Ошибка проверки статуса ордера на продажу:",
          e.message || e,
        );
      }
    }

    // 4. Контроль РЕАЛЬНОГО стоп-лосса по моментальному стакану
    if (inPosition && sellOrderId) {
      const stopLossPrice = entryPrice * (1 - STOP_LOSS_PCT / 100);

      try {
        const instantTicker = await client.bookTicker(SYMBOL);
        const currentInstantPrice = parseFloat(instantTicker.bidPrice);

        if (currentInstantPrice <= stopLossPrice) {
          console.log(
            `🚨 СТОП-ЛОСС! Цена (${currentInstantPrice}) пробила уровень защиты (${stopLossPrice}).`,
          );

          try {
            await client.cancelOrder(SYMBOL, { orderId: sellOrderId });
            console.log(`Тейк-Профит ${sellOrderId} отменен.`);
          } catch (e) {
            console.error("Не удалось отменить Тейк-Профит при стопе:", e);
          }

          const finalWalletBalance = await getAssetBalance(ASSET_NAME);
          const estimatedValueUSDT = finalWalletBalance * currentInstantPrice;

          // На стоп-лоссе тоже проверяем лимит, чтобы бот не падал в ошибку
          if (finalWalletBalance > 0 && estimatedValueUSDT >= 1.05) {
            console.log(
              `Экстренно продаем весь кошелек: ${finalWalletBalance} ${ASSET_NAME}`,
            );
            await client.newOrder(SYMBOL, "SELL", "MARKET", {
      quantity: balance.toString(),
    });
          } else {
            console.log(
              `Остаток кошелька слишком мелкий для стоп-лосса (~${estimatedValueUSDT.toFixed(2)} USDT). Оставляем как пыль.`,
            );
          }

          inPosition = false;
          sellOrderId = null;
          entryPrice = 0;
          console.log("⏳ Пауза 5 минут после стопа...");
  await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        }
      } catch (tickerError: any) {
        console.error(
          "Ошибка моментального контроля стопа:",
          tickerError.message || tickerError,
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

tradeLoop();
