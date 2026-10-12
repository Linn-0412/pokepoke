import type { CalculationResult } from '../domain/types'

export function recommendationMessage(result: CalculationResult): string {
  if (!result.best) {
    return '今のおすすめパックはまだありません。デッキとパック情報を入力してください。'
  }
  return `今引くなら ${result.best.packName}。期待枚数は1パックあたり ${result.best.score.toFixed(3)} 枚です。`
}

export function canUseNotificationApi(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function notifyRecommendation(result: CalculationResult): Promise<string> {
  if (!canUseNotificationApi()) {
    return 'このブラウザは通知に対応していません。'
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()

  if (permission !== 'granted') {
    return '通知が許可されませんでした。'
  }

  const message = recommendationMessage(result)
  new Notification('ポケポケおすすめパック', {
    body: message,
  })
  return '通知を送信しました。'
}
