import { RestClientV5 } from "bybit-api";
import { API_KEY, SECRET_KEY } from "./config";

export const client = new RestClientV5({
    key: API_KEY,
    secret: SECRET_KEY,
    testnet: false 
});