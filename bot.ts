import { COINS_CONFIG } from "./src/config";
import { tradeLoop } from "./src/strategy";
import { sleep } from "./src/utils";

async function startMultiBot() {
  console.log(`Бот инициализирует торговлю для ${COINS_CONFIG.length} пар...`);

  // Запуск независимого цикла для каждой монеты параллельно
  const tradingPromises = COINS_CONFIG.map(async (coinConfig, index) => {
    await sleep(index * 4444);
    return tradeLoop(coinConfig);
  });

  await Promise.all(tradingPromises);
}

startMultiBot();
