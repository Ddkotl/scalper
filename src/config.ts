import * as dotenv from "dotenv";

dotenv.config();

export const API_KEY = process.env.BYBIT_API_KEY || "";
export const SECRET_KEY = process.env.BYBIT_SECRET_KEY || "";

if (!API_KEY || !SECRET_KEY) {
  console.error(
    "❌ Ошибка: Укажите ключи BYBIT_API_KEY и BYBIT_SECRET_KEY в файле .env",
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
  SELL_RANGE: number;
  BUY_RANGE: number;
  MIN_NOTIONAL: number;
  ASSET_NAME: string;
  TRADE_INTERVAL_MS: number;
  INTERVAL_AFTER_STOPLOSS_MS: number;
  ORDER_TIMEOUT_MS: number;

  ANALIZE_INTERVAL_CANDLES: number; // Необязательный параметр, если нужно изменить интервал анализа
  CANDLES_INTERVAL: string; // Необязательный параметр, если нужно изменить интервал свечей для анализа
  LOOCAL_LOOKBACK: number;
  MIN_RANGE_PCT: number; // Необязательный параметр для минимального диапазона в процентах
  MAX_RANGE_PCT: number; // Необязательный параметр для максимального диапазона в процентах
  MAX_TREND_FACTOR: number; // Необязательный параметр для максимального трендового фактора
}

export const COINS_CONFIG: CoinConfig[] = [
  // {
  //   SYMBOL: "PLBUSDT",
  //   USDT_QUANTITY: 10,
  //   QTY_STEP: 0.01,
  //   PRICE_STEP: 0.0001,
  //   STOP_LOSS_PCT: 2,
  //   SELL_RANGE: 0.55,
  //   BUY_RANGE: 0.45,
  //   MIN_NOTIONAL: 1.1,
  //   ASSET_NAME: "PLB",
  //   TRADE_INTERVAL_MS: 3000,
  //   INTERVAL_AFTER_STOPLOSS_MS: 5 * 60 * 60 * 1000,
  //   ORDER_TIMEOUT_MS: 3 * 60 * 1000,
  //   ANALIZE_INTERVAL_CANDLES: 15,
  //   CANDLES_INTERVAL: "1",
  //   LOOCAL_LOOKBACK: 3,
  //   MIN_RANGE_PCT: 0,
  //   MAX_RANGE_PCT: 5,
  //   MAX_TREND_FACTOR: 0.95,
  // },
  // {
  //   SYMBOL: "CORNUSDT",
  //   USDT_QUANTITY: 150,
  //   QTY_STEP: 0.01,
  //   PRICE_STEP: 0.00001,
  //   STOP_LOSS_PCT: 4,
  //   SELL_RANGE: 0.7,
  //   BUY_RANGE: 0.2,
  //   MIN_NOTIONAL: 1.1,
  //   ASSET_NAME: "CORN",
  //   TRADE_INTERVAL_MS: 60000,
  //   INTERVAL_AFTER_STOPLOSS_MS: 5 * 60 * 60 * 1000,
  //   ORDER_TIMEOUT_MS: 30 * 60 * 1000,
  //   ANALIZE_INTERVAL_CANDLES: 500,
  //   CANDLES_INTERVAL: "1",
  //   LOOCAL_LOOKBACK: 500,
  //   MIN_RANGE_PCT: 0,
  //   MAX_RANGE_PCT: 10,
  //   MAX_TREND_FACTOR: 0.99,
  // },
    {
    SYMBOL: "ZKJUSDT",
    USDT_QUANTITY: 2,
    QTY_STEP: 0.01,
    PRICE_STEP: 0.000001,
    STOP_LOSS_PCT: 4,
    SELL_RANGE: 0.7,
    BUY_RANGE: 0.2,
    MIN_NOTIONAL: 1.1,
    ASSET_NAME: "ZKJ",
    TRADE_INTERVAL_MS: 60000,
    INTERVAL_AFTER_STOPLOSS_MS: 5 * 60 * 60 * 1000,
    ORDER_TIMEOUT_MS: 30 * 60 * 1000,
    ANALIZE_INTERVAL_CANDLES: 500,
    CANDLES_INTERVAL: "1",
    LOOCAL_LOOKBACK: 500,
    MIN_RANGE_PCT: 0,
    MAX_RANGE_PCT: 10,
    MAX_TREND_FACTOR: 0.99,
  },
];
