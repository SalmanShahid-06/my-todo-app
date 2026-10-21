// app.js
// WHY THIS FILE EXISTS:
// This file runs in the USER'S BROWSER (not on the server). It's the
// "behavior" layer: it listens for clicks/submits on index.html's elements,
// talks to our server.js backend using fetch() (sending/receiving JSON over
// HTTP), and updates the page's HTML to reflect what's happening (showing
// the todo list, showing errors, switching between login/signup, etc).

// This variable keeps track of whether the auth form is currently in "login"
// mode or "signup" mode, since both modes reuse the same <form>. It starts
// as "login" because that's the default view when the page first loads.
let authMode = "login";

// ---------- GRABBING REFERENCES TO OUR HTML ELEMENTS ----------
// document.getElementById() finds an element in the page by its "id"
// attribute. We save each one in a variable now so we don't have to look it
// up again every time we need it later in this file.
const authSection = document.getElementById("auth-section");
const todoSection = document.getElementById("todo-section");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const switchModeBtn = document.getElementById("switch-mode-btn");
const authError = document.getElementById("auth-error");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const currentUsernameSpan = document.getElementById("current-username");
const logoutBtn = document.getElementById("logout-btn");
const addTodoForm = document.getElementById("add-todo-form");
const newTodoInput = document.getElementById("new-todo-input");
const todoList = document.getElementById("todo-list");
const weatherGreeting = document.getElementById("weather-greeting");
const weatherIcon = document.getElementById("weather-icon");
const weatherHeadline = document.getElementById("weather-headline");
const weatherDetail = document.getElementById("weather-detail");
const weatherSearchForm = document.getElementById("weather-search-form");
const weatherCityInput = document.getElementById("weather-city-input");
const weatherSearchError = document.getElementById("weather-search-error");
const weatherResult = document.getElementById("weather-result");
const weatherResultCity = document.getElementById("weather-result-city");
const weatherResultTemp = document.getElementById("weather-result-temp");
const weatherResultCondition = document.getElementById("weather-result-condition");
const weatherResultHumidity = document.getElementById("weather-result-humidity");
const weatherResultWind = document.getElementById("weather-result-wind");

// A few friendly, time-of-day-aware greetings so the banner doesn't feel
// robotic. We pick one at random each time weather loads.
const GREETINGS = ["Good to see you", "Welcome back", "Hope you're having a great day", "Hello there"];

// ---------- HELPER FUNCTIONS ----------

// This function shows the todo app and hides the login form, used right
// after a successful login/signup. It also displays the given username.
function showTodoApp(username) {
  // .classList.add("hidden") applies our CSS class that sets display:none,
  // making the auth form disappear from the page.
  authSection.classList.add("hidden");
  // .classList.remove("hidden") takes that same class OFF the todo section,
  // making it visible again.
  todoSection.classList.remove("hidden");
  // .textContent safely sets the visible text inside an element (safer than
  // .innerHTML here, since it won't accidentally run any HTML/script the
  // username might contain).
  currentUsernameSpan.textContent = username;
}

// This function shows the login/signup form and hides the todo app, used on
// initial page load (if not logged in) and after logging out.
function showAuthApp() {
  authSection.classList.remove("hidden");
  todoSection.classList.add("hidden");
}

// This function displays an error message string inside the auth form's
// error container, so the user knows what went wrong (e.g. wrong password).
function showAuthError(message) {
  authError.textContent = message;
}

// This function clears the auth error text, used whenever the user tries
// submitting the form again, so old error messages don't linger confusingly.
function clearAuthError() {
  authError.textContent = "";
}

// This function switches the form between "Login" mode and "Sign Up" mode by
// updating the heading, button text, and our "authMode" tracking variable.
function toggleAuthMode() {
  if (authMode === "login") {
    authMode = "signup";
    authTitle.textContent = "Sign Up";
    authSubmitBtn.textContent = "Sign Up";
    switchModeBtn.textContent = "Already have an account? Login";
  } else {
    authMode = "login";
    authTitle.textContent = "Login";
    authSubmitBtn.textContent = "Login";
    switchModeBtn.textContent = "Need an account? Sign Up";
  }
  // Clear any leftover error message when switching modes, for a clean slate.
  clearAuthError();
}

// This function takes an array of todo objects (from the server) and
// rebuilds the entire <ul id="todo-list"> to display them.
function renderTodos(todos) {
  // Reset the list's contents to empty before rebuilding it, so we don't end
  // up with duplicate items if this function runs more than once.
  todoList.innerHTML = "";

  // .forEach() runs the given function once for every item in the array.
  todos.forEach((todo) => {
    // document.createElement() makes a brand new, empty <li> HTML element in
    // memory (it isn't visible on the page yet until we attach it below).
    const li = document.createElement("li");
    li.className = "todo-item";
    // If this specific todo is completed, add the "completed" CSS class too,
    // which triggers the strikethrough styling defined in index.html's <style>.
    if (todo.completed) {
      li.classList.add("completed");
    }

    // Create the checkbox the user clicks to mark a todo done/undone.
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    // .checked reflects the todo's current completed state on the checkbox UI.
    checkbox.checked = todo.completed;
    // "change" fires whenever the user clicks the checkbox. We call our
    // toggleTodo() function (defined further down) with this todo's ID.
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    // Create the text label showing the task description.
    const span = document.createElement("span");
    span.className = "todo-text";
    // .textContent (not .innerHTML!) prevents any HTML the user typed in
    // their task from being executed as code -- an important security habit
    // called avoiding "XSS" (cross-site scripting).
    span.textContent = todo.task;

    // Create the delete ("X") button for this todo.
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "X";
    deleteBtn.className = "delete-btn";
    deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

    // Attach (append) all three pieces into the <li> row, in visual order.
    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteBtn);

    // Finally, attach the fully-built <li> into the visible <ul> on the page.
    todoList.appendChild(li);
  });
}

// ---------- SERVER COMMUNICATION FUNCTIONS ----------
// Each of these uses fetch(), the browser's built-in tool for making HTTP
// requests to a server. Every fetch() call is "asynchronous" (it takes time
// to complete over the network), so we use "async/await" to pause each
// function until the response actually comes back, without freezing the page.

// Asks the server "am I currently logged in?" -- runs once when the page loads.
async function checkLoginStatus() {
  // fetch() with no second argument defaults to a GET request.
  const response = await fetch("/me");
  // .json() reads the response body and parses it from a JSON string into a
  // real JavaScript object we can work with. This also takes time, hence "await".
  const data = await response.json();

  if (data.user) {
    // Already logged in (the server found a valid session cookie) -- skip
    // straight to showing the todo app and load their existing todos.
    showTodoApp(data.user.username);
    loadTodos();
    loadWeatherGreeting();
  } else {
    // Not logged in -- show the login form instead.
    showAuthApp();
  }
}

// Asks OUR server for the current weather (never OpenWeather directly --
// see server.js's "/api/weather" route for why) and displays a friendly
// greeting banner above the to-do list. Note: this never sees or needs the
// actual API key at all; the server has already used it and handed back
// just the plain weather info.
async function loadWeatherGreeting() {
  try {
    const response = await fetch("/api/weather");
    const data = await response.json();

    if (!response.ok) {
      // Weather is a nice-to-have, not critical -- if it fails, just keep
      // the banner hidden instead of showing an error to the user.
      weatherGreeting.classList.add("hidden");
      return;
    }

    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

    weatherHeadline.textContent = `${greeting}! It's ${data.temperature}°C in ${data.city}.`;
    weatherDetail.textContent = data.description;
    // OpenWeather hosts small icon images at this predictable URL pattern,
    // keyed by the "icon" code their API returned (e.g. "01d" = clear sky, day).
    weatherIcon.src = `https://openweathermap.org/img/wn/${data.icon}@2x.png`;
    weatherIcon.alt = data.description;

    weatherGreeting.classList.remove("hidden");
  } catch (err) {
    // Network failure reaching our own server -- again, just hide the
    // banner rather than breaking the rest of the todo app.
    weatherGreeting.classList.add("hidden");
  }
}

// Asks OUR server for the weather in a SPECIFIC city the user typed in, and
// fills in the detailed result card (temperature, condition, humidity, wind
// speed). Like loadWeatherGreeting(), this never sees the real API key --
// only server.js's "/api/weather" route does that.
async function loadWeatherForCity(city) {
  weatherSearchError.textContent = "";

  try {
    const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
    const data = await response.json();

    if (!response.ok) {
      weatherResult.classList.add("hidden");
      // 429 means our server itself is being rate-limited by OpenWeather --
      // distinguish that from other failures so the user knows to just wait.
      weatherSearchError.textContent =
        response.status === 429
          ? "Weather service is busy, try again in a bit."
          : data.error || "Could not fetch weather right now.";
      return;
    }

    weatherResultCity.textContent = data.city;
    weatherResultTemp.textContent = `${data.temperature}°C`;
    weatherResultCondition.textContent = data.description;
    weatherResultHumidity.textContent = `${data.humidity}%`;
    weatherResultWind.textContent = `${data.windSpeed} m/s`;

    weatherResult.classList.remove("hidden");
  } catch (err) {
    // Network failure reaching our own server.
    weatherResult.classList.add("hidden");
    weatherSearchError.textContent = "Could not fetch weather right now.";
  }
}

// Loads the current user's todos from the server and displays them.
async function loadTodos() {
  const response = await fetch("/todos");
  const data = await response.json();
  renderTodos(data.todos);
}

// Sends a new todo's text to the server to be saved, then refreshes the list.
async function addTodo(taskText) {
  const response = await fetch("/todos", {
    method: "POST", // POST is used because we're creating new data.
    // This header tells the server "the data I'm sending is JSON format",
    // so express.json() (in server.js) knows how to parse it correctly.
    headers: { "Content-Type": "application/json" },
    // The actual data must be sent as a JSON STRING over the network, so we
    // use JSON.stringify() to convert our JS object into that string format.
    body: JSON.stringify({ task: taskText }),
  });

  if (response.ok) {
    // response.ok is true for any successful (2xx) status code. If it
    // worked, reload the full todo list so the new item appears.
    loadTodos();
  }
}

// Tells the server to flip one todo's completed status, then refreshes the list.
async function toggleTodo(todoId) {
  // We use a "template literal" (backticks) to insert the todoId variable
  // directly into the URL string, building something like "/todos/3/toggle".
  await fetch(`/todos/${todoId}/toggle`, { method: "POST" });
  loadTodos();
}

// Tells the server to permanently delete one todo, then refreshes the list.
async function deleteTodo(todoId) {
  // DELETE is the HTTP method conventionally used for removing data.
  await fetch(`/todos/${todoId}`, { method: "DELETE" });
  loadTodos();
}

// ---------- EVENT LISTENERS ----------
// These connect user actions (clicking, submitting) to the functions above.

// Runs whenever the login/signup form is submitted (Enter key or button click).
authForm.addEventListener("submit", async (event) => {
  // event.preventDefault() stops the browser's default behavior of doing a
  // full page reload on form submit, which would lose all our JavaScript state.
  event.preventDefault();
  clearAuthError();

  // Read whatever the user currently typed into the two input boxes.
  const username = usernameInput.value;
  const password = passwordInput.value;

  // Decide which server route to call based on the current mode.
  const endpoint = authMode === "login" ? "/login" : "/signup";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    // The server responded with an error status (4xx/5xx). "data.error"
    // holds the human-readable message server.js sent us -- show it to the user.
    showAuthError(data.error);
    return; // Stop here; don't try to show the todo app on failure.
  }

  if (authMode === "signup") {
    // After successfully signing up, automatically switch to login mode so
    // the user can now log in with their brand new account.
    toggleAuthMode();
    showAuthError("Account created! Please log in.");
    // Clear the password field for security/freshness, but leave the
    // username filled in as a convenience.
    passwordInput.value = "";
    return;
  }

  // If we get here, the user just successfully logged in.
  showTodoApp(data.username);
  loadTodos();
  loadWeatherGreeting();
});

// Runs whenever the "Need an account? Sign Up" / "Already have an account?
// Login" link-style button is clicked.
switchModeBtn.addEventListener("click", toggleAuthMode);

// Runs when the "Logout" button is clicked.
logoutBtn.addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  // Reset the input fields so old credentials aren't left sitting visible.
  usernameInput.value = "";
  passwordInput.value = "";
  weatherGreeting.classList.add("hidden");
  showAuthApp();
});

// Runs whenever the weather search form is submitted.
weatherSearchForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Stop the page from reloading.

  const city = weatherCityInput.value.trim();

  if (city === "") {
    return; // Don't bother the server with an empty city.
  }

  loadWeatherForCity(city);
});

// Runs whenever the "add new todo" form is submitted.
addTodoForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Stop the page from reloading.

  const taskText = newTodoInput.value.trim(); // Remove extra whitespace.

  if (taskText === "") {
    return; // Don't bother the server with an empty task.
  }

  addTodo(taskText);
  newTodoInput.value = ""; // Clear the input box so it's ready for the next task.
});

// ---------- INITIAL PAGE LOAD ----------
// This line runs immediately when app.js is loaded by the browser (which, as
// set up in index.html, happens after the whole page's HTML has been built).
// It checks whether this browser already has a valid login session, so
// returning users don't have to log in again every time they open the page.
checkLoginStatus();
