const express = require('express');
const { neon } = require('@neondatabase/serverless');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
    origin: 'https://edu-streakz.vercel.app', // Replace with your frontend URL if different
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Connect to Neon PostgreSQL database using environment variable
const sql = neon(process.env.DATABASE_URL);

// Sample route to test the server
app.get('/', (req, res) => {
    res.send('EduStreakz Backend is running!');
});

// API to fetch user data (streak, progress, etc.)
app.get('/api/user/:username', async (req, res) => {
    const { username } = req.params;
    try {
        // Fetch user data
        const userResult = await sql`
            SELECT * FROM users WHERE username = ${username}
        `;
        if (userResult.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult[0];

        // Fetch user's streak
        const streakResult = await sql`
            SELECT streak_days FROM streaks WHERE user_id = ${user.id}
        `;
        const streak = streakResult[0]?.streak_days || 0;

        // Fetch user's progress (e.g., weekly progress percentage)
        const progressResult = await sql`
            SELECT progress_percentage FROM progress WHERE user_id = ${user.id} AND period = 'weekly'
        `;
        const progress = progressResult[0]?.progress_percentage || 0;

        // Fetch user's game activity (e.g., scores or levels completed)
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

// Export the app for Vercel
module.exports = app;