const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 5502;

// Middleware
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(bodyParser.json());

// Connessione al database utenti
const db = new sqlite3.Database('./utenti.db', (err) => {
  if (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
  console.log('Connected to SQLite DB for forum posts');
});

// JWT Secret (deve corrispondere a quello del server principale)
const JWT_SECRET = 'your-secret-key-here';

// Middleware per verificare il JWT
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Token verification error:', err);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.userId = decoded.id;
    next();
  });
};

// Crea le tabelle necessarie se non esistono
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      FOREIGN KEY(author_id) REFERENCES utenti(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY(post_id) REFERENCES posts(id),
      FOREIGN KEY(user_id) REFERENCES utenti(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(post_id) REFERENCES posts(id),
      FOREIGN KEY(author_id) REFERENCES utenti(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comment_likes (
      comment_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (comment_id, user_id),
      FOREIGN KEY(comment_id) REFERENCES comments(id),
      FOREIGN KEY(user_id) REFERENCES utenti(id)
    )
  `);
});

// Helper function per ottenere i dettagli dell'utente
const getUserDetails = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id, nome, cognome, user_type FROM utenti WHERE id = ?', 
      [userId],
      (err, user) => {
        if (err) reject(err);
        else resolve(user);
      }
    );
  });
};

// Routes

// Ottieni tutti i post con informazioni autore e conteggi
app.get('/posts', verifyToken, async (req, res) => {
  try {
    const posts = await new Promise((resolve, reject) => {
      db.all(`
        SELECT p.*, u.nome, u.cognome, u.user_type
        FROM posts p
        JOIN utenti u ON p.author_id = u.id
        ORDER BY p.created_at DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Per ogni post, verifica se l'utente corrente ha messo like
    const postsWithLikes = await Promise.all(posts.map(async post => {
      const userLiked = await new Promise((resolve, reject) => {
        db.get(
          'SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?',
          [post.id, req.userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
          }
        );
      });
      
      return {
        ...post,
        user_liked: userLiked
      };
    }));

    res.json({ posts: postsWithLikes });
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Crea un nuovo post
app.post('/posts', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Post content cannot be empty' });
    }
    
    const newPost = {
      id: uuidv4(),
      author_id: req.userId,
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO posts (id, author_id, content, created_at) VALUES (?, ?, ?, ?)`,
        [newPost.id, newPost.author_id, newPost.content, newPost.created_at],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Ottieni il post completo con i dettagli dell'autore
    const post = await new Promise((resolve, reject) => {
      db.get(`
        SELECT p.*, u.nome, u.cognome, u.user_type
        FROM posts p
        JOIN utenti u ON p.author_id = u.id
        WHERE p.id = ?
      `, [newPost.id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!post) {
      throw new Error('Failed to fetch created post');
    }
    
    res.status(201).json({
      ...post,
      user_liked: false,
      likes_count: 0,
      comments_count: 0
    });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: err.message || 'Database error' });
  }
});

// Gestione like/dislike ai post
app.post('/posts/:id/like', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;
    const now = new Date().toISOString();
    
    // Verifica se il post esiste
    const postExists = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM posts WHERE id = ?', [postId], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
    
    if (!postExists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Verifica se l'utente ha già messo like
    const likeExists = await new Promise((resolve, reject) => {
      db.get(
        'SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?', 
        [postId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
    
    if (likeExists) {
      // Rimuovi like
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM post_likes WHERE post_id = ? AND user_id = ?',
          [postId, userId],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Aggiorna conteggio like nel post
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?',
          [postId],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      res.json({ liked: false });
    } else {
      // Aggiungi like
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)',
          [postId, userId, now],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Aggiorna conteggio like nel post
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?',
          [postId],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      res.json({ liked: true });
    }
  } catch (err) {
    console.error('Error handling post like:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Ottieni i like di un post con dettagli utente
app.get('/posts/:id/likes', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    
    const likes = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.nome, u.cognome, u.user_type, pl.created_at
        FROM post_likes pl
        JOIN utenti u ON pl.user_id = u.id
        WHERE pl.post_id = ?
        ORDER BY pl.created_at DESC
      `, [postId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    res.json({ likes });
  } catch (err) {
    console.error('Error fetching post likes:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Aggiungi un commento a un post
app.post('/posts/:id/comments', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const { content } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Comment content cannot be empty' });
    }
    
    // Verifica se il post esiste
    const postExists = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM posts WHERE id = ?', [postId], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
    
    if (!postExists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const newComment = {
      id: uuidv4(),
      post_id: postId,
      author_id: req.userId,
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO comments (id, post_id, author_id, content, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [newComment.id, newComment.post_id, newComment.author_id, newComment.content, newComment.created_at],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Aggiorna conteggio commenti nel post
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?',
        [postId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Ottieni il commento completo con i dettagli dell'autore
    const comment = await new Promise((resolve, reject) => {
      db.get(`
        SELECT c.*, u.nome, u.cognome, u.user_type
        FROM comments c
        JOIN utenti u ON c.author_id = u.id
        WHERE c.id = ?
      `, [newComment.id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!comment) {
      throw new Error('Failed to fetch created comment');
    }
    
    res.status(201).json({
      ...comment,
      user_liked: false,
      likes_count: 0
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ error: err.message || 'Database error' });
  }
});

// Ottieni tutti i commenti di un post
app.get('/posts/:id/comments', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    
    // Verifica se il post esiste
    const postExists = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM posts WHERE id = ?', [postId], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
    
    if (!postExists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const comments = await new Promise((resolve, reject) => {
      db.all(`
        SELECT c.*, u.nome, u.cognome, u.user_type
        FROM comments c
        JOIN utenti u ON c.author_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at DESC
      `, [postId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Per ogni commento, verifica se l'utente corrente ha messo like
    const commentsWithLikes = await Promise.all(comments.map(async comment => {
      // Ottieni conteggio like
      const likesCount = await new Promise((resolve, reject) => {
        db.get(
          'SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?',
          [comment.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.count : 0);
          }
        );
      });
      
      // Verifica se l'utente corrente ha messo like
      const userLiked = await new Promise((resolve, reject) => {
        db.get(
          'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?',
          [comment.id, req.userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
          }
        );
      });
      
      return {
        ...comment,
        likes_count: likesCount,
        user_liked: userLiked
      };
    }));
    
    res.json({ comments: commentsWithLikes });
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Gestione like/dislike ai commenti
app.post('/comments/:id/like', verifyToken, async (req, res) => {
  try {
    const commentId = req.params.id;
    const userId = req.userId;
    const now = new Date().toISOString();
    
    // Verifica se il commento esiste
    const commentExists = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM comments WHERE id = ?', [commentId], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
    
    if (!commentExists) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Verifica se l'utente ha già messo like
    const likeExists = await new Promise((resolve, reject) => {
      db.get(
        'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?', 
        [commentId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
    
    if (likeExists) {
      // Rimuovi like
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?',
          [commentId, userId],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      res.json({ liked: false });
    } else {
      // Aggiungi like
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)',
          [commentId, userId, now],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      res.json({ liked: true });
    }
  } catch (err) {
    console.error('Error handling comment like:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Health check endpoint
app.get('/health-check', (req, res) => {
  res.status(200).json({ status: 'ok' });
});


// Start server
app.listen(PORT, () => {
  console.log(`Forum server running on http://localhost:${PORT}`);
});