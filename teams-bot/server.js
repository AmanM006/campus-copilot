// teams-bot/server.js
// ─── CampusCopilot Teams Bot ──────────────────────────────────────────────────
// Microsoft Bot Framework + botbuilder SDK
// Connects to existing FastAPI backend at http://localhost:8000
// NO new AI logic — everything goes through /api/chat

const path    = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const restify = require("restify");
const {
  BotFrameworkAdapter,
  ConversationState,
  MemoryStorage,
  UserState,
} = require("botbuilder");

const { CampusBot } = require("./bot/CampusBot");

// ─── Adapter ──────────────────────────────────────────────────────────────────
const adapter = new BotFrameworkAdapter({
  appId:       process.env.MICROSOFT_APP_ID     || "",
  appPassword: process.env.MICROSOFT_APP_PASSWORD || "",
});

// Error handler — logs and tells user something went wrong
adapter.onTurnError = async (context, error) => {
  console.error("[onTurnError]", error);
  await context.sendActivity(
    "⚠️ Something went wrong on my end. Please try again in a moment."
  );
};

// ─── State storage (in-memory for MVP; swap Redis for production) ─────────────
const memoryStorage   = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);
const userState         = new UserState(memoryStorage);

// ─── Bot instance ─────────────────────────────────────────────────────────────
const bot = new CampusBot(conversationState, userState);

// ─── Restify HTTP server ───────────────────────────────────────────────────────
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

// Health check
server.get("/", (req, res, next) => {
  res.json({ status: "ok", service: "CampusCopilot Teams Bot", port: process.env.PORT || 3978 });
  next();
});

// Teams bot messages endpoint
server.post("/api/messages", async (req, res) => {
  adapter.processActivity(req, res, async (context) => {
    await bot.run(context);
  });
});

const PORT = process.env.PORT || 3978;
server.listen(PORT, () => {
  console.log(`\n🤖 CampusCopilot Teams Bot running on http://localhost:${PORT}`);
  console.log(`   Backend: ${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}`);
  console.log(`   App ID:  ${process.env.MICROSOFT_APP_ID || "(emulator mode — no App ID)"}\n`);
});