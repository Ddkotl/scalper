import { client } from "./client";

export async function getAssetBalance(
  assetName: string,
): Promise<{ coinBalance: number; usdtBalance: number }> {
  try {
    const accountInfo = await client.accountInfo();
    if (!accountInfo?.balances) return { coinBalance: 0, usdtBalance: 0 };

    const asset = accountInfo.balances.find((b: any) => b.asset === assetName);
    const usdt = accountInfo.balances.find((b: any) => b.asset === "USDT");

    return {
      coinBalance: asset ? parseFloat(asset.free) : 0,
      usdtBalance: usdt ? parseFloat(usdt.free) : 0,
    };
  } catch (e: any) {
    console.error(`Ошибка при получении баланса ${assetName}:`, e.message || e);
    return { coinBalance: 0, usdtBalance: 0 };
  }
}
