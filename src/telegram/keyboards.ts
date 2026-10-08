export class TelegramKeyboards {
  public static getMainMenu(webAppUrl: string) {
    return {
      keyboard: [
        [{ text: '📊 Dashboard', web_app: { url: webAppUrl } }, { text: '📥 Загрузить выписку' }],
        [{ text: '📋 Текущий период' }, { text: '📊 Отчёт' }],
        [{ text: '💳 Банки' }, { text: '💰 Бюджет' }],
        [{ text: '⚙️ Настройки' }]
      ],
      resize_keyboard: true
    };
  }

  public static getBankSelectionInline(fileId: string) {
    return {
      inline_keyboard: [
        [
          { text: 'Kaspi', callback_data: `bank_select:kaspi:${fileId}` },
          { text: 'Halyk', callback_data: `bank_select:halyk:${fileId}` }
        ],
        [
          { text: 'BCC', callback_data: `bank_select:bcc:${fileId}` },
          { text: 'Alatau', callback_data: `bank_select:alatau:${fileId}` }
        ],
        [
          { text: 'Freedom', callback_data: `bank_select:freedom:${fileId}` }
        ]
      ]
    };
  }

  public static getOpenDashboardInline(webAppUrl: string) {
    return {
      inline_keyboard: [
        [{ text: '📊 Открыть Dashboard', web_app: { url: webAppUrl } }]
      ]
    };
  }

  public static getPeriodConfirmInline(statementId: string) {
    return {
      inline_keyboard: [
        [
          { text: '✅ Да, импортировать', callback_data: `period_confirm:${statementId}:yes` },
          { text: '❌ Отмена', callback_data: `period_confirm:${statementId}:no` }
        ]
      ]
    };
  }
}
