const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('@neondatabase/serverless');
const cors = require('cors');

const app = express();
const port = 3000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://team04_owner:KfC3X0zR5WqC@ep-solitary-bird-a58h7v6u.us-east-2.aws.neon.tech/team04?sslmode=require',
});

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://edu-streakz.vercel.app'],
    credentials: true,
}));
app.use(express.json());

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Initialize database schema
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                birth_day INTEGER NOT NULL,
                birth_month INTEGER NOT NULL,
                birth_year INTEGER NOT NULL,
                password VARCHAR(255) NOT NULL,
                streak INTEGER DEFAULT 0,
                join_date DATE NOT NULL,
                location VARCHAR(100),
                bio TEXT,
                education VARCHAR(100),
                favorite_game VARCHAR(50),
                friend_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                game_name VARCHAR(50) NOT NULL,
                score INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS badges (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                badge_name VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                activity_text VARCHAR(255) NOT NULL,
                timestamp TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS friends (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                friend_name VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS goals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                goal_text VARCHAR(255) NOT NULL,
                completed BOOLEAN DEFAULT FALSE
            );
        `);
    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        client.release();
    }
}

initializeDatabase();

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
    const { username, email, birthDay, birthMonth, birthYear, password } = req.body;
    const joinDate = new Date().toISOString().split('T')[0]; // Current date
    const client = await pool.connect();
    try {
        const result = await client.query(
            'INSERT INTO users (username, email, birth_day, birth_month, birth_year, password, join_date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [username, email, birthDay, birthMonth, birthYear, password, joinDate]
        );
        const user = result.rows[0];
        res.status(201).json({ message: 'User created', user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Get user data endpoint
app.get('/api/user/me', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const userResult = await client.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
        const user = userResult.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const gamesResult = await client.query('SELECT * FROM games WHERE user_id = $1', [req.user.userId]);
        const badgesResult = await client.query('SELECT * FROM badges WHERE user_id = $1', [req.user.userId]);
        const activitiesResult = await client.query('SELECT * FROM activities WHERE user_id = $1 ORDER BY timestamp DESC', [req.user.userId]);
        const friendsResult = await client.query('SELECT * FROM friends WHERE user_id = $1', [req.user.userId]);
        const goalsResult = await client.query('SELECT * FROM goals WHERE user_id = $1', [req.user.userId]);

        res.json({
            username: user.username,
            email: user.email,
            streak: user.streak,
            join_date: user.join_date,
            location: user.location,
            bio: user.bio,
            education: user.education,
            favorite_game: user.favorite_game,
            friend_count: user.friend_count,
            games: gamesResult.rows,
            badges: badgesResult.rows.map(b => b.badge_name),
            activities: activitiesResult.rows.map(a => ({ text: a.activity_text, timestamp: a.timestamp })),
            friends: friendsResult.rows.map(f => f.friend_name),
            goals: goalsResult.rows.map(g => ({ text: g.goal_text, completed: g.completed })),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Leaderboard endpoint
app.get('/api/leaderboard', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT u.username, SUM(g.score) as total_score
            FROM users u
            LEFT JOIN games g ON u.id = g.user_id
            GROUP BY u.id, u.username
            ORDER BY total_score DESC
            LIMIT 3
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Community info endpoint
app.get('/api/community', async (req, res) => {
    res.json({
        message: 'Praat mee in onze community en deel je voortgang!',
        support_email: 'support@edustreakz.com',
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});