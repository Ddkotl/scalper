import { Spot } from "mexc-api-sdk";
import { API_KEY, SECRET_KEY } from "./config";

export const client = new Spot(API_KEY, SECRET_KEY);