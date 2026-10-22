import { client } from "./client";

export async function getAssetBalance(
  assetName: string,
): Promise<{ coinBalance: number; usdtBalance: number }> {
  try {
    // Для Единого торгового аккаунта (UTA) используем 'UNIFIED'. 
    // Если у вас старый классический аккаунт, замените 'UNIFIED' на 'SPOT'
    const response = await client.getWalletBalance({
      accountType: "UNIFIED", 
      coin: `${assetName},USDT`,
    });

    // Проверяем успешность ответа от Bybit (retCode === 0)
    if (response.retCode !== 0 || !response.result?.list?.[0]?.coin) {
      console.error("Ошибка API Bybit:", response.retMsg);
      return { coinBalance: 0, usdtBalance: 0 };
    }

    const coinsList = response.result.list[0].coin;

    const asset = coinsList.find((c: any) => c.coin === assetName);
    const usdt = coinsList.find((c: any) => c.coin === "USDT");

    return {
      // walletBalance — общий баланс монеты на аккаунте
      // Если вам нужен только доступный баланс для торговли (минус заблокированный в ордерах), 
      // используйте поле 'availableToWithdraw' вместо 'walletBalance'
      coinBalance: asset ? parseFloat(asset.walletBalance) : 0,
      usdtBalance: usdt ? parseFloat(usdt.walletBalance) : 0,
    };
  } catch (e: any) {
    console.error(`Ошибка при получении баланса ${assetName}:`, e.message || e);
    return { coinBalance: 0, usdtBalance: 0 };
  }
}
