const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {roundNumber, photoCheckUrl} = require("./bot_start_scene");
const {showCart, cartWizard} = require("./bot_catalog_scene");
const {store, cart} = require("./bot_store_cart.js");
const botConfig = functions.config().env.bot;
const moment = require("moment");
require("moment/locale/ru");
moment.locale("ru");
const ordersActions = [];
// user orders
const myOrders = async (ctx, next) => {
  if (ctx.state.routeName === "myO") {
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const userId = + ctx.state.param;
    const inlineKeyboardArray = [];
    const orderId = ctx.state.params.get("oId");
    const objectId = ctx.state.params.get("o");
    let caption = `<b>${ctx.state.bot_first_name} > Мои заказы</b>`;
    if (ctx.session.pathOrderCurrent) {
      caption = `Заказы от ${userId}`;
    }
    const limit = 10;
    if (orderId) {
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      if (order) {
        // show order
        const date = moment.unix(order.createdAt);
        caption += " <b>> " +
        `Заказ #${store.formatOrderNumber(order.userId, order.orderNumber)} (${date.fromNow()})\n` +
        `Склад: ${order.objectName}\n` +
        `Статус: ${store.statuses().get(order.statusId)}\n` +
        `${order.recipientName} ${order.phoneNumber}\n` +
        `Адрес доставки: ${order.address}, ` +
        `${store.carriers().get(order.carrierId)} ` +
        `${order.carrierNumber ? "#" + order.carrierNumber : ""}\n` +
        `Оплата: ${store.payments().get(order.paymentId)}\n` +
        `${order.comment ? "Комментарий: " + order.comment + "\n" : ""}</b>`;
        let totalQty = 0;
        let totalSum = 0;
        store.sort(order.products).forEach((product, index) => {
          const productTxt = `${index + 1}) ${product.name} (${product.id})` +
        `=${product.price} ${botConfig.currency}*${product.qty}${product.unit}` +
        `=${roundNumber(product.price * product.qty)}${botConfig.currency}`;
          caption += `${productTxt}\n`;
          totalQty += product.qty;
          totalSum += product.qty * product.price;
        });
        caption += `<b>Количество товара: ${totalQty}\n` +
          `Сумма: ${roundNumber(totalSum)} ${botConfig.currency}</b>`;
      }
      inlineKeyboardArray.push([{text: "🧾 Мои заказы",
        callback_data: `${ctx.session.myPathOrder ? ctx.session.myPathOrder : "myO/" + userId}`}]);
    } else {
      // show all orders
      ctx.session.myPathOrder = ctx.callbackQuery.data;
      const mainQuery = firebase.firestore().collectionGroup("orders").where("userId", "==", userId)
          .orderBy("createdAt", "desc");
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await store.getQuery(`objects/${objectId}/orders/${startAfter}`).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await store.getQuery(`objects/${objectId}/orders/${endBefore}`).get();
        // set limit
        query = query.endBefore(endBeforeProduct).limitToLast(limit);
      } else {
        // defaul limit
        query = query.limit(limit);
      }
      // get orders
      const ordersSnapshot = await query.get();
      // render orders
      ordersSnapshot.docs.forEach((doc) => {
        const order = {id: doc.id, ...doc.data()};
        const date = moment.unix(order.createdAt);
        inlineKeyboardArray.push([{text: `🧾 Заказ #${store.formatOrderNumber(order.userId, order.orderNumber)},` +
          `${store.statuses().get(order.statusId)}, ${date.fromNow()}`,
        callback_data: `myO/${userId}?oId=${order.id}&o=${order.objectId}`}]);
      });
      // load more button
      if (!ordersSnapshot.empty) {
        const prevNext = [];
        const endBeforeSnap = ordersSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          prevNext.push({text: "⬅️ Назад",
            callback_data: `myO/${userId}?e=${endBeforeSnap.id}&o=${endBeforeSnap.data().objectId}`});
        }
        // startAfter
        const startAfterSnap = ordersSnapshot.docs[ordersSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          prevNext.push({text: "➡️ Вперед",
            callback_data: `myO/${userId}?s=${startAfterSnap.id}&o=${startAfterSnap.data().objectId}`});
        }
        inlineKeyboardArray.push(prevNext);
      } else {
        inlineKeyboardArray.push([{text: "У Вас пока нет заказов", callback_data: `myO/${userId}`}]);
      }
      if (ctx.session.pathOrderCurrent) {
        inlineKeyboardArray.push([{text: "🏠 Вернуться к заказу",
          callback_data: `${ctx.session.pathOrderCurrent}`}]);
      }
      inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "objects"}]);
    }
    // truncate long string
    if (caption.length > 1024) {
      caption = caption.substring(0, 1024);
    }
    const media = await photoCheckUrl(botConfig.logo);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption,
      parse_mode: "html",
    }, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
// admin orders
const showOrders = async (ctx, next) => {
  if (ctx.state.routeName === "orders") {
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const objectId = ctx.state.params.get("o");
    const inlineKeyboardArray = [];
    const orderId = ctx.state.param;
    const limit = 10;
    const object = await store.findRecord(`objects/${objectId}`);
    let caption = `<b>${ctx.state.bot_first_name} > Заказы ${object.name}</b>`;
    if (orderId) {
      // show order
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      if (order) {
        // show order
        ctx.session.pathOrderCurrent = ctx.callbackQuery.data;
        const date = moment.unix(order.createdAt);
        caption = `<b>${ctx.state.bot_first_name} > ${order.objectName} >` +
        ` Заказ #${store.formatOrderNumber(order.userId, order.orderNumber)}` +
        ` (${date.fromNow()})\n` +
        `${order.recipientName} ${order.phoneNumber}\n` +
        `Адрес доставки: ${order.address}, ` +
        `${store.carriers().get(order.carrierId)} ` +
        `${order.carrierNumber ? "#" + order.carrierNumber : ""}\n` +
        `Оплата: ${store.payments().get(order.paymentId)}\n` +
        `${order.comment ? "Комментарий: " + order.comment + "\n" : ""}</b>`;
        let totalQty = 0;
        let totalSum = 0;
        store.sort(order.products).forEach((product, index) => {
          const productTxt = `${index + 1})${product.name} (${product.id})` +
        `=${product.price} ${botConfig.currency}*${product.qty}${product.unit}` +
        `=${roundNumber(product.price * product.qty)}${botConfig.currency}`;
          caption += `${productTxt}\n`;
          totalQty += product.qty;
          totalSum += product.qty * product.price;
        });
        caption += `<b>Количество товара: ${totalQty}\n` +
          `Сумма: ${roundNumber(totalSum)} ${botConfig.currency}</b>`;
      }
      // edit entries
      inlineKeyboardArray.push([{text: `📝 Статус: ${store.statuses().get(order.statusId)}`,
        callback_data: `eO/${order.id}?sSI=${order.statusId}&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: `📝 Получатель: ${order.recipientName}`,
        callback_data: `eO/${order.id}?e=recipientName&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: `📝 Номер тел.: ${order.phoneNumber}`,
        callback_data: `eO/${order.id}?e=phoneNumber&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: `📝 Оплата: ${store.payments().get(order.paymentId)}`,
        callback_data: `eO/${order.id}?showPay=${order.paymentId}&o=${objectId}`}]);
      if (order.carrierId === 2) {
        inlineKeyboardArray.push([{text: `📝 Доставка: ${store.carriers().get(order.carrierId)}` +
        `${order.carrierNumber ? " #" + order.carrierNumber : ""}`,
        callback_data: `eO/${order.id}?cId=${order.carrierId}&n=${order.carrierNumber}&o=${objectId}`}]);
      } else {
        inlineKeyboardArray.push([{text: `📝 Доставка: ${store.carriers().get(order.carrierId)}` +
        `${order.carrierNumber ? " #" + order.carrierNumber : ""}`,
        callback_data: `eO/${order.id}?cId=${order.carrierId}&o=${objectId}`}]);
      }
      inlineKeyboardArray.push([{text: `📝 Адрес: ${order.address}`,
        callback_data: `eO/${order.id}?e=address&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: `📝 Комментарий: ${order.comment ? order.comment : ""}`,
        callback_data: `eO/${order.id}?e=comment&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: "📝 Редактировать товары",
        callback_data: `eO/${orderId}?eP=1&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: "📝 Информация о покупателе",
        callback_data: `eO?userId=${order.userId}&o=${order.objectId}`}]);
      const rnd = Math.random().toFixed(2).substring(2);
      inlineKeyboardArray.push([{text: `🔄 Обновить заказ#${order.orderNumber}`,
        callback_data: `orders/${order.id}?o=${objectId}&${rnd}`}]);
      inlineKeyboardArray.push([{text: "🧾 Заказы",
        callback_data: `${ctx.session.pathOrder ? ctx.session.pathOrder : "orders?o=" + order.objectId}`}]);
    } else {
      // show orders
      ctx.session.pathOrderCurrent = null;
      ctx.session.pathOrder = ctx.callbackQuery.data;
      let mainQuery = firebase.firestore().collection("objects").doc(objectId)
          .collection("orders").orderBy("createdAt", "desc");
      // filter statusId
      const statusId = + ctx.state.params.get("statusId");
      let statusUrl = "";
      if (statusId) {
        mainQuery = mainQuery.where("statusId", "==", statusId);
        statusUrl = `&statusId=${statusId}`;
      }
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await store.getQuery(`objects/${objectId}/orders/${startAfter}`).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await store.getQuery(`objects/${objectId}/orders/${endBefore}`).get();
        // set limit
        query = query.endBefore(endBeforeProduct).limitToLast(limit);
      } else {
        // defaul limit
        query = query.limit(limit);
      }
      // get orders
      const ordersSnapshot = await query.get();
      const tagsArray = [];
      tagsArray.push({text: "📌 Статус заказа",
        callback_data: `eO/showStatuses?o=${objectId}`});
      // delete or close selected tag
      if (statusId) {
        tagsArray[0].callback_data = `eO/showStatuses?selectedStatus=${statusId}&o=${objectId}`;
        tagsArray.push({text: `❎ ${store.statuses().get(statusId)}`, callback_data: `orders?o=${objectId}`});
      }
      inlineKeyboardArray.push(tagsArray);
      // render orders
      ordersSnapshot.docs.forEach((doc) => {
        const order = {id: doc.id, ...doc.data()};
        const date = moment.unix(order.createdAt);
        inlineKeyboardArray.push([{text: `🧾 Заказ #${store.formatOrderNumber(order.userId, order.orderNumber)},` +
          `${store.statuses().get(order.statusId)}, ${date.fromNow()}`,
        callback_data: `orders/${order.id}?o=${objectId}`}]);
      });
      // set load more button
      if (!ordersSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = ordersSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          prevNext.push({text: "⬅️ Назад",
            callback_data: `orders?e=${endBeforeSnap.id}${statusUrl}&o=${endBeforeSnap.data().objectId}`});
        }
        // startAfter
        const startAfterSnap = ordersSnapshot.docs[ordersSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          prevNext.push({text: "➡️ Вперед",
            callback_data: `orders?s=${startAfterSnap.id}${statusUrl}&o=${startAfterSnap.data().objectId}`});
        }
        inlineKeyboardArray.push(prevNext);
      } else {
        inlineKeyboardArray.push([{text: "Заказов нет", callback_data: `orders?o=${objectId}`}]);
      }
      inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "objects"}]);
    }
    // truncate long string
    if (caption.length > 1024) {
      caption = caption.substring(0, 1024);
    }
    let publicImgUrl = botConfig.logo;
    if (object.logo) {
      publicImgUrl = `photos/${objectId}/logo/2/${object.logo}.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption,
      parse_mode: "html",
    }, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
ordersActions.push(showOrders);
ordersActions.push(myOrders);

// order wizard
const orderWizard = [
  async (ctx) => {
    await ctx.replyWithHTML(`Текущее значение ${ctx.session.fieldName}: <b>${ctx.session.fieldValue}</b>`, {
      reply_markup: {
        keyboard: [["Отмена"]],
        resize_keyboard: true,
      }});
    ctx.session.scene = "editOrder";
    ctx.session.cursor = 1;
  },
  async (ctx) => {
    // save order field
    if (ctx.session.fieldName === "recipientName" && ctx.message.text.length < 2) {
      await ctx.reply("Имя слишком короткое");
      return;
    }
    if (ctx.session.fieldName === "phoneNumber") {
      const regexpPhone = new RegExp(botConfig.phoneregexp);
      const checkPhone = ctx.message.text.match(regexpPhone);
      if (!checkPhone) {
        await ctx.reply(`Введите номер телефона в формате ${botConfig.phonetemplate}`);
        return;
      }
      ctx.message.text = `${botConfig.phonecode}${checkPhone[2]}`;
    }
    await store.updateRecord(`objects/${ctx.session.objectId}/orders/${ctx.session.orderId}`,
        {[ctx.session.fieldName]: ctx.message.text});
    // exit scene
    await ctx.reply("Данные сохранены. Обновите заказ!🔄", {
      reply_markup: {
        remove_keyboard: true,
      }});
    ctx.session.scene = null;
  },
];
// edit order fields
ordersActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "eO") {
    const orderId = ctx.state.param;
    const editField = ctx.state.params.get("e");
    const cId = + ctx.state.params.get("cId");
    const carrierNumber = + ctx.state.params.get("n");
    const sCid = + ctx.state.params.get("sCid");
    const showPaymentId = + ctx.state.params.get("showPay");
    const paymentId = + ctx.state.params.get("paymentId");
    const showStatusId = + ctx.state.params.get("sSI");
    const statusId = + ctx.state.params.get("sId");
    const objectId = ctx.state.params.get("o");
    const userId = ctx.state.params.get("userId");
    // show user info creator
    if (userId) {
      const inlineKeyboardArray = [];
      inlineKeyboardArray.push([{text: `Заказы from User ${userId}`,
        callback_data: `myO/${userId}`}]);
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `${ctx.session.pathOrderCurrent ? ctx.session.pathOrderCurrent : `orders?o=${objectId}`}`}]);
      await cartWizard[0](ctx, `User <a href="tg://user?id=${userId}">${userId}</a>`, inlineKeyboardArray);
    }
    // edit produc
    const editProducts = ctx.state.params.get("eP");
    const saveProducts = ctx.state.params.get("sP");
    // save products from cart
    if (saveProducts) {
      const products = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
      await Promise.all([
        store.deleteRecord(`users/${ctx.from.id}`, "session.orderData"),
        store.deleteRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products"),
        store.updateRecord(`objects/${objectId}/orders/${orderId}`, {products}),
      ]);
      // redirect to order
      ctx.state.routeName = "orders";
      ctx.state.param = orderId;
      await showOrders(ctx, next);
    }
    if (editProducts) {
      // clear cart then export!!!
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      await Promise.all([
        cart.clear(objectId, ctx.from.id),
        store.updateRecord(`users/${ctx.from.id}`, {"session.orderData": {
          id: order.id,
          orderNumber: order.orderNumber,
          recipientName: order.recipientName,
        }}),
        store.updateRecord(`objects/${objectId}/carts/${ctx.from.id}`, {products: order.products}),
      ]);
      // set route name
      ctx.state.routeName = "cart";
      await showCart(ctx, next);
    }
    // show statuses
    if (orderId === "showStatuses") {
      const selectedStatus = + ctx.state.params.get("selectedStatus");
      const inlineKeyboardArray = [];
      store.statuses().forEach((value, key) => {
        if (key === selectedStatus) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `orders?statusId=${key}&o=${objectId}`}]);
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `${ctx.session.pathOrder ? ctx.session.pathOrder : `orders?o=${objectId}`}`}]);
      await cartWizard[0](ctx, "Статуc заказа", inlineKeyboardArray);
    }
    if (editField) {
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      ctx.session.orderId = orderId;
      ctx.session.objectId = objectId;
      ctx.session.fieldName = editField;
      ctx.session.fieldValue = order[editField];
      await orderWizard[0](ctx);
    }
    // show payment
    if (showPaymentId) {
      const inlineKeyboardArray = [];
      store.payments().forEach((value, key) => {
        if (key === showPaymentId) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `eO/${orderId}?paymentId=${key}&o=${objectId}`}]);
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}?o=${objectId}`}]);
      await cartWizard[0](ctx, "Способ оплаты", inlineKeyboardArray);
    }
    // save payment
    if (paymentId) {
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {paymentId});
      ctx.state.routeName = "orders";
      // ctx.state.param = orderId;
      await showOrders(ctx, next);
    }
    // show carrier
    if (cId) {
      const inlineKeyboardArray = [];
      store.carriers().forEach((value, key) => {
        if (key === cId) {
          value = "✅ " + value;
        }
        if (key === 1) {
          inlineKeyboardArray.push([{text: value, callback_data: `eO/${orderId}?sCid=${key}&o=${objectId}`}]);
        } else {
          inlineKeyboardArray.push([{text: value,
            callback_data: `cO/cN?cId=${key}&oId=${orderId}&o=${objectId}` +
            `${carrierNumber ? "&q=" + carrierNumber : ""}`}]);
        }
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}?o=${objectId}`}]);
      await cartWizard[0](ctx, "Способ доставки", inlineKeyboardArray);
    }
    // save carrier
    if (sCid) {
      // await ctx.state.cart.saveOrder(orderId, {
      //   carrierId: sCid,
      // });
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {carrierId: sCid});
      // carrierNumber = Number(carrierNumber);
      if (sCid === 2 && !carrierNumber) {
        // return first step error
        ctx.state.params.set("oId", orderId);
        ctx.state.params.set("cId", sCid);
        await cartWizard[1](ctx, "errorCurrierNumber");
        return;
      }
      if (carrierNumber) {
        // await ctx.state.cart.saveOrder(orderId, {
        //   carrierNumber,
        // });
        await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {carrierNumber});
      } else {
        // await ctx.state.cart.saveOrder(orderId, {
        //   carrierNumber: null,
        // });
        await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {carrierNumber: null});
      }
      // redirect to order
      ctx.state.routeName = "orders";
      // ctx.state.param = orderId;
      await showOrders(ctx, next);
    }
    // show status
    if (showStatusId) {
      const inlineKeyboardArray = [];
      store.statuses().forEach((value, key) => {
        if (key === showStatusId) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `eO/${orderId}?sId=${key}&o=${objectId}`}]);
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}`}]);
      await cartWizard[0](ctx, "Статус заказа", inlineKeyboardArray);
    }
    // save status
    if (statusId) {
      // await ctx.state.cart.saveOrder(orderId, {
      //   statusId,
      // });
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {statusId});
      // redirect to order
      ctx.state.routeName = "orders";
      // ctx.state.param = orderId;
      // ctx.state.params.set("o") = objectId;
      await showOrders(ctx, next);
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.ordersActions = ordersActions;
exports.orderWizard = orderWizard;
