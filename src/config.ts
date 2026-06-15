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

// Интерфейс для индивидуальных настроек каждой монеты
export interface CoinConfig {
  SYMBOL: string;
  USDT_QUANTITY: number;
  QTY_STEP: number;
  PRICE_STEP: number;
  STOP_LOSS_PCT: number;
  MIN_NOTIONAL: number;
  ASSET_NAME: string;
  CHANNEL_TIME: number;
  TRADE_INTERVAL_MS: number;
  INTERVAL_AFTER_STOPLOSS_MS: number;
  ORDER_TIMEOUT_MS: number;
}

export const COINS_CONFIG: CoinConfig[] = [
  {
    SYMBOL: "PLBUSDT",
    USDT_QUANTITY: 30,
    QTY_STEP: 0.01,
    PRICE_STEP: 0.0001,
    STOP_LOSS_PCT: 0.5,
    MIN_NOTIONAL: 1.1,
    ASSET_NAME: "PLB",
    CHANNEL_TIME: 60 * 1000,
    TRADE_INTERVAL_MS: 3000,
    INTERVAL_AFTER_STOPLOSS_MS: 15 * 60 * 1000,
    ORDER_TIMEOUT_MS: 3 * 60 * 1000,
  },

];

//corn nibi
