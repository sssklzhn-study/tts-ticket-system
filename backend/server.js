const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --------------------------------------------------------------
// Загрузка сервисного ключа Firebase
// --------------------------------------------------------------
let serviceAccount;
if (process.env.FIREBASE_ADMIN_KEY) {
  // На Render - используем переменную окружения
  serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
  console.log('✅ Firebase ключ загружен из переменной окружения');
} else {
  // Локально - используем файл
  try {
    serviceAccount = require('./firebase-admin.json');
    console.log('✅ Firebase ключ загружен из файла');
  } catch (err) {
    console.error('❌ Ошибка: не найден файл firebase-admin.json и не задана переменная FIREBASE_ADMIN_KEY');
    console.error('Убедитесь, что вы добавили переменную окружения на Render.');
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

// Настройка CORS для продакшена
// const allowedOrigins = [
//   'http://localhost:5173',
//   'http://localhost:3000',
//   'https://tts-ticket-system.vercel.app',
//   'https://tts-ticket-system-v2.vercel.app'
// ];
// Настройка CORS для продакшена
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://tts-ticket-system.vercel.app',
  'https://tts-ticket-system-1.onrender.com'
];

app.use(cors({
  origin: function(origin, callback) {
    // Разрешаем запросы без origin (например, из Postman)
    if (!origin) return callback(null, true);
    
    // Проверяем, разрешён ли origin
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // Также разрешаем любые .vercel.app поддомены
    if (origin.match(/\.vercel\.app$/)) {
      return callback(null, true);
    }
    
    console.log(`❌ CORS blocked: ${origin}`);
    return callback(new Error('CORS policy does not allow access from this origin'), false);
  },
  credentials: true
}));

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));
app.use(express.json());

// --------------------------------------------------------------
// Вспомогательная функция: получить роль пользователя по email
// --------------------------------------------------------------
async function getUserRole(email) {
  if (!email) return null;
  const usersSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
  if (usersSnapshot.empty) return null;
  return usersSnapshot.docs[0].data().role;
}

// --------------------------------------------------------------
// Регистрация нового пользователя (создаём запись с ролью 'user')
// --------------------------------------------------------------
app.post('/register-user', async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', email).get();
  if (snapshot.empty) {
    const userRole = role || 'user';
    await usersRef.add({ email, role: userRole });
    console.log(`✅ Новый пользователь: ${email} (роль: ${userRole})`);
  }
  res.json({ success: true });
});

// --------------------------------------------------------------
// Получить роль текущего пользователя
// --------------------------------------------------------------
app.get('/user-role', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const role = await getUserRole(email);
  res.json({ role });
});

// --------------------------------------------------------------
// Получить заявки (админ – все, пользователь – только свои)
// --------------------------------------------------------------
app.get('/tickets', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const role = await getUserRole(email);
  try {
    let query = db.collection('tickets').orderBy('createdAt', 'desc');
    if (role !== 'admin') {
      query = query.where('userId', '==', email);
    }
    const snapshot = await query.get();
    const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------
// Создать заявку (с location и contactPhone)
// --------------------------------------------------------------
app.post('/tickets', async (req, res) => {
  const { equipment, problem, urgency, location, contactPhone, category, dueDate, attachment, userId } = req.body;
  
  if (!equipment || !problem || !urgency || !userId) {
    return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
  }
  
  try {
    const newTicket = {
      userId,
      equipment,
      problem,
      urgency,
      location: location || '',
      contactPhone: contactPhone || '',
      category: category || 'general',
      dueDate: dueDate || '',
      attachment: attachment || '',
      status: 'pending',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      history: [{ action: 'Создана', date: new Date().toISOString(), by: userId }]
    };
    
    const docRef = await db.collection('tickets').add(newTicket);
    res.json({ id: docRef.id, ...newTicket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------
// Изменить статус заявки (только для админа)
// --------------------------------------------------------------
app.put('/tickets/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, updatedBy, requesterEmail } = req.body;
  
  const role = await getUserRole(requesterEmail);
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор может менять статус.' });
  }
  
  try {
    const ticketRef = db.collection('tickets').doc(id);
    const doc = await ticketRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Не найдено' });
    const history = doc.data().history || [];
    history.push({ action: `Статус изменён на ${status}`, date: new Date().toISOString(), by: updatedBy });
    await ticketRef.update({ status, history });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------
// Добавить комментарий к заявке
// --------------------------------------------------------------
app.post('/tickets/:id/comment', async (req, res) => {
  const { id } = req.params;
  const { comment, userId } = req.body;
  try {
    const ticketRef = db.collection('tickets').doc(id);
    const doc = await ticketRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Не найдено' });
    const comments = doc.data().comments || [];
    comments.push({ text: comment, userId, date: new Date().toISOString() });
    await ticketRef.update({ comments });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------
// Удалить заявку (только админ)
// --------------------------------------------------------------
app.delete('/tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { email, role } = req.query;
  if (role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  try {
    await db.collection('tickets').doc(id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------
// Назначить заявку на себя (админ)
// --------------------------------------------------------------
app.put('/tickets/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { assignedTo, requesterEmail } = req.body;
  const role = await getUserRole(requesterEmail);
  if (role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  try {
    await db.collection('tickets').doc(id).update({ assignedTo, status: 'in_progress' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------
// Оценка заявки
// --------------------------------------------------------------
app.post('/tickets/:id/rating', async (req, res) => {
  const { id } = req.params;
  const { rating, userId } = req.body;
  try {
    await db.collection('tickets').doc(id).update({ rating });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------
// Аналитика
// --------------------------------------------------------------
app.get('/analytics', async (req, res) => {
  const { email, role } = req.query;
  try {
    let query = db.collection('tickets');
    if (role !== 'admin') query = query.where('userId', '==', email);
    const snapshot = await query.get();
    const tickets = snapshot.docs.map(doc => doc.data());
    
    const userStats = {};
    tickets.forEach(t => {
      if (!userStats[t.userId]) userStats[t.userId] = { total: 0, completed: 0 };
      userStats[t.userId].total++;
      if (t.status === 'completed') userStats[t.userId].completed++;
    });
    const userRatings = Object.entries(userStats).map(([email, stats]) => ({
      email, 
      score: (stats.completed / stats.total * 100) || 0, 
      completed: stats.completed
    })).sort((a, b) => b.score - a.score).slice(0, 5);
    
    res.json({ userRatings, averageCompletionTime: 0 });
  } catch (err) {
    res.json({ userRatings: [], averageCompletionTime: 0 });
  }
});

// --------------------------------------------------------------
// Создаём админа в Firestore при старте (если его нет)
// --------------------------------------------------------------
const setupAdmin = async () => {
  const adminEmail = 'admin@tts.kz';
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', adminEmail).get();
  if (snapshot.empty) {
    await usersRef.add({ email: adminEmail, role: 'admin' });
    console.log(`✅ Админ ${adminEmail} создан в Firestore`);
  } else {
    console.log(`✅ Админ уже существует`);
  }
};

setupAdmin();

// --------------------------------------------------------------
// Запуск сервера
// --------------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Бэкенд запущен: http://localhost:${PORT}`));