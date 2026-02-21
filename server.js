// server.js - ПОВНИЙ КОД СЕРВЕРА
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ===========================================
//           ТЕСТОВИЙ МАРШРУТ
// ===========================================
app.get('/', (req, res) => {
  res.json({ 
    message: "Сервер Finance AI працює!",
    time: new Date().toISOString(),
    endpoints: [
      "POST /api/auth/register",
      "POST /api/auth/login",
      "GET /api/auth/me",
      "GET /api/expenses",
      "POST /api/expenses",
      "DELETE /api/expenses/:id",
      "GET /api/expenses/stats",
      "GET /api/goals",
      "POST /api/goals",
      "DELETE /api/goals/:id"
    ]
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
  
  // Імітація збереження в базу даних
  const newUser = {
    id: "user_" + Date.now(),
    email: email,
    name: name,
    avatarEmoji: "👤",
    currency: "₴",
    monthlyBudget: 0,
    notificationsEnabled: true,
    theme: "system",
    createdAt: new Date().toISOString()
  };
  
  res.json({
    success: true,
    token: "token_" + Date.now(),
    user: newUser
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
  
  // Імітація перевірки в базі даних
  res.json({
    success: true,
    token: "token_" + Date.now(),
    user: {
      id: "user_12345",
      email: email,
      name: email.split('@')[0] || "Користувач",
      avatarEmoji: "👤",
      currency: "₴",
      monthlyBudget: 0,
      notificationsEnabled: true,
      theme: "system",
      createdAt: new Date().toISOString()
    }
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
  
  res.json({
    user: {
      id: "user_12345",
      email: "user@example.com",
      name: "Тестовий Користувач",
      avatarEmoji: "👤",
      currency: "₴",
      monthlyBudget: 0,
      notificationsEnabled: true,
      theme: "system",
      createdAt: new Date().toISOString()
    }
  });
});

// ===========================================
//           МАРШРУТИ ВИТРАТ
// ===========================================

// Тимчасова база даних в пам'яті
let expenses = [
  {
    id: "1",
    title: "Продукти",
    amount: 1500,
    category: "Їжа",
    date: new Date().toISOString(),
    notes: "Супермаркет"
  },
  {
    id: "2",
    title: "Таксі",
    amount: 250,
    category: "Транспорт",
    date: new Date().toISOString(),
    notes: null
  }
];

// ОТРИМАННЯ ВСІХ ВИТРАТ
app.get('/api/expenses', (req, res) => {
  console.log('📊 Отримання витрат');
  
  res.json({
    success: true,
    expenses: expenses
  });
});

// ДОДАВАННЯ ВИТРАТИ
app.post('/api/expenses', (req, res) => {
  console.log('➕ Додавання витрати:', req.body);
  const { title, amount, category, date, notes } = req.body;
  
  const newExpense = {
    id: "expense_" + Date.now(),
    title: title || "Нова витрата",
    amount: amount || 0,
    category: category || "Інше",
    date: date || new Date().toISOString(),
    notes: notes || null
  };
  
  expenses.unshift(newExpense); // Додаємо в початок
  
  res.json({
    success: true,
    expense: newExpense
  });
});

// ВИДАЛЕННЯ ВИТРАТИ
app.delete('/api/expenses/:id', (req, res) => {
  console.log('🗑️ Видалення витрати:', req.params.id);
  const { id } = req.params;
  
  expenses = expenses.filter(e => e.id !== id);
  
  res.json({
    success: true,
    message: "Витрату видалено"
  });
});

// СТАТИСТИКА
app.get('/api/expenses/stats', (req, res) => {
  console.log('📈 Статистика');
  
  const totalCount = expenses.length;
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const categories = new Set(expenses.map(e => e.category)).size;
  
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

let goals = [
  {
    id: "1",
    name: "Купити телефон",
    targetAmount: 20000,
    currentAmount: 5000,
    deadline: null,
    imageEmoji: "📱"
  }
];

// ОТРИМАННЯ ВСІХ ЦІЛЕЙ
app.get('/api/goals', (req, res) => {
  console.log('🎯 Отримання цілей');
  
  res.json({
    success: true,
    goals: goals
  });
});

// ДОДАВАННЯ ЦІЛІ
app.post('/api/goals', (req, res) => {
  console.log('➕ Додавання цілі:', req.body);
  const { name, targetAmount, currentAmount, deadline, imageEmoji } = req.body;
  
  const newGoal = {
    id: "goal_" + Date.now(),
    name: name || "Нова ціль",
    targetAmount: targetAmount || 1000,
    currentAmount: currentAmount || 0,
    deadline: deadline || null,
    imageEmoji: imageEmoji || "💰"
  };
  
  goals.push(newGoal);
  
  res.json({
    success: true,
    goal: newGoal
  });
});

// ВИДАЛЕННЯ ЦІЛІ
app.delete('/api/goals/:id', (req, res) => {
  console.log('🗑️ Видалення цілі:', req.params.id);
  const { id } = req.params;
  
  goals = goals.filter(g => g.id !== id);
  
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
});
