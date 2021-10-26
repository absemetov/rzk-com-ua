const firebase = require("firebase-admin");
const download = require("./download.js");
const fs = require("fs");
const {botConfig, roundNumber} = require("./bot_start_scene");
const bucket = firebase.storage().bucket();

const footerButtons = [{text: "🏠 Главная", callback_data: "start"}, {text: "🛒 Корзина", callback_data: "cart"}];
// const {Scenes: {BaseScene, WizardScene}} = require("telegraf");
// const {getMainKeyboard} = require("./bot_keyboards.js");
// const catalogScene = new BaseScene("catalog");
// catalogScene.use(async (ctx, next) => {
//   if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
// console.log("Catalog scene another callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
//   }
//   return next();
// });

// enter to scene
// catalog.enter(async (ctx) => {
//   const catalogsSnapshot = await firebase.firestore().collection("catalogs")
//       .where("parentId", "==", null).orderBy("orderNumber").get();
//   // generate catalogs array
//   const catalogsArray = [];
//   catalogsSnapshot.docs.forEach((doc) => {
//     catalogsArray.push(Markup.button.callback(`🗂 ${doc.data().name}`, `c/${doc.id}`));
//   });
//   // return ctx.replyWithMarkdown("RZK Market Catalog", Markup.inlineKeyboard(catalogsArray));
//   // reply with photo necessary to show ptoduct
//   return ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
//       {
//         caption: "Rzk Market Catalog 🇺🇦",
//         parse_mode: "Markdown",
//         ...Markup.inlineKeyboard(catalogsArray),
//       });
// });

// catalog.leave((ctx) => {
//   ctx.reply("Menu", getMainKeyboard);
// });

// catalogScene.hears("where", (ctx) => ctx.reply("You are in catalog scene"));

// catalogScene.hears("back", (ctx) => {
//   ctx.scene.leave();
// });

// test actions array
const catalogsActions = [];

// Show Catalogs and goods

const showCatalog = async (ctx, next) => {
  if (ctx.state.routeName === "c") {
    const cartProductsArray = await ctx.state.cart.products();
    footerButtons[1].text = "🛒 Корзина";
    if (cartProductsArray.length) {
      footerButtons[1].text += ` (${cartProductsArray.length})`;
    }
    const catalogId = ctx.state.param;
    const tag = ctx.state.params.get("t");
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const cb = ctx.state.params.get("cb");
    const inlineKeyboardArray =[];
    let currentCatalog = {};
    // save path to session
    if (!cb) {
      await ctx.state.cart.setSessionData({path: ctx.callbackQuery.data});
    }
    // Get catalogs snap index or siblings
    const catalogsSnapshot = await firebase.firestore().collection("catalogs")
        .where("parentId", "==", catalogId ? catalogId : null).orderBy("orderNumber").get();
    // get current catalog
    if (catalogId) {
      const currentCatalogSnapshot = await firebase.firestore().collection("catalogs").doc(catalogId).get();
      currentCatalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
      // back button
      inlineKeyboardArray.push([{text: `⤴️ ../${currentCatalog.name}`,
        callback_data: currentCatalog.parentId ? `c/${currentCatalog.parentId}` : "c"}]);
      // get products
      // textMessage += `\n> <b>${currentCatalog.name}</b>`;
      // Products query
      let mainQuery = firebase.firestore().collection("products").where("catalog.id", "==", currentCatalog.id)
          .orderBy("orderNumber");
      // Filter by tag
      let tagUrl = "";
      if (tag) {
        mainQuery = mainQuery.where("tags", "array-contains", tag);
        tagUrl = `&t=${tag}`;
      }
      // Add tags button
      if (currentCatalog.tags) {
        const tagsArray = [];
        // inlineKeyboardArray.push(Markup.button.callback(`📌 Tags ${selectedTag}`,
        //    `t/${currentCatalog.id}?tagSelected=${params.get("tag")}`));
        tagsArray.push({text: "📌 Фильтр",
          callback_data: `t/${currentCatalog.id}?tagSelected=${tag}`});
        // Delete or close selected tag
        if (tag) {
          tagsArray.push({text: `❎ ${tag}`, callback_data: `c/${currentCatalog.id}`});
        }
        inlineKeyboardArray.push(tagsArray);
      }
      // Paginate goods
      // copy main query
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await firebase.firestore().collection("products")
            .doc(startAfter).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await firebase.firestore().collection("products")
            .doc(endBefore).get();
        query = query.endBefore(endBeforeProduct).limitToLast(10);
      } else {
        query = query.limit(10);
      }
      // get Products
      const productsSnapshot = await query.get();
      // generate products array
      for (const product of productsSnapshot.docs) {
        // inlineKeyboardArray.push(Markup.button.callback(`📦 ${product.data().name} (${product.id})`,
        //    `p/${product.id}/${ctx.callbackQuery.data}`));
        // Get cart
        const addButton = {text: `📦 ${product.data().name} (${product.id}) = ${product.data().price}`+
          ` ${botConfig.currency}`, callback_data: `addToCart/${product.id}`};
        // get cart products
        const cartProduct = cartProductsArray.find((x) => x.id === product.id);
        if (cartProduct) {
          addButton.text = `🛒 ${product.data().name} (${product.id})` +
          `=${cartProduct.price} ${botConfig.currency}*${cartProduct.qty}${cartProduct.unit}` +
          `=${roundNumber(cartProduct.qty * cartProduct.price)}${botConfig.currency}`;
          addButton.callback_data = `addToCart/${product.id}?qty=${cartProduct.qty}&a=1`;
        }
        inlineKeyboardArray.push([addButton]);
      }
      // Set load more button
      if (!productsSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = productsSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          // inlineKeyboardArray.push(Markup.button.callback("⬅️ Back",
          //    `c/${currentCatalog.id}?endBefore=${endBefore.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "⬅️ Назад", callback_data: `c/${currentCatalog.id}?e=${endBeforeSnap.id}${tagUrl}`});
        }
        // startAfter
        const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // startAfter iqual s
          // inlineKeyboardArray.push(Markup.button.callback("➡️ Load more",
          //    `c/${currentCatalog.id}?startAfter=${startAfter.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "➡️ Вперед",
            callback_data: `c/${currentCatalog.id}?s=${startAfterSnap.id}${tagUrl}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      // =====
      // add back button
      // inlineKeyboardArray.push(Markup.button.callback("⤴️ Parent catalog",
      //  currentCatalog.parentId ? `c/${currentCatalog.parentId}` : "c/"));
    }
    // Show catalog siblings
    catalogsSnapshot.docs.forEach((doc) => {
      // inlineKeyboardArray.push(Markup.button.callback(`🗂 ${doc.data().name}`, `c/${doc.id}`));
      inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}`}]);
    });
    // footer buttons
    inlineKeyboardArray.push(footerButtons);
    // const extraObject = {
    //   parse_mode: "Markdown",
    //   ...Markup.inlineKeyboard(inlineKeyboardArray,
    //       {wrap: (btn, index, currentRow) => {
    //         return index <= 20;
    //       }}),
    // };
    // await ctx.editMessageText(`${textMessage}`, extraObject);
    // await ctx.editMessageCaption(`${textMessage}`, extraObject);
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: `<b>${botConfig.name} > Каталог</b>`,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showCatalog);
// show product
const showProduct = async (ctx, next) => {
  if (ctx.state.routeName === "p") {
    // get product data
    const productId = ctx.state.param;
    const productSnapshot = await firebase.firestore().collection("products").doc(productId).get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    // cart button
    const cartProductsArray = await ctx.state.cart.products();
    footerButtons[1].text = "🛒 Корзина";
    if (cartProductsArray.length) {
      footerButtons[1].text += ` (${cartProductsArray.length})`;
    }
    // generate array
    const session = await ctx.state.cart.getSessionData();
    let catalogUrl = `c/${product.catalog.id}`;
    if (session.path) {
      catalogUrl = session.path;
    }
    const inlineKeyboardArray = [];
    // inlineKeyboardArray.push(Markup.button.callback("📸 Upload photo", `uploadPhotos/${product.id}`));
    inlineKeyboardArray.push([{text: `⤴️ ../${product.catalog.name}`, callback_data: catalogUrl}]);
    // default add button
    const addButton = {text: "🛒 Добавить в корзину", callback_data: `addToCart/${product.id}`};
    // get cart products
    const cartProduct = cartProductsArray.find((x) => x.id === product.id);
    if (cartProduct) {
      addButton.text = `🛒 ${cartProduct.qty} ${cartProduct.unit} ` +
      ` ${roundNumber(cartProduct.qty * cartProduct.price)} ${botConfig.currency}`;
      addButton.callback_data = `addToCart/${product.id}?qty=${cartProduct.qty}&a=1`;
    }
    inlineKeyboardArray.push([addButton]);
    inlineKeyboardArray.push([{text: "📸 Upload photo",
      callback_data: `uploadPhoto/${product.id}`}]);
    // chck photos
    if (product.photos && product.photos.length) {
      // inlineKeyboardArray.push(Markup.button.callback("🖼 Show photos", `showPhotos/${product.id}`));
      inlineKeyboardArray.push([{text: `🖼 Show photos (${product.photos.length})`,
        callback_data: `showPhotos/${product.id}`}]);
    }
    // Get main photo url.
    let publicImgUrl = "";
    if (product.mainPhoto) {
      const photoExists = await bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).exists();
      if (photoExists[0]) {
        publicImgUrl = bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).publicUrl();
      }
    } else {
      publicImgUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
    }
    // Set Main menu
    inlineKeyboardArray.push(footerButtons);
    await ctx.editMessageMedia({
      type: "photo",
      media: publicImgUrl,
      caption: `<b>${product.name} (${product.id})\nЦена ${product.price} ${botConfig.currency}</b>`,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showProduct);

// add product to cart by keyboard
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "addToCart") {
    const session = await ctx.state.cart.getSessionData();
    let qty = ctx.state.params.get("qty");
    const number = ctx.state.params.get("number");
    const back = ctx.state.params.get("back");
    const redirect = ctx.state.params.get("r");
    const added = ctx.state.params.get("a");
    const productId = ctx.state.param;
    const addValue = ctx.state.params.get("add_value");
    let qtyUrl = "";
    let paramsUrl = "";
    if (qty) {
      if (number) {
        qty += number;
      }
      if (back) {
        qty = qty.slice(0, -1);
      }
    } else {
      // add first
      if (Number(number)) {
        qty = number;
      } else {
        // generate response
        const dateTimestamp = Math.floor(Date.now() / 1000);
        paramsUrl += `&t=${dateTimestamp}`;
      }
    }
    if (qty) {
      qtyUrl = `&qty=${qty}`;
    } else {
      qty = 0;
    }
    // add redirect param
    if (redirect) {
      paramsUrl += "&r=1";
    }
    if (added) {
      paramsUrl += "&a=1";
    }
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (productSnapshot.exists) {
      const product = {id: productSnapshot.id, ...productSnapshot.data()};
      let catalogUrl = `c/${product.catalog.id}`;
      if (session.path) {
        catalogUrl = session.path;
      }
      // Add product to cart
      if (addValue) {
        await ctx.state.cart.add(added ? product.id : product, addValue);
        if (session.path) {
          // eslint-disable-next-line no-useless-escape
          const regPath = session.path.match(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/);
          ctx.state.routeName = regPath[1];
          ctx.state.param = regPath[2];
          const args = regPath[3];
          // parse url params
          const params = new Map();
          if (args) {
            for (const paramsData of args.split("&")) {
              params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
            }
          }
          // add redirect flag
          params.set("cb", 1);
          ctx.state.params = params;
          await showCatalog(ctx, next);
        } else {
          // ctx.state.routeName = "p";
          // await showProduct(ctx, next);
          ctx.state.routeName = "cart";
          await showCart(ctx, next);
        }
        return;
      }
      const addButtonArray = [];
      const addButton = {text: "🛒 Добавить",
        callback_data: `addToCart/${product.id}?add_value=${qty}${paramsUrl}`};
      const delButton = {text: "❎ Удалить",
        callback_data: `addToCart/${product.id}?add_value=0${paramsUrl}`};
      if (added) {
        addButtonArray.push(delButton);
      }
      // if (redirect) {
      //   addButton.callback_data = `cart/${product.id}?qty=${qty}`;
      //   delButton.callback_data = `cart/${product.id}?qty=0`;
      // }
      addButtonArray.push(addButton);
      // Get main photo url.
      let publicImgUrl = "";
      if (product.mainPhoto) {
        const photoExists = await bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).exists();
        if (photoExists[0]) {
          publicImgUrl = bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).publicUrl();
        }
      } else {
        publicImgUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
      }
      await ctx.editMessageMedia({
        type: "photo",
        media: publicImgUrl,
        caption: `${product.name} (${product.id})` +
        `\nЦена ${product.price} ${botConfig.currency}` +
        `\nСумма ${roundNumber(qty * product.price)} ${botConfig.currency}` +
        `\n<b>Количетво: ${qty} ${product.unit}</b>`,
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: [
          [{text: `⤴️ ../${product.catalog.name}`, callback_data: catalogUrl}],
          [
            {text: "7", callback_data: `addToCart/${product.id}?number=7${qtyUrl}${paramsUrl}`},
            {text: "8", callback_data: `addToCart/${product.id}?number=8${qtyUrl}${paramsUrl}`},
            {text: "9", callback_data: `addToCart/${product.id}?number=9${qtyUrl}${paramsUrl}`},
          ],
          [
            {text: "4", callback_data: `addToCart/${product.id}?number=4${qtyUrl}${paramsUrl}`},
            {text: "5", callback_data: `addToCart/${product.id}?number=5${qtyUrl}${paramsUrl}`},
            {text: "6", callback_data: `addToCart/${product.id}?number=6${qtyUrl}${paramsUrl}`},
          ],
          [
            {text: "1", callback_data: `addToCart/${product.id}?number=1${qtyUrl}${paramsUrl}`},
            {text: "2", callback_data: `addToCart/${product.id}?number=2${qtyUrl}${paramsUrl}`},
            {text: "3", callback_data: `addToCart/${product.id}?number=3${qtyUrl}${paramsUrl}`},
          ],
          [
            {text: "0️", callback_data: `addToCart/${product.id}?number=0${qtyUrl}${paramsUrl}`},
            {text: "🔙", callback_data: `addToCart/${product.id}?back=true${qtyUrl}${paramsUrl}`},
            {text: "AC", callback_data: `addToCart/${product.id}?clear=1${paramsUrl}`},
          ],
          addButtonArray,
          [
            {text: `⤴️ ${product.name} (${product.id})`, callback_data: `p/${product.id}`},
          ],
        ],
      }});
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// show cart
const showCart = async (ctx, next) => {
  if (ctx.state.routeName === "cart") {
    // clear path
    await ctx.state.cart.setSessionData({path: null});
    // clear cart
    const clear = ctx.state.params.get("clear");
    // show message not edit
    const reply = ctx.state.params.get("reply");
    if (clear) {
      await ctx.state.cart.clear();
    }
    const inlineKeyboardArray = [];
    let msgTxt = `<b> ${botConfig.name} > Корзина</b>\n`;
    // loop products
    let totalQty = 0;
    let totalSum = 0;
    const products = await ctx.state.cart.products();
    for (const [index, product] of products.entries()) {
      const productTxt = `${index + 1}) ${product.name} (${product.id})` +
      `=${product.price} ${botConfig.currency}*${product.qty}${product.unit}` +
      `=${roundNumber(product.price * product.qty)}${botConfig.currency}`;
      msgTxt += `${productTxt}\n`;
      inlineKeyboardArray.push([
        {text: `${productTxt}`, callback_data: `addToCart/${product.id}?qty=${product.qty}&r=1&a=1`},
      ]);
      totalQty += product.qty;
      totalSum += product.qty * product.price;
    }
    if (totalQty) {
      msgTxt += `<b>Количество товара: ${totalQty}\n` +
      `Сумма: ${roundNumber(totalSum)} ${botConfig.currency}</b>`;
    }

    if (inlineKeyboardArray.length < 1) {
      inlineKeyboardArray.push([
        {text: "📁 Каталог", callback_data: "c"},
      ]);
      msgTxt += "Корзина пуста";
    } else {
      inlineKeyboardArray.push([{text: "✅ Оформить заказ",
        callback_data: "createOrder/carrier"}]);
      inlineKeyboardArray.push([{text: "🗑 Очистить корзину",
        callback_data: "cart?clear=1"}]);
    }
    // Set Main menu
    inlineKeyboardArray.push([{text: "🏠 Главная",
      callback_data: "start"}]);
    // render data
    // truncate long string
    if (msgTxt.length > 1024) {
      msgTxt = msgTxt.substring(0, 1024);
    }
    if (reply) {
      await ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
          {
            caption: msgTxt,
            parse_mode: "html",
            reply_markup: {
              inline_keyboard: [...inlineKeyboardArray],
            },
          });
    } else {
      await ctx.editMessageMedia({
        type: "photo",
        media: "https://picsum.photos/450/150/?random",
        caption: msgTxt,
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: [...inlineKeyboardArray],
      }});
      await ctx.answerCbQuery();
    }
  } else {
    return next();
  }
};
catalogsActions.push(showCart);

// wizard scene
const orderWizard = [
  async (ctx) => {
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: "Нова Пошта", callback_data: "createOrder/carrier_number?carrier_id=1"}]);
    inlineKeyboardArray.push([{text: "Самовывоз", callback_data: "createOrder/payment?carrier_id=2"}]);
    inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: "cart"}]);
    await ctx.editMessageCaption("<b>Способ доставки</b>",
        {
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: [...inlineKeyboardArray],
          },
        });
  },
  async (ctx, error) => {
    const inlineKeyboardArray = [];
    let qty = ctx.state.params.get("qty");
    const number = ctx.state.params.get("number");
    const back = ctx.state.params.get("back");
    const carrierId = ctx.state.params.get("carrier_id");
    // save data to cart
    // if (carrierId) {
    //   carrierId = Number(carrierId);
    //   // await ctx.state.cart.setOrderData({carrierId});
    // }
    let qtyUrl = "";
    if (qty) {
      if (number) {
        qty += number;
      }
      if (back) {
        qty = qty.slice(0, -1);
      }
      // if (clear) {
      //   qty = 0;
      // }
    } else {
      // add first
      if (Number(number)) {
        qty = number;
      }
    }
    if (qty) {
      qtyUrl = `&qty=${qty}`;
    } else {
      qty = 0;
    }
    // add carrier ID
    if (carrierId) {
      qtyUrl += `&carrier_id=${carrierId}`;
    }
    inlineKeyboardArray.push([
      {text: "7", callback_data: `createOrder/carrier_number?number=7${qtyUrl}`},
      {text: "8", callback_data: `createOrder/carrier_number?number=8${qtyUrl}`},
      {text: "9", callback_data: `createOrder/carrier_number?number=9${qtyUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "4", callback_data: `createOrder/carrier_number?number=4${qtyUrl}`},
      {text: "5", callback_data: `createOrder/carrier_number?number=5${qtyUrl}`},
      {text: "6", callback_data: `createOrder/carrier_number?number=6${qtyUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "1", callback_data: `createOrder/carrier_number?number=1${qtyUrl}`},
      {text: "2", callback_data: `createOrder/carrier_number?number=2${qtyUrl}`},
      {text: "3", callback_data: `createOrder/carrier_number?number=3${qtyUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "0️", callback_data: `createOrder/carrier_number?number=0${qtyUrl}`},
      {text: "🔙", callback_data: `createOrder/carrier_number?back=true${qtyUrl}`},
      {text: "AC", callback_data: `createOrder/carrier_number?carrier_id=${carrierId}`},
    ]);
    inlineKeyboardArray.push([{text: "Выбрать отделение", callback_data: `createOrder/payment?carrier_number=${qty}` +
      `&carrier_id=${carrierId}`}]);
    inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: "cart"}]);
    await ctx.editMessageCaption(`Введите номер отделения:\n<b>${qty}</b>` +
      `\n${error ? "Ошибка: введите номер отделения" : ""}`,
    {
      parse_mode: "html",
      reply_markup: {
        inline_keyboard: [...inlineKeyboardArray],
      },
    });
  },
  async (ctx) => {
    ctx.reply("Укажите адрес доставки (город)", {
      reply_markup: {
        keyboard: [["Отмена"]],
        resize_keyboard: true,
      }});
    await ctx.state.cart.setSessionData({cursor: 3});
  },
  async (ctx) => {
    // save data to cart
    await ctx.state.cart.setOrderData({address: ctx.message.text});
    let userName = "";
    if (ctx.from.last_name) {
      userName += ctx.from.last_name;
    }
    if (ctx.from.first_name) {
      userName += " " + ctx.from.first_name;
    }
    ctx.reply("Введите фамилию и имя получателя, или выберите себя", {
      reply_markup: {
        keyboard: [[userName], ["Отмена"]],
        resize_keyboard: true,
      }});
    await ctx.state.cart.setSessionData({cursor: 4});
  },
  async (ctx) => {
    // validation example
    if (ctx.message.text.length < 2) {
      ctx.reply("Имя слишком короткое");
      return;
    }
    // save data to cart
    await ctx.state.cart.setOrderData({userName: ctx.message.text});
    ctx.reply("Введите номер телефона", {
      reply_markup: {
        keyboard: [
          [{
            text: "Отправить свой номер",
            request_contact: true,
          }],
          ["Отмена"],
        ],
        resize_keyboard: true,
      },
    });
    await ctx.state.cart.setSessionData({cursor: 5});
  },
  async (ctx) => {
    const phoneNumber = (ctx.message.contact && ctx.message.contact.phone_number) || ctx.message.text;
    // const checkPhoneUa = phoneNumber.match(/^(\+380|0)?([1-9]{1}\d{8})$/);
    const checkPhone = phoneNumber.match(/^(\+7|7|8)?([489][0-9]{2}[0-9]{7})$/);
    if (!checkPhone) {
      ctx.reply("Введите номер телефона в формате +7YYYXXXXXXX");
      return;
    }
    // save data to cart
    await ctx.state.cart.setOrderData({phoneNumber: "+7" + checkPhone[2]});
    ctx.reply("Проверьте даные", {
      reply_markup: {
        keyboard: [
          ["Оформить заказ"],
          ["Изменить данные"],
          ["Отмена"],
        ],
        resize_keyboard: true,
      }});
    // leave wizard
    await ctx.state.cart.setSessionData({cursor: 6});
  },
  async (ctx, next) => {
    if (ctx.message.text === "Оформить заказ") {
      // save order
      await ctx.state.cart.saveOrder();
      ctx.reply("Спасибо за заказ! /start", {
        reply_markup: {
          remove_keyboard: true,
        }});
    }
    if (ctx.message.text === "Изменить данные") {
      ctx.state.routeName = "cart";
      const params = new Map();
      params.set("reply", 1);
      ctx.state.params = params;
      await showCart(ctx, next);
    }

    // leave wizard
    await ctx.state.cart.setSessionData({scene: null});
  },
];

// save order final
catalogsActions.push( async (ctx, next) => {
  // ctx.scene.state.name = ctx.message.text;
  const todo = ctx.state.param;
  if (ctx.state.routeName === "createOrder") {
    // first step carrier
    if (todo === "carrier") {
      await orderWizard[0](ctx);
    }
    // set carrier number
    if (todo === "carrier_number") {
      await orderWizard[1](ctx);
    }
    // order payment method
    if (todo === "payment") {
      const inlineKeyboardArray = [];
      // save data to cart
      let carrierId = ctx.state.params.get("carrier_id");
      if (carrierId) {
        carrierId = Number(carrierId);
        await ctx.state.cart.setOrderData({carrierId});
      }
      let carrierNumber = ctx.state.params.get("carrier_number");
      carrierNumber = Number(carrierNumber);
      if (carrierId === 1 && !carrierNumber) {
        // return first step
        await orderWizard[1](ctx, "setCurrierNumber");
        return;
      }
      // save carrierNumber
      if (carrierNumber) {
        await ctx.state.cart.setOrderData({carrierNumber});
      }
      inlineKeyboardArray.push([{text: "Privat", callback_data: "createOrder/wizard?payment_id=1"}]);
      inlineKeyboardArray.push([{text: "Mono", callback_data: "createOrder/wizard?payment_id=2"}]);
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: "cart"}]);
      await ctx.editMessageMedia({
        type: "photo",
        media: "https://picsum.photos/450/150/?random",
        caption: "Способ оплаты",
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: [...inlineKeyboardArray],
      }});
    }
    // save payment and goto wizard
    if (todo === "wizard") {
      let paymentId = ctx.state.params.get("payment_id");
      if (paymentId) {
        paymentId = Number(paymentId);
      }
      // save data to cart
      if (paymentId) {
        await ctx.state.cart.setOrderData({paymentId});
      }
      await ctx.deleteMessage();
      // await ctx.scene.enter("order");
      // set session
      await ctx.state.cart.setSessionData({scene: "createOrder", cursor: 0});
      // start wizard
      orderWizard[2](ctx);
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Tags
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "t") {
    const inlineKeyboardArray = [];
    const catalogId = ctx.state.param;
    const session = await ctx.state.cart.getSessionData();
    const currentCatalogSnapshot = await firebase.firestore().collection("catalogs").doc(catalogId).get();
    const catalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
    inlineKeyboardArray.push([{text: `⤴️ ../${catalog.name}`,
      callback_data: session.path}]);
    for (const tag of catalog.tags) {
      if (tag.id === ctx.state.params.get("tagSelected")) {
        // inlineKeyboardArray.push(Markup.button.callback(`✅ ${tag.name}`, `c/c/${catalog.id}?tag=${tag.id}`));
        inlineKeyboardArray.push([{text: `✅ ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}`}]);
      } else {
        // inlineKeyboardArray.push(Markup.button.callback(`📌 ${tag.name}`, `c/c/${catalog.id}?tag=${tag.id}`));
        inlineKeyboardArray.push([{text: `📌 ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}`}]);
      }
    }
    // close tags
    // inlineKeyboardArray.push([{text: "⤴️ Перейти в каталог", callback_data: session.path}]);
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: `<b>${botConfig.name} > Фильтр</b>`,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Show all photos
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "showPhotos") {
    const productId = ctx.state.param;
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    for (const [index, photoId] of product.photos.entries()) {
      const inlineKeyboardArray = [];
      // check if file exists
      let publicUrl = "";
      const photoExists = await bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).exists();
      if (photoExists[0]) {
        publicUrl = bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).publicUrl();
      } else {
        publicUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
      }
      inlineKeyboardArray.push([{text: "🏷 Set main", callback_data: `setMainPhoto/${product.id}?photoId=${photoId}`}]);
      inlineKeyboardArray.push([{text: "❎ Close", callback_data: "closePhoto"}]);
      inlineKeyboardArray.push([{text: "🗑 Delete", callback_data: `deletePhoto/${product.id}?photoId=${photoId}`}]);
      await ctx.replyWithPhoto({url: publicUrl}, {
        caption: product.mainPhoto === photoId ?
          `✅ Photo <b>#${index + 1}</b> (Main Photo) ${product.name} (${product.id})` :
          `Photo #${index + 1} ${product.name} (${product.id})`,
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: [...inlineKeyboardArray],
        },
      });
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Set Main photo product
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "setMainPhoto") {
    const productId = ctx.state.param;
    const photoId = ctx.state.params.get("photoId");
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    await productRef.update({
      mainPhoto: photoId,
    });
    // ctx.reply(`Main photo updated, productId ${productId} ${fileId}`);
    await ctx.editMessageCaption(`Main photo updated, ${productSnapshot.data().name} ${productId}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{text: "🏷 Set main", callback_data: `setMainPhoto/${productId}/${photoId}`}],
              [{text: "❎ Close", callback_data: "closePhoto"}],
              [{text: "🗑 Delete", callback_data: `deletePhoto/${productId}/${photoId}`}],
            ],
          },
        });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// close Photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "closePhoto") {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// delete Photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "deletePhoto") {
    const productId = ctx.state.param;
    const deleteFileId = ctx.state.params.get("photoId");
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    // if delete main Photo
    if (productSnapshot.data().mainPhoto === deleteFileId) {
      // set new main photo inddex 1 or delete
      if (productSnapshot.data().photos && productSnapshot.data().photos.length > 1) {
        for (const photoId of productSnapshot.data().photos) {
          if (photoId !== deleteFileId) {
            await productRef.update({
              mainPhoto: photoId,
              photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
            });
            break;
          }
        }
      } else {
        await productRef.update({
          mainPhoto: firebase.firestore.FieldValue.delete(),
          // mainPhoto: "",
          photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
        });
      }
    } else {
      await productRef.update({
        photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
      });
    }
    const photoExists = await bucket.file(`photos/products/${productId}/1/${deleteFileId}.jpg`).exists();
    if (photoExists[0]) {
      await bucket.file(`photos/products/${productId}/3/${deleteFileId}.jpg`).delete();
      await bucket.file(`photos/products/${productId}/2/${deleteFileId}.jpg`).delete();
      await bucket.file(`photos/products/${productId}/1/${deleteFileId}.jpg`).delete();
    }
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// upload photos limit 5
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhoto") {
    // save productId to session data
    await ctx.state.cart.setSessionData({productId: ctx.state.param});
    // enter catalog scene
    // if (ctx.scene.current) {
    //   if (ctx.scene.current.id !== "catalog") {
    //     ctx.scene.enter("catalog");
    //   }
    // } else {
    //   ctx.scene.enter("catalog");
    // }
    const productRef = firebase.firestore().collection("products").doc(ctx.state.param);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    ctx.replyWithHTML(`Please add photo to <b>${product.name} (${product.id})</b>`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Upload product photos
const uploadPhotoProduct = async (ctx, next) => {
  const session = await ctx.state.cart.getSessionData();
  if (session.productId) {
    // make bucket is public
    await bucket.makePublic();
    // file_id: 'AgACAgIAAxkBAAJKe2Eeb3sz3VbX5NP2xB0MphISptBEAAIjtTEbNKZhSJTK4DMrPuXqAQADAgADcwADIAQ',
    // file_unique_id: 'AQADI7UxGzSmYUh4',
    // file_size: 912,
    // width: 90,
    // height: 51
    // get Product data
    const productRef = firebase.firestore().collection("products").doc(session.productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    // get count photos to check limits 5 photos
    if (product.photos && product.photos.length > 4) {
      await ctx.reply("Limit 5 photos");
    } else {
      // upload Photo
      // upload only one photo!!!
      if (ctx.message.media_group_id) {
        await ctx.reply("Choose only one Photo!");
        return next();
      }
      // get telegram file_id photos data
      const origin = ctx.message.photo[3];
      const big = ctx.message.photo[2];
      const thumbnail = ctx.message.photo[1];
      // If 720*1280 photo[3] empty
      if (!origin) {
        await ctx.reply("Choose large photo!");
        return next();
      }
      // get photos url
      const originUrl = await ctx.telegram.getFileLink(origin.file_id);
      const bigUrl = await ctx.telegram.getFileLink(big.file_id);
      const thumbnailUrl = await ctx.telegram.getFileLink(thumbnail.file_id);
      try {
        // download photos from telegram server
        const originFilePath = await download(originUrl.href);
        const bigFilePath = await download(bigUrl.href);
        const thumbnailFilePath = await download(thumbnailUrl.href);
        // upload photo file
        await bucket.upload(originFilePath, {
          destination: `photos/products/${product.id}/3/${origin.file_unique_id}.jpg`,
        });
        await bucket.upload(bigFilePath, {
          destination: `photos/products/${product.id}/2/${origin.file_unique_id}.jpg`,
        });
        await bucket.upload(thumbnailFilePath, {
          destination: `photos/products/${product.id}/1/${origin.file_unique_id}.jpg`,
        });
        // delete download file
        fs.unlinkSync(originFilePath);
        fs.unlinkSync(bigFilePath);
        fs.unlinkSync(thumbnailFilePath);
      } catch (e) {
        console.log("Download failed");
        console.log(e.message);
        await ctx.reply(`Error upload photos ${e.message}`);
      }
      // save fileID to Firestore
      if (!product.mainPhoto) {
        await productRef.update({
          mainPhoto: origin.file_unique_id,
          photos: firebase.firestore.FieldValue.arrayUnion(origin.file_unique_id),
        });
      } else {
        await productRef.update({
          photos: firebase.firestore.FieldValue.arrayUnion(origin.file_unique_id),
        });
      }
      const publicUrl = bucket.file(`photos/products/${product.id}/2/${origin.file_unique_id}.jpg`).publicUrl();
      // get catalog url (path)
      let catalogUrl = `c/${product.catalog.id}`;
      if (session.path) {
        catalogUrl = session.path;
      }
      await ctx.replyWithPhoto({url: publicUrl},
          {
            caption: `${product.name} (${product.id}) photo uploaded`,
            reply_markup: {
              inline_keyboard: [
                [{text: "📸 Upload photo", callback_data: `uploadPhoto/${product.id}`}],
                [{text: `🖼 Show photos (${product.photos ? product.photos.length + 1 : 1})`,
                  callback_data: `showPhotos/${product.id}`}],
                [{text: "⤴️ Goto catalog",
                  callback_data: catalogUrl}],
              ],
            },
          });
    }
    // ctx.session.productId = null;
    await ctx.state.cart.setSessionData({productId: null});
  } else {
    ctx.reply("Please select a product to upload Photo");
  }
};

exports.uploadPhotoProduct = uploadPhotoProduct;
exports.catalogsActions = catalogsActions;
exports.orderWizard = orderWizard;
