import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this-in-production';

export interface TelegramJWTPayload {
  userId: string;
  telegramChatId: string;
  telegramUsername?: string;
  telegramFirstName: string;
  authMethod: 'telegram';
}

export function signTelegramJWT(payload: Omit<TelegramJWTPayload, 'authMethod'>): string {
  const fullPayload: TelegramJWTPayload = {
    ...payload,
    authMethod: 'telegram',
  };

  return jwt.sign(fullPayload, JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function verifyTelegramJWT(token: string): TelegramJWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TelegramJWTPayload;
    
    if (payload.authMethod !== 'telegram') {
      console.error('[JWT] Invalid auth method:', payload.authMethod);
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('[JWT] Verification failed:', error);
    return null;
  }
}