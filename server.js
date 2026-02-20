// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Налаштування
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Тестовий маршрут
app.get('/', (req, res) => {
  res.json({ message: 'Сервер Finance AI працює!' });
});

// Підключення маршрутів API (додамо пізніше)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущено на порту ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
});