/**
 * Константы и проверки лимитов Telegram API
 */

export const TELEGRAM_LIMITS = {
  MAX_MESSAGE_LENGTH: 4096,
  MAX_CALLBACK_DATA_LENGTH: 64,
  MAX_INLINE_BUTTON_TEXT: 64,
  MAX_MESSAGES_PER_SECOND: 30,
  MAX_BUTTONS_PER_ROW: 8,
  MAX_BUTTON_ROWS: 100,
  MAX_PHOTO_CAPTION: 1024,
} as const;

/**
 * Проверяет, что callback_data не превышает лимит
 */
export function validateCallbackData(data: string): boolean {
  return Buffer.byteLength(data, 'utf8') <= TELEGRAM_LIMITS.MAX_CALLBACK_DATA_LENGTH;
}

/**
 * Обрезает текст до максимальной длины с добавлением "..."
 */
export function truncateMessage(text: string, maxLength = TELEGRAM_LIMITS.MAX_MESSAGE_LENGTH): string {
  if (text.length <= maxLength) return text;
  
  const suffix = '\n\n...';
  const truncateAt = maxLength - suffix.length;
  
  // Ищем последний перенос строки перед лимитом
  const lastNewline = text.lastIndexOf('\n', truncateAt);
  const cutAt = lastNewline > truncateAt * 0.8 ? lastNewline : truncateAt;
  
  return text.substring(0, cutAt) + suffix;
}

/**
 * Разбивает длинное сообщение на части
 */
export function splitLongMessage(text: string, maxLength = TELEGRAM_LIMITS.MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) return [text];
  
  const parts: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }
    
    // Ищем подходящее место для разрыва
    let splitAt: number = maxLength;
    const lastNewline = remaining.lastIndexOf('\n', maxLength);
    const lastSpace = remaining.lastIndexOf(' ', maxLength);
    
    if (lastNewline > maxLength * 0.8) {
      splitAt = lastNewline;
    } else if (lastSpace > maxLength * 0.8) {
      splitAt = lastSpace;
    }
    
    parts.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }
  
  return parts;
}

/**
 * Создает безопасный callback_data, обрезая если необходимо
 */
export function safeCallbackData(prefix: string, ...parts: (string | number)[]): string {
  const data = [prefix, ...parts].join(':');
  
  if (validateCallbackData(data)) {
    return data;
  }
  
  // Если превышает лимит, используем хеш
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  const safeData = `${prefix}:h:${hash}`;
  
  console.warn(`Callback data too long, using hash: ${data} -> ${safeData}`);
  return safeData;
}