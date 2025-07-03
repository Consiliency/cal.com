// scripts/env-preload.cjs
const path = require("path");
const { config } = require("dotenv-flow");
const findUp = require("find-up");

// Walk up until we find the repo root (the folder with .git or the env file)
const root = path.dirname(findUp.sync(".env.local", { cwd: __dirname }));
config({ path: root }); // loads .env*, .env.local*, etc. at repo root
