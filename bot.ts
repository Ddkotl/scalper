import { COINS_CONFIG } from "./src/config";
import { tradeLoop } from "./src/strategy";

async function startMultiBot() {
  console.log(`Бот инициализирует торговлю для ${COINS_CONFIG.length} пар...`);

  // Запуск независимого цикла для каждой монеты параллельно
  const tradingPromises = COINS_CONFIG.map((coinConfig) =>
    tradeLoop(coinConfig),
  );

  await Promise.all(tradingPromises);
}

startMultiBot();
