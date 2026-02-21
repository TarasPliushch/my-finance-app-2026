// server.js - ПОВНИЙ КОД ЗІ ЗБЕРЕЖЕННЯМ
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// ===========================================
//           РОБОТА З ФАЙЛАМИ (БАЗА ДАНИХ)
// ===========================================

const DB_PATH = path.join(__dirname, 'db.json');

// Ініціалізація бази даних
function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initialDB = {
      users: [],
      expenses: [],
      goals: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
    return initialDB;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

// Читання бази даних
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (error) {
    return initDB();
  }
}

// Запис в базу даних
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Ініціалізуємо базу при старті
let db = initDB();

// ===========================================
//           ТЕСТОВИЙ МАРШРУТ
// ===========================================
app.get('/', (req, res) => {
  res.json({ 
    message: "Сервер Finance AI працює!",
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
  console.log('📝 Реєстрація:', req.body);
  const { email, password, name } = req.body;
  
  // Перевірка обов'язкових полів
  if (!email || !password || !name) {
    return res.status(400).json({ 
      error: "Всі поля обов'язкові" 
    });
  }
  
  // Оновлюємо базу даних
  db = readDB();
  
  // Перевірка чи email вже існує
  const existingUser = db.users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ 
      error: "Користувач з таким email вже існує" 
    });
  }
  
  // Створюємо нового користувача
  const newUser = {
    id: "user_" + Date.now(),
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
  
  // Додаємо в базу
  db.users.push(newUser);
  writeDB(db);
  
  console.log(`✅ Зареєстровано нового користувача: ${email}`);
  
  // Повертаємо дані без пароля
  const { password: _, ...userWithoutPassword } = newUser;
  
  res.json({
    success: true,
    token: "token_" + Date.now(),
    user: userWithoutPassword
  });
});

// ВХІД
app.post('/api/auth/login', (req, res) => {
  console.log('🔑 Вхід:', req.body);
  const { email, password } = req.body;
  
  // Перевірка обов'язкових полів
  if (!email || !password) {
    return res.status(400).json({ 
      error: "Email та пароль обов'язкові" 
    });
  }
  
  // Оновлюємо базу даних
  db = readDB();
  
  // Шукаємо користувача
  const user = db.users.find(u => u.email === email);
  
  // Перевіряємо пароль (в реальному проекті треба хешування)
  if (!user || user.password !== password) {
    return res.status(401).json({ 
      error: "Невірний email або пароль" 
    });
  }
  
  console.log(`✅ Успішний вхід: ${email}`);
  
  // Повертаємо дані без пароля
  const { password: _, ...userWithoutPassword } = user;
  
  res.json({
    success: true,
    token: "token_" + Date.now(),
    user: userWithoutPassword
  });
});

// ОТРИМАННЯ КОРИСТУВАЧА
app.get('/api/auth/me', (req, res) => {
  console.log('👤 Отримання користувача');
  
  // Отримуємо токен з заголовка
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Не авторизовано" });
  }
  
  // Оновлюємо базу даних
  db = readDB();
  
  // В реальному проекті тут треба декодувати токен
  // Поки що повертаємо першого користувача для тесту
  if (db.users.length > 0) {
    const { password: _, ...userWithoutPassword } = db.users[0];
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
  console.log('📊 Отримання витрат');
  
  db = readDB();
  
  // Отримуємо userId з токена (тут спрощено)
  const userId = db.users[0]?.id || 'user_12345';
  
  // Фільтруємо витрати поточного користувача
  const userExpenses = db.expenses.filter(e => e.userId === userId);
  
  res.json({
    success: true,
    expenses: userExpenses
  });
});

// ДОДАВАННЯ ВИТРАТИ
app.post('/api/expenses', (req, res) => {
  console.log('➕ Додавання витрати:', req.body);
  const { title, amount, category, date, notes } = req.body;
  
  db = readDB();
  
  // Отримуємо userId з токена (тут спрощено)
  const userId = db.users[0]?.id || 'user_12345';
  
  const newExpense = {
    id: "expense_" + Date.now(),
    userId: userId,
    title: title || "Нова витрата",
    amount: amount || 0,
    category: category || "Інше",
    date: date || new Date().toISOString(),
    notes: notes || null
  };
  
  db.expenses.push(newExpense);
  writeDB(db);
  
  res.json({
    success: true,
    expense: newExpense
  });
});

// ВИДАЛЕННЯ ВИТРАТИ
app.delete('/api/expenses/:id', (req, res) => {
  console.log('🗑️ Видалення витрати:', req.params.id);
  const { id } = req.params;
  
  db = readDB();
  db.expenses = db.expenses.filter(e => e.id !== id);
  writeDB(db);
  
  res.json({
    success: true,
    message: "Витрату видалено"
  });
});

// СТАТИСТИКА
app.get('/api/expenses/stats', (req, res) => {
  console.log('📈 Статистика');
  
  db = readDB();
  
  // Отримуємо userId з токена (тут спрощено)
  const userId = db.users[0]?.id || 'user_12345';
  
  // Фільтруємо витрати поточного користувача
  const userExpenses = db.expenses.filter(e => e.userId === userId);
  
  const totalCount = userExpenses.length;
  const totalAmount = userExpenses.reduce((sum, e) => sum + e.amount, 0);
  const categories = new Set(userExpenses.map(e => e.category)).size;
  
  res.json({
    success: true,
    stats: {
      totalCount: totalCount,
      totalAmount: totalAmount,
      categoryCount: categories
    }
  });
});

// ===========================================
//           МАРШРУТИ ЦІЛЕЙ
// ===========================================

// ОТРИМАННЯ ВСІХ ЦІЛЕЙ
app.get('/api/goals', (req, res) => {
  console.log('🎯 Отримання цілей');
  
  db = readDB();
  
  // Отримуємо userId з токена (тут спрощено)
  const userId = db.users[0]?.id || 'user_12345';
  
  // Фільтруємо цілі поточного користувача
  const userGoals = db.goals.filter(g => g.userId === userId);
  
  res.json({
    success: true,
    goals: userGoals
  });
});

// ДОДАВАННЯ ЦІЛІ
app.post('/api/goals', (req, res) => {
  console.log('➕ Додавання цілі:', req.body);
  const { name, targetAmount, currentAmount, deadline, imageEmoji } = req.body;
  
  db = readDB();
  
  // Отримуємо userId з токена (тут спрощено)
  const userId = db.users[0]?.id || 'user_12345';
  
  const newGoal = {
    id: "goal_" + Date.now(),
    userId: userId,
    name: name || "Нова ціль",
    targetAmount: targetAmount || 1000,
    currentAmount: currentAmount || 0,
    deadline: deadline || null,
    imageEmoji: imageEmoji || "💰"
  };
  
  db.goals.push(newGoal);
  writeDB(db);
  
  res.json({
    success: true,
    goal: newGoal
  });
});

// ВИДАЛЕННЯ ЦІЛІ
app.delete('/api/goals/:id', (req, res) => {
  console.log('🗑️ Видалення цілі:', req.params.id);
  const { id } = req.params;
  
  db = readDB();
  db.goals = db.goals.filter(g => g.id !== id);
  writeDB(db);
  
  res.json({
    success: true,
    message: "Ціль видалено"
  });
});

// ===========================================
//           ЗАПУСК СЕРВЕРА
// ===========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущено на порту ${PORT}`);
  console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
  console.log(`💾 Дані зберігаються у файлі db.json`);
});
