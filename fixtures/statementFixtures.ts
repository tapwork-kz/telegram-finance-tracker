import * as XLSX from 'xlsx';

export function createKaspiFixtureCsv(): string {
  return `Дата;Операция;Сумма;Категория
01.10.2026 10:15;Покупка Magnum Cash&Carry;- 12500,00 ₸;Продукты
02.10.2026 14:20;Оплата Yandex.Go;- 2100,00 ₸;Такси
03.10.2026 19:45;Покупка АЗС Qazaq Oil;- 15000,00 ₸;Топливо
05.10.2026 12:00;Пополнение Kaspi Gold;+ 300000,00 ₸;Пополнение
06.10.2026 18:30;Оплата Dodo Pizza;- 6400,00 ₸;Рестораны
07.10.2026 11:10;Перевод на Halyk Bank;- 50000,00 ₸;Переводы
09.10.2026 21:00;Покупка Small Супермаркет;- 8520,00 ₸;Продукты`;
}

export function createHalykFixtureCsv(): string {
  return `Дата;Контрагент;Дебет;Кредит;Назначение
02.10.2026;ТОО Europharma;4500.00;;Покупка в аптеке
04.10.2026;ТОО Мобильник;5000.00;;Оплата связи Beeline
07.10.2026;Kaspi Bank P2P;;50000.00;Перевод с Kaspi Bank
08.10.2026;ТОО Коммунал Сервис;18200.00;;Оплата коммунальных услуг
09.10.2026;Halyk Bank;500.00;;Комиссия за ведение счета`;
}

export function createBCCFixtureCsv(): string {
  return `Дата;Описание;Сумма;Референс
03.10.2026;Покупка Zara Dostyk Plaza;-24000.00;BCC_TX_1001
05.10.2026;Starbucks Coffee;-3200.00;BCC_TX_1002
08.10.2026;Зачисление зарплаты;+400000.00;BCC_TX_1003
09.10.2026;Обслуживание карты BCC;-800.00;BCC_TX_1004`;
}

export function createAlatauFixtureCsv(): string {
  return `Дата;Операция;Сумма
02.10.2026;Автомойка Alatau;-3500.00
04.10.2026;Супермаркет Galmart;-14300.00
07.10.2026;Кинотеатр Chaplin;-5600.00
09.10.2026;Пополнение депозита;+50000.00`;
}

export function createFreedomFixtureCsv(): string {
  return `Дата;Детали операции;Сумма;Валюта
01.10.2026;Trading commission;-1500.00;KZT
03.10.2026;Kolesa.kz реклама;-4200.00;KZT
06.10.2026;Apple Subscription;-2.99;USD
08.10.2026;Пополнение брокерского счета;+150000.00;KZT`;
}
