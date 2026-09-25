// database.js
// WHY THIS FILE EXISTS:
// This file connects our app to a REAL MySQL database (running on your own
// computer, managed through DBeaver) instead of using fake in-memory arrays.
// That means todos and users now survive a server restart, because they're
// saved to disk by MySQL, not just kept in RAM.

// "mysql2/promise" is the MySQL driver for Node.js. We use the "/promise"
// version specifically because it lets us use async/await with our queries,
// instead of older-style callback functions -- much easier to read.
const mysql = require("mysql2/promise");

// ---------- CREATE THE CONNECTION POOL ----------
// A "connection pool" is a small group of ready-to-use connections to MySQL
// that get reused across requests, instead of opening/closing a brand new
// connection every single time we run a query (which would be slow).
const pool = mysql.createPool({
  host: "localhost", // MySQL is running on this same computer.
  user: "root", // The MySQL user we're logging in as.
  password: "", // No password set for this local "root" user.
  database: "todo_db", // The specific database (created in DBeaver) we're using.
});

// ---------- CREATE TABLES IF THEY DON'T EXIST YET ----------
// This function runs once when the server starts. "CREATE TABLE IF NOT
// EXISTS" is safe to run every single time the server starts -- it does
// nothing if the tables are already there, and builds them the first time.
async function initializeDatabase() {
  // The "users" table stores one row per account.
  // - id: a unique number MySQL assigns automatically to each new row.
  // - username: must be unique, so two people can't sign up with the same name.
  // - password: stores the HASHED (scrambled) password, never plain text.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL
    )
  `);

  // The "todos" table stores one row per to-do item.
  // - user_id: records WHICH user this todo belongs to, and "REFERENCES
  //   users(id)" links it to a real row in the users table (a "foreign key").
  //   "ON DELETE CASCADE" means if a user is ever deleted, their todos get
  //   automatically deleted too, instead of being left as orphaned rows.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_text VARCHAR(255) NOT NULL,
      is_completed BOOLEAN NOT NULL DEFAULT false,
      user_id INT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log("Database tables are ready.");
}

// ---------- USER-RELATED FUNCTIONS ----------
// Every function below is "async" because talking to a database over the
// network/disk takes time, so we must "await" each query's result.

// Looks up a single user row by username. Used during signup (to check if
// the name is already taken) and login (to find the account to check against).
async function findUserByUsername(username) {
  // pool.query() takes a SQL string and a separate array of values. Using
  // "?" as a placeholder (instead of pasting "username" directly into the
  // string) is CRITICAL for security -- it prevents "SQL injection" attacks,
  // where a malicious username could otherwise contain SQL code of its own.
  // mysql2 safely substitutes "?" with the escaped value from the array.
  const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);

  // A SELECT always returns an array of matching rows (even if 0 or 1 match).
  // We only ever expect at most one match since usernames are UNIQUE, so we
  // return the first row, or "undefined" if the array is empty.
  return rows[0];
}

// Inserts a brand new user row and returns the newly created user object.
async function createUser(username, hashedPassword) {
  // INSERT adds a new row. "result.insertId" gives us the auto-generated id
  // MySQL just assigned to this new row, since we didn't specify one ourselves.
  const [result] = await pool.query("INSERT INTO users (username, password) VALUES (?, ?)", [
    username,
    hashedPassword,
  ]);

  // Build and return a plain object matching the shape the rest of the app
  // expects, using the id MySQL just generated.
  return { id: result.insertId, username, password: hashedPassword };
}

// ---------- TODO-RELATED FUNCTIONS ----------

// Returns every todo row belonging to one specific user, most recent first.
async function getTodosByUserId(userId) {
  const [rows] = await pool.query("SELECT * FROM todos WHERE user_id = ? ORDER BY id ASC", [userId]);
  return rows;
}

// Inserts a brand new todo row for a given user and returns it.
async function createTodo(userId, task) {
  const [result] = await pool.query("INSERT INTO todos (task_text, is_completed, user_id) VALUES (?, false, ?)", [
    task,
    userId,
  ]);

  return { id: result.insertId, task_text: task, is_completed: false, user_id: userId };
}

// Flips a todo's completed status, but ONLY if it belongs to this user.
async function toggleTodo(userId, todoId) {
  // First, find the todo and confirm it belongs to this user (security check:
  // stops User A from toggling User B's todo just by guessing an ID).
  const [rows] = await pool.query("SELECT * FROM todos WHERE id = ? AND user_id = ?", [todoId, userId]);
  const todo = rows[0];

  if (!todo) {
    return null; // No matching todo for this user -- nothing to update.
  }

  // Flip the value: MySQL stores booleans as 0/1, so "!todo.is_completed"
  // still correctly flips true<->false in JavaScript.
  const newStatus = !todo.is_completed;

  await pool.query("UPDATE todos SET is_completed = ? WHERE id = ?", [newStatus, todoId]);

  // Return the updated todo (with the new status) so server.js can send it back.
  return { ...todo, is_completed: newStatus };
}

// Permanently deletes a todo, again only if it belongs to this user.
async function deleteTodo(userId, todoId) {
  // DELETE removes matching rows. "result.affectedRows" tells us how many
  // rows actually matched and got deleted (0 if the ID was wrong or belonged
  // to a different user).
  const [result] = await pool.query("DELETE FROM todos WHERE id = ? AND user_id = ?", [todoId, userId]);

  return result.affectedRows > 0;
}

// ---------- EXPORTING OUR FUNCTIONS ----------
// module.exports lets other files (like server.js) "require" this file and
// use these functions and the pool's setup routine.
module.exports = {
  initializeDatabase,
  findUserByUsername,
  createUser,
  getTodosByUserId,
  createTodo,
  toggleTodo,
  deleteTodo,
};
