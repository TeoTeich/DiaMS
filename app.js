// Импорт express
const express = require('express');
const app = express();
const pool = require('./db');

// Определение порта, на котором будет работать сервер
const PORT = process.env.PORT || 3000;

// Middleware для обработки JSON-данных
app.use(express.json());
app.use(express.static('public'));

// Маршрут для проверки подключения к БД
app.get('/test-db', async (req, res) => {
    try {
        // Получение соединения из пула
        const connection = await pool.getConnection();
        // Выполнение простого запроса (например, получение текущей даты)
        const [rows] = await connection.query('SELECT NOW() AS now');
        connection.release(); // Обязательно освободить соединение

        res.status(200).json({ message: 'Соединение с базой данных успешно установлено!', time: rows[0].now });
    } catch (err) {
        console.error('Ошибка подключения к БД:', err);
        res.status(500).json({ error: 'Не удалось подключиться к базе данных.' });
    }
});

// Маршрут для регистрации нового пациента
app.post('/api/patients', async (req, res) => {
    // Получение данных из тела запроса
    const { full_name, date_of_birth, diabetes_type, contact_info } = req.body;

    // Проверка, что обязательные поля не пусты
    if (!full_name || !diabetes_type) {
        return res.status(400).json({ error: 'Имя и тип диабета являются обязательными полями.' });
    }

    try {
        // Получение соединения из пула
        const connection = await pool.getConnection();

        // SQL-запрос для вставки данных
        const sql = `
      INSERT INTO Patients (full_name, date_of_birth, diabetes_type, contact_info)
      VALUES (?, ?, ?, ?)
    `;
        const values = [full_name, date_of_birth, diabetes_type, contact_info];

        // Выполнение запроса
        await connection.query(sql, values);

        // Освобождение соединения
        connection.release();

        // Отправка успешного ответа
        res.status(201).json({ message: 'Пациент успешно зарегистрирован.' });
    } catch (err) {
        console.error('Ошибка при регистрации пациента:', err);
        res.status(500).json({ error: 'Ошибка сервера при регистрации.' });
    }
});

// Маршрут для добавления нового показания
app.post('/api/readings', async (req, res) => {
    // Получение данных из тела запроса
    const { glucose_level, reading_time, notes, patient_id } = req.body;

    // Валидация обязательных полей
    if (!glucose_level || !reading_time || !patient_id) {
        return res.status(400).json({ error: 'Уровень глюкозы, время измерения и ID пациента являются обязательными.' });
    }

    // Проверка на положительное значение глюкозы
    if (glucose_level <= 0) {
        return res.status(400).json({ error: 'Уровень глюкозы должен быть положительным числом.' });
    }

    try {
        const connection = await pool.getConnection();

        // SQL-запрос для вставки данных
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

// Маршрут для добавления нового медицинского оборудования
app.post('/api/equipment', async (req, res) => {
    const { name, serial_number, purchase_date, warranty_expiration_date, patient_id } = req.body;

    // Проверка обязательных полей
    if (!name || !patient_id) {
        return res.status(400).json({ error: 'Название и ID пациента являются обязательными полями.' });
    }

    try {
        const connection = await pool.getConnection();

        const sql = `
      INSERT INTO Medical_Equipment (name, serial_number, purchase_date, warranty_expiration_date, patient_id)
      VALUES (?, ?, ?, ?, ?)
    `;
        const values = [name, serial_number, purchase_date, warranty_expiration_date, patient_id];

        await connection.query(sql, values);

        connection.release();

        res.status(201).json({ message: 'Медицинское оборудование успешно добавлено.' });
    } catch (err) {
        console.error('Ошибка при добавлении оборудования:', err);
        res.status(500).json({ error: 'Ошибка сервера при добавлении оборудования.' });
    }
});

// Маршрут для получения всего оборудования пациента
app.get('/api/patients/:patientId/equipment', async (req, res) => {
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

// Маршрут для добавления нового расходного материала
app.post('/api/consumables', async (req, res) => {
    const { name, quantity_in_pack, expiration_date, patient_id } = req.body;

    // Проверка обязательных полей
    if (!name || !patient_id) {
        return res.status(400).json({ error: 'Название и ID пациента являются обязательными.' });
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

// Маршрут для получения всех расходных материалов пациента
app.get('/api/patients/:patientId/consumables', async (req, res) => {
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

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});