// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';
const JWT_EXPIRE = '30d';

function initDB() {
    return {
        users: [],
        expenses: [],
        goals: [],
        chatSessions: [],
        chatMessages: [],
        notifications: [],        // ← FIXED: was missing
        shoppingLists: []         // ← NEW
    };
}

function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const initialDB = initDB();
            fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
            return initialDB;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        const db = JSON.parse(data);
        // Migrate: ensure new collections exist in existing DB
        if (!db.notifications) db.notifications = [];
        if (!db.shoppingLists) db.shoppingLists = [];
        return db;
    } catch (error) {
        return initDB();
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        return false;
    }
}

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
}

function verifyToken(token) {
    try { return jwt.verify(token, JWT_SECRET); }
    catch (error) { return null; }
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Не авторизовано' });
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Недійсний токен' });
    req.userId = decoded.userId;
    next();
}

// ─── AUTH ──────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name)
        return res.status(400).json({ error: 'Всі поля обов\'язкові' });
    const db = readDB();
    if (db.users.some(u => u.email === email))
        return res.status(400).json({ error: 'Email вже використовується' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: 'user_' + Date.now(), email, name,
        password: hashedPassword, avatarEmoji: "👤",
        currency: "₴", monthlyBudget: 0,
        notificationsEnabled: true, theme: "system",
        pinHash: null, language: "uk",
        createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDB(db);
    const { password: _, ...userWithoutPassword } = newUser;
    res.json({ success: true, token: generateToken(newUser.id), user: userWithoutPassword });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Невірний email або пароль' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Невірний email або пароль' });
    user.updatedAt = new Date().toISOString();
    writeDB(db);
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, token: generateToken(user.id), user: userWithoutPassword });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.userId);
    if (!user) return res.status(401).json({ error: 'Користувача не знайдено' });
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
});

app.put('/api/auth/profile', authMiddleware, (req, res) => {
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'Користувача не знайдено' });
    const allowed = ['name','avatarEmoji','currency','monthlyBudget','notificationsEnabled','theme','language','pinHash','bio'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) db.users[idx][field] = req.body[field];
    });
    db.users[idx].updatedAt = new Date().toISOString();
    writeDB(db);
    const { password: _, ...userWithoutPassword } = db.users[idx];
    res.json({ success: true, user: userWithoutPassword });
});

// PIN — dedicated endpoint
app.put('/api/auth/pin', authMiddleware, (req, res) => {
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'Користувача не знайдено' });
    db.users[idx].pinHash = req.body.pinHash || null;
    db.users[idx].updatedAt = new Date().toISOString();
    writeDB(db);
    res.json({ success: true });
});

// ─── EXPENSES ──────────────────────────────────────────────────────────

app.get('/api/expenses', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    res.json({ success: true, expenses: (db.expenses || []).filter(e => e.userId === userId) });
});

app.post('/api/expenses', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const e = { id: 'expense_' + Date.now(), userId, ...req.body, date: req.body.date || new Date().toISOString() };
    if (!db.expenses) db.expenses = [];
    db.expenses.push(e);
    writeDB(db);
    res.json({ success: true, expense: e });
});

app.put('/api/expenses/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const idx = (db.expenses || []).findIndex(e => e.id === req.params.id && e.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Не знайдено' });
    db.expenses[idx] = { ...db.expenses[idx], ...req.body, id: req.params.id, userId };
    writeDB(db);
    res.json({ success: true, expense: db.expenses[idx] });
});

app.delete('/api/expenses/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    db.expenses = (db.expenses || []).filter(e => !(e.id === req.params.id && e.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

// ─── GOALS ─────────────────────────────────────────────────────────────

app.get('/api/goals', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    res.json({ success: true, goals: (db.goals || []).filter(g => g.userId === userId) });
});

app.post('/api/goals', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const g = { id: 'goal_' + Date.now(), userId, ...req.body, imageEmoji: req.body.imageEmoji || "💰" };
    if (!db.goals) db.goals = [];
    db.goals.push(g);
    writeDB(db);
    res.json({ success: true, goal: g });
});

app.put('/api/goals/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const idx = (db.goals || []).findIndex(g => g.id === req.params.id && g.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Не знайдено' });
    db.goals[idx] = { ...db.goals[idx], ...req.body, id: req.params.id, userId };
    writeDB(db);
    res.json({ success: true, goal: db.goals[idx] });
});

app.delete('/api/goals/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    db.goals = (db.goals || []).filter(g => !(g.id === req.params.id && g.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

// ─── SHOPPING LISTS ────────────────────────────────────────────────────

app.get('/api/shopping-lists', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const lists = (db.shoppingLists || []).filter(l => l.userId === userId);
    res.json({ success: true, lists: lists.map(({ userId: _, ...l }) => l) });
});

app.post('/api/shopping-lists', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const list = {
        id: 'list_' + Date.now(), userId,
        name: req.body.name || 'Новий список',
        items: req.body.items || [],
        reminderDate: req.body.reminderDate || null,
        reminderLeadMinutes: req.body.reminderLeadMinutes || 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    if (!db.shoppingLists) db.shoppingLists = [];
    db.shoppingLists.push(list);
    writeDB(db);
    const { userId: _, ...listWithout } = list;
    res.json({ success: true, list: listWithout });
});

app.put('/api/shopping-lists/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const idx = (db.shoppingLists || []).findIndex(l => l.id === req.params.id && l.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Список не знайдено' });
    const allowed = ['name','items','reminderDate','reminderLeadMinutes'];
    allowed.forEach(f => { if (req.body[f] !== undefined) db.shoppingLists[idx][f] = req.body[f]; });
    db.shoppingLists[idx].updatedAt = new Date().toISOString();
    writeDB(db);
    const { userId: _, ...listWithout } = db.shoppingLists[idx];
    res.json({ success: true, list: listWithout });
});

app.delete('/api/shopping-lists/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    db.shoppingLists = (db.shoppingLists || []).filter(l => !(l.id === req.params.id && l.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────

app.get('/api/notifications', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const notifs = (db.notifications || []).filter(n => n.userId === userId);
    res.json({ success: true, notifications: notifs.map(({ userId: _, ...n }) => n) });
});

app.post('/api/notifications', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    if (!db.notifications) db.notifications = [];
    db.notifications.push({ ...req.body, userId });
    // Keep last 500 per user max
    const userNotifs = db.notifications.filter(n => n.userId === userId);
    if (userNotifs.length > 500) {
        const toRemove = userNotifs.length - 500;
        let removed = 0;
        db.notifications = db.notifications.filter(n => {
            if (n.userId === userId && removed < toRemove) { removed++; return false; }
            return true;
        });
    }
    writeDB(db);
    res.json({ success: true });
});

app.delete('/api/notifications/:id', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    db.notifications = (db.notifications || []).filter(n => !(n.id === req.params.id && n.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

app.put('/api/notifications/read-all', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    (db.notifications || []).forEach(n => { if (n.userId === userId) n.isRead = true; });
    writeDB(db);
    res.json({ success: true });
});

// ─── CHAT ──────────────────────────────────────────────────────────────

app.get('/api/chat/sessions', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const sessions = (db.chatSessions || []).filter(s => s.userId === userId);
    res.json({ success: true, sessions: sessions.map(s => ({
        id: s.id, name: s.name, userId: s.userId,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
        messageCount: s.messageCount || 0, lastMessage: s.lastMessage || null
    }))});
});

app.post('/api/chat/sessions', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const s = {
        id: 'session_' + Date.now(), userId,
        name: req.body.name || 'Новий чат',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        messageCount: 0, lastMessage: null
    };
    if (!db.chatSessions) db.chatSessions = [];
    db.chatSessions.push(s);
    writeDB(db);
    res.json({ success: true, session: s });
});

app.put('/api/chat/sessions/:sessionId', (req, res) => {
    const userId = req.headers['user-id'];
    const { sessionId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const idx = (db.chatSessions || []).findIndex(s => s.id === sessionId && s.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Сесію не знайдено' });
    if (req.body.name) db.chatSessions[idx].name = req.body.name;
    db.chatSessions[idx].updatedAt = new Date().toISOString();
    writeDB(db);
    res.json({ success: true, session: db.chatSessions[idx] });
});

app.delete('/api/chat/sessions/:sessionId', (req, res) => {
    const userId = req.headers['user-id'];
    const { sessionId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    db.chatSessions = (db.chatSessions || []).filter(s => !(s.id === sessionId && s.userId === userId));
    db.chatMessages = (db.chatMessages || []).filter(m => !(m.sessionId === sessionId && m.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const { sessionId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    const messages = (db.chatMessages || []).filter(m => m.sessionId === sessionId && m.userId === userId);
    res.json({ success: true, messages });
});

app.post('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const { sessionId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    if (!req.body.content) return res.status(400).json({ error: 'content відсутній' });
    const db = readDB();
    const sessionExists = (db.chatSessions || []).some(s => s.id === sessionId && s.userId === userId);
    if (!sessionExists) return res.status(404).json({ error: 'Сесію не знайдено' });
    const msg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        userId, sessionId, content: req.body.content,
        isUser: req.body.isUser || false, createdAt: new Date().toISOString()
    };
    if (!db.chatMessages) db.chatMessages = [];
    db.chatMessages.push(msg);
    const sIdx = db.chatSessions.findIndex(s => s.id === sessionId);
    if (sIdx !== -1) {
        db.chatSessions[sIdx].updatedAt = new Date().toISOString();
        db.chatSessions[sIdx].lastMessage = req.body.content;
        db.chatSessions[sIdx].messageCount = db.chatMessages.filter(m => m.sessionId === sessionId).length;
    }
    writeDB(db);
    res.json({ success: true, message: msg });
});

// ─── STATS ─────────────────────────────────────────────────────────────

app.get('/api/user/stats', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    const db = readDB();
    res.json({ success: true, stats: {
        totalExpenses: (db.expenses || []).filter(e => e.userId === userId).length,
        totalExpensesAmount: (db.expenses || []).filter(e => e.userId === userId).reduce((s, e) => s + (e.amount || 0), 0),
        totalGoals: (db.goals || []).filter(g => g.userId === userId).length,
        completedGoals: (db.goals || []).filter(g => g.userId === userId && g.currentAmount >= g.targetAmount).length,
        totalChats: (db.chatSessions || []).filter(s => s.userId === userId).length,
        totalMessages: (db.chatMessages || []).filter(m => m.userId === userId).length
    }});
});

// ─── ROOT ──────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
    const db = readDB();
    res.json({ message: '🚀 СЕРВЕР FINANCE AI', version: '3.0',
        stats: { users: db.users.length, expenses: (db.expenses||[]).length,
                 goals: (db.goals||[]).length, shoppingLists: (db.shoppingLists||[]).length,
                 notifications: (db.notifications||[]).length,
                 chatSessions: (db.chatSessions||[]).length },
        time: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`✅ СЕРВЕР ЗАПУЩЕНО НА ПОРТУ ${PORT}`);
    console.log('='.repeat(50));
});
