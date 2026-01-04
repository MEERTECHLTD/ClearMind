# ClearMind Security Documentation

## Security Features Implemented

### 1. **Input Validation & Sanitization**
- Email validation with RFC 5321 compliance
- Strong password requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - Maximum 128 characters
- Nickname validation (2-50 characters, alphanumeric with limited special chars)
- Input sanitization for all user inputs
- SQL injection pattern detection
- XSS prevention via HTML sanitization

### 2. **Security Headers** (via vercel.json)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: Strict CSP with allowed domains
```

### 3. **Firebase Security**
- Proper authentication error handling
- Rate limiting for API calls
- Sanitization of undefined values before Firestore writes
- Secure Firebase config via environment variables
- Real-time sync with authenticated users only

### 4. **API Security**
- Gemini API key stored in environment variables (never committed)
- Input validation for AI requests
- Rate limiting for AI service calls
- Error handling for API failures and quota limits
- Message length validation (max 10,000 characters)

### 5. **Service Worker Security**
- HTTPS enforcement in production
- Secure cache management
- Only caching GET requests
- Updated cache version for security patches

### 6. **Environment Variables**
All sensitive data is stored in `.env` file (gitignored):
```
VITE_GEMINI_API_KEY=<your-key>
VITE_FIREBASE_API_KEY=<your-key>
VITE_FIREBASE_AUTH_DOMAIN=<your-domain>
VITE_FIREBASE_PROJECT_ID=<your-project>
VITE_FIREBASE_STORAGE_BUCKET=<your-bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<your-sender>
VITE_FIREBASE_APP_ID=<your-app-id>
```

## Security Best Practices

### For Users:
1. **Use Strong Passwords**: Follow the enforced password requirements
2. **Enable Email Verification**: Verify your email after signing up
3. **Keep Browser Updated**: Use the latest browser version
4. **Use HTTPS**: Always access via `https://`

### For Developers:
1. **Never Commit `.env`**: Environment variables are gitignored
2. **Rotate API Keys**: Regularly rotate API keys in production
3. **Monitor Firebase Usage**: Watch for suspicious activity
4. **Update Dependencies**: Run `npm audit` and `npm outdated` regularly
5. **Review Security Headers**: Adjust CSP as needed for new integrations

## Data Privacy

### Local Mode:
- All data stored in browser's IndexedDB
- No server communication
- Data stays on device

### Cloud Mode:
- Data encrypted in transit (HTTPS)
- Data stored in Firebase Firestore with user-scoped rules
- Each user's data is isolated by Firebase UID
- Real-time sync only for authenticated users

## Firebase Security Rules (Recommended)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User data - only accessible by the owner
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // User's sub-collections (tasks, notes, etc.)
      match /{collection}/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## Security Audit Results

**Last Audit**: January 4, 2026

- ✅ No npm vulnerabilities found (`npm audit`)
- ✅ All packages up to date
- ✅ Environment variables properly configured
- ✅ Input validation implemented
- ✅ Security headers configured
- ✅ HTTPS enforced
- ✅ XSS protection enabled
- ✅ CSRF protection via Firebase Auth

## Reporting Security Issues

If you discover a security vulnerability, please email: [your-email@example.com]

Do NOT open public issues for security vulnerabilities.

## Updates & Maintenance

### Package Updates (Last Run)
```bash
npm update @google/genai lucide-react
```

### Security Checks
```bash
npm audit
npm outdated
```

Run these commands monthly to stay secure.

## Compliance

- **GDPR**: Users can delete their data via Settings
- **Data Portability**: Export feature available (future enhancement)
- **Right to be Forgotten**: Account deletion removes all user data

## Future Security Enhancements

- [ ] Two-factor authentication (2FA)
- [ ] Biometric authentication
- [ ] End-to-end encryption for notes
- [ ] Security audit logging
- [ ] Automated dependency updates (Dependabot)
- [ ] Web Application Firewall (WAF)
- [ ] Rate limiting middleware
- [ ] Advanced anomaly detection
