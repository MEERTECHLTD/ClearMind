/**
 * Security Utilities for ClearMind
 * Provides input validation and sanitization functions
 */

// Sanitize HTML to prevent XSS attacks
export const sanitizeHTML = (str: string): string => {
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
};

// Validate email format
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 320; // RFC 5321
};

// Validate password strength
export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

export const validatePassword = (password: string): PasswordValidation => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (password.length > 128) {
    errors.push('Password is too long (maximum 128 characters)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Sanitize user input for display
export const sanitizeInput = (input: string, maxLength: number = 10000): string => {
  if (!input) return '';
  
  // Trim whitespace
  let sanitized = input.trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  return sanitized;
};

// Validate URL (for links in notes, etc.)
export const isValidURL = (str: string): boolean => {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// Check if date string is valid
export const isValidDate = (dateString: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

// Check if time string is valid (HH:MM format)
export const isValidTime = (timeString: string): boolean => {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(timeString);
};

// Rate limiting helper (simple client-side implementation)
interface RateLimitState {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitState>();

export const checkRateLimit = (
  key: string, 
  maxRequests: number, 
  windowMs: number
): boolean => {
  const now = Date.now();
  const state = rateLimitStore.get(key);
  
  if (!state || now > state.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    return true;
  }
  
  if (state.count >= maxRequests) {
    return false;
  }
  
  state.count++;
  return true;
};

// Prevent rapid-fire submissions (debounce helper)
export const createDebounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Generate secure random ID (for client-side use)
export const generateSecureId = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Validate nickname (alphanumeric, spaces, limited special chars)
export const isValidNickname = (nickname: string): boolean => {
  if (!nickname || nickname.length < 2 || nickname.length > 50) {
    return false;
  }
  
  // Allow letters, numbers, spaces, hyphens, underscores
  const regex = /^[a-zA-Z0-9 _-]+$/;
  return regex.test(nickname);
};

// Check for common SQL injection patterns (defense in depth)
export const containsSQLInjection = (str: string): boolean => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(--|;|\/\*|\*\/)/,
    /(\bOR\b.*=.*)/i,
    /(\bAND\b.*=.*)/i
  ];
  
  return sqlPatterns.some(pattern => pattern.test(str));
};

// Sanitize filename for uploads (if ever implemented)
export const sanitizeFilename = (filename: string): string => {
  // Remove path traversal attempts
  let clean = filename.replace(/\.\./g, '');
  
  // Remove special characters except dot, dash, underscore
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Limit length
  if (clean.length > 255) {
    const ext = clean.split('.').pop() || '';
    clean = clean.substring(0, 255 - ext.length - 1) + '.' + ext;
  }
  
  return clean;
};
