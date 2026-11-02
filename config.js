// ตั้งค่าการเชื่อมต่อ — แก้ 2 บรรทัดแรกหลังสมัคร Supabase
// (หน้า Supabase > Project Settings > API: คัดลอก Project URL และ anon/publishable key)
// ถ้าเว้นว่างไว้ ระบบจะทำงานใน "โหมดทดลอง" เก็บข้อมูลในเครื่องนี้เท่านั้น
window.DD_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_KEY: '',
  HELPER_URL: 'http://127.0.0.1:8765',   // โปรแกรมเครื่องอ่านบัตรในคอมร้าน
  SESSION_HOURS: 12                        // เข้าระบบแล้วใช้ได้กี่ชั่วโมงก่อนต้องใส่ PIN ใหม่
};
