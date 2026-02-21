// server.js - ВЕРСІЯ ДЛЯ ПОРТУ 5000
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
const DB_PATH = '/tmp/db.json';

console.log('\n' + '='.repeat(50));
console.log('🚀 ЗАПУСК НОВОГО СЕРВЕРА');
console.log('='.repeat(50));
console.log('📁 Шлях до БД:', DB_PATH);

// Функція читання бази
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.log('📂 Файл БД не існує, створюємо...');
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
    console.log('❌ ПОМИЛКА ЗАПИСУ:', error.message);
    return false;
  }
}

let db = readDB();

// ===========================================
//           МАРШРУТИ
// ===========================================

// ГОЛОВНА СТОРІНКА
app.get('/', (req, res) => {
  res.json({
    message: "🚀 НОВИЙ СЕРВЕР Finance AI працює!",
    version: "2.0",
    port: PORT,
    dbPath: DB_PATH,
    stats: {
      users: db.users.length,
      expenses: db.expenses.length,
      goals: db.goals.length
    },
    time: new Date().toISOString()
  });
});

// ТЕСТ ЗАПИСУ
app.get('/api/test-write', (req, res) => {
  const testFile = '/tmp/test.txt';
  try {
    fs.writeFileSync(testFile, 'test ' + Date.now());
    res.json({ 
      success: true, 
      message: '✅ Запис працює!',
      path: testFile
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.message 
    });
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
    return res.status(500).json({ error: "Помилка збереження" });
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

// ОТРИМАННЯ ВСІХ ВИТРАТ
app.get('/api/expenses', (req, res) => {
  db = readDB();
  res.json({ success: true, expenses: db.expenses });
});

// ДОДАВАННЯ ВИТРАТИ
app.post('/api/expenses', (req, res) => {
  db = readDB();
  const newExpense = {
    id: `expense_${Date.now()}`,
    ...req.body,
    date: req.body.date || new Date().toISOString()
  };
  db.expenses.push(newExpense);
  writeDB(db);
  res.json({ success: true, expense: newExpense });
});

// ВИДАЛЕННЯ ВИТРАТИ
app.delete('/api/expenses/:id', (req, res) => {
  db = readDB();
  db.expenses = db.expenses.filter(e => e.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// СТАТИСТИКА
app.get('/api/expenses/stats', (req, res) => {
  db = readDB();
  const totalCount = db.expenses.length;
  const totalAmount = db.expenses.reduce((sum, e) => sum + e.amount, 0);
  const categories = new Set(db.expenses.map(e => e.category)).size;
  res.json({
    success: true,
    stats: { totalCount, totalAmount, categoryCount: categories }
  });
});

// ОТРИМАННЯ ВСІХ ЦІЛЕЙ
app.get('/api/goals', (req, res) => {
  db = readDB();
  res.json({ success: true, goals: db.goals });
});

// ДОДАВАННЯ ЦІЛІ
app.post('/api/goals', (req, res) => {
  db = readDB();
  const newGoal = {
    id: `goal_${Date.now()}`,
    ...req.body,
    imageEmoji: req.body.imageEmoji || "💰"
  };
  db.goals.push(newGoal);
  writeDB(db);
  res.json({ success: true, goal: newGoal });
});

// ВИДАЛЕННЯ ЦІЛІ
app.delete('/api/goals/:id', (req, res) => {
  db = readDB();
  db.goals = db.goals.filter(g => g.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// ===========================================
//           ЗАПУСК СЕРВЕРА
// ===========================================

const PORT = process.env.PORT || 5000; // ЗМІНЕНО на 5000!
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log(`✅ НОВИЙ СЕРВЕР ЗАПУЩЕНО на порту ${PORT}`);
  console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
  console.log(`📁 База даних: ${DB_PATH}`);
  console.log(`📊 Користувачів: ${db.users.length}`);
  console.log('='.repeat(50) + '\n');
});
