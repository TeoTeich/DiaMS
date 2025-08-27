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

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});