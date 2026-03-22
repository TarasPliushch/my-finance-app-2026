// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===========================================
//           НАЛАШТУВАННЯ
// ===========================================
const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';
const JWT_EXPIRE = '30d';

// ===========================================
//           ІНІЦІАЛІЗАЦІЯ БАЗИ ДАНИХ
// ===========================================
function initDB() {
    return {
        users: [],
        expenses: [],
        goals: [],
        chatSessions: [],
        chatMessages: []
    };
}

function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            console.log('📁 База даних не знайдена, створюємо нову');
            const initialDB = initDB();
            fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
            return initialDB;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('❌ Помилка читання БД:', error.message);
        return initDB();
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        console.log('💾 Базу даних збережено');
        return true;
    } catch (error) {
        console.log('❌ Помилка запису БД:', error.message);
        return false;
    }
}

// ===========================================
//           ДОПОМІЖНІ ФУНКЦІЇ
// ===========================================
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// ===========================================
//           МАРШРУТИ АВТОРИЗАЦІЇ
// ===========================================

app.post('/api/auth/register', async (req, res) => {
    console.log('📝 Реєстрація:', req.body.email);
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Всі поля обов\'язкові' });
    }
    
    const db = readDB();
    
    if (db.users.some(u => u.email === email)) {
        return res.status(400).json({ error: 'Email вже використовується' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const newUser = {
        id: 'user_' + Date.now(),
        email,
        name,
        password: hashedPassword,
        avatarEmoji: "👤",
        currency: "₴",
        monthlyBudget: 0,
        notificationsEnabled: true,
        theme: "system",
        createdAt: new Date().toISOString()
    };
    
    db.users.push(newUser);
    writeDB(db);
    
    const token = generateToken(newUser.id);
    const { password: _, ...userWithoutPassword } = newUser;
    
    res.json({
        success: true,
        token,
        user: userWithoutPassword
    });
});

app.post('/api/auth/login', async (req, res) => {
    console.log('🔑 Вхід:', req.body.email);
    const { email, password } = req.body;
    
    const db = readDB();
    const user = db.users.find(u => u.email === email);
    
    if (!user) {
        return res.status(401).json({ error: 'Невірний email або пароль' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ error: 'Невірний email або пароль' });
    }
    
    const token = generateToken(user.id);
    const { password: _, ...userWithoutPassword } = user;
    
    user.updatedAt = new Date().toISOString();
    writeDB(db);
    
    res.json({
        success: true,
        token,
        user: userWithoutPassword
    });
});

app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
        return res.status(401).json({ error: 'Недійсний токен' });
    }
    
    const db = readDB();
    const user = db.users.find(u => u.id === decoded.userId);
    
    if (!user) {
        return res.status(401).json({ error: 'Користувача не знайдено' });
    }
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
});

// ===========================================
//           МАРШРУТИ ВИТРАТ
// ===========================================

app.get('/api/expenses', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const db = readDB();
    const userExpenses = (db.expenses || []).filter(e => e.userId === userId);
    res.json({ success: true, expenses: userExpenses });
});

app.post('/api/expenses', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const db = readDB();
    
    const newExpense = {
        id: 'expense_' + Date.now(),
        userId: userId,
        ...req.body,
        date: req.body.date || new Date().toISOString()
    };
    
    if (!db.expenses) db.expenses = [];
    db.expenses.push(newExpense);
    writeDB(db);
    
    res.json({ success: true, expense: newExpense });
});

app.delete('/api/expenses/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    db.expenses = (db.expenses || []).filter(e => !(e.id === req.params.id && e.userId === userId));
    writeDB(db);
    
    res.json({ success: true });
});

// ===========================================
//           МАРШРУТИ ЦІЛЕЙ
// ===========================================

app.get('/api/goals', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const userGoals = (db.goals || []).filter(g => g.userId === userId);
    res.json({ success: true, goals: userGoals });
});

app.post('/api/goals', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    
    const newGoal = {
        id: 'goal_' + Date.now(),
        userId: userId,
        ...req.body,
        imageEmoji: req.body.imageEmoji || "💰"
    };
    
    if (!db.goals) db.goals = [];
    db.goals.push(newGoal);
    writeDB(db);
    
    res.json({ success: true, goal: newGoal });
});

app.delete('/api/goals/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    db.goals = (db.goals || []).filter(g => !(g.id === req.params.id && g.userId === userId));
    writeDB(db);
    
    res.json({ success: true });
});

// ===========================================
//           МАРШРУТИ ЧАТІВ
// ===========================================

// ОТРИМАННЯ ВСІХ СЕСІЙ
app.get('/api/chat/sessions', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) {
        console.log('❌ chat/sessions: userId відсутній');
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const db = readDB();
    const userSessions = (db.chatSessions || []).filter(s => s.userId === userId);
    
    console.log(`📊 Сесій для userId ${userId}: ${userSessions.length}`);
    
    const formattedSessions = userSessions.map(s => ({
        id: s.id,
        name: s.name,
        userId: s.userId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messageCount || 0,
        lastMessage: s.lastMessage || null
    }));
    
    res.json({ success: true, sessions: formattedSessions });
});

// СТВОРЕННЯ НОВОЇ СЕСІЇ
app.post('/api/chat/sessions', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) {
        console.log('❌ create session: userId відсутній');
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const db = readDB();
    const newSession = {
        id: 'session_' + Date.now(),
        userId: userId,
        name: req.body.name || 'Новий чат',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        lastMessage: null
    };
    
    if (!db.chatSessions) db.chatSessions = [];
    db.chatSessions.push(newSession);
    writeDB(db);
    
    console.log(`✅ Сесію створено для userId ${userId}: ${newSession.id}`);
    res.json({ success: true, session: newSession });
});

// ОНОВЛЕННЯ СЕСІЇ (ПЕРЕЙМЕНУВАННЯ)
app.put('/api/chat/sessions/:sessionId', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    if (!userId) {
        console.log('❌ update session: userId відсутній');
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const db = readDB();
    const sessionIndex = (db.chatSessions || []).findIndex(s => s.id === sessionId && s.userId === userId);
    
    if (sessionIndex === -1) {
        return res.status(404).json({ error: 'Сесію не знайдено' });
    }
    
    db.chatSessions[sessionIndex].name = req.body.name || db.chatSessions[sessionIndex].name;
    db.chatSessions[sessionIndex].updatedAt = new Date().toISOString();
    writeDB(db);
    
    console.log(`✏️ Сесію перейменовано: ${sessionId} -> ${db.chatSessions[sessionIndex].name}`);
    res.json({ success: true, session: db.chatSessions[sessionIndex] });
});

// ВИДАЛЕННЯ СЕСІЇ
app.delete('/api/chat/sessions/:sessionId', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    db.chatSessions = (db.chatSessions || []).filter(s => !(s.id === sessionId && s.userId === userId));
    db.chatMessages = (db.chatMessages || []).filter(m => !(m.sessionId === sessionId && m.userId === userId));
    writeDB(db);
    
    console.log(`🗑️ Сесію видалено: ${sessionId}`);
    res.json({ success: true });
});

// ОТРИМАННЯ ПОВІДОМЛЕНЬ СЕСІЇ
app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const messages = (db.chatMessages || []).filter(m => m.sessionId === sessionId && m.userId === userId);
    
    console.log(`📨 Повідомлень для сесії ${sessionId}: ${messages.length}`);
    res.json({ success: true, messages: messages });
});

// ДОДАВАННЯ ПОВІДОМЛЕННЯ
app.post('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    
    console.log('📝 ДОДАВАННЯ ПОВІДОМЛЕННЯ');
    console.log('📝 userId:', userId);
    console.log('📝 sessionId:', sessionId);
    console.log('📝 body:', req.body);
    
    if (!userId) {
        return res.status(401).json({ error: 'Не авторизовано - userId відсутній' });
    }
    
    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId відсутній' });
    }
    
    if (!req.body.content) {
        return res.status(400).json({ error: 'content відсутній' });
    }
    
    const db = readDB();
    
    // Перевіряємо чи існує сесія
    const sessionExists = (db.chatSessions || []).some(s => s.id === sessionId && s.userId === userId);
    if (!sessionExists) {
        return res.status(404).json({ error: 'Сесію не знайдено' });
    }
    
    const newMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        userId: userId,
        sessionId: sessionId,
        content: req.body.content,
        isUser: req.body.isUser || false,
        createdAt: new Date().toISOString()
    };
    
    if (!db.chatMessages) db.chatMessages = [];
    db.chatMessages.push(newMessage);
    
    // Оновлюємо сесію
    const sessionIndex = (db.chatSessions || []).findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) {
        db.chatSessions[sessionIndex].updatedAt = new Date().toISOString();
        db.chatSessions[sessionIndex].lastMessage = req.body.content;
        db.chatSessions[sessionIndex].messageCount = (db.chatMessages || []).filter(
            m => m.sessionId === sessionId
        ).length;
    }
    
    writeDB(db);
    
    console.log(`✅ Повідомлення додано: ${newMessage.id}`);
    res.json({ success: true, message: newMessage });
});

// ===========================================
//           СТАТИСТИЧНІ МАРШРУТИ
// ===========================================

app.get('/api/user/stats', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    
    const userExpenses = (db.expenses || []).filter(e => e.userId === userId);
    const userGoals = (db.goals || []).filter(g => g.userId === userId);
    const userSessions = (db.chatSessions || []).filter(s => s.userId === userId);
    
    res.json({
        success: true,
        stats: {
            totalExpenses: userExpenses.length,
            totalExpensesAmount: userExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
            totalGoals: userGoals.length,
            completedGoals: userGoals.filter(g => g.currentAmount >= g.targetAmount).length,
            totalChats: userSessions.length,
            totalMessages: (db.chatMessages || []).filter(m => m.userId === userId).length
        }
    });
});

// ===========================================
//           ТЕСТОВИЙ МАРШРУТ
// ===========================================

app.get('/', (req, res) => {
    const db = readDB();
    res.json({
        message: '🚀 СЕРВЕР FINANCE AI',
        version: '2.0',
        features: {
            auth: true,
            expenses: true,
            goals: true,
            chats: true,
            profiles: true,
            statistics: true
        },
        stats: {
            users: db.users.length,
            expenses: (db.expenses || []).length,
            goals: (db.goals || []).length,
            chatSessions: (db.chatSessions || []).length,
            chatMessages: (db.chatMessages || []).length
        },
        time: new Date().toISOString()
    });
});

// GET /api/notifications
app.get('/api/notifications', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const notifs = (db.notifications || []).filter(n => n.userId === userId);
    res.json({ success: true, notifications: notifs.map(({userId: _, ...n}) => n) });
});

// POST /api/notifications
app.post('/api/notifications', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    if (!db.notifications) db.notifications = [];
    const notif = { ...req.body, userId };
    db.notifications.push(notif);
    if (db.notifications.length > 200) db.notifications = db.notifications.slice(-200);
    writeDB(db);
    res.json({ success: true });
});

// DELETE /api/notifications/:id
app.delete('/api/notifications/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    db.notifications = (db.notifications || []).filter(
        n => !(n.id === req.params.id && n.userId === userId)
    );
    writeDB(db);
    res.json({ success: true });
});

// PUT /api/notifications/read-all
app.put('/api/notifications/read-all', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    (db.notifications || []).forEach(n => { if (n.userId === userId) n.isRead = true; });
    writeDB(db);
    res.json({ success: true });
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
