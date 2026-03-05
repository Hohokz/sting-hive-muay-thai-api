/**
 * ยูทิลิตี้สำหรับจัดการ Cache ในหน่วยความจำ (In-memory Cache)
 * ช่วยลดการดึงข้อมูลจาก Database โดยตรง เพื่อประหยัด Cost และเพิ่มความเร็ว
 */
class CacheUtility {
  constructor() {
    this.cache = new Map();
  }

  /**
   * บันทึกข้อมูลลง Cache
   * @param {string} key - คีย์สำหรับอ้างอิงข้อมูล
   * @param {any} value - ข้อมูลที่ต้องการเก็บ
   * @param {number} ttl - อายุของข้อมูล (มิลลิวินาที), ค่าเริ่มต้นคือ 1 นาที
   */
  set(key, value, ttl = 60000) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  /**
   * ดึงข้อมูลจาก Cache
   * @param {string} key - คีย์ที่ต้องการค้นหา
   * @returns {any|null} - ข้อมูลที่เก็บไว้ หรือ null ถ้าข้อมูลไม่มี/หมดอายุ
   */
  get(key) {
    const data = this.cache.get(key);
    if (!data) return null;

    // ตรวจสอบว่าข้อมูลหมดอายุหรือยัง
    if (Date.now() > data.expiry) {
      this.cache.delete(key);
      return null;
    }

    return data.value;
  }

  /**
   * ลบข้อมูลราย Key
   * @param {string} key 
   */
  del(key) {
    this.cache.delete(key);
  }

  /**
   * ลบข้อมูลทั้งหมดที่มี Key ขึ้นต้นด้วยคำที่ระบุ (เช่น 'schedules:')
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
   * ล้างข้อมูลใน Cache ทั้งหมด
   */
  flushAll() {
    this.cache.clear();
  }
}

// Export เป็น Singleton Instance เพื่อให้ใช้ตัวแปรเดียวกันทั้งโปรเจค
module.exports = new CacheUtility();
