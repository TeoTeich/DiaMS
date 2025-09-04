const express = require('express');
const app = express();
const pool = require('./db');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = '1234'; // ВАЖНО: Замените на сложный секретный ключ!

// Middleware для обработки JSON-запросов
app.use(express.json());

// Отдача главной страницы (login.html) при запросе корня сайта
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Отдача статических файлов (HTML, CSS, JS) из папки public
app.use(express.static('public'));

// Middleware для проверки токена и роли пользователя
const auth = (role) => (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Доступ запрещен. Нет токена.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Добавляем данные пользователя в объект запроса
        if (role && req.user.role !== role) {
            return res.status(403).json({ error: 'Доступ запрещен. Недостаточно прав.' });
        }
        next();
    } catch (err) {
        res.status(401).json({ error: 'Недействительный токен.' });
    }
};

//---
// Маршруты аутентификации

// Регистрация врача (доступно только через API)
app.post('/api/register-endocrinologist', async (req, res) => {
    const { username, password, full_name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO Endocrinologists (username, password, full_name) VALUES (?, ?, ?)',
            [username, hashedPassword, full_name]
        );
        res.status(201).json({ message: 'Врач успешно зарегистрирован' });
    } catch (err) {
        console.error('Ошибка при регистрации врача:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход в систему (логин)
app.post('/api/login', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        let user;
        let userId;
        let userRole;
        if (role === 'patient') {
            const [rows] = await pool.query('SELECT * FROM Patients WHERE username = ?', [username]);
            if (rows.length === 0) return res.status(401).json({ error: 'Неверные учетные данные' });
            user = rows[0];
            userId = user.patient_id;
            userRole = 'patient';
        } else if (role === 'endocrinologist') {
            const [rows] = await pool.query('SELECT * FROM Endocrinologists WHERE username = ?', [username]);
            if (rows.length === 0) return res.status(401).json({ error: 'Неверные учетные данные' });
            user = rows[0];
            userId = user.id;
            userRole = 'endocrinologist';
        } else {
            return res.status(400).json({ error: 'Неверная роль' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Неверные учетные данные' });
        const token = jwt.sign({ id: userId, role: userRole }, JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ token, role: userRole });
    } catch (err) {
        console.error('Ошибка входа:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

//---
// Защищённые маршруты для врача

// Регистрация пациента (доступно только для врача)
app.post('/api/patients', auth('endocrinologist'), async (req, res) => {
    const { full_name, date_of_birth, diabetes_type, contact_info, username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO Patients (full_name, date_of_birth, diabetes_type, contact_info, username, password) VALUES (?, ?, ?, ?, ?, ?)',
            [full_name, date_of_birth, diabetes_type, contact_info, username, hashedPassword]
        );
        res.status(201).json({ message: 'Пациент успешно зарегистрирован.' });
    } catch (err) {
        console.error('Ошибка при регистрации пациента:', err);
        res.status(500).json({ error: 'Ошибка сервера при регистрации.' });
    }
});

// Получение списка пациентов (доступно только для врача)
app.get('/api/patients', auth('endocrinologist'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Patients');
        res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение оборудования по ID пациента (доступно только для врача)
app.get('/api/patients/:patientId/equipment', auth('endocrinologist'), async (req, res) => {
    const { patientId } = req.params;
    try {
        const connection = await pool.getConnection();
        const sql = 'SELECT * FROM Medical_Equipment WHERE patient_id = ?';
        const [rows] = await connection.query(sql, [patientId]);
        connection.release();
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Оборудование для этого пациента не найдено.' });
        }
        res.status(200).json(rows);
    } catch (err) {
        console.error('Ошибка при получении оборудования:', err);
        res.status(500).json({ error: 'Ошибка сервера при получении оборудования.' });
    }
});

// Получение расходников по ID пациента (доступно только для врача)
app.get('/api/patients/:patientId/consumables', auth('endocrinologist'), async (req, res) => {
    const { patientId } = req.params;
    try {
        const connection = await pool.getConnection();
        const sql = 'SELECT * FROM Consumables WHERE patient_id = ?';
        const [rows] = await connection.query(sql, [patientId]);
        connection.release();
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Расходные материалы для этого пациента не найдены.' });
        }
        res.status(200).json(rows);
    } catch (err) {
        console.error('Ошибка при получении расходников:', err);
        res.status(500).json({ error: 'Ошибка сервера при получении расходников.' });
    }
});

// Получение показаний по ID пациента (доступно только для врача)
app.get('/api/patients/:patientId/readings', auth('endocrinologist'), async (req, res) => {
    const { patientId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM Readings WHERE patient_id = ?', [patientId]);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Ошибка получения показаний:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

//---
// Новые маршруты для редактирования и удаления пациентов (только для врача)

app.put('/api/patients/:id', auth('endocrinologist'), async (req, res) => {
    const { id } = req.params;
    let { full_name, date_of_birth, diabetes_type, contact_info } = req.body;

    // Преобразуем дату в формат 'YYYY-MM-DD' для MySQL
    if (date_of_birth) {
        const dateObject = new Date(date_of_birth);
        date_of_birth = dateObject.toISOString().split('T')[0];
    }

    try {
        const [result] = await pool.query(
            'UPDATE Patients SET full_name = ?, date_of_birth = ?, diabetes_type = ?, contact_info = ? WHERE patient_id = ?',
            [full_name, date_of_birth, diabetes_type, contact_info, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Пациент не найден.' });
        }
        res.status(200).json({ message: 'Информация о пациенте успешно обновлена.' });
    } catch (err) {
        console.error('Ошибка при обновлении данных пациента:', err);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

app.delete('/api/patients/:id', auth('endocrinologist'), async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM Patients WHERE patient_id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Пациент не найден.' });
        }
        res.status(200).json({ message: 'Пациент успешно удален.' });
    } catch (err) {
        console.error('Ошибка при удалении пациента:', err);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

//---
// Защищённые маршруты для пациента

// Получение данных текущего пациента (доступно только для пациента)
app.get('/api/me', auth('patient'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Patients WHERE patient_id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Пациент не найден' });
        res.status(200).json(rows[0]);
    } catch (err) {
        console.error('Ошибка получения данных пациента:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение показаний текущего пациента (доступно только для пациента)
app.get('/api/me/readings', auth('patient'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Readings WHERE patient_id = ?', [req.user.id]);
        res.status(200).json(rows);
    } catch (err) {
        console.error('Ошибка получения показаний:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

//---
// Маршруты для обеих ролей

// Добавление показания (для обеих ролей, но пациент может только себе)
app.post('/api/readings', auth(), async (req, res) => {
    const { glucose_level, reading_time, notes, patient_id } = req.body;
    // Пациент может добавлять показания только для себя
    if (req.user.role === 'patient' && req.user.id !== patient_id) {
        return res.status(403).json({ error: 'Доступ запрещен. Вы не можете добавлять показания для другого пациента.' });
    }
    try {
        const connection = await pool.getConnection();
        const sql = `
          INSERT INTO Readings (glucose_level, reading_time, notes, patient_id)
          VALUES (?, ?, ?, ?)
        `;
        const values = [glucose_level, reading_time, notes, patient_id];
        await connection.query(sql, values);
        connection.release();
        res.status(201).json({ message: 'Показание успешно добавлено.' });
    } catch (err) {
        console.error('Ошибка при добавлении показания:', err);
        res.status(500).json({ error: 'Ошибка сервера при добавлении показания.' });
    }
});

// Добавление оборудования (для обеих ролей)
app.post('/api/equipment', auth(), async (req, res) => {
    const { name, serial_number, patient_id } = req.body;
    // Пациент может добавлять оборудование только для себя
    if (req.user.role === 'patient' && req.user.id !== patient_id) {
        return res.status(403).json({ error: 'Доступ запрещен. Вы не можете добавлять оборудование для другого пациента.' });
    }
    try {
        const connection = await pool.getConnection();
        const sql = `
          INSERT INTO Medical_Equipment (name, serial_number, patient_id)
          VALUES (?, ?, ?)
        `;
        const values = [name, serial_number, patient_id];
        await connection.query(sql, values);
        connection.release();
        res.status(201).json({ message: 'Оборудование успешно добавлено.' });
    } catch (err) {
        console.error('Ошибка при добавлении оборудования:', err);
        res.status(500).json({ error: 'Ошибка сервера при добавлении оборудования.' });
    }
});

// Добавление расходников (для обеих ролей)
app.post('/api/consumables', auth(), async (req, res) => {
    const { name, quantity_in_pack, expiration_date, patient_id } = req.body;
    // Пациент может добавлять расходники только для себя
    if (req.user.role === 'patient' && req.user.id !== patient_id) {
        return res.status(403).json({ error: 'Доступ запрещен. Вы не можете добавлять расходники для другого пациента.' });
    }
    try {
        const connection = await pool.getConnection();
        const sql = `
          INSERT INTO Consumables (name, quantity_in_pack, expiration_date, patient_id)
          VALUES (?, ?, ?, ?)
        `;
        const values = [name, quantity_in_pack, expiration_date, patient_id];
        await connection.query(sql, values);
        connection.release();
        res.status(201).json({ message: 'Расходный материал успешно добавлен.' });
    } catch (err) {
        console.error('Ошибка при добавлении расходника:', err);
        res.status(500).json({ error: 'Ошибка сервера при добавлении расходника.' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});