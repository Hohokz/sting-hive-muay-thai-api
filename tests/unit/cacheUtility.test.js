const cacheUtility = require('../../utils/cacheUtility');

describe('CacheUtility', () => {
  beforeEach(() => {
    cacheUtility.flushAll();
  });

  test('should set and get a value', () => {
    cacheUtility.set('testKey', 'testValue');
    expect(cacheUtility.get('testKey')).toBe('testValue');
  });

  test('should return null for non-existent key', () => {
    expect(cacheUtility.get('unknownKey')).toBeNull();
  });

  test('should expire value after TTL', (done) => {
    cacheUtility.set('ttlKey', 'ttlValue', 100); // 100ms TTL
    
    expect(cacheUtility.get('ttlKey')).toBe('ttlValue');
    
    setTimeout(() => {
      expect(cacheUtility.get('ttlKey')).toBeNull();
      done();
    }, 150);
  });

  test('should delete a value', () => {
    cacheUtility.set('deleteKey', 'deleteValue');
    cacheUtility.del('deleteKey');
    expect(cacheUtility.get('deleteKey')).toBeNull();
  });

  test('should clear values by prefix', () => {
    cacheUtility.set('user:1', 'Alice');
    cacheUtility.set('user:2', 'Bob');
    cacheUtility.set('session:1', 'Active');
    
    cacheUtility.clearByPrefix('user:');
    
    expect(cacheUtility.get('user:1')).toBeNull();
    expect(cacheUtility.get('user:2')).toBeNull();
    expect(cacheUtility.get('session:1')).toBe('Active');
  });

  test('should flush all values', () => {
    cacheUtility.set('a', 1);
    cacheUtility.set('b', 2);
    cacheUtility.flushAll();
    
    expect(cacheUtility.get('a')).toBeNull();
    expect(cacheUtility.get('b')).toBeNull();
  });
});
