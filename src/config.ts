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
  SELL_RANGE: number;
  BUY_RANGE: number;
  MIN_NOTIONAL: number;
  ASSET_NAME: string;
  TRADE_INTERVAL_MS: number;
  INTERVAL_AFTER_STOPLOSS_MS: number;
  ORDER_TIMEOUT_MS: number;

  ANALIZE_INTERVAL_MIN: number; // Необязательный параметр, если нужно изменить интервал анализа
  LOOCAL_LOOKBACK: number;
  MIN_RANGE_PCT: number; // Необязательный параметр для минимального диапазона в процентах
  MAX_RANGE_PCT: number; // Необязательный параметр для максимального диапазона в процентах
  MAX_TREND_FACTOR: number; // Необязательный параметр для максимального трендового фактора
}

export const COINS_CONFIG: CoinConfig[] = [
  // {
  //   SYMBOL: "CTPUSDT",
  //   USDT_QUANTITY: 3,
  //   QTY_STEP: 0.01,
  //   PRICE_STEP: 0.0000001,
  //   STOP_LOSS_PCT: 2,
  //   SELL_RANGE: 0.9,
  //   BUY_RANGE: 0.1,
  //   MIN_NOTIONAL: 1.1,
  //   ASSET_NAME: "CTP",
  //   TRADE_INTERVAL_MS: 3000,
  //   INTERVAL_AFTER_STOPLOSS_MS: 2 * 60 * 60 * 1000,
  //   ORDER_TIMEOUT_MS: 5 * 60 * 1000,

  //   ANALIZE_INTERVAL_MIN: 15,
  //   LOOCAL_LOOKBACK: 1,
  //   MIN_RANGE_PCT: 0,
  //   MAX_RANGE_PCT: 1.2,
  //   MAX_TREND_FACTOR: 0.6,
  // },
  //   {
  //   SYMBOL: "PLBUSDT",
  //   USDT_QUANTITY: 3,
  //   QTY_STEP: 0.01,
  //   PRICE_STEP: 0.0001,
  //   STOP_LOSS_PCT: 2,
  //   SELL_RANGE: 0.6,
  //   BUY_RANGE: 0.1,
  //   MIN_NOTIONAL: 1.1,
  //   ASSET_NAME: "PLB",
  //   TRADE_INTERVAL_MS: 3000,
  //   INTERVAL_AFTER_STOPLOSS_MS: 2 * 60 * 60 * 1000,
  //   ORDER_TIMEOUT_MS: 5 * 60 * 1000,

  //   ANALIZE_INTERVAL_MIN: 30,
  //   LOOCAL_LOOKBACK: 15,
  //   MIN_RANGE_PCT: 0,
  //   MAX_RANGE_PCT: 1.2,
  //   MAX_TREND_FACTOR: 0.5,
  // },
  // {
  //   SYMBOL: "CORNUSDT",
  //   USDT_QUANTITY: 3,
  //   QTY_STEP: 0.01,
  //   PRICE_STEP: 0.00001,
  //   STOP_LOSS_PCT: 2,
  //   SELL_RANGE: 1,
  //   BUY_RANGE: 0.1,
  //   MIN_NOTIONAL: 1.1,
  //   ASSET_NAME: "CORN",
  //   TRADE_INTERVAL_MS: 3000,
  //   INTERVAL_AFTER_STOPLOSS_MS: 2 * 60 * 60 * 1000,
  //   ORDER_TIMEOUT_MS: 10 * 60 * 1000,

  //   ANALIZE_INTERVAL_MIN: 15,
  //   LOOCAL_LOOKBACK: 1,
  //   MIN_RANGE_PCT: 0,
  //   MAX_RANGE_PCT: 1.2,
  //   MAX_TREND_FACTOR: 0.5,
  // },
  // {
  //   SYMBOL: "NXTUSDT",
  //   USDT_QUANTITY: 3,
  //   QTY_STEP: 0.01,
  //   PRICE_STEP: 0.00001,
  //   STOP_LOSS_PCT: 3,
  //   SELL_RANGE: 0.7,
  //   BUY_RANGE: 0.1,
  //   MIN_NOTIONAL: 1.1,
  //   ASSET_NAME: "NXT",
  //   TRADE_INTERVAL_MS: 3000,
  //   INTERVAL_AFTER_STOPLOSS_MS: 2 * 60 * 60 * 1000,
  //   ORDER_TIMEOUT_MS: 10 * 60 * 1000,

  //   ANALIZE_INTERVAL_MIN: 30,
  //   LOOCAL_LOOKBACK: 15,
  //   MIN_RANGE_PCT: 0,
  //   MAX_RANGE_PCT: 5.0,
  //   MAX_TREND_FACTOR: 0.7,
  // },
  {
    SYMBOL: "SLIMEXUSDT",
    USDT_QUANTITY: 100,
    QTY_STEP: 0.01,
    PRICE_STEP: 0.000001,
    STOP_LOSS_PCT: 3,
    SELL_RANGE: 0.8,
    BUY_RANGE: 0.3,
    MIN_NOTIONAL: 1.1,
    ASSET_NAME: "SLIMEX",
    TRADE_INTERVAL_MS: 3000,
    INTERVAL_AFTER_STOPLOSS_MS: 2 * 60 * 60 * 1000,
    ORDER_TIMEOUT_MS: 3 * 60 * 1000,

    ANALIZE_INTERVAL_MIN: 10,
    LOOCAL_LOOKBACK: 2,
    MIN_RANGE_PCT: 0,
    MAX_RANGE_PCT: 2.0,
    MAX_TREND_FACTOR: 0.7,
  },
];

//SEDAUSDT спред
//aix отскок
