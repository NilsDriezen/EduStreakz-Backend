const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('@neondatabase/serverless');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
    origin: ['https://edu-streakz.vercel.app', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://team04_owner:KfC3X0zR5WqC@ep-solitary-bird-a58h7v6u.us-east-2.aws.neon.tech/team04?sslmode=require',
});

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

// Middleware to check if user is a teacher
const requireTeacher = async (req, res, next) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT role FROM users WHERE id = $1', [req.user.userId]);
        const user = result.rows[0];
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Teacher access required' });
        }
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
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
                friend_count INTEGER DEFAULT 0,
                role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher'))
            );

            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                game_name VARCHAR(50) NOT NULL,
                score INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS badges (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                badge_name VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                activity_text VARCHAR(255) NOT NULL,
                timestamp TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS friends (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                friend_name VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS goals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                goal_text VARCHAR(255) NOT NULL,
                completed BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS classes (
                id SERIAL PRIMARY KEY,
                class_name VARCHAR(100) NOT NULL,
                teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS class_members (
                id SERIAL PRIMARY KEY,
                class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
                student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (class_id, student_id)
            );
        `);
        console.log('Database schema initialized.');
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
        res.json({ token, role: user.role });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
    const { username, email, birthDay, birthMonth, birthYear, password, role } = req.body;
    const joinDate = new Date().toISOString().split('T')[0];
    const client = await pool.connect();
    try {
        const result = await client.query(
            'INSERT INTO users (username, email, birth_day, birth_month, birth_year, password, join_date, role) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [username, email, birthDay, birthMonth, birthYear, password, joinDate, role || 'student']
        );
        res.status(201).json({ message: 'User created', user: result.rows[0] });
    } catch (err) {
        console.error('Error during signup:', err);
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
            role: user.role,
            games: gamesResult.rows,
            badges: badgesResult.rows.map(b => b.badge_name),
            activities: activitiesResult.rows.map(a => ({ text: a.activity_text, timestamp: a.timestamp })),
            friends: friendsResult.rows.map(f => f.friend_name),
            goals: goalsResult.rows.map(g => ({ text: g.goal_text, completed: g.completed }))
        });
    } catch (err) {
        console.error('Error fetching user data:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Update user profile data
app.put('/api/user/update', authenticateToken, async (req, res) => {
    const { bio, education, favorite_game, email } = req.body;
    const client = await pool.connect();
    try {
        const updates = {};
        if (bio !== undefined) updates.bio = bio;
        if (education !== undefined) updates.education = education;
        if (favorite_game !== undefined) updates.favorite_game = favorite_game;
        if (email !== undefined) updates.email = email;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields provided to update' });
        }

        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        values.push(req.user.userId);

        await client.query(
            `UPDATE users SET ${setClause} WHERE id = $${fields.length + 1}`,
            values
        );
        res.status(200).json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Error updating user data:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Get user-specific scores
app.get('/api/mijn-scores', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const scores = await client.query(
            'SELECT game_name, score, level FROM games WHERE user_id = $1 ORDER BY score DESC',
            [req.user.userId]
        );
        res.json(scores.rows);
    } catch (err) {
        console.error('Error fetching scores:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Update or insert game score.
app.post('/api/games', authenticateToken, async (req, res) => {
    const { game_name, score, level } = req.body;
    if (!game_name || score == null || level == null) {
        return res.status(400).json({ error: 'game_name, score, and level are required' });
    }
    const client = await pool.connect();
    try {
        const existing = await client.query(
            'SELECT * FROM games WHERE user_id = $1 AND game_name = $2',
            [req.user.userId, game_name]
        );
        if (existing.rows.length > 0) {
            await client.query(
                'UPDATE games SET score = $1, level = $2 WHERE user_id = $3 AND game_name = $4',
                [score, level, req.user.userId, game_name]
            );
        } else {
            await client.query(
                'INSERT INTO games (user_id, game_name, score, level) VALUES ($1, $2, $3, $4)',
                [req.user.userId, game_name, score, level]
            );
        }
        await client.query(
            'INSERT INTO activities (user_id, activity_text, timestamp) VALUES ($1, $2, $3)',
            [req.user.userId, game_name, new Date()]
        );
        res.status(200).json({ message: 'Score updated' });
    } catch (err) {
        console.error('Error saving score:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Log a user activity with a specific timestamp
app.post('/api/user/log-activity', authenticateToken, async (req, res) => {
    const { activity_text, timestamp } = req.body;
    if (!activity_text || !timestamp) {
        return res.status(400).json({ error: 'activity_text and timestamp are required' });
    }
    const client = await pool.connect();
    try {
        await client.query(
            'INSERT INTO activities (user_id, activity_text, timestamp) VALUES ($1, $2, $3)',
            [req.user.userId, activity_text, timestamp]
        );
        res.status(200).json({ message: 'Activity logged successfully' });
    } catch (err) {
        console.error('Error logging activity:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Update user streak based on daily game completion
app.post('/api/user/update-streak', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        // Get today's date (midnight to midnight)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Check if the user completed a game today
        const todayCompletions = await client.query(
            `SELECT * FROM activities 
             WHERE user_id = $1 
             AND activity_text LIKE 'Completed%' 
             AND timestamp >= $2 
             AND timestamp < $3`,
            [req.user.userId, today, tomorrow]
        );

        // Get the user's current streak and last completion date
        const userResult = await client.query(
            'SELECT streak FROM users WHERE id = $1',
            [req.user.userId]
        );
        let currentStreak = userResult.rows[0].streak || 0;

        // Find the last game completion date before today
        const lastCompletion = await client.query(
            `SELECT timestamp FROM activities 
             WHERE user_id = $1 
             AND activity_text LIKE 'Completed%' 
             AND timestamp < $2 
             ORDER BY timestamp DESC LIMIT 1`,
            [req.user.userId, today]
        );

        let newStreak = currentStreak;

        if (todayCompletions.rows.length > 0) {
            // User completed a game today
            if (lastCompletion.rows.length > 0) {
                const lastCompletionDate = new Date(lastCompletion.rows[0].timestamp);
                lastCompletionDate.setHours(0, 0, 0, 0);
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);

                if (lastCompletionDate.getTime() === yesterday.getTime()) {
                    // Last completion was yesterday, increment streak
                    newStreak = currentStreak + 1;
                } else if (lastCompletionDate.getTime() < yesterday.getTime()) {
                    // Last completion was before yesterday, reset streak to 1
                    newStreak = 1;
                }
                // If last completion was earlier today, streak stays the same
            } else {
                // No prior completions, start streak at 1
                newStreak = 1;
            }
        } else {
            // No completion today, check if streak should reset
            if (lastCompletion.rows.length > 0) {
                const lastCompletionDate = new Date(lastCompletion.rows[0].timestamp);
                lastCompletionDate.setHours(0, 0, 0, 0);
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);

                if (lastCompletionDate.getTime() < yesterday.getTime()) {
                    // Last completion was before yesterday, reset streak
                    newStreak = 0;
                }
                // If last completion was yesterday, streak stays the same
            } else {
                // No completions ever, streak remains 0
                newStreak = 0;
            }
        }

        // Update the user's streak
        await client.query(
            'UPDATE users SET streak = $1 WHERE id = $2',
            [newStreak, req.user.userId]
        );

        res.status(200).json({ message: 'Streak updated', streak: newStreak });
    } catch (err) {
        console.error('Error updating streak:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Get score van een game. (Voor correct gebruikt check schattenjacht.js in de frontend)
app.get('/api/score/initial', authenticateToken, async (req, res) => {
    const { game_name } = req.query;
    if (!game_name) {
        return res.status(400).json({ error: 'game_name is required' });
    }
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT score FROM games WHERE user_id = $1 AND game_name = $2 ORDER BY id DESC LIMIT 1',
            [req.user.userId, game_name]
        );
        const initialScore = result.rows.length > 0 ? result.rows[0].score : 0;
        res.json({ score: initialScore });
    } catch (err) {
        console.error('Error fetching initial score:', err);
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
            HAVING SUM(g.score) IS NOT NULL
            ORDER BY total_score DESC LIMIT 3
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

// Create a new class
app.post('/api/classes', authenticateToken, async (req, res) => {
    const { class_name } = req.body;
    const client = await pool.connect();
    try {
        if (!class_name) {
            return res.status(400).json({ error: 'Class name is required' });
        }
        const result = await client.query(
            'INSERT INTO classes (class_name, teacher_id, created_at) VALUES ($1, $2, $3) RETURNING *',
            [class_name, req.user.userId, new Date()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating class:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Add a student to a class
app.post('/api/classes/:classId/members', authenticateToken, async (req, res) => {
    const { classId } = req.params;
    const { student_username } = req.body;
    const client = await pool.connect();
    try {
        const classResult = await client.query('SELECT * FROM classes WHERE id = $1 AND teacher_id = $2', [classId, req.user.userId]);
        if (!classResult.rows[0]) {
            return res.status(403).json({ error: 'Class not found or not authorized' });
        }
        const studentResult = await client.query('SELECT id FROM users WHERE username = $1 AND role = $2', [student_username, 'student']);
        const student = studentResult.rows[0];
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        await client.query('INSERT INTO class_members (class_id, student_id) VALUES ($1, $2)', [classId, student.id]);
        res.status(201).json({ message: 'Student added to class' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Get classes for a teacher
app.get('/api/classes', authenticateToken, requireTeacher, async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM classes WHERE teacher_id = $1', [req.user.userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Get student progress for a class (teacher only)
app.get('/api/classes/:classId/progress', authenticateToken, requireTeacher, async (req, res) => {
    const { classId } = req.params;
    const client = await pool.connect();
    try {
        const classResult = await client.query('SELECT * FROM classes WHERE id = $1 AND teacher_id = $2', [classId, req.user.userId]);
        if (!classResult.rows[0]) {
            return res.status(403).json({ error: 'Class not found or not authorized' });
        }
        const result = await client.query(`
            SELECT u.username,
                   u.streak,
                   u.friend_count,
                   SUM(g.score) AS total_score,
                   COUNT(g.id) AS games_played,
                   STRING_AGG(b.badge_name, ', ') AS badges
            FROM class_members cm
            JOIN users u ON cm.student_id = u.id
            LEFT JOIN games g ON u.id = g.user_id
            LEFT JOIN badges b ON u.id = b.user_id
            WHERE cm.class_id = $1
            GROUP BY u.id, u.username, u.streak, u.friend_count
        `, [classId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Get classes a student is enrolled in, including the teacher's name
app.get('/api/student/classes', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT c.id, c.class_name, c.teacher_id, c.created_at, u.username AS teacher_name
            FROM class_members cm
            JOIN classes c ON cm.class_id = c.id
            JOIN users u ON c.teacher_id = u.id
            WHERE cm.student_id = $1
        `, [req.user.userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching student classes:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Get the number of students in a specific class
app.get('/api/classes/:classId/student-count', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT COUNT(*) AS count FROM class_members WHERE class_id = $1',
            [req.params.classId]
        );
        res.json({ count: result.rows[0].count });
    } catch (err) {
        console.error('Error fetching student count:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Export the app for Vercel
module.exports = app;