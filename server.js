// server.js - ПОВНИЙ РОБОЧИЙ СЕРВЕР
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===========================================
//           НАЛАШТУВАННЯ
// ===========================================
const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';
const JWT_EXPIRE = '30d';

// ===========================================
//         НАЛАШТУВАННЯ MULTER (АВАТАРКИ)
// ===========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = '/tmp/uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'avatar-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Дозволені тільки зображення (jpeg, jpg, png, gif)'));
        }
    }
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

// РЕЄСТРАЦІЯ
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
        avatar: null,
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
    
    res.json({
        success: true,
        token,
        user: userWithoutPassword
    });
});

// ВХІД
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

// ОТРИМАННЯ ПОТОЧНОГО КОРИСТУВАЧА
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

// ОНОВЛЕННЯ ПРОФІЛЮ
app.put('/api/auth/profile', upload.single('avatar'), (req, res) => {
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
    const userIndex = db.users.findIndex(u => u.id === decoded.userId);
    
    if (userIndex === -1) {
        return res.status(401).json({ error: 'Користувача не знайдено' });
    }
    
    const updates = req.body;
    const allowedFields = [
        'name', 'avatarEmoji', 'currency', 'language', 'theme',
        'monthlyBudget', 'monthlyIncome', 'workplace', 'notificationsEnabled'
    ];
    
    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            db.users[userIndex][field] = updates[field];
        }
    });
    
    if (req.file) {
        db.users[userIndex].avatar = `/uploads/${req.file.filename}`;
    }
    
    db.users[userIndex].updatedAt = new Date().toISOString();
    writeDB(db);
    
    const { password: _, ...userWithoutPassword } = db.users[userIndex];
    res.json({ success: true, user: userWithoutPassword });
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

app.get('/api/expenses/stats', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const userExpenses = (db.expenses || []).filter(e => e.userId === userId);
    
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
//           МАРШРУТИ ЧАТІВ (ДОДАНО!)
// ===========================================

// ОТРИМАННЯ ВСІХ СЕСІЙ
app.get('/api/chat/sessions', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const userSessions = (db.chatSessions || []).filter(s => s.userId === userId);
    
    // Форматуємо сесії з усіма потрібними полями
    const formattedSessions = userSessions.map(s => ({
        id: s.id,
        name: s.name,
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
    
    res.json({ success: true });
});

// ОТРИМАННЯ ПОВІДОМЛЕНЬ СЕСІЇ
app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const messages = (db.chatMessages || []).filter(m => m.sessionId === sessionId && m.userId === userId);
    
    res.json({ success: true, messages: messages });
});

// ДОДАВАННЯ ПОВІДОМЛЕННЯ
app.post('/api/chat/sessions/:sessionId/messages', (req, res) => {
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

// ===========================================
//           СТАТИЧНІ ФАЙЛИ (АВАТАРКИ)
// ===========================================
app.use('/uploads', express.static('/tmp/uploads'));

// ===========================================
//           ЗАПУСК СЕРВЕРА
// ===========================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`✅ СЕРВЕР ЗАПУЩЕНО НА ПОРТУ ${PORT}`);
    console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
    console.log('='.repeat(50));
});
