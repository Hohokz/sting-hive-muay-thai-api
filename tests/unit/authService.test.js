const authService = require('../../services/authService');

// กำหนด Environment Variables สำหรับการทดสอบ
process.env.JWT_SECRET = 'test_jwt_secret_123';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_456';
process.env.JWT_EXPIRES_IN = '30m';
process.env.JWT_REFRESH_EXPIRES_IN = '1d';

describe('AuthService', () => {
  const password = 'testPassword123';
  let hashedPassword;

  test('should hash a password correctly', async () => {
    hashedPassword = await authService.hashPassword(password);
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toBe(password);
  });

  test('should verify a correct password', async () => {
    const isMatch = await authService.comparePassword(password, hashedPassword);
    expect(isMatch).toBe(true);
  });

  test('should not verify an incorrect password', async () => {
    const isMatch = await authService.comparePassword('wrongPassword', hashedPassword);
    expect(isMatch).toBe(false);
  });

  test('should generate tokens for a user', () => {
    const user = { id: 1, email: 'test@example.com', role: 'USER' };
    const tokens = authService.generateTokens(user);
    
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });

  test('should verify a valid access token', () => {
    const user = { id: 123, email: 'token@example.com', role: 'ADMIN' };
    const { accessToken } = authService.generateTokens(user);
    
    const decoded = authService.verifyAccessToken(accessToken);
    expect(decoded.id).toBe(123);
    expect(decoded.role).toBe('ADMIN');
  });

  test('should throw error for invalid access token', () => {
    expect(() => {
      authService.verifyAccessToken('invalidToken');
    }).toThrow();
  });
});
