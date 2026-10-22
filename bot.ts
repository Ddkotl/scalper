import { COINS_CONFIG } from "./src/config";
import { tradeLoop } from "./src/strategy";
import { sleep } from "./src/utils";

async function startMultiBot() {
  console.log(`[Bybit V5] Бот инициализирует торговлю для ${COINS_CONFIG.length} пар...`);

  // Запуск независимого цикла для каждой монеты параллельно
  // Задержка в 4.4 секунды между парами защищает от Rate Limit на старте
  const tradingPromises = COINS_CONFIG.map(async (coinConfig, index) => {
    await sleep(index * 4444);
    return tradeLoop(coinConfig);
  });

  await Promise.all(tradingPromises);
}

startMultiBot();
