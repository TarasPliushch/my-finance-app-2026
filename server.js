// server.js - МІНІМАЛЬНА ТЕСТОВА ВЕРСІЯ
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;

console.log('\n' + '='.repeat(50));
console.log('🔧 ТЕСТОВИЙ СЕРВЕР');
console.log('='.repeat(50));
console.log(`📁 Шлях до БД: ${DB_PATH}`);
console.log(`🔌 Порт: ${PORT}`);

// 1. ПЕРЕВІРКА ЧИ МОЖНА ПИСАТИ В /tmp
try {
  fs.writeFileSync('/tmp/test.txt', 'test');
  console.log('✅ /tmp доступний для запису');
} catch (e) {
  console.log('❌ /tmp НЕ доступний:', e.message);
}

// 2. ПЕРЕВІРКА ЧИ МОЖНА ПИСАТИ В ПОТОЧНУ ПАПКУ
try {
  fs.writeFileSync('./test.txt', 'test');
  console.log('✅ Поточна папка доступна для запису');
} catch (e) {
  console.log('❌ Поточна папка НЕ доступна:', e.message);
}

// ТЕСТОВИЙ МАРШРУТ
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Тестовий сервер працює!',
    time: new Date().toISOString(),
    canWrite: {
      tmp: fs.existsSync('/tmp/test.txt'),
      current: fs.existsSync('./test.txt')
    }
  });
});

// МАРШРУТ ДЛЯ ПЕРЕВІРКИ ЗАПИСУ
app.post('/api/test/write', (req, res) => {
  try {
    const data = { time: Date.now(), ...req.body };
    fs.writeFileSync(DB_PATH, JSON.stringify(data));
    res.json({ success: true, data });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/test/read', (req, res) => {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      res.json({ success: true, data: JSON.parse(data) });
    } else {
      res.json({ success: false, error: 'Файл не існує' });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущено на порту ${PORT}`);
  console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
});
