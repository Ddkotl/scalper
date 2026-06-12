import * as dotenv from "dotenv";

dotenv.config();

export const API_KEY = process.env.MEXC_API_KEY || "";
export const SECRET_KEY = process.env.MEXC_SECRET_KEY || "";

if (!API_KEY || !SECRET_KEY) {
  console.error(
    "❌ Ошибка: Укажите ключи MEXC_API_KEY и MEXC_SECRET_KEY в файле .env",
  );
  process.exit(1);
}

export const SYMBOL = "PLBUSDT"; // Торговая пара (можно подстроить под конкретную пару)
export const QUANTITY = 6; // Количество монет для покупки (можно подстроить под конкретную пару)
export const PRICE_STEP = 0.0001; // Шаг цены для расчета целевых уровней (можно подстроить под конкретную пару)
export const STOP_LOSS_PCT = 0.3; // Процент для стоп-лосса от цены покупки (0.3% = 0.003)
export const MIN_NOTIONAL = 1.1; // Минимальная стоимость ордера в USDT для торговли (с запасом)
export const TRADE_INTERVAL_MS = 5000; // Интервал между итерациями торгового цикла (5 секунд)
export const INTERVAL_AFTER_STOPLOSS_MS = 10 * 60 * 1000; // Интервал паузы после срабатывания стоп-лосса (10 минут)
export const ORDER_TIMEOUT_MS = 3 * 60 * 1000; // Время в миллисекундах, после которого ордер считается "зависшим" (3 минуты)
export const ASSET_NAME = SYMBOL.replace("USDT", "");
