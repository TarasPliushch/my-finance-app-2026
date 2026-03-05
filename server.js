// ===========================================
//           МАРШРУТИ ЧАТІВ (ВИПРАВЛЕНО!)
// ===========================================

// ОТРИМАННЯ ВСІХ СЕСІЙ
app.get('/api/chat/sessions', (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const userSessions = (db.chatSessions || []).filter(s => s.userId === userId);
    
    res.json({ success: true, sessions: userSessions });
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

// ===========================================
//      МАРШРУТИ ПОВІДОМЛЕНЬ (ГОЛОВНА ПРОБЛЕМА)
// ===========================================

// ОТРИМАННЯ ПОВІДОМЛЕНЬ СЕСІЇ
app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    if (!userId) return res.status(401).json({ error: 'Не авторизовано' });
    
    const db = readDB();
    const messages = (db.chatMessages || []).filter(m => m.sessionId === sessionId && m.userId === userId);
    
    res.json({ success: true, messages: messages });
});

// ДОДАВАННЯ ПОВІДОМЛЕННЯ (ВИПРАВЛЕНО!)
app.post('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const userId = req.headers['user-id'];
    const sessionId = req.params.sessionId;
    
    console.log('📝 ДОДАВАННЯ ПОВІДОМЛЕННЯ:');
    console.log('   userId:', userId);
    console.log('   sessionId:', sessionId);
    console.log('   content:', req.body.content);
    console.log('   isUser:', req.body.isUser);
    
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
    
    // Створюємо нове повідомлення
    const newMessage = {
        id: 'msg_' + Date.now(),
        userId: userId,
        sessionId: sessionId,
        content: req.body.content,
        isUser: req.body.isUser === true,
        createdAt: new Date().toISOString()
    };
    
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
    
    writeDB(db);
    
    console.log('✅ Повідомлення додано:', newMessage.id);
    res.json({ success: true, message: newMessage });
});
