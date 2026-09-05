/**
 * In-memory cache utility.
 * Reduces direct database reads to save cost and improve latency.
 */
class CacheUtility {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Stores a value in the cache.
   * @param {string} key
   * @param {any} value
   * @param {number} ttl - time to live in milliseconds, default 1 minute
   */
  set(key, value, ttl = 60000) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  /**
   * Reads a value from the cache.
   * @param {string} key
   * @returns {any|null} the stored value, or null if missing/expired
   */
  get(key) {
    const data = this.cache.get(key);
    if (!data) return null;

    if (Date.now() > data.expiry) {
      this.cache.delete(key);
      return null;
    }

    return data.value;
  }

  /**
   * Deletes a single key.
   * @param {string} key
   */
  del(key) {
    this.cache.delete(key);
  }

  /**
   * Deletes every key starting with the given prefix (e.g. 'schedules:').
   * @param {string} prefix
   */
  clearByPrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears the entire cache.
   */
  flushAll() {
    this.cache.clear();
  }
}

// Exported as a singleton instance so the whole project shares one cache.
module.exports = new CacheUtility();
