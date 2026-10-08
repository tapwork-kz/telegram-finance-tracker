export class TelegramClient {
  private baseUrl: string;

  constructor(private token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  public async sendMessage(chatId: number | string, text: string, replyMarkup?: any): Promise<any> {
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    };

    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  public async getFile(fileId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/getFile?file_id=${fileId}`);
    return await res.json();
  }

  public async downloadFile(filePath: string): Promise<ArrayBuffer> {
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${filePath}`);
    return await res.arrayBuffer();
  }

  public async setWebhook(url: string, secretToken?: string): Promise<any> {
    const body: any = { url };
    if (secretToken) body.secret_token = secretToken;
    const res = await fetch(`${this.baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  }

  public async setMenuButton(webAppUrl: string): Promise<any> {
    const body = {
      menu_button: {
        type: 'web_app',
        text: '📊 Финансы',
        web_app: { url: webAppUrl }
      }
    };
    const res = await fetch(`${this.baseUrl}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  }
}
