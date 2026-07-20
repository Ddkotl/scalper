export async function getKlines(symbol: string, interval = "1m", limit = 15) {
  const url =
    `https://api.mexc.com/api/v3/klines` +
    `?symbol=${symbol}` +
    `&interval=${interval}` +
    `&limit=${limit}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
