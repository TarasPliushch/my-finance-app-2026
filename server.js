// server.js - АБСОЛЮТНО РОБОЧА ВЕРСІЯ
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// ===========================================
//           РОБОТА З ФАЙЛАМИ (ВИПРАВЛЕНО)
// ===========================================

// ВАЖЛИВО: Railway дозволяє запис тільки в /tmp
const DB_PATH = path.join('/tmp', 'db.json');
console.log('📁 Шлях до БД:', DB_PATH);

// Початкові дані
const DEFAULT_DB = {
  users: [],
  expenses: [],
  goals: []
};

// Функція читання бази
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.log('📂 Файл БД не існує, створюємо новий');
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
      return DEFAULT_DB;
    }
    
    const data = fs.readFileSync(DB_PATH, 'utf8');
    const db = JSON.parse(data);
    console.log(`✅ БД прочитано: ${db.users.length} користувачів`);
    return db;
  } catch (error) {
    console.log('❌ Помилка читання БД:', error.message);
    return DEFAULT_DB;
  }
}

// Функція запису бази
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    console.log('✅ БД збережено');
    return true;
  } catch (error) {
    console.log('❌ Помилка запису БД:', error.message);
    return false;
  }
}

// Ініціалізація
let db = readDB();

// ===========================================
//           ТЕСТОВИЙ МАРШРУТ
// ===========================================
app.get('/', (req, res) => {
  res.json({
    message: "🚀 Сервер Finance AI працює!",
    dbPath: DB_PATH,
    stats: {
      users: db.users.length,
      expenses: db.expenses.length,
      goals: db.goals.length
    },
    time: new Date().toISOString()
  });
});

// ===========================================
//           МАРШРУТИ АВТОРИЗАЦІЇ
// ===========================================

// РЕЄСТРАЦІЯ
app.post('/api/auth/register', (req, res) => {
  console.log('\n📝 РЕЄСТРАЦІЯ');
  console.log('Дані:', req.body);
  
  const { email, password, name } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Всі поля обов'язкові" });
  }
  
  // Оновлюємо базу
  db = readDB();
  
  // Перевірка чи email вже є
  if (db.users.some(u => u.email === email)) {
    return res.status(400).json({ error: "Email вже використовується" });
  }
  
  // Створюємо користувача
  const newUser = {
    id: `user_${Date.now()}`,
    email,
    name,
    password, // В реальному проекті треба хешувати
    avatarEmoji: "👤",
    currency: "₴",
    monthlyBudget: 0,
    notificationsEnabled: true,
    theme: "system",
    createdAt: new Date().toISOString()
  };
  
  // Додаємо в базу
  db.users.push(newUser);
  
  // Зберігаємо
  const saved = writeDB(db);
  
  if (!saved) {
    return res.status(500).json({ error: "Помилка збереження" });
  }
  
  console.log(`✅ Користувача додано: ${email}`);
  console.log(`📊 Всього користувачів: ${db.users.length}`);
  
  // Повертаємо без пароля
  const { password: _, ...userWithoutPassword } = newUser;
  
  res.json({
    success: true,
    token: `token_${Date.now()}`,
    user: userWithoutPassword
  });
});

// ВХІД
app.post('/api/auth/login', (req, res) => {
  console.log('\n🔑 ВХІД');
  console.log('Дані:', req.body);
  
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email та пароль обов'язкові" });
  }
  
  // Оновлюємо базу
  db = readDB();
  
  // Шукаємо користувача
  const user = db.users.find(u => u.email === email);
  
  if (!user) {
    console.log('❌ Користувача не знайдено');
    return res.status(401).json({ error: "Невірний email або пароль" });
  }
  
  if (user.password !== password) {
    console.log('❌ Невірний пароль');
    return res.status(401).json({ error: "Невірний email або пароль" });
  }
  
  console.log(`✅ Успішний вхід: ${email}`);
  
  const { password: _, ...userWithoutPassword } = user;
  
  res.json({
    success: true,
    token: `token_${Date.now()}`,
    user: userWithoutPassword
  });
});

// ОТРИМАННЯ КОРИСТУВАЧА
app.get('/api/auth/me', (req, res) => {
  console.log('\n👤 ОТРИМАННЯ КОРИСТУВАЧА');
  
  db = readDB();
  
  if (db.users.length > 0) {
    const user = db.users[db.users.length - 1];
    console.log('✅ Повертаємо:', user.name);
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } else {
    console.log('❌ Немає користувачів');
    res.json({ user: null });
  }
});

// ===========================================
//           МАРШРУТИ ДЛЯ ПЕРЕВІРКИ
// ===========================================

// Перевірка бази
app.get('/api/db/status', (req, res) => {
  db = readDB();
  res.json({
    users: db.users.length,
    expenses: db.expenses.length,
    goals: db.goals.length,
    dbPath: DB_PATH
  });
});

// ===========================================
//           ЗАПУСК СЕРВЕРА
// ===========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 СЕРВЕР ЗАПУЩЕНО');
  console.log('='.repeat(50));
  console.log(`📍 URL: https://financeai-app-2026-production.up.railway.app`);
  console.log(`📁 База даних: ${DB_PATH}`);
  console.log(`📊 Статистика:`);
  console.log(`   - Користувачів: ${db.users.length}`);
  console.log(`   - Витрат: ${db.expenses.length}`);
  console.log(`   - Цілей: ${db.goals.length}`);
  console.log('='.repeat(50) + '\n');
});
