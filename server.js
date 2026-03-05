// ===========================================
//           МАРШРУТИ ЧАТІВ (ПЕРЕРОБЛЕНО!)
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

// ===========================================
//      МАРШРУТИ ПОВІДОМЛЕНЬ (ВИПРАВЛЕНО!)
// ===========================================

// ОТРИМАННЯ ПОВІДОМЛЕНЬ
app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const messages = (db.chatMessages || []).filter(m => m.sessionId === sessionId && m.userId === userId);
    
    res.json({ success: true, messages: messages });
});

// ДОДАВАННЯ ПОВІДОМЛЕННЯ - СПРОЩЕНА ВЕРСІЯ
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
            console.log(`❌ ПОМИЛКА: Сесія ${sessionId} не знайдена`);
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
        }
        
        // Зберігаємо
        writeDB(db);
        
        console.log('✅ Повідомлення успішно додано!');
        console.log('📊 Тепер повідомлень в сесії:', db.chatSessions[sessionIndex]?.messageCount);
        
        res.json({ success: true, message: newMessage });
        
    } catch (error) {
        console.log('❌ КРИТИЧНА ПОМИЛКА:', error);
        res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
});
