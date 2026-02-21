// server.js - ОНОВЛЕНА ВЕРСІЯ З TOKEN
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;

console.log('\n' + '='.repeat(50));
console.log('🚀 ЗАПУСК СЕРВЕРА');
console.log('='.repeat(50));

// Ініціалізація бази даних
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2));
  console.log('✅ Базу даних створено');
}

// Функція для читання бази
function readDB() {
  const data = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(data);
}

// Функція для запису бази
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ГОЛОВНА СТОРІНКА
app.get('/', (req, res) => {
  const data = readDB();
  res.json({
    message: 'Сервер Finance AI працює!',
    users: data.users.length,
    time: new Date().toISOString()
  });
});

// ТЕСТОВИЙ МАРШРУТ
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Тестовий маршрут працює' });
});

// ===========================================
//           МАРШРУТИ АВТОРИЗАЦІЇ
// ===========================================

// РЕЄСТРАЦІЯ - ВИПРАВЛЕНО!
app.post('/api/auth/register', (req, res) => {
  console.log('📝 Реєстрація:', req.body);
  const { email, password, name } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Всі поля обов\'язкові' });
  }
  
  const data = readDB();
  
  // Перевірка чи email вже існує
  if (data.users.some(u => u.email === email)) {
    return res.status(400).json({ error: 'Користувач з таким email вже існує' });
  }
  
  // Створюємо нового користувача
  const newUser = {
    id: 'user_' + Date.now(),
    email: email,
    name: name,
    password: password, // В реальному проекті треба хешувати!
    avatarEmoji: "👤",
    currency: "₴",
    monthlyBudget: 0,
    notificationsEnabled: true,
    theme: "system",
    createdAt: new Date().toISOString()
  };
  
  data.users.push(newUser);
  writeDB(data);
  
  console.log(`✅ Користувача додано: ${email}`);
  
  // Повертаємо дані без пароля
  const { password: _, ...userWithoutPassword } = newUser;
  
  // ВІДПОВІДЬ З TOKEN - те, що очікує додаток!
  res.json({
    success: true,
    token: 'token_' + Date.now(),
    user: userWithoutPassword
  });
});

// ВХІД - ВИПРАВЛЕНО!
app.post('/api/auth/login', (req, res) => {
  console.log('🔑 Вхід:', req.body);
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email та пароль обов\'язкові' });
  }
  
  const data = readDB();
  const user = data.users.find(u => u.email === email);
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Невірний email або пароль' });
  }
  
  console.log(`✅ Успішний вхід: ${email}`);
  
  const { password: _, ...userWithoutPassword } = user;
  
  // ВІДПОВІДЬ З TOKEN
  res.json({
    success: true,
    token: 'token_' + Date.now(),
    user: userWithoutPassword
  });
});

// ОТРИМАННЯ КОРИСТУВАЧА
app.get('/api/auth/me', (req, res) => {
  console.log('👤 Отримання користувача');
  
  // Отримуємо токен з заголовка
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Не авторизовано' });
  }
  
  const data = readDB();
  
  // Повертаємо останнього користувача для простоти
  if (data.users.length > 0) {
    const lastUser = data.users[data.users.length - 1];
    const { password: _, ...userWithoutPassword } = lastUser;
    res.json({ user: userWithoutPassword });
  } else {
    res.json({ user: null });
  }
});

// ===========================================
//           МАРШРУТИ ВИТРАТ
// ===========================================

// ОТРИМАННЯ ВСІХ ВИТРАТ
app.get('/api/expenses', (req, res) => {
  const data = readDB();
  if (!data.expenses) data.expenses = [];
  res.json({ success: true, expenses: data.expenses });
});

// ДОДАВАННЯ ВИТРАТИ
app.post('/api/expenses', (req, res) => {
  const data = readDB();
  if (!data.expenses) data.expenses = [];
  
  const newExpense = {
    id: 'expense_' + Date.now(),
    ...req.body,
    date: req.body.date || new Date().toISOString()
  };
  
  data.expenses.push(newExpense);
  writeDB(data);
  
  res.json({ success: true, expense: newExpense });
});

// ВИДАЛЕННЯ ВИТРАТИ
app.delete('/api/expenses/:id', (req, res) => {
  const data = readDB();
  data.expenses = (data.expenses || []).filter(e => e.id !== req.params.id);
  writeDB(data);
  res.json({ success: true });
});

// СТАТИСТИКА
app.get('/api/expenses/stats', (req, res) => {
  const data = readDB();
  const expenses = data.expenses || [];
  
  res.json({
    success: true,
    stats: {
      totalCount: expenses.length,
      totalAmount: expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
      categoryCount: new Set(expenses.map(e => e.category)).size
    }
  });
});

// ===========================================
//           МАРШРУТИ ЦІЛЕЙ
// ===========================================

app.get('/api/goals', (req, res) => {
  const data = readDB();
  if (!data.goals) data.goals = [];
  res.json({ success: true, goals: data.goals });
});

app.post('/api/goals', (req, res) => {
  const data = readDB();
  if (!data.goals) data.goals = [];
  
  const newGoal = {
    id: 'goal_' + Date.now(),
    ...req.body,
    imageEmoji: req.body.imageEmoji || "💰"
  };
  
  data.goals.push(newGoal);
  writeDB(data);
  
  res.json({ success: true, goal: newGoal });
});

// ===========================================
//           ЗАПУСК СЕРВЕРА
// ===========================================

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`✅ СЕРВЕР ЗАПУЩЕНО НА ПОРТУ ${PORT}`);
  console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
  console.log(`📁 База даних: ${DB_PATH}`);
  console.log('='.repeat(50) + '\n');
});
