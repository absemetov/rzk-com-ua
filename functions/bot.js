const functions = require("firebase-functions");
const firebase = require("firebase-admin");
firebase.initializeApp();
const {Telegraf, Scenes: {Stage}} = require("telegraf");
const firestoreSession = require("telegraf-session-firestore");
const {start} = require("./bot_start_scene");
const {mono, menuMono} = require("./bot_mono_scene");
const {upload} = require("./bot_upload_scene");
const {catalog} = require("./bot_catalog_scene");
// const {getMainKeyboard} = require("./bot_keyboards.js");
const {MenuMiddleware} = require("telegraf-inline-menu");

const token = functions.config().bot.token;

const bot = new Telegraf(token, {
  handlerTimeout: 540000,
});
// Stage scenes
const stage = new Stage([start, mono, upload, catalog]);
bot.use(firestoreSession(firebase.firestore().collection("sessions")));
bot.use(stage.middleware());
bot.start((ctx) => ctx.scene.enter("start"));
// bot.hears("mono", (ctx) => ctx.scene.enter("mono"));
bot.hears("where", (ctx) => ctx.reply("You are in outside"));
// mono menu
const monoMiddleware = new MenuMiddleware("mono/", menuMono);
// console.log(menuMiddleware.tree());
// bot.use(async (ctx, next) => {
//   if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
//     console.log("another callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
//   }
//   return next();
// });
bot.command("mono", async (ctx) => monoMiddleware.replyToContext(ctx));
bot.use(monoMiddleware.middleware());
// Upload scene
bot.command("upload", async (ctx) => ctx.scene.enter("upload"));
// Catalog scene
bot.command("catalog", async (ctx) => ctx.scene.enter("catalog"));

// if session destroyed show main keyboard
// bot.on("text", async (ctx) => ctx.reply("Menu test", getMainKeyboard));

// bot.telegram.sendMessage(94899148, "Bot Rzk.com.ua ready!" );

bot.catch((err) => {
  console.log("Telegram error", err);
});

if (process.env.FUNCTIONS_EMULATOR) {
  bot.launch();
}

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "256MB",
};

// Enable graceful stop
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

exports.bot = functions.runWith(runtimeOpts).https.onRequest(async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
  } finally {
    res.status(200).end();
  }
});
