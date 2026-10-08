export interface CategoryRule {
  pattern: RegExp;
  category: string;
}

export class TransactionCategorizer {
  private static defaultRules: CategoryRule[] = [
    // Продукты
    { pattern: /(magnum|магнум|small|гастроном|супермаркет|продукты|galmart|spar|диона|fix price)/i, category: 'Продукты' },
    // Рестораны и Кафе
    { pattern: /(dodo|додо|mcdonalds|kfc|burger king|кофейня|coffee|starbucks|paul|bahandi|ресторан|кафе|пицца|sushi|суши|столовая)/i, category: 'Рестораны' },
    // Такси
    { pattern: /(yandex\.?go|яндекс\.?такси|yandex taxi|indriver|inDrive|uberdriver|такси)/i, category: 'Такси' },
    // Топливо и АЗС
    { pattern: /(азс|qazaq oil|helios|гелиос|sinooil|синойл|compass|компас|газпромнефть|топливо|бензин)/i, category: 'Топливо' },
    // Автомобиль
    { pattern: /(автомойка|сто|шиномонтаж|автозапчасти|парковка|паркинг|kolesa\.kz|авто)/i, category: 'Автомобиль' },
    // Связь и Интернет
    { pattern: /(kcell|activ|актив|beeline|билайн|tele2|теле2|altel|алтел|казахтелеком|интернет|баланс)/i, category: 'Связь' },
    // Коммунальные услуги
    { pattern: /(алсеко|ивц|коммуналка|коммунальные|электроэнергия|алматы су|астана-рэк|отопление|кск|оси)/i, category: 'Коммунальные услуги' },
    // Здоровье и Аптека
    { pattern: /(аптека|еврофарма|биосфера|садыхан|клиника|стоматология|анализы|инвитро|олимп|invitro|olymp)/i, category: 'Здоровье' },
    // Развлечения и Подписки
    { pattern: /(kinopark|cinema|chaplin|кино|кинотеатр|netflix|spotify|apple|google play|youtube|яндекс плюс)/i, category: 'Развлечения' },
    // Покупки и Одежда
    { pattern: /(kaspi red|kaspi магазин|wildberries|вайлдберриз|ozon|озон|zara|h&m|lc waikiki|спортмастер|покупка)/i, category: 'Покупки' },
    // Банковские комиссии
    { pattern: /(комиссия|годовое обслуживание|смс информирование|sms|fee)/i, category: 'Банковские комиссии' },
    // Кредиты
    { pattern: /(погашение кредита|кредит|займ|рассрочка)/i, category: 'Кредиты' },
    // Переводы
    { pattern: /(перевод|p2p|перевод клиенту|перевод на карту)/i, category: 'Переводы' }
  ];

  /**
   * Categorizes transaction based on merchant, description, and custom user rules
   */
  public static categorize(
    description: string,
    merchant?: string,
    customRules?: { pattern: string; targetCategory: string }[]
  ): string {
    const textToMatch = `${merchant || ''} ${description}`.trim().toLowerCase();

    // 1. Check custom user rules first (priority!)
    if (customRules && customRules.length > 0) {
      for (const rule of customRules) {
        try {
          const reg = new RegExp(rule.pattern, 'i');
          if (reg.test(textToMatch)) {
            return rule.targetCategory;
          }
        } catch {
          // ignore invalid regex
        }
      }
    }

    // 2. Built-in pattern matching
    for (const rule of this.defaultRules) {
      if (rule.pattern.test(textToMatch)) {
        return rule.category;
      }
    }

    return 'Другое';
  }
}
