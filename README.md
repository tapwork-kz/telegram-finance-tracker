# Telegram Finance Tracker (Personal Finance)

Система персонального финансового учёта на базе **Telegram Bot + Telegram Web App** c автоматическим распознаванием выписок банков Казахстана, декадным финансовым циклом, дедупликацией и сквозной аналитикой.

Полностью развернута в бессерверной инфраструктуре **Cloudflare Workers + D1 Database + R2 Storage + Cron Triggers**.

---

## 🚀 Live Сервисы
* **Telegram Bot**: [@walletbai_bot](https://t.me/walletbai_bot)
* **Cloudflare Worker API**: `https://telegram-finance-tracker.mechtatx.workers.dev`
* **Telegram Web App**: `https://telegram-finance-tracker.mechtatx.workers.dev/app`
* **GitHub Repository**: [https://github.com/tapwork-kz/telegram-finance-tracker](https://github.com/tapwork-kz/telegram-finance-tracker)

---

## 🏦 Поддерживаемые банки Казахстана
1. **Kaspi Bank** (PDF со шрифтовыми таблицами CID/CMap, XLSX, CSV, TXT)
2. **Halyk Bank** (XLSX, XLS, CSV)
3. **Банк ЦентрКредит (BCC)** (XLSX, CSV)
4. **Alatau City Bank** (XLSX, CSV)
5. **Freedom Bank** (XLSX, CSV, мультивалютный учёт KZT / USD / EUR / RUB)

Каждый банк реализован через изолированный адаптер `StatementParser`.

---

## 📅 Декадный финансовый цикл (Asia/Almaty UTC+5)
- **Декада 1**: с 1 по 9 число 23:59:59 (запрос выписок 10-го числа).
- **Декада 2**: с 10 по 19 число 23:59:59 (запрос выписок 20-го числа).
- **Декада 3**: с 20 по последний день месяца 23:59:59 (запрос выписок 1-го числа следующего месяца).

---

## 💡 Ключевые возможности
* **Автоматическое распознавание банка** по структуре файла, заголовкам и содержимому с ручным fallback-меню.
* **Устойчивая дедупликация**: composite hash SHA-256 (`external_hash`) исключает повторный импорт одной и той же операции.
* **Внутренние переводы**: выявление переводов между собственными счетами (Kaspi ⇄ Halyk и др.) и исключение их из общих расходов и доходов.
* **Автокатегоризация**: гибкие правила для мерчантов Казахстана (Magnum, Compass, Yandex Go, Altel и др.) с приоритетом пользовательских правил.
* **Telegram Web App / Mini App**: интерактивный мобильный интерфейс с диаграммами Chart.js (Donut по категориям, Bar по банкам, фильтрация по декадам и месяцу).
* **Автоматические напоминания**: Cloudflare Cron Triggers с интервалом `STATEMENT_REMINDER_INTERVAL_HOURS` для недостающих банков.

---

## 🛠 Технологический стек
* **Runtime**: Cloudflare Workers (ES Modules, TypeScript)
* **База данных**: Cloudflare D1 (SQLite)
* **Файловое хранилище**: Cloudflare R2
* **Планировщик**: Cloudflare Cron Triggers (`0 4 * * *`)
* **Тестирование**: Vitest
