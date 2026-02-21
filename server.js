// server.js - РОБОЧА ВЕРСІЯ З ДІАГНОСТИКОЮ
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// ===========================================
//           РОБОТА З ФАЙЛАМИ
// ===========================================
const DB_PATH = '/tmp/db.json'; // ← ОДРАЗУ ВКАЗУЄМО ШЛЯХ ДО /tmp

console.log('='.repeat(50));
console.log('🚀 ЗАПУСК СЕРВЕРА');
console.log('='.repeat(50));
console.log('📁 Шлях до БД:', DB_PATH);

// Спробуємо одразу створити файл, щоб перевірити права
try {
  fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], expenses: [], goals: [] }, null, 2));
  console.log('✅ Файл БД успішно створено при старті');
} catch (error) {
  console.log('❌ ПОМИЛКА: Не вдалося створити файл БД:', error.message);
}

// Функція читання бази
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.log('📂 Файл БД не існує, створюємо новий');
      const defaultDB = { users: [], expenses: [], goals: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
      return defaultDB;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log('❌ Помилка читання БД:', error.message);
    return { users: [], expenses: [], goals: [] };
  }
}

// Функція запису бази
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    console.log('✅ БД збережено');
    return true;
  } catch (error) {
    console.log('❌ ПОМИЛКА ЗАПИСУ БД:', error.message);
    return false;
  }
}

let db = readDB();

// ===========================================
//           МАРШРУТИ
// ===========================================

app.get('/', (req, res) => {
  res.json({
    message: "Сервер Finance AI працює!",
    dbPath: DB_PATH,
    dbExists: fs.existsSync(DB_PATH),
    stats: {
      users: db.users.length,
      expenses: db.expenses.length,
      goals: db.goals.length
    }
  });
});

// ТЕСТОВИЙ МАРШРУТ ДЛЯ ПЕРЕВІРКИ ЗАПИСУ
app.get('/api/test-write', (req, res) => {
  const testFile = '/tmp/test.txt';
  try {
    fs.writeFileSync(testFile, 'test');
    res.json({ success: true, message: 'Запис працює' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// РЕЄСТРАЦІЯ
app.post('/api/auth/register', (req, res) => {
  console.log('\n📝 РЕЄСТРАЦІЯ');
  
  const { email, password, name } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Всі поля обов'язкові" });
  }
  
  db = readDB();
  
  if (db.users.some(u => u.email === email)) {
    return res.status(400).json({ error: "Email вже використовується" });
  }
  
  const newUser = {
    id: `user_${Date.now()}`,
    email,
    name,
    password,
    avatarEmoji: "👤",
    createdAt: new Date().toISOString()
  };
  
  db.users.push(newUser);
  
  if (!writeDB(db)) {
    return res.status(500).json({ error: "Помилка збереження на сервері" });
  }
  
  console.log(`✅ Користувача додано: ${email}`);
  
  const { password: _, ...userWithoutPassword } = newUser;
  
  res.json({
    success: true,
    token: `token_${Date.now()}`,
    user: userWithoutPassword
  });
});

// ВХІД
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email та пароль обов'язкові" });
  }
  
  db = readDB();
  const user = db.users.find(u => u.email === email);
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Невірний email або пароль" });
  }
  
  const { password: _, ...userWithoutPassword } = user;
  
  res.json({
    success: true,
    token: `token_${Date.now()}`,
    user: userWithoutPassword
  });
});

// ІНШІ МАРШРУТИ (expenses, goals) - залишаємо як є
// ... (сюди можна додати код для /expenses та /goals з минулих версій)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер слухає порт ${PORT}`);
});
