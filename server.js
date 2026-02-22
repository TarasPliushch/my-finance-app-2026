// server.js - ПОВНИЙ РОБОЧИЙ СЕРВЕР
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();

// ===========================================
//           БАЗОВІ НАЛАШТУВАННЯ
// ===========================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

// ===========================================
//           ТЕСТОВИЙ МАРШРУТ (ВАЖЛИВО!)
// ===========================================
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 СЕРВЕР FINANCE AI ПРАЦЮЄ',
        status: 'ok',
        time: new Date().toISOString()
    });
});

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
//           JWT ФУНКЦІЇ
// ===========================================
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
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

// РЕЄСТРАЦІЯ
app.post('/api/auth/register', async (req, res) => {
    try {
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
            language: "uk",
            theme: "system",
            monthlyBudget: 0,
            monthlyIncome: 0,
            workplace: "",
            notificationsEnabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        db.users.push(newUser);
        writeDB(db);
        
        const token = generateToken(newUser.id);
        const { password: _, ...userWithoutPassword } = newUser;
        
        res.json({ success: true, token, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ВХІД
app.post('/api/auth/login', async (req, res) => {
    try {
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
        
        res.json({ success: true, token, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ОТРИМАННЯ КОРИСТУВАЧА
app.get('/api/auth/me', (req, res) => {
    try {
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
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================
//           МАРШРУТИ ВИТРАТ
// ===========================================

app.get('/api/expenses', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'Не авторизовано' });
        }
        
        const db = readDB();
        const userExpenses = (db.expenses || []).filter(e => e.userId === userId);
        
        res.json({ success: true, expenses: userExpenses });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/expenses', (req, res) => {
    try {
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
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/expenses/:id', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
        
        const db = readDB();
        db.expenses = (db.expenses || []).filter(e => !(e.id === req.params.id && e.userId === userId));
        writeDB(db);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================
//           МАРШРУТИ ЦІЛЕЙ
// ===========================================

app.get('/api/goals', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
        
        const db = readDB();
        const userGoals = (db.goals || []).filter(g => g.userId === userId);
        
        res.json({ success: true, goals: userGoals });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/goals', (req, res) => {
    try {
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
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/goals/:id', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
        
        const db = readDB();
        db.goals = (db.goals || []).filter(g => !(g.id === req.params.id && g.userId === userId));
        writeDB(db);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================
//           МАРШРУТИ ЧАТІВ
// ===========================================

app.get('/api/chat/sessions', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
        
        const db = readDB();
        const userSessions = (db.chatSessions || []).filter(s => s.userId === userId);
        
        const formattedSessions = userSessions.map(s => ({
            id: s.id,
            name: s.name,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            messageCount: s.messageCount || 0,
            lastMessage: s.lastMessage || null
        }));
        
        res.json({ success: true, sessions: formattedSessions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chat/sessions', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
        
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
        
        res.json({ success: true, session: newSession });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/chat/sessions/:sessionId', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const sessionId = req.params.sessionId;
        if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
        
        const db = readDB();
        db.chatSessions = (db.chatSessions || []).filter(s => !(s.id === sessionId && s.userId === userId));
        db.chatMessages = (db.chatMessages || []).filter(m => !(m.sessionId === sessionId && m.userId === userId));
        writeDB(db);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const sessionId = req.params.sessionId;
        if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
        
        const db = readDB();
        const messages = (db.chatMessages || []).filter(m => m.sessionId === sessionId && m.userId === userId);
        
        res.json({ success: true, messages: messages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chat/sessions/:sessionId/messages', (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const sessionId = req.params.sessionId;
        if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
        
        const db = readDB();
        const newMessage = {
            id: 'msg_' + Date.now(),
            userId: userId,
            sessionId: sessionId,
            content: req.body.content,
            isUser: req.body.isUser,
            createdAt: new Date().toISOString()
        };
        
        if (!db.chatMessages) db.chatMessages = [];
        db.chatMessages.push(newMessage);
        
        const sessionIndex = (db.chatSessions || []).findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            db.chatSessions[sessionIndex].updatedAt = new Date().toISOString();
            db.chatSessions[sessionIndex].lastMessage = req.body.content;
            db.chatSessions[sessionIndex].messageCount = (db.chatMessages || []).filter(
                m => m.sessionId === sessionId
            ).length;
        }
        
        writeDB(db);
        res.json({ success: true, message: newMessage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================
//           ЗАПУСК СЕРВЕРА
// ===========================================
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`✅ СЕРВЕР ЗАПУЩЕНО НА ПОРТУ ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log('='.repeat(50));
});
