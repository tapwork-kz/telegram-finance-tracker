/**
 * Validates Telegram Web App initData
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
export async function validateTelegramWebAppData(
  initData: string,
  botToken: string
): Promise<{ isValid: boolean; user?: any }> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { isValid: false };

    params.delete('hash');

    // Sort keys alphabetically
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map(k => `${k}=${params.get(k)}`).join('\n');

    // HMAC-SHA256 of botToken with key "WebAppData"
    const encoder = new TextEncoder();
    const secretKeyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secretKey = await crypto.subtle.sign('HMAC', secretKeyMaterial, encoder.encode(botToken));

    // Sign dataCheckString with secretKey
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      secretKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const calculatedSignature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(dataCheckString));
    const calculatedHash = Array.from(new Uint8Array(calculatedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const isValid = calculatedHash === hash;
    const userJson = params.get('user');
    const user = userJson ? JSON.parse(userJson) : undefined;

    return { isValid, user };
  } catch (e) {
    return { isValid: false };
  }
}
