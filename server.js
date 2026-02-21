// server.js
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ============ МАРШРУТИ АВТОРИЗАЦІЇ ============

// Реєстрація
app.post('/api/auth/register', (req, res) => {
  console.log('📝 Реєстрація:', req.body);
  const { email, password, name } = req.body;
  
  // Тут має бути логіка збереження в базу даних
  // Поки що повертаємо тестову відповідь
  
  res.json({
    success: true,
    token: "test_token_12345",
    user: {
      id: "user_" + Date.now(),
      email: email,
      name: name,
      avatarEmoji: "👤",
      currency: "₴",
      monthlyBudget: 0,
      notificationsEnabled: true,
      theme: "system",
      createdAt: new Date().toISOString()
    }
  });
});

// Вхід
app.post('/api/auth/login', (req, res) => {
  console.log('🔑 Вхід:', req.body);
  const { email, password } = req.body;
  
  // Тут має бути перевірка в базі даних
  
  res.json({
    success: true,
    token: "test_token_12345",
    user: {
      id: "user_12345",
      email: email,
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

// Отримання поточного користувача
app.get('/api/auth/me', (req, res) => {
  console.log('👤 Отримання користувача');
  
  // Перевірка токена має бути тут
  
  res.json({
    user: {
      id: "user_12345",
      email: "test@test.com",
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

// ============ МАРШРУТИ ВИТРАТ ============

// Отримання всіх витрат
app.get('/api/expenses', (req, res) => {
  console.log('📊 Отримання витрат');
  
  res.json({
    success: true,
    expenses: [
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
    ]
  });
});

// Додавання витрати
app.post('/api/expenses', (req, res) => {
  console.log('➕ Додавання витрати:', req.body);
  
  res.json({
    success: true,
    expense: {
      id: "expense_" + Date.now(),
      ...req.body,
      date: req.body.date || new Date().toISOString()
    }
  });
});

// Статистика
app.get('/api/expenses/stats', (req, res) => {
  console.log('📈 Статистика');
  
  res.json({
    success: true,
    stats: {
      totalCount: 2,
      totalAmount: 1750,
      categoryCount: 2
    }
  });
});

// ============ МАРШРУТИ ЦІЛЕЙ ============

// Отримання всіх цілей
app.get('/api/goals', (req, res) => {
  console.log('🎯 Отримання цілей');
  
  res.json({
    success: true,
    goals: [
      {
        id: "1",
        name: "Купити телефон",
        targetAmount: 20000,
        currentAmount: 5000,
        deadline: null,
        imageEmoji: "📱"
      }
    ]
  });
});

// ============ ТЕСТОВИЙ МАРШРУТ ============

app.get('/', (req, res) => {
  res.json({ 
    message: "Сервер Finance AI працює!",
    endpoints: [
      "POST /api/auth/register",
      "POST /api/auth/login",
      "GET /api/auth/me",
      "GET /api/expenses",
      "POST /api/expenses",
      "GET /api/expenses/stats",
      "GET /api/goals"
    ]
  });
});

// ============ ЗАПУСК СЕРВЕРА ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущено на порту ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
});
