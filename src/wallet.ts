import { client } from "./client";

export async function getAssetBalance(assetName: string): Promise<number> {
  try {
    const accountInfo = await client.accountInfo();
    if (!accountInfo?.balances) return 0;

    const asset = accountInfo.balances.find((b: any) => b.asset === assetName);
    return asset ? parseFloat(asset.free) : 0;
  } catch (e: any) {
    console.error(`Ошибка при получении баланса ${assetName}:`, e.message || e);
    return 0;
  }
}