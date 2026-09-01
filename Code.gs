/**
 * OUR BUDGET — Apps Script backend
 * ---------------------------------
 * This script turns a Google Sheet into the database + API for the
 * budget tracker web app. Paste this into Extensions > Apps Script
 * on your Google Sheet, then run `initialize` once, then deploy as
 * a Web App (see SETUP.md for full steps).
 *
 * If you already deployed an earlier version of this script: paste this
 * whole file over your old code, run `initialize` again (it only adds
 * what's missing, your existing data is untouched), then redeploy
 * (Deploy > Manage deployments > Edit > New version > Deploy).
 *
 * ============================================================
 * SCRIPT VERSION: 1.1.0
 * ------------------------------------------------------------
 * This is this file's OWN version number — it only moves when
 * Code.gs itself changes (a new action, a new sheet/column, a
 * changed migration, etc). Frontend-only changes to index.html
 * (styling, new screens that call existing actions, etc.) do NOT
 * bump this number and are not logged here — see the changelog
 * inside index.html for those.
 *
 * When you change this file: bump SCRIPT VERSION above and add a
 * new entry at the top of the changelog below describing exactly
 * what changed in the backend.
 * ------------------------------------------------------------
 * CHANGELOG
 *   v1.1.0 – Replaced the single shared PASSCODE with per-person
 *            login. Added Users (username, passwordHash, salt,
 *            displayName, createdAt) and Sessions (token,
 *            username, createdAt — no expiry, sessions last until
 *            explicit logout) sheets. checkAuth_ now validates a
 *            token against Sessions instead of comparing a shared
 *            secret; it's still the single choke point at the top
 *            of doGet/doPost, so every existing action is
 *            unchanged behind it. New unauthenticated "login"
 *            action (POST only — a password has no business in a
 *            URL/GET) hashes the submitted password with the
 *            user's stored salt (salted, iterated SHA-256 via
 *            hashPassword_) and compares it to passwordHash; a
 *            match creates a Sessions row and returns its token.
 *            New "logout" action deletes the matching Sessions
 *            row. Accounts are seeded once per person via a new
 *            manual createUser_(username, password, displayName)
 *            function, run from the Apps Script editor exactly
 *            like initialize() — there is no public sign-up
 *            action, since this is a closed 2-person app and one
 *            would be a real hole. PASSCODE and all shared-secret
 *            logic are removed.
 *   v1.0.4 – Fixed a date bug in rowToObj_: Sheets auto-converts
 *            plain "yyyy-MM-dd" strings into real Date cells, and
 *            reading those back returned raw Date objects that
 *            JSON.stringify then serialized as UTC timestamps —
 *            shifting the date back a day (and sometimes a whole
 *            month) for any timezone ahead of UTC. Transactions
 *            were still listed in Recent Activity but silently
 *            dropped out of the current month's Budget Status and
 *            Balance calculations. rowToObj_ now reformats any
 *            Date cell back to a plain date string in the
 *            spreadsheet's own timezone before it's returned.
 *   v1.0.3 – Fixed Food Fund accounting: contributions now log a
 *            real expense (scope "shared") against the
 *            contributor's income, under a new "Food Fund"
 *            category. Spending from the fund is now scoped
 *            "fund" instead of "shared", so it no longer
 *            double-counts against income/expense totals (it
 *            still counts toward category budgets). Added the
 *            deleteTransactionRowOnly_ helper and fixed a
 *            double-deletion bug in deleteFoodFundEntry_ that
 *            would corrupt an unrelated row when removing a fund
 *            entry with a linked transaction.
 *   v1.0.2 – Added deleteCategoryBudget_ (remove a category budget).
 *            Added migrateAddColumn_ and a "scope" column on
 *            Transactions ("shared" | "personal"), so personal
 *            spending can be tracked separately from household
 *            budgets. Added ensureSettingKey_ and two new Settings
 *            keys, personalBudgetP1 / personalBudgetP2, for each
 *            person's optional personal monthly spending limit.
 *   v1.0.1 – Added FoodFund and Debts sheets and their actions
 *            (addFoodFundContribution_, addFoodFundSpend_,
 *            deleteFoodFundEntry_, addDebt_, settleDebt_,
 *            deleteDebt_). Extended addTransaction_ to
 *            auto-create an IOU when "actuallyFor" is set, and to
 *            deduct from the Food Fund when paidBy is "Food Fund".
 *   v1.0.0 – Initial backend: Transactions, Categories,
 *            SavingsGoals, and Settings sheets, with their core
 *            read/write actions (getAllData_, addTransaction_,
 *            deleteTransaction_, updateCategoryBudget_, addGoal_,
 *            updateGoal_, deleteGoal_, updateSettings_).
 * ============================================================
 */

// ------- CONFIG -------
const SHEET_NAMES = {
  TX: "Transactions",
  CAT: "Categories",
  GOALS: "SavingsGoals",
  SETTINGS: "Settings",
  FUND: "FoodFund",
  DEBTS: "Debts",
  USERS: "Users",
  SESSIONS: "Sessions"
};

// Salted SHA-256, stretched with many iterations, as a lightweight KDF.
// Apps Script has no bcrypt/scrypt/argon2 built in; this is reasonable for a
// closed 2-user app but is NOT adequate for a public-facing product at scale.
const HASH_ITERATIONS = 10000;

// ------- SETUP (run this once manually from the Apps Script editor) -------
function initialize() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const tx = getOrCreateSheet_(ss, SHEET_NAMES.TX);
  if (tx.getLastRow() === 0) {
    tx.appendRow(["id", "date", "type", "amount", "category", "paidBy", "note", "createdAt", "scope"]);
  } else {
    // Existing sheets from before "Personal spending" — add the column, default everything to "shared".
    migrateAddColumn_(tx, "scope", "shared");
  }

  const cat = getOrCreateSheet_(ss, SHEET_NAMES.CAT);
  if (cat.getLastRow() === 0) {
    cat.appendRow(["name", "monthlyBudget"]);
    const defaults = [
      ["Groceries", 1500],
      ["Dining Out", 800],
      ["Transport", 500],
      ["Rent", 6000],
      ["Utilities", 600],
      ["Entertainment", 400],
      ["Shopping", 600],
      ["Health", 400],
      ["Other", 300]
    ];
    defaults.forEach(r => cat.appendRow(r));
  }

  const goals = getOrCreateSheet_(ss, SHEET_NAMES.GOALS);
  if (goals.getLastRow() === 0) {
    goals.appendRow(["id", "name", "targetAmount", "currentAmount", "deadline", "createdAt"]);
  }

  const settings = getOrCreateSheet_(ss, SHEET_NAMES.SETTINGS);
  if (settings.getLastRow() === 0) {
    settings.appendRow(["key", "value"]);
    settings.appendRow(["currency", "AED"]);
    settings.appendRow(["partner1Name", "Partner 1"]);
    settings.appendRow(["partner2Name", "Partner 2"]);
    settings.appendRow(["personalBudgetP1", 0]);
    settings.appendRow(["personalBudgetP2", 0]);
  } else {
    // Existing sheets from before "Personal spending" — add the new keys if missing.
    ensureSettingKey_(settings, "personalBudgetP1", 0);
    ensureSettingKey_(settings, "personalBudgetP2", 0);
  }

  const fund = getOrCreateSheet_(ss, SHEET_NAMES.FUND);
  if (fund.getLastRow() === 0) {
    fund.appendRow(["id", "type", "amount", "by", "note", "date", "createdAt", "linkedTransactionId"]);
  }

  const debts = getOrCreateSheet_(ss, SHEET_NAMES.DEBTS);
  if (debts.getLastRow() === 0) {
    debts.appendRow(["id", "fromWho", "toWho", "amount", "reason", "date", "status", "createdAt", "settledAt", "linkedTransactionId"]);
  }

  // Added in SCRIPT VERSION 1.1.0 for per-person login. No default rows are
  // seeded here on purpose — there's no public sign-up, so accounts are
  // created once per person via createUser_() run manually from the editor.
  const users = getOrCreateSheet_(ss, SHEET_NAMES.USERS);
  if (users.getLastRow() === 0) {
    users.appendRow(["username", "passwordHash", "salt", "displayName", "createdAt"]);
  }

  // No expiry column — sessions are persistent until explicit logout, per
  // this app's requirements. Rows here ARE the source of truth checkAuth_
  // validates every request against.
  const sessions = getOrCreateSheet_(ss, SHEET_NAMES.SESSIONS);
  if (sessions.getLastRow() === 0) {
    sessions.appendRow(["token", "username", "createdAt"]);
  }

  SpreadsheetApp.flush();
  Logger.log("Initialized. Tabs: " + Object.values(SHEET_NAMES).join(", "));
  Logger.log("Next: create your two accounts by running createUser_('username','password','Display Name') once each from this editor.");
}

function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

// Adds a new column with a header + default value to every existing row,
// but only if that column doesn't already exist. Safe to call every time
// initialize() runs. (Added in SCRIPT VERSION 1.0.2, for the Transactions
// "scope" column.)
function migrateAddColumn_(sheet, colName, defaultValue) {
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (header.indexOf(colName) !== -1) return; // already migrated
  const newColIndex = lastCol + 1;
  sheet.getRange(1, newColIndex).setValue(colName);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const fill = [];
    for (let i = 0; i < lastRow - 1; i++) fill.push([defaultValue]);
    sheet.getRange(2, newColIndex, lastRow - 1, 1).setValues(fill);
  }
}

// Adds a key/value row to the Settings sheet if that key doesn't exist yet.
// (Added in SCRIPT VERSION 1.0.2, for the personalBudgetP1 / personalBudgetP2 keys.)
function ensureSettingKey_(sheet, key, defaultValue) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) return; // already present
  }
  sheet.appendRow([key, defaultValue]);
}

// ------- WEB APP ENTRY POINTS -------

function doGet(e) {
  try {
    const action = e.parameter.action;
    // Login takes a password and must never be a GET (URLs land in browser
    // history and Apps Script access logs) — every doGet action is data, so
    // all of them require an already-valid session token.
    checkAuth_(e.parameter.token);

    let result;
    switch (action) {
      case "getAll":
        result = getAllData_();
        break;
      case "getTransactions":
        result = getTransactions_();
        break;
      default:
        throw new Error("Unknown action: " + action);
    }
    return jsonOut_({ ok: true, data: result });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // "login" is the one action allowed without a valid session — it's how
    // you get one. Every other action still goes through checkAuth_ below,
    // unchanged from how the old shared-passcode check worked.
    if (body.action === "login") {
      return jsonOut_({ ok: true, data: login_(body.payload) });
    }

    checkAuth_(body.token);

    let result;
    switch (body.action) {
      case "logout":
        result = logout_(body.token);
        break;
      case "addTransaction":
        result = addTransaction_(body.payload);
        break;
      case "deleteTransaction":
        result = deleteTransaction_(body.payload.id);
        break;
      case "updateCategoryBudget":
        result = updateCategoryBudget_(body.payload);
        break;
      case "deleteCategoryBudget":
        result = deleteCategoryBudget_(body.payload.name);
        break;
      case "addGoal":
        result = addGoal_(body.payload);
        break;
      case "updateGoal":
        result = updateGoal_(body.payload);
        break;
      case "deleteGoal":
        result = deleteGoal_(body.payload.id);
        break;
      case "updateSettings":
        result = updateSettings_(body.payload);
        break;
      case "addFoodFundContribution":
        result = addFoodFundContribution_(body.payload);
        break;
      case "addFoodFundSpend":
        result = addFoodFundSpend_(body.payload);
        break;
      case "deleteFoodFundEntry":
        result = deleteFoodFundEntry_(body.payload.id);
        break;
      case "addDebt":
        result = addDebt_(body.payload);
        break;
      case "settleDebt":
        result = settleDebt_(body.payload.id);
        break;
      case "deleteDebt":
        result = deleteDebt_(body.payload.id);
        break;
      default:
        throw new Error("Unknown action: " + body.action);
    }
    return jsonOut_({ ok: true, data: result });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

// Single choke point for every action except "login". Errors here are
// prefixed "AUTH: " so the frontend can tell "you need to log in again"
// apart from an ordinary network/backend failure and route accordingly,
// instead of parsing free-form error text.
function checkAuth_(token) {
  if (!token) throw new Error("AUTH: Not logged in");
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SESSIONS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === token) return; // valid session
  }
  throw new Error("AUTH: Invalid or expired session");
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ------- DATA READ -------

function getAllData_() {
  return {
    transactions: getTransactions_(),
    categories: getCategories_(),
    goals: getGoals_(),
    settings: getSettings_(),
    foodFund: getFoodFund_(),
    debts: getDebts_()
  };
}

function getTransactions_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TX);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  return rows.filter(r => r[0] !== "").map(r => rowToObj_(header, r));
}

function getCategories_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAT);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  return rows.filter(r => r[0] !== "").map(r => rowToObj_(header, r));
}

function getGoals_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GOALS);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  return rows.filter(r => r[0] !== "").map(r => rowToObj_(header, r));
}

function getSettings_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
  const values = sh.getDataRange().getValues();
  const obj = {};
  values.forEach(([k, v]) => { if (k && k !== "key") obj[k] = v; });
  return obj;
}

function getFoodFund_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.FUND);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  const entries = rows.filter(r => r[0] !== "").map(r => rowToObj_(header, r));
  let balance = 0;
  entries.forEach(e => {
    balance += e.type === "contribution" ? Number(e.amount) : -Number(e.amount);
  });
  return { balance, entries };
}

function getDebts_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DEBTS);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  return rows.filter(r => r[0] !== "").map(r => rowToObj_(header, r));
}

// Google Sheets silently auto-converts plain "yyyy-MM-dd" strings written into
// a cell into a real Date value. When that comes back through getValues(), it's
// a JS Date at local midnight in the spreadsheet's timezone — and JSON.stringify
// would serialize it with .toISOString(), which is UTC and can shift the date
// back a full day (and across a month boundary) for any timezone ahead of UTC.
// Reformat it back to a plain date string here, in the sheet's own timezone,
// before it ever gets JSON-encoded.
function rowToObj_(header, row) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const obj = {};
  header.forEach((h, i) => {
    let v = row[i];
    if (v instanceof Date) {
      v = Utilities.formatDate(v, tz, "yyyy-MM-dd");
    }
    obj[h] = v;
  });
  return obj;
}

// ------- AUTH: login / logout / accounts -------

// Verifies username + password and, on match, creates and returns a new
// session token. Deliberately returns the same generic error whether the
// username doesn't exist or the password is wrong, so a failed attempt can't
// be used to enumerate valid usernames.
function login_(payload) {
  const username = ((payload && payload.username) || "").trim();
  const password = (payload && payload.password) || "";
  const genericError = "Invalid username or password";
  if (!username || !password) throw new Error(genericError);

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  const col = {
    username: header.indexOf("username"),
    passwordHash: header.indexOf("passwordHash"),
    salt: header.indexOf("salt"),
    displayName: header.indexOf("displayName")
  };

  const row = rows.find(r => r[col.username] === username);
  if (!row) throw new Error(genericError);

  const computedHash = hashPassword_(password, row[col.salt]);
  if (computedHash !== row[col.passwordHash]) throw new Error(genericError);

  const sessionsSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SESSIONS);
  const token = Utilities.getUuid();
  sessionsSh.appendRow([token, username, new Date().toISOString()]);

  return { token, username, displayName: row[col.displayName] || username };
}

// Deletes the matching Sessions row so a replayed copy of this token is
// rejected by checkAuth_ from this point on. Missing/already-gone token is
// treated as success (logging out is idempotent from the caller's view).
function logout_(token) {
  if (!token) return { loggedOut: true };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SESSIONS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === token) {
      sh.deleteRow(i + 1);
      break;
    }
  }
  return { loggedOut: true };
}

// Salted, iterated SHA-256. Not a substitute for bcrypt/scrypt/argon2 on a
// public product, but a reasonable lightweight KDF for a closed 2-user app
// with no external dependencies available.
function hashPassword_(password, salt) {
  let bytes = Utilities.newBlob(String(password) + ":" + String(salt)).getBytes();
  for (let i = 0; i < HASH_ITERATIONS; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return bytes.map(b => ("0" + (b & 0xFF).toString(16)).slice(-2)).join("");
}

// ------- SETUP (run this once per person, manually, from the Apps Script
// editor — same pattern as initialize()). There is no public sign-up
// endpoint: for a closed 2-person app, a public one would be a real hole. -------
function createUser_(username, password, displayName) {
  username = (username || "").trim();
  if (!username || !password) {
    throw new Error("createUser_ needs both a username and a password.");
  }
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === username) {
      throw new Error('User "' + username + '" already exists — delete that row from Users first if you want to recreate it.');
    }
  }
  const salt = Utilities.getUuid();
  const passwordHash = hashPassword_(password, salt);
  sh.appendRow([username, passwordHash, salt, displayName || username, new Date().toISOString()]);
  Logger.log('Created user "' + username + '".');
}

// ------- DATA WRITE: transactions -------

const FOOD_FUND_LABEL = "Food Fund";

function addTransaction_(payload) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TX);
  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  // Money spent via the Food Fund already left the household's income when it
  // was contributed — so it's tagged "fund" scope, not "shared", to avoid
  // counting against income/expense totals a second time. It still counts
  // toward category budgets so it shows up in your monthly spending view.
  const scope = (payload.type === "expense" && payload.paidBy === FOOD_FUND_LABEL)
    ? "fund"
    : (payload.scope || "shared");
  sh.appendRow([
    id,
    payload.date,
    payload.type,       // "income" | "expense"
    Number(payload.amount),
    payload.category || "",
    payload.paidBy || "",
    payload.note || "",
    createdAt,
    scope   // "shared" (counts toward income/expense + budgets) | "personal" (budgets only) | "fund" (budgets only, drawn from Food Fund)
  ]);

  let debtId = null;
  // If this expense was actually for the other partner's share, auto-create an IOU
  if (payload.actuallyFor && payload.paidBy && payload.actuallyFor !== payload.paidBy) {
    const debt = addDebt_({
      fromWho: payload.actuallyFor,
      toWho: payload.paidBy,
      amount: payload.amount,
      reason: payload.category || payload.note || "Shared expense",
      date: payload.date,
      linkedTransactionId: id
    });
    debtId = debt.id;
  }

  // If "Food Fund" was chosen as the payment method, deduct it from the fund
  if (payload.type === "expense" && payload.paidBy === FOOD_FUND_LABEL) {
    const fundSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.FUND);
    const fundId = Utilities.getUuid();
    fundSh.appendRow([fundId, "spend", Number(payload.amount), FOOD_FUND_LABEL, payload.note || "", payload.date || createdAt.slice(0, 10), createdAt, id]);
  }

  return { id, debtId };
}

function deleteTransaction_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TX);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sh.deleteRow(i + 1);
      deleteFundEntryByTxId_(id); // reverse any linked Food Fund contribution/spend
      return { deleted: true };
    }
  }
  return { deleted: false };
}

// Deletes a transaction row WITHOUT cascading into Food Fund cleanup.
// Used by deleteFoodFundEntry_, which deletes its own fund row directly —
// calling the cascading deleteTransaction_ from there would make
// deleteFundEntryByTxId_ race to delete the same fund row a second time
// (by then at a shifted index), corrupting whatever row came after it.
// (Added in SCRIPT VERSION 1.0.3.)
function deleteTransactionRowOnly_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TX);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sh.deleteRow(i + 1);
      return;
    }
  }
}

function deleteFundEntryByTxId_(txId) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.FUND);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][7] === txId) {
      sh.deleteRow(i + 1);
      return;
    }
  }
}

function updateCategoryBudget_(payload) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAT);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === payload.name) {
      sh.getRange(i + 1, 2).setValue(Number(payload.monthlyBudget));
      return { updated: true };
    }
  }
  sh.appendRow([payload.name, Number(payload.monthlyBudget)]);
  return { created: true };
}

// Added in SCRIPT VERSION 1.0.2
function deleteCategoryBudget_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAT);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === name) {
      sh.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

// ------- DATA WRITE: savings goals -------

function addGoal_(payload) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GOALS);
  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  sh.appendRow([
    id,
    payload.name,
    Number(payload.targetAmount),
    Number(payload.currentAmount || 0),
    payload.deadline || "",
    createdAt
  ]);
  return { id };
}

function updateGoal_(payload) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GOALS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === payload.id) {
      if (payload.currentAmount !== undefined) sh.getRange(i + 1, 4).setValue(Number(payload.currentAmount));
      if (payload.targetAmount !== undefined) sh.getRange(i + 1, 3).setValue(Number(payload.targetAmount));
      if (payload.name !== undefined) sh.getRange(i + 1, 2).setValue(payload.name);
      if (payload.deadline !== undefined) sh.getRange(i + 1, 5).setValue(payload.deadline);
      return { updated: true };
    }
  }
  return { updated: false };
}

function deleteGoal_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GOALS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sh.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

function updateSettings_(payload) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
  const values = sh.getDataRange().getValues();
  Object.keys(payload).forEach(key => {
    let found = false;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === key) {
        sh.getRange(i + 1, 2).setValue(payload[key]);
        found = true;
        break;
      }
    }
    if (!found) sh.appendRow([key, payload[key]]);
  });
  return { updated: true };
}

// ------- DATA WRITE: Food Fund -------

// Updated in SCRIPT VERSION 1.0.3 to log an actual expense on contribution.
function addFoodFundContribution_(payload) {
  // Contributing is real money leaving that person's pocket into the shared
  // pot, so it's logged as a normal "shared" expense (counts toward income)
  // under its own "Food Fund" category, in addition to the fund ledger entry.
  const tx = addTransaction_({
    type: "expense",
    amount: payload.amount,
    date: payload.date,
    category: "Food Fund",
    paidBy: payload.by,
    note: payload.note || "Food Fund contribution",
    scope: "shared"
  });

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.FUND);
  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  sh.appendRow([id, "contribution", Number(payload.amount), payload.by || "", payload.note || "", payload.date || createdAt.slice(0,10), createdAt, tx.id]);
  return { id, transactionId: tx.id };
}

// Updated in SCRIPT VERSION 1.0.3: scope changed from "shared" to "fund".
function addFoodFundSpend_(payload) {
  // Spending from the fund also logs an expense transaction so it still shows
  // up in category budgets, but scoped "fund" so it does NOT count against
  // income/expense totals again — that money was already accounted for when
  // it was contributed.
  const tx = addTransaction_({
    type: "expense",
    amount: payload.amount,
    date: payload.date,
    category: payload.category || "Groceries",
    paidBy: payload.by,
    note: payload.note ? "Food Fund: " + payload.note : "Food Fund",
    scope: "fund"
  });

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.FUND);
  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  sh.appendRow([id, "spend", Number(payload.amount), payload.by || "", payload.note || "", payload.date || createdAt.slice(0,10), createdAt, tx.id]);
  return { id, transactionId: tx.id };
}

function deleteFoodFundEntry_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.FUND);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      const linkedTxId = values[i][7];
      sh.deleteRow(i + 1); // delete the fund row itself first
      if (linkedTxId) deleteTransactionRowOnly_(linkedTxId); // then its linked transaction, non-cascading
      return { deleted: true };
    }
  }
  return { deleted: false };
}

// ------- DATA WRITE: Debts / IOUs -------

function addDebt_(payload) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DEBTS);
  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  sh.appendRow([
    id,
    payload.fromWho,   // who owes
    payload.toWho,     // who is owed
    Number(payload.amount),
    payload.reason || "",
    payload.date || createdAt.slice(0, 10),
    "open",
    createdAt,
    "",
    payload.linkedTransactionId || ""
  ]);
  return { id };
}

function settleDebt_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DEBTS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sh.getRange(i + 1, 7).setValue("settled");
      sh.getRange(i + 1, 9).setValue(new Date().toISOString());
      return { settled: true };
    }
  }
  return { settled: false };
}

function deleteDebt_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DEBTS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sh.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  return { deleted: false };
}
