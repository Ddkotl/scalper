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

export const SYMBOL = "PLBUSDT";
export const QUANTITY = 6;
export const PRICE_STEP = 0.0001;
export const STOP_LOSS_PCT = 0.3;
