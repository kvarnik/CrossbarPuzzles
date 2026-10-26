import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "public", "data");

function loadSource(source, filename) {
  const sandbox = { window: {} };
  runInNewContext(source, sandbox, { filename });
  return sandbox.window;
}

function loadData() {
  const sandbox = { window: {} };
  for (const name of ["clubs.js", "results.js", "fixtures.js", "puzzles.js"]) {
    const source = readFileSync(join(dataDir, name), "utf8");
    runInNewContext(source, sandbox, { filename: name });
  }
  return sandbox.window;
}

function rowKey(row) {
  return JSON.stringify(row);
}

const sheet = loadData();
const clubs = sheet.CROSSBAR_CLUBS;
const results = sheet.CROSSBAR_RESULTS;
const fixtures = sheet.CROSSBAR_FIXTURES;
const puzzles = sheet.CROSSBAR_PUZZLES;
const codes = new Set(clubs.map((club) => club[0]));

test("twenty unique clubs have the documented row shape", () => {
  assert.equal(clubs.length, 20);
  assert.equal(codes.size, 20);
  for (const club of clubs) {
    assert.equal(club.length, 12);
    assert.match(club[0], /^[A-Z]{3}$/);
    assert.equal(typeof club[1], "string");
    assert.equal(typeof club[4], "string");
    assert.equal(typeof club[6], "number");
    assert.match(club[3], /^[A-Z]+$/);
  }
});

test("word-search words are unique", () => {
  const words = clubs.map((club) => club[3]);
  assert.equal(new Set(words).size, words.length);
});

test("results use known clubs, whole-number goals, and unique matches", () => {
  const seen = new Set();
  for (const row of results) {
    assert.equal(row.length, 6);
    const [matchweek, date, home, away, homeGoals, awayGoals] = row;
    assert.equal(typeof matchweek, "number");
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(codes.has(home), home);
    assert.ok(codes.has(away), away);
    assert.notEqual(home, away);
    assert.equal(Number.isInteger(homeGoals), true);
    assert.equal(Number.isInteger(awayGoals), true);
    assert.ok(homeGoals >= 0 && awayGoals >= 0);
    const key = rowKey([matchweek, home, away]);
    assert.equal(seen.has(key), false, key);
    seen.add(key);
  }
});

test("fixtures use known clubs and unique matches", () => {
  const seen = new Set();
  for (const row of fixtures) {
    assert.equal(row.length, 6);
    const [matchweek, date, kickoff, home, away, tv] = row;
    assert.equal(typeof matchweek, "number");
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof kickoff, "string");
    assert.ok(codes.has(home), home);
    assert.ok(codes.has(away), away);
    assert.notEqual(home, away);
    assert.equal(typeof tv, "string");
    const key = rowKey([matchweek, home, away]);
    assert.equal(seen.has(key), false, key);
    seen.add(key);
  }
});

test("the edition matchweek is complete and the next one is scheduled", () => {
  const last = Math.max(...results.map((row) => row[0]));
  assert.equal(puzzles.matchweek, last);

  const played = new Set(results.filter((row) => row[0] === last).map((row) => rowKey([row[2], row[3]])));
  const scheduled = fixtures.filter((row) => row[0] === last);
  assert.ok(scheduled.length > 0);
  for (const row of scheduled) {
    assert.ok(played.has(rowKey([row[3], row[4]])), `${row[3]} v ${row[4]}`);
  }
  assert.ok(fixtures.some((row) => row[0] === last + 1));
});

test("wins equal losses and goals for equal goals against", () => {
  const table = new Map(clubs.map((club) => [club[0], { w: 0, l: 0, gf: 0, ga: 0 }]));
  for (const [, , home, away, homeGoals, awayGoals] of results) {
    const homeRow = table.get(home);
    const awayRow = table.get(away);
    homeRow.gf += homeGoals;
    homeRow.ga += awayGoals;
    awayRow.gf += awayGoals;
    awayRow.ga += homeGoals;
    if (homeGoals > awayGoals) {
      homeRow.w += 1;
      awayRow.l += 1;
    } else if (awayGoals > homeGoals) {
      awayRow.w += 1;
      homeRow.l += 1;
    }
  }
  const rows = [...table.values()];
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  assert.equal(sum("w"), sum("l"));
  assert.equal(sum("gf"), sum("ga"));
});

test("stadium puzzle chooses ten clubs and a real shuffle", () => {
  assert.equal(puzzles.stadiumCodes.length, 10);
  assert.equal(new Set(puzzles.stadiumCodes).size, 10);
  for (const code of puzzles.stadiumCodes) {
    assert.ok(codes.has(code), code);
  }
  assert.deepEqual([...puzzles.clubOrder].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.notDeepEqual(puzzles.clubOrder, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(Number.isInteger(puzzles.wordSeed), true);
});

test("the page loads the data files and keeps the landscape print rule", () => {
  const page = readFileSync(join(root, "public", "index.html"), "utf8");
  for (const name of ["clubs.js", "results.js", "fixtures.js", "puzzles.js"]) {
    assert.match(page, new RegExp(`<script src="data/${name}"></script>`));
  }
  assert.match(page, /@page\{size:A4 landscape/);
});

test("published results and stadiums stay unchanged", { skip: !process.env.COMPARE_REF }, () => {
  const ref = process.env.COMPARE_REF;

  function published(name) {
    const source = execFileSync("git", ["show", `${ref}:public/data/${name}`], {
      cwd: root,
      encoding: "utf8",
    });
    return loadSource(source, name);
  }

  const publishedResults = published("results.js").CROSSBAR_RESULTS;
  const current = new Map();
  for (const row of results) {
    const key = rowKey(row);
    current.set(key, (current.get(key) || 0) + 1);
  }
  for (const row of publishedResults) {
    const key = rowKey(row);
    assert.ok(current.get(key) > 0, `published result changed: ${key}`);
    current.set(key, current.get(key) - 1);
  }

  const publishedClubs = new Map(published("clubs.js").CROSSBAR_CLUBS.map((club) => [club[0], club]));
  for (const [code, previous] of publishedClubs) {
    const club = clubs.find((row) => row[0] === code);
    assert.ok(club, code);
    assert.equal(club[4], previous[4], `${code} stadium`);
    assert.equal(club[6], previous[6], `${code} capacity`);
  }
});
