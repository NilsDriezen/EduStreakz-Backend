const express = require('express');
const { neon } = require('@neondatabase/serverless');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors({
    origin: 'https://edu-streakz.vercel.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Debug middleware to log all incoming requests
app.use((req, res, next) => {
    console.log(`Received ${req.method} request to ${req.url}`);
    next();
});

// Connect to Neon PostgreSQL database
const sql = neon(process.env.DATABASE_URL);

// Sample route to test the server
app.get('/', (req, res) => {
    res.send('EduStreakz Backend is running!');
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userResult = await sql`
            SELECT * FROM users WHERE username = ${username}
        `;
        if (userResult.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = userResult[0];
        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Middleware to authenticate JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// API to fetch user data (protected route)
app.get('/api/user/me', authenticateToken, async (req, res) => {
    const username = req.user.username;

    try {
        const userResult = await sql`
            SELECT * FROM users WHERE username = ${username}
        `;
        if (userResult.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult[0];

        const streakResult = await sql`
            SELECT streak_days FROM streaks WHERE user_id = ${user.id}
        `;
        const streak = streakResult[0]?.streak_days || 0;

        const progressResult = await sql`
            SELECT progress_percentage FROM progress WHERE user_id = ${user.id} AND period = 'weekly'
        `;
        const progress = progressResult[0]?.progress_percentage || 0;

        const gamesResult = await sql`
            SELECT game_name, score, level FROM game_activity WHERE user_id = ${user.id}
        `;
        const games = gamesResult;

        res.json({
            username: user.username,
            streak,
            progress,
            games
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API to fetch user data (unprotected, for debugging)
app.get('/api/user/:username', async (req, res) => {
    const { username } = req.params;
    console.log(`Fetching data for username: ${username}`);
    try {
        const userResult = await sql`
            SELECT * FROM users WHERE username = ${username}
        `;
        if (userResult.length === 0) {
            console.log(`User ${username} not found`);
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult[0];

        const streakResult = await sql`
            SELECT streak_days FROM streaks WHERE user_id = ${user.id}
        `;
        const streak = streakResult[0]?.streak_days || 0;

        const progressResult = await sql`
            SELECT progress_percentage FROM progress WHERE user_id = ${user.id} AND period = 'weekly'
        `;
        const progress = progressResult[0]?.progress_percentage || 0;

        // Fetch user's game activity

        const gamesResult = await sql`
            SELECT game_name, score, level FROM game_activity WHERE user_id = ${user.id}
        `;
        const games = gamesResult;

        res.json({
            username: user.username,
            streak,
            progress,
            games
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Fallback route for unmatched routes
app.use((req, res) => {
    console.log(`Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Cannot ${req.method} ${req.url}` });
});

// Export the app for Vercel
module.exports = app;