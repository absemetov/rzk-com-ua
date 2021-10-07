const {Scenes: {BaseScene}} = require("telegraf");
const firebase = require("firebase-admin");
// const {getMainKeyboard} = require("./bot_keyboards.js");
const start = new BaseScene("start");
const startActions = [];

// Parse callback data, add Cart instance
const parseUrl = async (ctx, next) => {
  ctx.state.routeName = ctx.match[1];
  ctx.state.param = ctx.match[2];
  const args = ctx.match[3];
  // parse url params
  const params = new Map();
  if (args) {
    for (const paramsData of args.split("&")) {
      params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
    }
  }
  ctx.state.params = params;
  // cart instance
  const cart = {
    sessionQuery: firebase.firestore().collection("sessions").doc(`${ctx.from.id}`),
    async add(product, qty) {
      qty = Number(qty);
      let cartData = {};
      if (qty) {
        // add product to cart or edit
        if (typeof product == "object") {
          cartData = {
            [product.id]: {
              name: product.name,
              price: product.price,
              unit: product.unit,
              qty: qty,
            },
          };
        } else {
          cartData = {
            [product]: {
              qty: qty,
            },
          };
        }
        await this.sessionQuery.set({
          cart: cartData,
        }, {merge: true});
      } else {
        // delete product from cart
        await this.sessionQuery.set({
          cart: {
            [typeof product == "object" ? product.id : product]: firebase.firestore.FieldValue.delete(),
          },
        }, {merge: true});
      }
    },
    async products() {
      const products = [];
      const sessionRef = await this.sessionQuery.get();
      if (sessionRef.exists) {
        const cart = sessionRef.data().cart;
        if (cart) {
          for (const [id, product] of Object.entries(cart)) {
            products.push({id, ...product});
          }
        }
      }
      return products;
    },
    async clear() {
      await this.sessionQuery.set({
        cart: firebase.firestore.FieldValue.delete(),
      }, {merge: true});
    },
  };
  ctx.state.cart = cart;
  return next();
};

// start.enter(async (ctx) => {
//   // ctx.reply("Выберите меню", getMainKeyboard);
//   // ctx.reply("Welcome to Rzk.com.ru! Monobank rates /mono Rzk Catalog /catalog");
//   // reply with photo necessary to show ptoduct
//   await ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
//       {
//         caption: "Welcome to Rzk Market Ukraine 🇺🇦",
//         parse_mode: "Markdown",
//         reply_markup: {
//           remove_keyboard: true,
//           inline_keyboard: [[
//             {text: "📁 Catalog", callback_data: "c"},
//             {text: "🛒 Cart", callback_data: "cart"},
//           ]],
//         },
//       });
//   // set commands
//   await ctx.telegram.setMyCommands([
//     {"command": "start", "description": "RZK Market Shop"},
//     {"command": "upload", "description": "Upload goods"},
//     {"command": "mono", "description": "Monobank exchange rates "},
//   ]);
//   ctx.scene.enter("catalog");
// });

start.hears("where", (ctx) => ctx.reply("You are in start scene"));

startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "start") {
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: "Welcome to Rzk Market Ukraine 🇺🇦",
      parse_mode: "Markdown",
    }, {
      reply_markup: {
        inline_keyboard: [[
          {text: "📁 Catalog", callback_data: "c"},
          {text: "🛒 Cart", callback_data: "cart"},
        ]],
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.start = start;
exports.startActions = startActions;
exports.parseUrl = parseUrl;
