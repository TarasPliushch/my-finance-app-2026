// server.js - ПРАВИЛЬНА ВЕРСІЯ З ПРИВ'ЯЗКОЮ ДО КОРИСТУВАЧА
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;

// Ініціалізація бази даних
function initDB() {
    return {
        users: [],
        expenses: [],    // КОЖЕН елемент матиме userId
        goals: [],       // КОЖЕН елемент матиме userId
        chatSessions: [], // КОЖЕН елемент матиме userId
        chatMessages: []  // КОЖЕН елемент матиме userId
    };
}

// Читання бази
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            fs.writeFileSync(DB_PATH, JSON.stringify(initDB(), null, 2));
            return initDB();
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('❌ Помилка читання БД:', error.message);
        return initDB();
    }
}

// Запис в базу
function writeDB(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.log('❌ Помилка запису БД:', error.message);
        return false;
    }
}

// ===========================================
//           МАРШРУТИ АВТОРИЗАЦІЇ
// ===========================================

// РЕЄСТРАЦІЯ
app.post('/api/auth/register', (req, res) => {
    console.log('📝 Реєстрація:', req.body.email);
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Всі поля обов\'язкові' });
    }
    
    const db = readDB();
    
    if (db.users.some(u => u.email === email)) {
        return res.status(400).json({ error: 'Email вже використовується' });
    }
    
    const newUser = {
        id: 'user_' + Date.now(),
        email,
        name,
        password, // В реальному проекті треба хешувати!
        avatarEmoji: "👤",
        currency: "₴",
        monthlyBudget: 0,
        notificationsEnabled: true,
        theme: "system",
        createdAt: new Date().toISOString()
    };
    
    db.users.push(newUser);
    writeDB(db);
    
    const { password: _, ...userWithoutPassword } = newUser;
    
    res.json({
        success: true,
        token: 'token_' + Date.now(),
        user: userWithoutPassword
    });
});

// ВХІД
app.post('/api/auth/login', (req, res) => {
    console.log('🔑 Вхід:', req.body.email);
    const { email, password } = req.body;
    
    const db = readDB();
    const user = db.users.find(u => u.email === email);
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Невірний email або пароль' });
    }
    
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
        success: true,
        token: 'token_' + Date.now(),
        user: userWithoutPassword
    });
});

// ===========================================
//           МАРШРУТИ ВИТРАТ (З ПРИВ'ЯЗКОЮ)
// ===========================================

// ОТРИМАННЯ ВСІХ ВИТРАТ КОРИСТУВАЧА
app.get('/api/expenses', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'Не авторизовано - немає userId' });
    }
    
    const db = readDB();
    // Фільтруємо ТІЛЬКИ витрати цього користувача
    const userExpenses = db.expenses.filter(e => e.userId === userId);
    
    console.log(`📊 Витрати для userId ${userId}: ${userExpenses.length} записів`);
    res.json({ success: true, expenses: userExpenses });
});

// ДОДАВАННЯ ВИТРАТИ
app.post('/api/expenses', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'Не авторизовано - немає userId' });
    }
    
    const db = readDB();
    
    // Створюємо витрату З прив'язкою до userId
    const newExpense = {
        id: 'expense_' + Date.now(),
        userId: userId,  // ← КЛЮЧОВИЙ МОМЕНТ!
        ...req.body,
        date: req.body.date || new Date().toISOString()
    };
    
    if (!db.expenses) db.expenses = [];
    db.expenses.push(newExpense);
    writeDB(db);
    
    console.log(`✅ Витрату додано для userId ${userId}`);
    res.json({ success: true, expense: newExpense });
});

// ВИДАЛЕННЯ ВИТРАТИ
app.delete('/api/expenses/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    // Видаляємо ТІЛЬКИ якщо це витрата поточного користувача
    db.expenses = db.expenses.filter(e => !(e.id === req.params.id && e.userId === userId));
    writeDB(db);
    
    res.json({ success: true });
});

// СТАТИСТИКА (ТІЛЬКИ ДЛЯ ПОТОЧНОГО КОРИСТУВАЧА)
app.get('/api/expenses/stats', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const userExpenses = db.expenses.filter(e => e.userId === userId);
    
    res.json({
        success: true,
        stats: {
            totalCount: userExpenses.length,
            totalAmount: userExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
            categoryCount: new Set(userExpenses.map(e => e.category)).size
        }
    });
});

// ===========================================
//           МАРШРУТИ ЦІЛЕЙ (З ПРИВ'ЯЗКОЮ)
// ===========================================

// ОТРИМАННЯ ЦІЛЕЙ
app.get('/api/goals', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const userGoals = db.goals.filter(g => g.userId === userId);
    
    res.json({ success: true, goals: userGoals });
});

// ДОДАВАННЯ ЦІЛІ
app.post('/api/goals', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    
    const newGoal = {
        id: 'goal_' + Date.now(),
        userId: userId,  // ← КЛЮЧОВИЙ МОМЕНТ!
        ...req.body,
        imageEmoji: req.body.imageEmoji || "💰"
    };
    
    if (!db.goals) db.goals = [];
    db.goals.push(newGoal);
    writeDB(db);
    
    res.json({ success: true, goal: newGoal });
});

// ВИДАЛЕННЯ ЦІЛІ
app.delete('/api/goals/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    db.goals = db.goals.filter(g => !(g.id === req.params.id && g.userId === userId));
    writeDB(db);
    
    res.json({ success: true });
});

// ===========================================
//           ТЕСТОВИЙ МАРШРУТ
// ===========================================

app.get('/', (req, res) => {
    const db = readDB();
    res.json({
        message: '🚀 СЕРВЕР FINANCE AI',
        stats: {
            users: db.users.length,
            expenses: db.expenses.length,
            goals: db.goals.length
        },
        time: new Date().toISOString()
    });
});

// ===========================================
//           ЗАПУСК СЕРВЕРА
// ===========================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`✅ СЕРВЕР ЗАПУЩЕНО НА ПОРТУ ${PORT}`);
    console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
    console.log('='.repeat(50));
});
