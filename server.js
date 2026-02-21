// server.js
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

app.get('/', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  res.json({
    message: 'Сервер працює!',
    users: data.users.length,
    time: new Date().toISOString()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Тестовий маршрут працює' });
});

app.post('/api/auth/register', (req, res) => {
  console.log('📝 Реєстрація:', req.body);
  const { email, name } = req.body;
  
  if (!email || !name) {
    return res.status(400).json({ error: 'Email та ім\'я обов\'язкові' });
  }
  
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  
  const newUser = {
    id: Date.now().toString(),
    email,
    name,
    registered: new Date().toISOString()
  };
  
  data.users.push(newUser);
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  
  console.log(`✅ Користувача додано: ${email}`);
  res.json({ success: true, user: newUser });
});

app.post('/api/auth/login', (req, res) => {
  console.log('🔑 Вхід:', req.body);
  const { email } = req.body;
  
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const user = data.users.find(u => u.email === email);
  
  if (user) {
    res.json({ success: true, user });
  } else {
    res.status(401).json({ error: 'Користувача не знайдено' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущено на порту ${PORT}`);
  console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
});
