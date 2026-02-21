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
console.log('🚀 СЕРВЕР ЗАПУСКАЄТЬСЯ');
console.log('='.repeat(50));

// Ініціалізація бази даних
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }));
  console.log('✅ Базу даних створено');
}

app.get('/', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DB_PATH));
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
  
  res.json({ success: true, user: newUser });
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущено на порту ${PORT}`);
});
