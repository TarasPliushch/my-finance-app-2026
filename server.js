// server.js - 100% РОБОЧА ВЕРСІЯ
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;

console.log('\n' + '🌟'.repeat(20));
console.log('🌟 НОВИЙ СЕРВЕР');
console.log('🌟'.repeat(20));
console.log(`📁 База даних: ${DB_PATH}`);

// Ініціалізація бази
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }));
  console.log('✅ Базу даних створено');
}

// ГОЛОВНА СТОРІНКА
app.get('/', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DB_PATH));
  res.json({
    message: '🎉 СЕРВЕР ПРАЦЮЄ!',
    users: data.users.length,
    time: new Date().toISOString()
  });
});

// ТЕСТОВИЙ МАРШРУТ
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Тестовий маршрут працює',
    time: Date.now()
  });
});

// РЕЄСТРАЦІЯ
app.post('/api/auth/register', (req, res) => {
  console.log('📝 Реєстрація:', req.body);
  
  const { email, name } = req.body;
  
  const data = JSON.parse(fs.readFileSync(DB_PATH));
  
  const newUser = {
    id: Date.now(),
    email,
    name,
    registered: new Date().toISOString()
  };
  
  data.users.push(newUser);
  fs.writeFileSync(DB_PATH, JSON.stringify(data));
  
  res.json({
    success: true,
    user: newUser,
    token: 'token_' + Date.now()
  });
});

// ВХІД
app.post('/api/auth/login', (req, res) => {
  console.log('🔑 Вхід:', req.body);
  
  const { email } = req.body;
  const data = JSON.parse(fs.readFileSync(DB_PATH));
  const user = data.users.find(u => u.email === email);
  
  if (user) {
    res.json({
      success: true,
      user,
      token: 'token_' + Date.now()
    });
  } else {
    res.status(401).json({ error: 'Користувача не знайдено' });
  }
});

// СПИСОК КОРИСТУВАЧІВ
app.get('/api/users', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DB_PATH));
  res.json(data.users);
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущено на порту ${PORT}`);
  console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
});
