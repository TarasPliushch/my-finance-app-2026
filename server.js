// server.js - ПОВНІСТЮ ВИПРАВЛЕНИЙ
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===========================================
//           НАЛАШТУВАННЯ
// ===========================================
const DB_PATH = '/tmp/db.json';
const PORT = process.env.PORT || 5000;

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
        console.log('💾 Базу даних збережено');
        return true;
    } catch (error) {
        console.log('❌ Помилка запису БД:', error.message);
        return false;
    }
}

// ===========================================
//           МАРШРУТИ АВТОРИЗАЦІЇ
// ===========================================

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
        password,
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

app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const db = readDB();
    if (db.users.length > 0) {
        const user = db.users[db.users.length - 1];
        const { password: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword });
    } else {
        res.json({ user: null });
    }
});

// ===========================================
//           МАРШРУТИ ВИТРАТ
// ===========================================

app.get('/api/expenses', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const userExpenses = (db.expenses || []).filter(e => e.userId === userId);
    res.json({ success: true, expenses: userExpenses });
});

app.post('/api/expenses', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
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
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const db = readDB();
    const userSessions = (db.chatSessions || []).filter(s => s.userId === userId);
    
    console.log(`📊 Сесій для userId ${userId}: ${userSessions.length}`);
    res.json({ success: true, sessions: userSessions });
});

// СТВОРЕННЯ НОВОЇ СЕСІЇ
app.post('/api/chat/sessions', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) {
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
    
    console.log(`✅ Створено сесію: ${newSession.id}`);
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

// ОТРИМАННЯ ПОВІДОМЛЕНЬ
app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const messages = (db.chatMessages || []).filter(m => m.sessionId === sessionId && m.userId === userId);
    
    res.json({ success: true, messages: messages });
});

// ДОДАВАННЯ ПОВІДОМЛЕННЯ - ВИПРАВЛЕНО!
app.post('/api/chat/sessions/:sessionId/messages', (req, res) => {
    console.log('='.repeat(50));
    console.log('📨 ОТРИМАНО POST ЗАПИТ НА ПОВІДОМЛЕННЯ');
    console.log('📨 Headers:', req.headers);
    console.log('📨 Body:', req.body);
    console.log('📨 Params:', req.params);
    console.log('='.repeat(50));
    
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    
    // ПЕРЕВІРКА 1: userId
    if (!userId) {
        console.log('❌ ПОМИЛКА: userId відсутній');
        return res.status(401).json({ error: 'userId відсутній' });
    }
    
    // ПЕРЕВІРКА 2: sessionId
    if (!sessionId) {
        console.log('❌ ПОМИЛКА: sessionId відсутній');
        return res.status(400).json({ error: 'sessionId відсутній' });
    }
    
    // ПЕРЕВІРКА 3: content
    if (!req.body.content) {
        console.log('❌ ПОМИЛКА: content відсутній');
        return res.status(400).json({ error: 'content відсутній' });
    }
    
    try {
        const db = readDB();
        
        // ПЕРЕВІРКА 4: чи існує сесія
        const sessionExists = (db.chatSessions || []).some(s => s.id === sessionId && s.userId === userId);
        if (!sessionExists) {
            console.log(`❌ ПОМИЛКА: Сесія ${sessionId} не знайдена для userId ${userId}`);
            return res.status(404).json({ error: 'Сесію не знайдено' });
        }
        
        // Створюємо повідомлення
        const newMessage = {
            id: 'msg_' + Date.now(),
            userId: userId,
            sessionId: sessionId,
            content: req.body.content,
            isUser: req.body.isUser === true,
            createdAt: new Date().toISOString()
        };
        
        console.log('📨 Нове повідомлення:', newMessage);
        
        // Додаємо в базу
        if (!db.chatMessages) db.chatMessages = [];
        db.chatMessages.push(newMessage);
        
        // Оновлюємо сесію
        const sessionIndex = db.chatSessions.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            db.chatSessions[sessionIndex].updatedAt = new Date().toISOString();
            db.chatSessions[sessionIndex].lastMessage = req.body.content;
            db.chatSessions[sessionIndex].messageCount = (db.chatMessages || []).filter(
                m => m.sessionId === sessionId
            ).length;
            console.log(`📊 Оновлено сесію, тепер повідомлень: ${db.chatSessions[sessionIndex].messageCount}`);
        }
        
        // Зберігаємо
        const saved = writeDB(db);
        
        if (saved) {
            console.log('✅ Повідомлення успішно збережено в БД');
        } else {
            console.log('❌ ПОМИЛКА при збереженні в БД');
            return res.status(500).json({ error: 'Помилка збереження' });
        }
        
        console.log('✅ Повідомлення успішно додано!');
        
        res.json({ success: true, message: newMessage });
        
    } catch (error) {
        console.log('❌ КРИТИЧНА ПОМИЛКА:', error);
        res.status(500).json({ error: 'Внутрішня помилка сервера: ' + error.message });
    }
}); // ← Ця дужка була відсутня!

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
//           ЗАПУСК СЕРВЕРА
// ===========================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`✅ СЕРВЕР ЗАПУЩЕНО НА ПОРТУ ${PORT}`);
    console.log(`📍 https://financeai-app-2026-production.up.railway.app`);
    console.log('='.repeat(50));
});
