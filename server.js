const express = require('express');
const { neon } = require('@neondatabase/serverless');
const cors = require('cors');

const app = express();
const port = 3001;

// Middleware
app.use(cors()); // Allow cross-origin requests from the frontend
app.use(express.json());

// Connect to Neon PostgreSQL database
const sql = neon('postgresql://neondb_owner:npg_keVmI4MiLG7x@ep-purple-sea-a2c6jvv5-pooler.eu-central-1.aws.neon.tech/edustreakzdb?sslmode=require');

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

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});