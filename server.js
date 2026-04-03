// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const crypto = require('crypto');
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
const OTP_EXPIRE_MINUTES = 10;
const MAX_PIN_ATTEMPTS = 3;
const BLOCK_DURATION_MINUTES = 30;

// ===========================================
//           ІНІЦІАЛІЗАЦІЯ БАЗИ ДАНИХ
// ===========================================
function initDB() {
    return {
        users: [],
        expenses: [],
        goals: [],
        chatSessions: [],
        chatMessages: [],
        notifications: [],
        shoppingLists: [],
        shoppingItems: [],
        otpCodes: [],
        pinResetCodes: [],
        twoFactorCodes: [],
        pinAttempts: [],
        blockedAccounts: []
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
        const db = JSON.parse(data);
        if (!db.otpCodes) db.otpCodes = [];
        if (!db.notifications) db.notifications = [];
        if (!db.shoppingLists) db.shoppingLists = [];
        if (!db.shoppingItems) db.shoppingItems = [];
        if (!db.pinResetCodes) db.pinResetCodes = [];
        if (!db.twoFactorCodes) db.twoFactorCodes = [];
        if (!db.pinAttempts) db.pinAttempts = [];
        if (!db.blockedAccounts) db.blockedAccounts = [];
        return db;
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

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function getAuthUserId(req) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const decoded = verifyToken(authHeader.split(' ')[1]);
        if (decoded) return decoded.userId;
    }
    return req.headers['user-id'] || null;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function saveOTP(db, userId, type, code) {
    db.otpCodes = (db.otpCodes || []).filter(o => !(o.userId === userId && o.type === type));
    const expiresAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000).toISOString();
    db.otpCodes.push({ userId, type, code, expiresAt, createdAt: new Date().toISOString() });
}

function verifyOTP(db, userId, type, inputCode) {
    const otp = (db.otpCodes || []).find(o => o.userId === userId && o.type === type);
    if (!otp) return { valid: false, reason: 'Код не знайдено' };
    if (new Date(otp.expiresAt) < new Date()) return { valid: false, reason: 'Термін дії коду вийшов' };
    if (otp.code !== inputCode) return { valid: false, reason: 'Невірний код' };
    db.otpCodes = db.otpCodes.filter(o => !(o.userId === userId && o.type === type));
    return { valid: true };
}

function isAccountBlocked(db, userId) {
    const blocked = (db.blockedAccounts || []).find(b => b.userId === userId);
    if (!blocked) return false;
    if (new Date(blocked.expiresAt) < new Date()) {
        db.blockedAccounts = (db.blockedAccounts || []).filter(b => b.userId !== userId);
        writeDB(db);
        return false;
    }
    return true;
}

function recordFailedPinAttempt(db, userId) {
    const attempts = (db.pinAttempts || []).find(a => a.userId === userId);
    const now = new Date();
    
    if (!attempts) {
        db.pinAttempts.push({ userId, count: 1, lastAttempt: now.toISOString() });
    } else {
        const lastAttempt = new Date(attempts.lastAttempt);
        if (now.getTime() - lastAttempt.getTime() > 15 * 60 * 1000) {
            attempts.count = 1;
        } else {
            attempts.count++;
        }
        attempts.lastAttempt = now.toISOString();
    }
    
    if (attempts.count >= MAX_PIN_ATTEMPTS) {
        const expiresAt = new Date(now.getTime() + BLOCK_DURATION_MINUTES * 60 * 1000);
        db.blockedAccounts = (db.blockedAccounts || []).filter(b => b.userId !== userId);
        db.blockedAccounts.push({
            userId,
            expiresAt: expiresAt.toISOString(),
            attempts: attempts.count,
            blockedAt: now.toISOString()
        });
        db.pinAttempts = (db.pinAttempts || []).filter(a => a.userId !== userId);
        writeDB(db);
        return true;
    }
    
    writeDB(db);
    return false;
}

function resetPinAttempts(db, userId) {
    db.pinAttempts = (db.pinAttempts || []).filter(a => a.userId !== userId);
    writeDB(db);
}

async function sendEmail(to, subject, html) {
    if (!process.env.RESEND_API_KEY) {
        console.log(`⚠️ RESEND_API_KEY не налаштований — email до ${to} пропущено`);
        console.log(`📧 Тема: ${subject}`);
        return true;
    }
    return new Promise((resolve) => {
        const body = JSON.stringify({
            from: 'FinanceAI <onboarding@yourproject.ink>',
            to: [to],
            subject,
            html
        });
        const options = {
            hostname: 'api.resend.com',
            path: '/emails',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    console.log(`📧 Email надіслано → ${to}`);
                    resolve(true);
                } else {
                    console.log(`❌ Resend помилка [${res.statusCode}]: ${data}`);
                    resolve(false);
                }
            });
        });
        req.on('error', (err) => {
            console.log('❌ Email error:', err.message);
            resolve(false);
        });
        req.write(body);
        req.end();
    });
}

// ===========================================
//           EMAIL ШАБЛОНИ
// ===========================================
function tplVerification(name, code) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;margin:0;padding:20px}
.c{max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.logo h1{font-size:26px;font-weight:700;background:linear-gradient(135deg,#FF2D55,#AF52DE);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;text-align:center}
h2{color:#1c1c1e;font-size:20px;text-align:center}
p{color:#6c6c70;line-height:1.6}
.box{background:linear-gradient(135deg,#FF2D55,#AF52DE);border-radius:16px;padding:24px;text-align:center;margin:20px 0}
.code{font-size:40px;font-weight:700;letter-spacing:10px;color:#fff;font-family:monospace}
.warn{background:#fff3cd;border-left:4px solid #ffc107;padding:10px 14px;border-radius:8px;color:#856404;font-size:13px}
.footer{text-align:center;color:#aeaeb2;font-size:12px;margin-top:20px}
</style></head><body><div class="c">
<div class="logo"><h1>FinanceAI</h1></div>
<h2>Підтвердження email адреси</h2>
<p>Привіт, <strong>${name}</strong>! 👋</p>
<p>Дякуємо за реєстрацію в FinanceAI. Введіть цей код у застосунку для завершення реєстрації:</p>
<div class="box"><div class="code">${code}</div></div>
<div class="warn">⏱ Код дійсний <strong>10 хвилин</strong>. Не передавайте його нікому.</div>
<p>Якщо ви не реєструвалися — просто проігноруйте цей лист.</p>
<div class="footer">© 2026 FinanceAI &nbsp;·&nbsp; <a href="mailto:tarasplus502@gmail.com">tarasplus502@gmail.com</a></div>
</div></body></html>`;
}

function tpl2FA(name, code) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;margin:0;padding:20px}
.c{max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.logo h1{font-size:26px;font-weight:700;background:linear-gradient(135deg,#007AFF,#5856D6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;text-align:center}
h2{color:#1c1c1e;font-size:20px;text-align:center}
p{color:#6c6c70;line-height:1.6}
.box{background:linear-gradient(135deg,#007AFF,#5856D6);border-radius:16px;padding:24px;text-align:center;margin:20px 0}
.code{font-size:40px;font-weight:700;letter-spacing:10px;color:#fff;font-family:monospace}
.warn{background:#d1ecf1;border-left:4px solid #17a2b8;padding:10px 14px;border-radius:8px;color:#0c5460;font-size:13px}
.footer{text-align:center;color:#aeaeb2;font-size:12px;margin-top:20px}
</style></head><body><div class="c">
<div class="logo"><h1>FinanceAI</h1></div>
<h2>Двофакторна автентифікація</h2>
<p>Привіт, <strong>${name}</strong>! 🔐</p>
<p>Код для входу в ваш акаунт FinanceAI:</p>
<div class="box"><div class="code">${code}</div></div>
<div class="warn">⏱ Код дійсний <strong>10 хвилин</strong>. Якщо це не ви — негайно змініть пароль!</div>
<div class="footer">© 2026 FinanceAI &nbsp;·&nbsp; <a href="mailto:tarasplus502@gmail.com">tarasplus502@gmail.com</a></div>
</div></body></html>`;
}

function tplPasswordReset(name, code) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;margin:0;padding:20px}
.c{max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.logo h1{font-size:26px;font-weight:700;background:linear-gradient(135deg,#FF9500,#FF2D55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;text-align:center}
h2{color:#1c1c1e;font-size:20px;text-align:center}
p{color:#6c6c70;line-height:1.6}
.box{background:linear-gradient(135deg,#FF9500,#FF2D55);border-radius:16px;padding:24px;text-align:center;margin:20px 0}
.code{font-size:40px;font-weight:700;letter-spacing:10px;color:#fff;font-family:monospace}
.warn{background:#fde8e8;border-left:4px solid #e53e3e;padding:10px 14px;border-radius:8px;color:#742a2a;font-size:13px}
.footer{text-align:center;color:#aeaeb2;font-size:12px;margin-top:20px}
</style></head><body><div class="c">
<div class="logo"><h1>FinanceAI</h1></div>
<h2>Скидання пароля</h2>
<p>Привіт, <strong>${name}</strong>! 🔑</p>
<p>Ми отримали запит на скидання пароля вашого акаунту FinanceAI. Введіть цей код у застосунку:</p>
<div class="box"><div class="code">${code}</div></div>
<div class="warn">⏱ Код дійсний <strong>10 хвилин</strong>. Якщо ви не запитували — проігноруйте цей лист.</div>
<div class="footer">© 2026 FinanceAI &nbsp;·&nbsp; <a href="mailto:tarasplus502@gmail.com">tarasplus502@gmail.com</a></div>
</div></body></html>`;
}

function tplPinReset(name, code) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;margin:0;padding:20px}
.c{max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.logo h1{font-size:26px;font-weight:700;background:linear-gradient(135deg,#FF9500,#FF2D55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;text-align:center}
h2{color:#1c1c1e;font-size:20px;text-align:center}
p{color:#6c6c70;line-height:1.6}
.box{background:linear-gradient(135deg,#FF9500,#FF2D55);border-radius:16px;padding:24px;text-align:center;margin:20px 0}
.code{font-size:40px;font-weight:700;letter-spacing:10px;color:#fff;font-family:monospace}
.warn{background:#fde8e8;border-left:4px solid #e53e3e;padding:10px 14px;border-radius:8px;color:#742a2a;font-size:13px}
.footer{text-align:center;color:#aeaeb2;font-size:12px;margin-top:20px}
</style></head><body><div class="c">
<div class="logo"><h1>FinanceAI</h1></div>
<h2>Скидання PIN-коду</h2>
<p>Привіт, <strong>${name}</strong>! 🔑</p>
<p>Ми отримали запит на скидання PIN-коду вашого акаунту FinanceAI. Введіть цей код у застосунку:</p>
<div class="box"><div class="code">${code}</div></div>
<div class="warn">⏱ Код дійсний <strong>10 хвилин</strong>. Якщо ви не запитували — проігноруйте цей лист.</div>
<div class="footer">© 2026 FinanceAI &nbsp;·&nbsp; <a href="mailto:tarasplus502@gmail.com">tarasplus502@gmail.com</a></div>
</div></body></html>`;
}

function tplAccountBlocked(name, unblockToken) {
    const unblockLink = `https://financeai-web-ten.vercel.app/unblock?token=${unblockToken}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;margin:0;padding:20px}
.c{max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.logo h1{font-size:26px;font-weight:700;background:linear-gradient(135deg,#e53e3e,#c53030);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;text-align:center}
h2{color:#1c1c1e;font-size:20px;text-align:center}
p{color:#6c6c70;line-height:1.6}
.warn{background:#fde8e8;border-left:4px solid #e53e3e;padding:10px 14px;border-radius:8px;color:#742a2a;font-size:13px;margin:20px 0}
.button{background:linear-gradient(135deg,#FF2D55,#AF52DE);border-radius:16px;padding:14px 24px;text-align:center;margin:20px 0}
.button a{color:#fff;text-decoration:none;font-weight:600}
.footer{text-align:center;color:#aeaeb2;font-size:12px;margin-top:20px}
</style></head><body><div class="c">
<div class="logo"><h1>FinanceAI</h1></div>
<h2>⚠️ Увага! Спроба несанкціонованого доступу</h2>
<p>Привіт, <strong>${name}</strong>! 🔒</p>
<p>Хтось намагався увійти до вашого акаунту FinanceAI і <strong>3 рази неправильно ввів PIN-код</strong>.</p>
<div class="warn">🔐 Ваш акаунт тимчасово заблоковано на 30 хвилин для захисту ваших даних.</div>
<p>Якщо це були ви - натисніть кнопку нижче, щоб розблокувати акаунт:</p>
<div class="button"><a href="${unblockLink}">🔓 Розблокувати акаунт</a></div>
<p>Якщо це були не ви - негайно змініть пароль та PIN-код!</p>
<p>Рекомендації:<br>
• Змініть пароль від акаунту<br>
• Змініть PIN-код<br>
• Увімкніть двофакторну автентифікацію</p>
<div class="footer">© 2026 FinanceAI &nbsp;·&nbsp; <a href="mailto:tarasplus502@gmail.com">tarasplus502@gmail.com</a></div>
</div></body></html>`;
}

// ===========================================
//           МАРШРУТИ АВТОРИЗАЦІЇ
// ===========================================

app.post('/api/auth/register', async (req, res) => {
    console.log('📝 Реєстрація:', req.body.email);
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ success: false, error: 'Всі поля обов\'язкові' });
    }

    const db = readDB();

    if (db.users.some(u => u.email === email)) {
        return res.status(400).json({ success: false, error: 'Email вже використовується' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
        id: 'user_' + Date.now(),
        email,
        name,
        password: hashedPassword,
        avatarEmoji: '👤',
        currency: '₴',
        monthlyBudget: 0,
        notificationsEnabled: true,
        theme: 'system',
        language: 'uk',
        description: '',
        pinHash: null,
        isEmailVerified: false,
        twoFactorEnabled: false,
        createdAt: new Date().toISOString()
    };

    db.users.push(newUser);

    const code = generateOTP();
    saveOTP(db, newUser.id, 'email_verification', code);
    writeDB(db);

    await sendEmail(email, 'FinanceAI — Підтвердження email адреси', tplVerification(name, code));

    const token = generateToken(newUser.id);
    const { password: _, ...userWithoutPassword } = newUser;

    console.log(`✅ Реєстрація успішна: ${email}`);
    res.json({ success: true, token, user: userWithoutPassword, requiresVerification: true });
});

app.post('/api/auth/login', async (req, res) => {
    console.log('🔑 Вхід:', req.body.email);
    const { email, password } = req.body;

    const db = readDB();
    const user = db.users.find(u => u.email === email);

    if (!user) {
        return res.status(401).json({ success: false, error: 'Невірний email або пароль' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ success: false, error: 'Невірний email або пароль' });
    }

    if (user.twoFactorEnabled) {
        const code = generateOTP();
        saveOTP(db, user.id, '2fa', code);
        writeDB(db);
        await sendEmail(email, 'FinanceAI — Код двофакторної автентифікації', tpl2FA(user.name, code));
        const { password: _, ...userWithoutPassword } = user;
        console.log(`🔐 2FA код надіслано для: ${email}`);
        return res.json({ success: true, requires2FA: true, user: userWithoutPassword });
    }

    const token = generateToken(user.id);
    const { password: _, ...userWithoutPassword } = user;
    user.updatedAt = new Date().toISOString();
    writeDB(db);

    console.log(`✅ Вхід успішний: ${email}`);
    res.json({ success: true, token, user: userWithoutPassword });
});

app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Не авторизовано' });

    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error: 'Недійсний токен' });

    const db = readDB();
    const user = db.users.find(u => u.id === decoded.userId);
    if (!user) return res.status(401).json({ error: 'Користувача не знайдено' });

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
});

app.put('/api/auth/profile', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'Користувача не знайдено' });

    const allowed = ['name', 'avatarEmoji', 'language', 'description', 'theme', 'currency',
                     'monthlyBudget', 'notificationsEnabled', 'pinHash', 'twoFactorEnabled'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) db.users[idx][field] = req.body[field];
    });
    db.users[idx].updatedAt = new Date().toISOString();
    writeDB(db);

    const { password: _, ...userWithoutPassword } = db.users[idx];
    res.json({ success: true, user: userWithoutPassword });
});

app.post('/api/auth/verify-email', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Не авторизовано' });

    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Код відсутній' });

    const db = readDB();
    const result = verifyOTP(db, userId, 'email_verification', code);

    if (!result.valid) {
        writeDB(db);
        return res.status(400).json({ success: false, error: result.reason });
    }

    const idx = db.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
        db.users[idx].isEmailVerified = true;
        db.users[idx].updatedAt = new Date().toISOString();
    }
    writeDB(db);

    console.log(`✅ Email підтверджено для userId: ${userId}`);
    res.json({ success: true });
});

app.post('/api/auth/resend-verification', async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Не авторизовано' });

    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ success: false, error: 'Користувача не знайдено' });

    if (user.isEmailVerified) return res.json({ success: true, message: 'Email вже підтверджено' });

    const code = generateOTP();
    saveOTP(db, userId, 'email_verification', code);
    writeDB(db);

    const sent = await sendEmail(user.email, 'FinanceAI — Код підтвердження email', tplVerification(user.name, code));
    res.json({ success: sent, error: sent ? undefined : 'Не вдалося надіслати email' });
});

app.post('/api/auth/verify-2fa', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ success: false, error: 'email та code обов\'язкові' });
    }

    const db = readDB();
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Користувача не знайдено' });

    const result = verifyOTP(db, user.id, '2fa', code);
    if (!result.valid) {
        writeDB(db);
        return res.status(400).json({ success: false, error: result.reason });
    }

    user.updatedAt = new Date().toISOString();
    writeDB(db);

    const token = generateToken(user.id);
    const { password: _, ...userWithoutPassword } = user;

    console.log(`✅ 2FA підтверджено для: ${email}`);
    res.json({ success: true, token, user: userWithoutPassword });
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email обов\'язковий' });

    const db = readDB();
    const user = db.users.find(u => u.email === email);

    if (!user) return res.json({ success: true, message: 'Якщо акаунт існує — код надіслано' });

    const code = generateOTP();
    saveOTP(db, user.id, 'password_reset', code);
    writeDB(db);

    await sendEmail(email, 'FinanceAI — Скидання пароля', tplPasswordReset(user.name, code));

    console.log(`📧 Код скидання пароля надіслано для: ${email}`);
    res.json({ success: true });
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
        return res.status(400).json({ success: false, error: 'Всі поля обов\'язкові' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Пароль мінімум 6 символів' });
    }

    const db = readDB();
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Користувача не знайдено' });

    const result = verifyOTP(db, user.id, 'password_reset', code);
    if (!result.valid) {
        writeDB(db);
        return res.status(400).json({ success: false, error: result.reason });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.updatedAt = new Date().toISOString();
    writeDB(db);

    console.log(`✅ Пароль змінено для: ${email}`);
    res.json({ success: true });
});

// ===========================================
//           PIN VERIFICATION З БЛОКУВАННЯМ
// ===========================================

app.post('/api/auth/verify-pin', (req, res) => {
    const { pin } = req.body;
    const userId = getAuthUserId(req);
    
    if (!userId) return res.status(401).json({ success: false, error: 'Не авторизовано' });
    if (!pin) return res.status(400).json({ success: false, error: 'PIN відсутній' });

    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ success: false, error: 'Користувача не знайдено' });

    if (isAccountBlocked(db, userId)) {
        return res.status(403).json({ 
            success: false, 
            error: 'Акаунт тимчасово заблоковано. Перевірте email для розблокування.',
            blocked: true 
        });
    }

    if (!user.pinHash) {
        return res.status(400).json({ success: false, error: 'PIN не встановлено' });
    }

    const hashedInput = crypto.createHash('sha256')
        .update(pin + user.id)
        .digest('hex');

    if (hashedInput === user.pinHash) {
        resetPinAttempts(db, userId);
        res.json({ success: true, message: 'PIN правильний' });
    } else {
        const wasBlocked = recordFailedPinAttempt(db, userId);
        
        if (wasBlocked) {
            const unblockToken = crypto.randomBytes(32).toString('hex');
            db.blockedAccounts = (db.blockedAccounts || []).map(b => 
                b.userId === userId ? { ...b, unblockToken } : b
            );
            writeDB(db);
            
            sendEmail(user.email, 'FinanceAI — Ваш акаунт заблоковано', tplAccountBlocked(user.name, unblockToken));
            
            return res.status(403).json({ 
                success: false, 
                error: 'Акаунт заблоковано після 3 невдалих спроб. Перевірте email для розблокування.',
                blocked: true 
            });
        }
        
        const attempts = (db.pinAttempts || []).find(a => a.userId === userId);
        const remainingAttempts = MAX_PIN_ATTEMPTS - (attempts?.count || 0);
        
        res.status(401).json({ 
            success: false, 
            error: `Невірний PIN. Залишилось спроб: ${remainingAttempts}`,
            attemptsLeft: remainingAttempts
        });
    }
});

app.post('/api/auth/unblock', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Токен відсутній' });

    const db = readDB();
    const blocked = (db.blockedAccounts || []).find(b => b.unblockToken === token);
    
    if (!blocked) {
        return res.status(404).json({ success: false, error: 'Недійсний токен' });
    }
    
    db.blockedAccounts = (db.blockedAccounts || []).filter(b => b.unblockToken !== token);
    db.pinAttempts = (db.pinAttempts || []).filter(a => a.userId !== blocked.userId);
    writeDB(db);
    
    res.json({ success: true, message: 'Акаунт розблоковано' });
});

app.get('/api/auth/unblock-status', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, error: 'Токен відсутній' });

    const db = readDB();
    const blocked = (db.blockedAccounts || []).find(b => b.unblockToken === token);
    
    if (!blocked) {
        return res.json({ success: false, error: 'Недійсний токен' });
    }
    
    const user = db.users.find(u => u.id === blocked.userId);
    res.json({ 
        success: true, 
        email: user?.email,
        expiresAt: blocked.expiresAt
    });
});

// ===========================================
//           PIN RECOVERY МАРШРУТИ
// ===========================================

app.post('/api/auth/reset-pin-request', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email обов\'язковий' });

    const db = readDB();
    const user = db.users.find(u => u.email === email);

    if (!user) return res.json({ success: true, message: 'Якщо акаунт існує — код надіслано' });

    const code = generateOTP();
    db.pinResetCodes = (db.pinResetCodes || []).filter(c => c.userId !== user.id);
    db.pinResetCodes.push({
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
    });
    writeDB(db);

    await sendEmail(email, 'FinanceAI — Скидання PIN-коду', tplPinReset(user.name, code));

    console.log(`📧 Код скидання PIN надіслано для: ${email}`);
    res.json({ success: true });
});

app.post('/api/auth/reset-pin-verify', async (req, res) => {
    const { email, code, newPinHash } = req.body;
    if (!email || !code || !newPinHash) {
        return res.status(400).json({ success: false, error: 'Всі поля обов\'язкові' });
    }

    const db = readDB();
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Користувача не знайдено' });

    const resetCode = (db.pinResetCodes || []).find(c => c.userId === user.id && c.code === code);
    if (!resetCode) {
        return res.status(400).json({ success: false, error: 'Невірний код' });
    }
    if (new Date(resetCode.expiresAt) < new Date()) {
        db.pinResetCodes = (db.pinResetCodes || []).filter(c => c.userId !== user.id);
        writeDB(db);
        return res.status(400).json({ success: false, error: 'Термін дії коду вийшов' });
    }

    const idx = db.users.findIndex(u => u.id === user.id);
    db.users[idx].pinHash = newPinHash;
    db.users[idx].updatedAt = new Date().toISOString();
    db.pinResetCodes = (db.pinResetCodes || []).filter(c => c.userId !== user.id);
    writeDB(db);

    console.log(`✅ PIN змінено для: ${email}`);
    res.json({ success: true });
});

// ===========================================
//           2FA МАРШРУТИ
// ===========================================

app.post('/api/auth/2fa/enable', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Не авторизовано' });

    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Користувача не знайдено' });

    const code = generateOTP();
    db.twoFactorCodes = (db.twoFactorCodes || []).filter(c => c.userId !== userId);
    db.twoFactorCodes.push({
        userId,
        code,
        expiresAt: new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
    });
    writeDB(db);

    sendEmail(db.users[idx].email, 'FinanceAI — Код для увімкнення 2FA', tpl2FA(db.users[idx].name, code));

    res.json({ success: true, message: 'Код надіслано на email' });
});

app.post('/api/auth/2fa/disable', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Не авторизовано' });

    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Користувача не знайдено' });

    db.users[idx].twoFactorEnabled = false;
    db.users[idx].updatedAt = new Date().toISOString();
    writeDB(db);

    res.json({ success: true });
});

app.post('/api/auth/2fa/verify', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Не авторизовано' });

    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Код відсутній' });

    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Користувача не знайдено' });

    const twoFactorCode = (db.twoFactorCodes || []).find(c => c.userId === userId && c.code === code);
    if (!twoFactorCode) {
        return res.status(400).json({ success: false, error: 'Невірний код' });
    }
    if (new Date(twoFactorCode.expiresAt) < new Date()) {
        db.twoFactorCodes = (db.twoFactorCodes || []).filter(c => c.userId !== userId);
        writeDB(db);
        return res.status(400).json({ success: false, error: 'Термін дії коду вийшов' });
    }

    db.users[idx].twoFactorEnabled = true;
    db.users[idx].updatedAt = new Date().toISOString();
    db.twoFactorCodes = (db.twoFactorCodes || []).filter(c => c.userId !== userId);
    writeDB(db);

    console.log(`✅ 2FA увімкнено для: ${db.users[idx].email}`);
    res.json({ success: true });
});

// ===========================================
//           МАРШРУТИ ВИТРАТ
// ===========================================

app.get('/api/expenses', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const userExpenses = (db.expenses || []).filter(e => e.userId === userId);
    res.json({ success: true, expenses: userExpenses });
});

app.post('/api/expenses', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const newExpense = {
        id: 'expense_' + Date.now(),
        userId,
        ...req.body,
        date: req.body.date || new Date().toISOString()
    };
    if (!db.expenses) db.expenses = [];
    db.expenses.push(newExpense);
    writeDB(db);
    res.json({ success: true, expense: newExpense });
});

app.put('/api/expenses/:id', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const idx = (db.expenses || []).findIndex(e => e.id === req.params.id && e.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Витрату не знайдено' });

    db.expenses[idx] = { ...db.expenses[idx], ...req.body, id: req.params.id, userId };
    writeDB(db);
    res.json({ success: true, expense: db.expenses[idx] });
});

app.delete('/api/expenses/:id', (req, res) => {
    const userId = getAuthUserId(req);
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
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const userGoals = (db.goals || []).filter(g => g.userId === userId);
    res.json({ success: true, goals: userGoals });
});

app.post('/api/goals', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const newGoal = {
        id: 'goal_' + Date.now(),
        userId,
        ...req.body,
        imageEmoji: req.body.imageEmoji || '💰'
    };
    if (!db.goals) db.goals = [];
    db.goals.push(newGoal);
    writeDB(db);
    res.json({ success: true, goal: newGoal });
});

app.put('/api/goals/:id', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const idx = (db.goals || []).findIndex(g => g.id === req.params.id && g.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Ціль не знайдено' });

    db.goals[idx] = { ...db.goals[idx], ...req.body, id: req.params.id, userId };
    writeDB(db);
    res.json({ success: true, goal: db.goals[idx] });
});

app.delete('/api/goals/:id', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    db.goals = (db.goals || []).filter(g => !(g.id === req.params.id && g.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

// ===========================================
//           МАРШРУТИ ЧАТІВ
// ===========================================

app.get('/api/chat/sessions', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const userSessions = (db.chatSessions || []).filter(s => s.userId === userId);
    const formatted = userSessions.map(s => ({
        id: s.id, name: s.name, userId: s.userId,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
        messageCount: s.messageCount || 0,
        lastMessage: s.lastMessage || null
    }));
    res.json({ success: true, sessions: formatted });
});

app.post('/api/chat/sessions', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const newSession = {
        id: 'session_' + Date.now(),
        userId,
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

app.put('/api/chat/sessions/:sessionId', (req, res) => {
    const userId = getAuthUserId(req);
    const { sessionId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const idx = (db.chatSessions || []).findIndex(s => s.id === sessionId && s.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Сесію не знайдено' });

    if (req.body.name !== undefined) db.chatSessions[idx].name = req.body.name;
    db.chatSessions[idx].updatedAt = new Date().toISOString();
    writeDB(db);

    res.json({ success: true, session: db.chatSessions[idx] });
});

app.delete('/api/chat/sessions/:sessionId', (req, res) => {
    const userId = getAuthUserId(req);
    const { sessionId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    db.chatSessions = (db.chatSessions || []).filter(s => !(s.id === sessionId && s.userId === userId));
    db.chatMessages = (db.chatMessages || []).filter(m => !(m.sessionId === sessionId && m.userId === userId));
    writeDB(db);

    res.json({ success: true });
});

app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = getAuthUserId(req);
    const { sessionId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const messages = (db.chatMessages || []).filter(m => m.sessionId === sessionId && m.userId === userId);
    res.json({ success: true, messages });
});

app.post('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = getAuthUserId(req);
    const { sessionId } = req.params;

    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    if (!sessionId) return res.status(400).json({ error: 'sessionId відсутній' });
    if (!req.body.content) return res.status(400).json({ error: 'content відсутній' });

    const db = readDB();
    const sessionExists = (db.chatSessions || []).some(s => s.id === sessionId && s.userId === userId);
    if (!sessionExists) return res.status(404).json({ error: 'Сесію не знайдено' });

    const newMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        userId, sessionId,
        content: req.body.content,
        isUser: req.body.isUser || false,
        createdAt: new Date().toISOString()
    };
    if (!db.chatMessages) db.chatMessages = [];
    db.chatMessages.push(newMessage);

    const sIdx = db.chatSessions.findIndex(s => s.id === sessionId);
    if (sIdx !== -1) {
        db.chatSessions[sIdx].updatedAt = new Date().toISOString();
        db.chatSessions[sIdx].lastMessage = req.body.content;
        db.chatSessions[sIdx].messageCount = db.chatMessages.filter(m => m.sessionId === sessionId).length;
    }
    writeDB(db);

    res.json({ success: true, message: newMessage });
});

// ===========================================
//           МАРШРУТИ СПОВІЩЕНЬ
// ===========================================

app.get('/api/notifications', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const notifs = (db.notifications || []).filter(n => n.userId === userId);
    res.json({ success: true, notifications: notifs.map(({ userId: _, ...n }) => n) });
});

app.post('/api/notifications', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    if (!db.notifications) db.notifications = [];
    const notif = { ...req.body, userId };
    db.notifications.push(notif);
    writeDB(db);
    res.json({ success: true });
});

app.delete('/api/notifications/:id', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    db.notifications = (db.notifications || []).filter(n => !(n.id === req.params.id && n.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

app.put('/api/notifications/read-all', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    (db.notifications || []).forEach(n => { if (n.userId === userId) n.isRead = true; });
    writeDB(db);
    res.json({ success: true });
});

// ===========================================
//           МАРШРУТИ СПИСКІВ ПОКУПОК
// ===========================================

app.get('/api/shopping/lists', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const lists = (db.shoppingLists || []).filter(l => l.userId === userId);
    const items = (db.shoppingItems || []).filter(i => i.userId === userId);
    const result = lists.map(list => ({
        ...list,
        items: items.filter(i => i.listId === list.id)
    }));
    res.json({ success: true, lists: result });
});

app.post('/api/shopping/lists', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    if (!db.shoppingLists) db.shoppingLists = [];
    const newList = {
        id: 'slist_' + Date.now(),
        userId,
        name: req.body.name || 'Новий список',
        reminderDate: req.body.reminderDate || null,
        reminderLeadMinutes: req.body.reminderLeadMinutes || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    db.shoppingLists.push(newList);
    writeDB(db);
    res.json({ success: true, list: newList });
});

app.put('/api/shopping/lists/:id', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const idx = (db.shoppingLists || []).findIndex(l => l.id === req.params.id && l.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Список не знайдено' });

    db.shoppingLists[idx] = {
        ...db.shoppingLists[idx], ...req.body,
        id: req.params.id, userId,
        updatedAt: new Date().toISOString()
    };
    
    if (req.body.items && Array.isArray(req.body.items)) {
        if (!db.shoppingItems) db.shoppingItems = [];
        db.shoppingItems = db.shoppingItems.filter(i => !(i.listId === req.params.id && i.userId === userId));
        req.body.items.forEach(item => {
            db.shoppingItems.push({
                id: item.id || 'sitem_' + Date.now() + '_' + Math.random(),
                listId: req.params.id,
                userId,
                name: item.name || '',
                isChecked: item.isCompleted === true,
                quantity: item.quantity || null,
                price: item.price || null,
                note: item.note || null,
                createdAt: new Date().toISOString()
            });
        });
    }
    
    writeDB(db);
    res.json({ success: true, list: db.shoppingLists[idx] });
});

app.delete('/api/shopping/lists/:id', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    db.shoppingLists = (db.shoppingLists || []).filter(l => !(l.id === req.params.id && l.userId === userId));
    db.shoppingItems = (db.shoppingItems || []).filter(i => !(i.listId === req.params.id && i.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/shopping/lists/:listId/items', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const { listId } = req.params;
    const db = readDB();

    const listExists = (db.shoppingLists || []).some(l => l.id === listId && l.userId === userId);
    if (!listExists) return res.status(404).json({ error: 'Список не знайдено' });

    if (!db.shoppingItems) db.shoppingItems = [];
    const newItem = {
        id: 'sitem_' + Date.now(),
        listId, userId,
        name: req.body.name || '',
        isChecked: req.body.isChecked || false,
        quantity: req.body.quantity || null,
        price: req.body.price || null,
        note: req.body.note || null,
        createdAt: new Date().toISOString()
    };
    db.shoppingItems.push(newItem);
    writeDB(db);
    res.json({ success: true, item: newItem });
});

app.put('/api/shopping/items/:id', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const idx = (db.shoppingItems || []).findIndex(i => i.id === req.params.id && i.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Елемент не знайдено' });

    db.shoppingItems[idx] = { ...db.shoppingItems[idx], ...req.body, id: req.params.id, userId };
    writeDB(db);
    res.json({ success: true, item: db.shoppingItems[idx] });
});

app.delete('/api/shopping/items/:id', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    db.shoppingItems = (db.shoppingItems || []).filter(i => !(i.id === req.params.id && i.userId === userId));
    writeDB(db);
    res.json({ success: true });
});

// ===========================================
//           СТАТИСТИЧНІ МАРШРУТИ
// ===========================================

app.get('/api/user/stats', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

    const db = readDB();
    const userExpenses = (db.expenses || []).filter(e => e.userId === userId);
    const userGoals = (db.goals || []).filter(g => g.userId === userId);
    const userSessions = (db.chatSessions || []).filter(s => s.userId === userId);

    res.json({
        success: true,
        stats: {
            totalExpenses: userExpenses.length,
            totalExpensesAmount: userExpenses.reduce((s, e) => s + (e.amount || 0), 0),
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
        version: '3.0',
        features: {
            auth: true, emailVerification: true, twoFactorAuth: true,
            passwordReset: true, pinReset: true, pinBlocking: true,
            expenses: true, goals: true, chats: true, notifications: true, shoppingLists: true
        },
        stats: {
            users: db.users.length,
            expenses: (db.expenses || []).length,
            goals: (db.goals || []).length,
            chatSessions: (db.chatSessions || []).length,
            chatMessages: (db.chatMessages || []).length,
            notifications: (db.notifications || []).length,
            shoppingLists: (db.shoppingLists || []).length,
            shoppingItems: (db.shoppingItems || []).length
        },
        time: new Date().toISOString()
    });
});

// ===========================================
//           ЗАПУСК СЕРВЕРА
// ===========================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`✅ СЕРВЕР FINANCE AI v3.0 НА ПОРТУ ${PORT}`);
    console.log(`📧 Resend: ${process.env.RESEND_API_KEY ? '✅ налаштовано' : '⚠️ RESEND_API_KEY не встановлено'}`);
    console.log(`📍 https://my-finance-app-2026-production.up.railway.app`);
    console.log('='.repeat(50));
});
