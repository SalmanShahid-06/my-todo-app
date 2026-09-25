// server.js
// WHY THIS FILE EXISTS:
// This is the "backend" of our app - the part that runs on a server (your
// computer, in this case) rather than in the user's browser. It listens for
// requests from the browser (like "log me in" or "add a todo"), talks to our
// mock database, and sends responses back. This file is the brain of the app.

// "dotenv" reads the local ".env" file and copies its key=value pairs into
// process.env, so secrets (like our weather API key) can live in a file that
// is NEVER sent to the browser and NEVER committed to git, instead of being
// hard-coded here. Calling .config() as the very first thing in this file
// makes sure process.env is populated before anything below tries to read it.
require("dotenv").config();

// "require" is Node.js's way of importing code from other files or packages.
// We bring in "express", a popular framework that makes building a web server
// MUCH easier than using Node's raw, low-level tools.
const express = require("express");

// "express-session" lets us remember that a specific browser is "logged in"
// across multiple requests, using a small cookie. Without this, the server
// would forget who you are the instant you load a new page (HTTP is stateless).
const session = require("express-session");

// "bcryptjs" is a library for securely hashing (scrambling) passwords.
// WHY: we must NEVER store passwords as plain, readable text. If our
// database were ever leaked, hashed passwords are extremely hard to reverse,
// while plain-text passwords would instantly expose every user's password.
const bcrypt = require("bcryptjs");

// "path" is a built-in Node.js tool for safely building file paths that work
// on any operating system (Windows uses backslashes, Mac/Linux use forward slashes).
const path = require("path");

// Here we import the functions we wrote in database.js so we can use our
// mock database (finding users, creating todos, etc.) inside this file.
const db = require("./database");

// "app" is our actual Express application/server. Calling express() creates it.
const app = express();

// We define which "port" (a numbered door on your computer) the server will
// listen on. Browsers will visit http://localhost:3000 to reach this server.
const PORT = 3000;

// ---------- MIDDLEWARE SETUP ----------
// "Middleware" are functions that run on EVERY incoming request, before it
// reaches our specific route handlers below. They're used for shared setup work.

// This middleware teaches Express to automatically parse incoming JSON data
// (sent by our frontend's fetch() calls) into a normal JavaScript object,
// available to us as "req.body". Without this, req.body would be undefined.
app.use(express.json());

// This middleware serves our static frontend files (index.html, app.js)
// directly to the browser whenever it requests them, straight out of the
// current folder ("__dirname" = the folder this server.js file lives in).
app.use(express.static(__dirname));

// This middleware sets up login sessions.
app.use(
  session({
    // "secret" is used internally to cryptographically sign the session ID
    // cookie so it can't be tampered with. In a REAL production app, this
    // should be a long random string stored in an environment variable, not
    // typed directly in the code like this. We keep it simple here for learning.
    secret: "beginner-todo-app-secret-key",
    // "resave: false" stops the session from being re-saved on every single
    // request if nothing actually changed, which is more efficient.
    resave: false,
    // "saveUninitialized: false" means we won't create/store a session for
    // visitors who never actually log in, saving memory.
    saveUninitialized: false,
    // "cookie" options control the cookie the browser stores.
    cookie: {
      // "secure: false" allows the cookie to work over plain HTTP (fine for
      // local learning). In production with HTTPS, this should be set to true.
      secure: false,
      // "httpOnly: true" stops JavaScript running in the browser from reading
      // this cookie directly. This is an important security measure that
      // helps protect against a type of attack called "XSS" (cross-site scripting).
      httpOnly: true,
    },
  })
);

// ---------- AUTH MIDDLEWARE (a security guard function) ----------
// This is a custom middleware function we wrote ourselves. Its job is to
// check "is this visitor actually logged in?" before letting them reach
// certain routes (like viewing or editing todos).
function requireLogin(req, res, next) {
  // express-session automatically attaches "req.session" to every request.
  // If the user is logged in, we will have stored their userId on it (see the
  // /login route below). If it's missing, they're not logged in.
  if (!req.session.userId) {
    // "401" is the HTTP status code meaning "Unauthorized" - you're not
    // allowed here because you haven't proven who you are.
    return res.status(401).json({ error: "You must be logged in." });
  }
  // "next()" tells Express "this middleware is done, please continue on to
  // the actual route handler now." Without calling next(), the request would
  // hang forever with no response.
  next();
}

// ---------- AUTH ROUTES ----------

// This route handles new account creation.
// "app.post" means this only responds to POST requests (used for submitting
// data), sent to the URL path "/signup".
app.post("/signup", async (req, res) => {
  // Pull "username" and "password" out of the JSON body the frontend sent us.
  const { username, password } = req.body;

  // Basic validation: make sure both fields were actually provided and are
  // not just empty/whitespace. This prevents junk accounts from bad input.
  if (!username || !password || username.trim() === "" || password.trim() === "") {
    // "400" means "Bad Request" - the client sent us something invalid.
    return res.status(400).json({ error: "Username and password are required." });
  }

  // Check our MySQL database to see if this username is already taken.
  // "await" pauses here until the SELECT query actually comes back.
  const existingUser = await db.findUserByUsername(username);
  if (existingUser) {
    // "409" means "Conflict" - the request conflicts with existing data.
    return res.status(409).json({ error: "That username is already taken." });
  }

  // Here is the CRUCIAL security step: we hash (scramble) the plain-text
  // password before saving it anywhere. "10" is the "salt rounds" - a number
  // controlling how much computational work goes into the hash (higher =
  // slower to compute but harder for attackers to crack). "await" pauses this
  // function until the hashing finishes, since it's an asynchronous operation.
  const hashedPassword = await bcrypt.hash(password, 10);

  // Save the new user (with the HASHED password, never the plain one) into
  // our MySQL database via an INSERT query.
  const newUser = await db.createUser(username, hashedPassword);

  // Send a success response back to the browser with a 201 ("Created") status.
  // We only send back the username, NEVER the password (even the hashed one)
  // -- there's no reason for the frontend to ever see it.
  res.status(201).json({ message: "Account created!", username: newUser.username });
});

// This route handles logging an existing user in.
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // Look up the user by username with a SELECT query against MySQL.
  const user = await db.findUserByUsername(username);

  // If no such user exists, we reject the login. NOTE: we deliberately give a
  // generic "Invalid username or password" message rather than "no such user"
  // -- this is a security best practice so attackers can't use our error
  // messages to figure out which usernames actually exist in our system.
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  // Compare the plain-text password the user just typed against the HASHED
  // password we stored earlier. bcrypt.compare() hashes the input the same
  // way and checks if the results match -- we can never "un-hash" a password.
  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  // If we reach this point, the username and password are both correct!
  // We store the user's ID on their session, which express-session tracks
  // using a secure cookie. This is what "logs them in" for future requests.
  req.session.userId = user.id;
  // We also stash the username on the session so /me can greet the user by
  // name on a page refresh, without needing an extra database lookup.
  req.session.username = user.username;

  res.json({ message: "Logged in!", username: user.username });
});

// This route logs the user out by destroying their session.
app.post("/logout", (req, res) => {
  // session.destroy() wipes out all the session data on the server and tells
  // the browser to clear its cookie, effectively logging the user out.
  req.session.destroy((err) => {
    if (err) {
      // "500" means "Internal Server Error" - something went wrong on our end.
      return res.status(500).json({ error: "Could not log out, please try again." });
    }
    res.json({ message: "Logged out!" });
  });
});

// This route lets the frontend check "am I currently logged in?" when the
// page first loads, so it knows whether to show the login form or the todo list.
app.get("/me", (req, res) => {
  if (!req.session.userId) {
    // Not logged in -- send back null to signal that.
    return res.json({ user: null });
  }

  // We also store the username in the session at login time (see /login),
  // so a page refresh can still greet the user by name without another lookup.
  res.json({ user: { id: req.session.userId, username: req.session.username } });
});

// ---------- WEATHER ROUTE ----------
// This route lets the frontend ask "what's the weather?" without ever
// knowing our OpenWeather API key. THIS is how the key stays "masked":
//   1. The key only ever lives in the ".env" file on the server's disk and
//      in the server's process.env memory -- it is never written into
//      app.js, index.html, or any file the browser downloads.
//   2. The browser calls OUR route ("/api/weather"), not OpenWeather
//      directly. Only this server-side code attaches the real API key when
//      it makes its OWN separate request to OpenWeather.
//   3. Whatever we send back to the browser is just weather data (temperature,
//      description, city name) -- the key itself never appears in that
//      response, so it can't be read from the browser's network tab.
app.get("/api/weather", async (req, res) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  // If whoever is running this server forgot to set up their .env file,
  // fail with a clear error instead of silently sending a broken request.
  if (!apiKey) {
    return res.status(500).json({ error: "Weather service is not configured." });
  }

  // The frontend can ask for any city via "?city=Paris" (used by the weather
  // search box). If none is given, fall back to a default so the greeting
  // banner on login always has something to show.
  const city = (req.query.city && req.query.city.trim()) || process.env.WEATHER_CITY || "London";

  try {
    // We build the OpenWeather API URL ourselves, on the server, so the key
    // is attached here and only here. "units=metric" gives temperatures in
    // Celsius; swap for "imperial" for Fahrenheit if preferred.
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      city
    )}&units=metric&appid=${apiKey}`;

    // Node's built-in fetch() has no default timeout, so a hung connection to
    // OpenWeather would leave this request pending indefinitely. Abort it
    // ourselves after 8s and treat that the same as any other network failure.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let weatherResponse;
    try {
      // Node's built-in fetch() makes the actual request to OpenWeather. This
      // happens server-to-server, so the browser never sees this URL or the key.
      weatherResponse = await fetch(weatherUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    const weatherData = await weatherResponse.json();

    if (!weatherResponse.ok) {
      // OpenWeather itself reported a problem (e.g. bad city, invalid key,
      // rate limit). Pass through the specific, safe cases so the frontend
      // can show a tailored message. Anything else stays generic, so we
      // never leak details about our key/config.
      console.log("OpenWeather error response:", weatherData);
      if (weatherResponse.status === 404) {
        return res.status(404).json({ error: "City not found." });
      }
      if (weatherResponse.status === 429) {
        // OpenWeather's free tier enforces a per-minute call quota; a 429
        // here means we've hit it. Surface it as our own 429 so the
        // frontend can distinguish "try again shortly" from other errors.
        return res
          .status(429)
          .json({ error: "Weather service is busy, please try again shortly." });
      }
      return res.status(502).json({ error: "Could not fetch weather right now." });
    }

    // Send back only the small, safe subset of data our frontend actually
    // needs -- not OpenWeather's full raw response.
    res.json({
      city: weatherData.name,
      temperature: Math.round(weatherData.main.temp),
      description: weatherData.weather[0].description,
      icon: weatherData.weather[0].icon,
      humidity: weatherData.main.humidity,
      windSpeed: weatherData.wind.speed,
    });
  } catch (err) {
    // Covers network failures reaching OpenWeather: no internet connection,
    // DNS/connection errors, or our own timeout abort above.
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Weather service took too long to respond." });
    }
    res.status(502).json({ error: "Could not fetch weather right now." });
  }
});

// ---------- TODO ROUTES ----------
// Notice every route below includes "requireLogin" as a second argument.
// Express runs middleware in order, so requireLogin runs FIRST and blocks
// the request with a 401 error before it can ever reach the actual logic,
// unless the user is properly logged in.

// A small helper that converts a database row (with MySQL's column names
// "task_text"/"is_completed") into the shape our frontend (app.js) already
// expects ("task"/"completed"), so we don't have to touch app.js at all.
function formatTodo(row) {
  return { id: row.id, task: row.task_text, completed: !!row.is_completed };
}

// Get all todos belonging to the currently logged-in user.
app.get("/todos", requireLogin, async (req, res) => {
  // "await" pauses here until the SELECT query finishes and rows come back.
  const userTodos = await db.getTodosByUserId(req.session.userId);
  res.json({ todos: userTodos.map(formatTodo) });
});

// Create a new todo for the currently logged-in user.
app.post("/todos", requireLogin, async (req, res) => {
  const { task } = req.body;

  // Make sure the task text isn't empty before saving it.
  if (!task || task.trim() === "") {
    return res.status(400).json({ error: "Task text is required." });
  }

  // "await" pauses here until the INSERT query finishes and we get the new row's id back.
  const newTodo = await db.createTodo(req.session.userId, task.trim());
  res.status(201).json({ todo: formatTodo(newTodo) });
});

// Toggle a todo's completed status. ":id" is a "route parameter" - a
// placeholder that captures whatever value is in that part of the URL
// (e.g. requesting "/todos/3/toggle" makes req.params.id equal "3").
app.post("/todos/:id/toggle", requireLogin, async (req, res) => {
  // req.params.id always arrives as a STRING, so we convert it to a Number
  // to match the numeric IDs stored in the "todos" table.
  const todoId = Number(req.params.id);

  // This runs a SELECT (to check ownership), then an UPDATE query behind the scenes.
  const updatedTodo = await db.toggleTodo(req.session.userId, todoId);

  if (!updatedTodo) {
    // "404" means "Not Found" - either the ID doesn't exist, or it belongs
    // to a different user (which we intentionally treat the same way, for security).
    return res.status(404).json({ error: "Todo not found." });
  }

  res.json({ todo: formatTodo(updatedTodo) });
});

// Delete a todo permanently.
app.delete("/todos/:id", requireLogin, async (req, res) => {
  const todoId = Number(req.params.id);

  // Runs a DELETE query scoped to both the todo's id AND this user's id.
  const wasDeleted = await db.deleteTodo(req.session.userId, todoId);

  if (!wasDeleted) {
    return res.status(404).json({ error: "Todo not found." });
  }

  // "204" means "No Content" - the request succeeded but there's nothing
  // meaningful to send back (the item is just... gone now).
  res.status(204).send();
});

// This route makes sure that visiting the site's root URL ("/") sends back
// our index.html file, so users see the app immediately.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Finally, this actually starts the server. We first run our database's
// "CREATE TABLE IF NOT EXISTS" setup and wait for it to finish, so the
// "users"/"todos" tables definitely exist before we start accepting requests
// that might try to read/write them.
db.initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running! Open http://localhost:${PORT} in your browser.`);
    });
  })
  .catch((err) => {
    // If MySQL isn't running, or the todo_db database doesn't exist yet,
    // fail loudly and clearly instead of starting a server that can't work.
    console.error("Failed to connect to the database:", err.message);
    process.exit(1);
  });
