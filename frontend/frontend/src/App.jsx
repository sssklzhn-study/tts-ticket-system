import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import './App.css';

// const API_URL = 'http://localhost:5000';
const API_URL = 'https://tts-ticket-system-1.onrender.com';
function App() {
  // Основные состояния
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  
  // Данные заявок
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // UI состояния
  const [toast, setToast] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Новая заявка
  const [newTicket, setNewTicket] = useState({
    equipment: '', problem: '', urgency: 'medium', 
    location: '', contactPhone: '', category: 'general', 
    dueDate: '', attachment: ''
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Тёмная тема
  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [darkMode]);

  // Загрузка данных пользователя
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const res = await axios.get(`${API_URL}/user-role?email=${currentUser.email}`);
          setRole(res.data.role);
          await fetchTickets(currentUser.email);
        } catch (err) { console.error(err); }
      }
    });
    return () => unsubscribe();
  }, []);

  // Фильтрация и сортировка
  useEffect(() => {
    let filtered = [...tickets];
    
    // Поиск
    if (searchTerm) {
      filtered = filtered.filter(t => 
        t.equipment?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.problem?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.userId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.location?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Фильтр по статусу
    if (statusFilter !== 'all') filtered = filtered.filter(t => t.status === statusFilter);
    
    // Фильтр по срочности
    if (urgencyFilter !== 'all') filtered = filtered.filter(t => t.urgency === urgencyFilter);
    
    // Фильтр по категории
    if (categoryFilter !== 'all') filtered = filtered.filter(t => t.category === categoryFilter);
    
    // Фильтр по дате
    if (dateFrom) {
      filtered = filtered.filter(t => new Date(t.createdAt) >= new Date(dateFrom));
    }
    if (dateTo) {
      filtered = filtered.filter(t => new Date(t.createdAt) <= new Date(dateTo));
    }
    
    // Сортировка
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.createdAt) - new Date(b.createdAt);
          break;
        case 'urgency':
          const urgencyOrder = { high: 3, medium: 2, low: 1 };
          comparison = (urgencyOrder[a.urgency] || 0) - (urgencyOrder[b.urgency] || 0);
          break;
        case 'status':
          const statusOrder = { pending: 1, in_progress: 2, completed: 3 };
          comparison = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    setFilteredTickets(filtered);
  }, [searchTerm, statusFilter, urgencyFilter, categoryFilter, tickets, sortBy, sortOrder, dateFrom, dateTo]);

  const fetchTickets = async (userEmail) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/tickets?email=${userEmail}`);
      setTickets(res.data);
    } catch (err) { console.error(err); }
    finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        showToast(`Добро пожаловать, ${email}!`);
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        let userRole = email === 'admin@tts.kz' ? 'admin' : 'user';
        await axios.post(`${API_URL}/register-user`, { email: userCred.user.email, role: userRole });
        showToast(`Регистрация успешна! Роль: ${userRole}`);
        setIsLogin(true);
      }
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
    finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    showToast('Вы вышли из системы');
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newTicket.equipment || !newTicket.problem) {
      showToast('Заполните оборудование и описание', 'error');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/tickets`, {
        ...newTicket, userId: user.email
      });
      await fetchTickets(user.email);
      setNewTicket({ equipment: '', problem: '', urgency: 'medium', location: '', contactPhone: '', category: 'general', dueDate: '', attachment: '' });
      showToast('✅ Заявка создана!');
      
      if (Notification.permission === 'granted') {
        new Notification('Новая заявка', { body: `${newTicket.equipment}: ${newTicket.problem}` });
      }
    } catch (err) {
      showToast('Ошибка при создании', 'error');
    }
    finally {
      setLoading(false);
    }
  };

  const updateStatus = async (ticketId, newStatus) => {
    try {
      await axios.put(`${API_URL}/tickets/${ticketId}/status`, {
        status: newStatus, updatedBy: user.email, requesterEmail: user.email
      });
      await fetchTickets(user.email);
      showToast(`Статус изменён на ${getStatusText(newStatus)}`);
    } catch (err) {
      showToast('Ошибка обновления', 'error');
    }
  };

  const deleteTicket = async (ticketId) => {
    if (!window.confirm('Удалить заявку?')) return;
    try {
      await axios.delete(`${API_URL}/tickets/${ticketId}?email=${user.email}&role=${role}`);
      await fetchTickets(user.email);
      showToast('Заявка удалена');
    } catch (err) {
      showToast('Ошибка удаления', 'error');
    }
  };

  const submitRating = async (ticketId, ratingValue) => {
    try {
      await axios.post(`${API_URL}/tickets/${ticketId}/rating`, {
        rating: ratingValue, userId: user.email
      });
      await fetchTickets(user.email);
      showToast('Спасибо за оценку!');
    } catch (err) {
      showToast('Ошибка оценки', 'error');
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Оборудование', 'Проблема', 'Срочность', 'Статус', 'Пользователь', 'Дата', 'Локация', 'Телефон', 'Категория'];
    const rows = filteredTickets.map((t, idx) => [
      idx + 1,
      t.equipment || '',
      t.problem || '',
      getUrgencyText(t.urgency),
      getStatusText(t.status),
      t.userId || '',
      new Date(t.createdAt).toLocaleDateString('ru-RU'),
      t.location || '',
      t.contactPhone || '',
      t.category === 'urgent' ? 'Аварийная' : t.category === 'planned' ? 'Плановая' : 'Обычная'
    ]);
    
    const csvRows = [];
    csvRows.push(headers.join(','));
    for (const row of rows) {
      const escapedRow = row.map(cell => {
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      });
      csvRows.push(escapedRow.join(','));
    }
    
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `tickets_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Экспорт завершён!');
  };

  const massUpdateStatus = async (newStatus) => {
    if (selectedTickets.length === 0) return;
    setLoading(true);
    for (const id of selectedTickets) {
      await updateStatus(id, newStatus);
    }
    setSelectedTickets([]);
    setLoading(false);
    showToast(`Обновлено ${selectedTickets.length} заявок`);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setUrgencyFilter('all');
    setCategoryFilter('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('date');
    setSortOrder('desc');
  };

  const getUrgencyText = (u) => u === 'high' ? 'Высокая' : u === 'medium' ? 'Средняя' : 'Низкая';
  const getUrgencyClass = (u) => u === 'high' ? 'badge-high' : u === 'medium' ? 'badge-medium' : 'badge-low';
  const getStatusText = (s) => s === 'pending' ? 'Ожидание' : s === 'in_progress' ? 'В работе' : 'Выполнено';
  const getStatusClass = (s) => s === 'pending' ? 'badge-pending' : s === 'in_progress' ? 'badge-progress' : 'badge-completed';
  const getProgress = (t) => t.status === 'pending' ? 0 : t.status === 'in_progress' ? 50 : 100;

  const stats = {
    total: tickets.length,
    pending: tickets.filter(t => t.status === 'pending').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    completed: tickets.filter(t => t.status === 'completed').length,
    highUrgency: tickets.filter(t => t.urgency === 'high').length,
    mediumUrgency: tickets.filter(t => t.urgency === 'medium').length,
    lowUrgency: tickets.filter(t => t.urgency === 'low').length
  };

  useEffect(() => {
    if (Notification.permission === 'default') Notification.requestPermission();
  }, []);

  // ========== СТРАНИЦА ВХОДА ==========
  if (!user) {
    const particles = [];
    for (let i = 0; i < 50; i++) {
      const size = Math.random() * 8 + 2;
      const left = Math.random() * 100;
      const delay = Math.random() * 15;
      const duration = Math.random() * 12 + 6;
      particles.push(
        <div
          key={i}
          className="particle"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            left: `${left}%`,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
          }}
        />
      );
    }

    return (
      <div className="auth-page">
        {particles}
        <div className="auth-card-premium">
          <div className="auth-logo">
            <div className="auth-logo-icon"><span>📡</span></div>
            <h2>ТТС Транстелеком</h2>
            <p>Система управления заявками на ремонт и обслуживание</p>
          </div>

          <div className="auth-toggle">
            <button className={`auth-toggle-btn ${isLogin ? 'active' : ''}`} onClick={() => setIsLogin(true)}>🔐 Вход</button>
            <button className={`auth-toggle-btn ${!isLogin ? 'active' : ''}`} onClick={() => setIsLogin(false)}>✨ Регистрация</button>
          </div>

          <form className="auth-form" onSubmit={handleAuth}>
            <div className="auth-input-group">
              <span className="auth-input-icon">📧</span>
              <input type="email" className="auth-input" placeholder="Электронная почта" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
            </div>
            <div className="auth-input-group">
              <span className="auth-input-icon">🔒</span>
              <input type="password" className="auth-input" placeholder="Пароль (минимум 6 символов)" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
            </div>
            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? '⏳ Загрузка...' : (isLogin ? '🔓 Войти в систему' : '📝 Зарегистрироваться')}
            </button>
          </form>

          {!isLogin && (
            <div className="auth-info">
              <p>✨ После регистрации вы получите роль пользователя</p>
              <p>👑 Для входа как администратор используйте <strong>admin@tts.kz</strong></p>
            </div>
          )}

          <div className="auth-features">
            <div className="auth-feature"><span>⚡</span><span>Быстрая обработка</span></div>
            <div className="auth-feature"><span>🔒</span><span>Безопасно</span></div>
            <div className="auth-feature"><span>📊</span><span>Статистика</span></div>
            <div className="auth-feature"><span>📱</span><span>Мобильная версия</span></div>
          </div>
        </div>
      </div>
    );
  }

  // ========== ОСНОВНОЕ ПРИЛОЖЕНИЕ ==========
  return (
    <div className="app-container">
      <div className="container">
        {/* ХЕДЕР */}
        <div className="header-gradient">
          <div className="header-top">
            <div className="logo-area">
              <div className="logo-icon">📡</div>
              <div className="logo-text">
                <h1>ТТС Транстелеком</h1>
                <p>Управление заявками на ремонт и обслуживание</p>
              </div>
            </div>
            <div className="header-actions">
              <button onClick={() => setDarkMode(!darkMode)} className="btn btn-secondary">
                {darkMode ? '☀️ Светлая' : '🌙 Тёмная'}
              </button>
              <button onClick={() => setShowAnalytics(!showAnalytics)} className="btn btn-secondary">
                📊 {showAnalytics ? 'Скрыть' : 'Аналитика'}
              </button>
              <button onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')} className="btn btn-secondary">
                {viewMode === 'grid' ? '📊 Таблица' : '📱 Карточки'}
              </button>
              <button onClick={handleLogout} className="btn btn-outline">🚪 Выйти</button>
            </div>
          </div>
          <div className="header-bottom">
            <div className="user-info">
              <span className="user-badge">👤 {user.email}</span>
              <span className={`role-badge ${role === 'admin' ? 'admin' : 'user'}`}>
                {role === 'admin' ? '👑 Администратор' : '👤 Пользователь'}
              </span>
            </div>
            <div className="date-text">
              {new Date().toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>

        {/* СТАТИСТИКА */}
        <div className="stats-dashboard">
          <div className="stat-glass">
            <div className="stat-value-large">{stats.total}</div>
            <div className="stat-label">Всего заявок</div>
          </div>
          <div className="stat-glass">
            <div className="stat-value-large" style={{ color: '#f59e0b' }}>{stats.pending}</div>
            <div className="stat-label">Ожидают</div>
          </div>
          <div className="stat-glass">
            <div className="stat-value-large" style={{ color: '#3b82f6' }}>{stats.inProgress}</div>
            <div className="stat-label">В работе</div>
          </div>
          <div className="stat-glass">
            <div className="stat-value-large" style={{ color: '#10b981' }}>{stats.completed}</div>
            <div className="stat-label">Выполнено</div>
          </div>
        </div>

        {/* АНАЛИТИКА */}
        {showAnalytics && (
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-title">📊 Статус заявок</div>
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 48, fontWeight: 'bold', color: 'var(--dark-green)' }}>{stats.total}</div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
                  <div><span style={{ color: '#f59e0b' }}>●</span> Ожидание: <strong>{stats.pending}</strong></div>
                  <div><span style={{ color: '#3b82f6' }}>●</span> В работе: <strong>{stats.inProgress}</strong></div>
                  <div><span style={{ color: '#10b981' }}>●</span> Выполнено: <strong>{stats.completed}</strong></div>
                </div>
                <div style={{ marginTop: 16, height: 8, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${stats.total ? (stats.completed / stats.total) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg, #0f5c3e, #a3ff00)' }} />
                </div>
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-title">⚡ Распределение по срочности</div>
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 48, fontWeight: 'bold', color: 'var(--dark-green)' }}>{stats.total}</div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
                  <div><span style={{ color: '#dc2626' }}>●</span> Высокая: <strong>{stats.highUrgency}</strong></div>
                  <div><span style={{ color: '#f59e0b' }}>●</span> Средняя: <strong>{stats.mediumUrgency}</strong></div>
                  <div><span style={{ color: '#0f5c3e' }}>●</span> Низкая: <strong>{stats.lowUrgency}</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ФОРМА СОЗДАНИЯ ЗАЯВКИ */}
        <div className="chart-card form-card">
          <div className="chart-title">➕ Новая заявка</div>
          <form onSubmit={handleCreateTicket}>
            <div className="form-grid">
              <input type="text" placeholder="Оборудование *" value={newTicket.equipment} onChange={e => setNewTicket({...newTicket, equipment: e.target.value})} required className="form-premium-input" disabled={loading} />
              <select value={newTicket.urgency} onChange={e => setNewTicket({...newTicket, urgency: e.target.value})} className="form-premium-select" disabled={loading}>
                <option value="low">🟢 Низкая</option>
                <option value="medium">🟡 Средняя</option>
                <option value="high">🔴 Высокая</option>
              </select>
              <select value={newTicket.category} onChange={e => setNewTicket({...newTicket, category: e.target.value})} className="form-premium-select" disabled={loading}>
                <option value="general">📌 Обычная</option>
                <option value="urgent">🚨 Аварийная</option>
                <option value="planned">📅 Плановая</option>
              </select>
              <input type="date" placeholder="Дата выполнения" value={newTicket.dueDate} onChange={e => setNewTicket({...newTicket, dueDate: e.target.value})} className="form-premium-input" disabled={loading} />
              <input type="text" placeholder="Местоположение" value={newTicket.location} onChange={e => setNewTicket({...newTicket, location: e.target.value})} className="form-premium-input" disabled={loading} />
              <input type="tel" placeholder="Контактный телефон" value={newTicket.contactPhone} onChange={e => setNewTicket({...newTicket, contactPhone: e.target.value})} className="form-premium-input" disabled={loading} />
              <input type="text" placeholder="Ссылка на фото" value={newTicket.attachment} onChange={e => setNewTicket({...newTicket, attachment: e.target.value})} className="form-premium-input" disabled={loading} />
            </div>
            <textarea placeholder="Описание проблемы *" value={newTicket.problem} onChange={e => setNewTicket({...newTicket, problem: e.target.value})} required rows="3" className="form-premium-textarea" disabled={loading} />
            <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
              {loading ? '⏳ Отправка...' : '📨 Отправить заявку'}
            </button>
          </form>
        </div>

        {/* ПОИСК И ФИЛЬТРЫ */}
        <div className="filters-bar">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Поиск по оборудованию, описанию, пользователю, локации..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-premium-input" />
          </div>
          <div className="filters-group">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-premium-select">
              <option value="all">Все статусы</option>
              <option value="pending">⏳ Ожидание</option>
              <option value="in_progress">⚙️ В работе</option>
              <option value="completed">✅ Выполнено</option>
            </select>
            <select value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)} className="filter-premium-select">
              <option value="all">Вся срочность</option>
              <option value="high">🔴 Высокая</option>
              <option value="medium">🟡 Средняя</option>
              <option value="low">🟢 Низкая</option>
            </select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="filter-premium-select">
              <option value="all">Все категории</option>
              <option value="general">📌 Обычная</option>
              <option value="urgent">🚨 Аварийная</option>
              <option value="planned">📅 Плановая</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="filter-premium-select">
              <option value="date">📅 По дате</option>
              <option value="urgency">⚡ По срочности</option>
              <option value="status">📊 По статусу</option>
            </select>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="filter-premium-select">
              <option value="desc">⬇️ По убыванию</option>
              <option value="asc">⬆️ По возрастанию</option>
            </select>
            <button onClick={clearFilters} className="btn btn-secondary">🗑️ Сбросить</button>
            <button onClick={exportToCSV} className="btn btn-primary">📎 Экспорт CSV</button>
          </div>
        </div>

        {/* ДАТА ФИЛЬТРЫ */}
        <div className="date-filters">
          <div className="date-filter-group">
            <label>С даты:</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="date-input" />
          </div>
          <div className="date-filter-group">
            <label>По дату:</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="date-input" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn btn-outline btn-sm">✖️ Очистить даты</button>
          )}
        </div>

        {/* МАССОВЫЕ ОПЕРАЦИИ */}
        {role === 'admin' && selectedTickets.length > 0 && (
          <div className="mass-actions-bar">
            <span>✅ Выбрано заявок: <strong>{selectedTickets.length}</strong></span>
            <div className="mass-actions-buttons">
              <button onClick={() => massUpdateStatus('in_progress')} className="btn btn-secondary">⚙️ В работу</button>
              <button onClick={() => massUpdateStatus('completed')} className="btn btn-primary">✅ Завершить</button>
              <button onClick={() => setSelectedTickets([])} className="btn btn-outline">Отмена</button>
            </div>
          </div>
        )}

        {/* ОСНОВНОЙ КОНТЕНТ */}
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Загрузка данных...</p>
          </div>
        ) : role === 'admin' ? (
          <div className="table-wrapper">
            <table className="table-modern">
              <thead>
                <tr>
                  <th style={{ width: 40 }}><input type="checkbox" onChange={(e) => e.target.checked ? setSelectedTickets(tickets.map(t => t.id)) : setSelectedTickets([])} /></th>
                  <th>Оборудование</th>
                  <th>Пользователь</th>
                  <th>Проблема</th>
                  <th>Срочность</th>
                  <th>Категория</th>
                  <th>Статус</th>
                  <th>Дата</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map(t => (
                  <tr key={t.id}>
                    <td><input type="checkbox" checked={selectedTickets.includes(t.id)} onChange={(e) => e.target.checked ? setSelectedTickets([...selectedTickets, t.id]) : setSelectedTickets(selectedTickets.filter(id => id !== t.id))} /></td>
                    <td><strong>{t.equipment}</strong></td>
                    <td>{t.userId?.split('@')[0]}</td>
                    <td style={{ maxWidth: 200, wordBreak: 'break-word' }}>{t.problem?.substring(0, 40)}...</td>
                    <td><span className={`badge ${getUrgencyClass(t.urgency)}`}>{getUrgencyText(t.urgency)}</span></td>
                    <td><span className="badge category-badge">{t.category === 'urgent' ? '🚨 Авария' : t.category === 'planned' ? '📅 План' : '📌 Обычная'}</span></td>
                    <td>
                      <select value={t.status} onChange={(e) => updateStatus(t.id, e.target.value)} className="status-select">
                        <option value="pending">⏳ Ожидание</option>
                        <option value="in_progress">⚙️ В работе</option>
                        <option value="completed">✅ Выполнено</option>
                      </select>
                    </td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="action-buttons">
                        <button onClick={() => setSelectedTicket(t)} className="btn-icon view">📄</button>
                        <button onClick={() => deleteTicket(t.id)} className="btn-icon delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="tickets-grid-premium">
            {filteredTickets.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>У вас пока нет заявок</p>
                <p className="empty-hint">Создайте первую заявку с помощью формы выше</p>
              </div>
            )}
            {filteredTickets.map(t => (
              <div key={t.id} className="ticket-premium">
                <div className="ticket-header-premium">
                  <span className="ticket-title-premium">{t.equipment}</span>
                  <span className={`badge ${getUrgencyClass(t.urgency)}`}>{getUrgencyText(t.urgency)}</span>
                </div>
                <div className="ticket-description-premium">{t.problem}</div>
                <div className="progress-premium">
                  <div className="progress-premium-bar"><div className="progress-premium-fill" style={{ width: `${getProgress(t)}%` }}></div></div>
                </div>
                <div className="ticket-premium-footer">
                  <span>📅 {new Date(t.createdAt).toLocaleDateString()}</span>
                  <span className={`badge ${getStatusClass(t.status)}`}>{getStatusText(t.status)}</span>
                </div>
                {t.location && <div className="ticket-location">📍 {t.location}</div>}
                {t.status === 'completed' && !t.rating && (
                  <div className="rating-section">
                    <span>Оцените ремонт:</span>
                    {[1,2,3,4,5].map(star => (
                      <button key={star} onClick={() => submitRating(t.id, star)} className="star-btn">★</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table-modern">
              <thead><tr><th>Оборудование</th><th>Проблема</th><th>Срочность</th><th>Статус</th><th>Дата</th></tr></thead>
              <tbody>
                {filteredTickets.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.equipment}</strong></td>
                    <td>{t.problem?.substring(0, 50)}</td>
                    <td><span className={`badge ${getUrgencyClass(t.urgency)}`}>{getUrgencyText(t.urgency)}</span></td>
                    <td><span className={`badge ${getStatusClass(t.status)}`}>{getStatusText(t.status)}</span></td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* МОДАЛКА ДЕТАЛЕЙ */}
      {selectedTicket && (
        <div className="modal-premium" onClick={() => setSelectedTicket(null)}>
          <div className="modal-content-premium" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📄 Детали заявки</h3>
              <button onClick={() => setSelectedTicket(null)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <div className="detail-row"><strong>Оборудование:</strong> {selectedTicket.equipment}</div>
              <div className="detail-row"><strong>Проблема:</strong> {selectedTicket.problem}</div>
              <div className="detail-row"><strong>Срочность:</strong> <span className={`badge ${getUrgencyClass(selectedTicket.urgency)}`}>{getUrgencyText(selectedTicket.urgency)}</span></div>
              <div className="detail-row"><strong>Категория:</strong> {selectedTicket.category === 'urgent' ? '🚨 Аварийная' : selectedTicket.category === 'planned' ? '📅 Плановая' : '📌 Обычная'}</div>
              <div className="detail-row"><strong>Статус:</strong> <span className={`badge ${getStatusClass(selectedTicket.status)}`}>{getStatusText(selectedTicket.status)}</span></div>
              <div className="detail-row"><strong>Создал:</strong> {selectedTicket.userId}</div>
              <div className="detail-row"><strong>Дата:</strong> {new Date(selectedTicket.createdAt).toLocaleString()}</div>
              {selectedTicket.location && <div className="detail-row"><strong>📍 Местоположение:</strong> {selectedTicket.location}</div>}
              {selectedTicket.contactPhone && <div className="detail-row"><strong>📞 Телефон:</strong> {selectedTicket.contactPhone}</div>}
              {selectedTicket.dueDate && <div className="detail-row"><strong>📅 Срок выполнения:</strong> {selectedTicket.dueDate}</div>}
              {selectedTicket.attachment && <div className="detail-row"><strong>📎 Вложение:</strong> <a href={selectedTicket.attachment} target="_blank" rel="noreferrer">Открыть</a></div>}
            </div>
            <button onClick={() => setSelectedTicket(null)} className="btn btn-primary modal-close-btn">Закрыть</button>
          </div>
        </div>
      )}

      {toast && <div className="toast-premium">{toast.type === 'error' ? '❌' : '✅'} {toast.message}</div>}
    </div>
  );
}

export default App;