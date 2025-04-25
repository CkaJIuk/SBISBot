import { Telegraf, Markup, Scenes, session } from 'telegraf'
import SbisApi from './Services/SBISService.js'
import dotenv from 'dotenv'

//TODO: foreach не работает
//TODO: указаывает номер товара а не его имя
//TODO: почему то кг в unit товара

dotenv.config()

const mainScene = new Scenes.BaseScene('mainScene')
const pointScene = new Scenes.BaseScene('pointScene')
const orderScene = new Scenes.BaseScene('orderScene')
const cartScene = new Scenes.BaseScene('cartScene')

mainScene.enter(async ctx => ctx.reply('Выбери интересующий раздел...',
    Markup.keyboard(
        [
            ['🍻 Предзаказ', '🛒 Корзина'],
            ['🏪 Магазины', '💳 Мои заказы'],
            ['🎁 Акции', '❓ Обратная связь'],
            [Markup.button.contactRequest('☎ Отправить номер'), '❌ Выйти']
        ])
        .resize()))

mainScene.hears('🎁 Акции', async ctx => {
    try { await ctx.deleteMessage() } catch (err) { }
    ctx.reply('В данное време нет действующих акций')
})

mainScene.hears('🍻 Предзаказ', async ctx => {
    try { await ctx.deleteMessage() } catch (err) { }
    if (typeof ctx.session.u_phone == 'undefined') {
        ctx.reply('Для предзаказа необходимо отправить контактные данные. Вы можете это сделать нажав кнопку меню.');
    } else {
        await ctx.reply('Получаю данные...', Markup.removeKeyboard())
        ctx.scene.enter('pointScene')
    }
})

mainScene.hears('🛒 Корзина', async ctx => {
    if (ctx.session.cart.length !== 0)
        ctx.scene.enter('cartScene')
    else {
        try { await ctx.deleteMessage() } catch (err) { }
        await ctx.reply('Ваша корзина пуста!')
    }
})

mainScene.hears('💳 Мои заказы', async ctx => {
    try { await ctx.deleteMessage() } catch (err) { }
    let res = await api.getOrders(ctx.session.u_phone)
    if (res !== null) {
        res.forEach(async el => {
            await ctx.reply(`Заказ № ${res[el].orderId} создан ${res[el].creationDate} на сумму ${res[el].totalPrice}. Статус: ${res[el].status}`)
        });
        ctx.reply('Выбери интересующий раздел...')
    } else {
        ctx.reply('Ошибка при выполнении запроса. Попробуйте повторить позднее.')
    }

})

mainScene.hears('🏪 Магазины', async ctx => {
    try { await ctx.deleteMessage() } catch (err) { }
    ctx.reply('Мы ждем Вас с 10:00 до 24:00 по адресам: ул. Комарова, д.10 и ул. Туполева, д. 3 без выходных и перерыва на обед.')
})

mainScene.on('contact', async ctx => {
    ctx.session.u_phone = ctx.message.contact.phone_number
    ctx.reply('Контактные данные обновлены')
})

mainScene.hears('❓ Обратная связь', async ctx => {
    try { await ctx.deleteMessage() } catch (err) { }
    ctx.reply('По всем интересующим вопросам вы можете написать нам на электронную почту: chiefuu@mail.ru')
})

mainScene.hears('❌ Выйти', async ctx => {
    try { await ctx.deleteMessage() } catch (err) { }
    ctx.session.nomenclr = []
    ctx.session.cart = []
    ctx.session.salePoint = null
    ctx.session.u_phone = ''
    ctx.session.deletedMessages = []
    ctx.reply('До встречи!', Markup.removeKeyboard())
})

mainScene.action(/\w*/, async ctx => {//обработка прочих сообщений
    await ctx.answerCbQuery()
})

cartScene.enter(async ctx => {
    try { await ctx.deleteMessage() } catch (err) { }
    ctx.session.deletedMessages = []
    ctx.session.deletedMessages.push((await ctx.reply('Товары в корзине:')).message_id)
    showCart(ctx)
})

async function showCart(ctx) {
    let ndx = 1
    let total = 0
    for (let item in ctx.session.cart) {
        let prod = ctx.session.nomenclr.find(el => el.hierarchicalId.toString() === ctx.session.cart[item].id)
        let msg = await ctx.reply(`${ndx}. Товар ${ctx.session.cart[item].id}, ${ctx.session.cart[item].count} ${prod.unit}, ${ctx.session.cart[item].count * prod.cost} р.`,
            Markup.inlineKeyboard([
                Markup.button.callback('➕', 'incItem' + item),
                Markup.button.callback('➖', 'decItem' + item),
                Markup.button.callback('✖️', 'delItem' + item)
            ]))
        ndx++
        total += ctx.session.cart[item].count * prod.cost
        ctx.session.deletedMessages.push(msg.message_id)
    }
    let msg = await ctx.reply(`Итого ${ndx - 1} позиций.`, Markup.removeKeyboard())
    ctx.session.deletedMessages.push(msg.message_id)
    msg = await ctx.reply(`К оплате ${total} р.`, Markup.inlineKeyboard(
        [
            [Markup.button.callback('Продолжить покупки', 'continueShopping')],
            [Markup.button.callback('Оформить заказ', 'doOrder')],
            [Markup.button.callback('🔙 В главное меню', 'toMainMenu')]
        ]))
    ctx.session.deletedMessages.push(msg.message_id)
}

async function deleteMessages(ctx) {
    for (let msg in ctx.session.deletedMessages)
        try { ctx.deleteMessage(ctx.session.deletedMessages[msg]) } catch (err) { }
}

cartScene.action('continueShopping', async ctx => {
    await ctx.answerCbQuery()
    await deleteMessages(ctx)
    ctx.scene.enter('orderScene')
})

cartScene.action('doOrder', async ctx => {
    await ctx.answerCbQuery()
    await deleteMessages(ctx)
    let Products = []
    let priceListId = ctx.session.salesPoints.find(el => el.id.toString() === ctx.session.salePoint).priceLists[0].id
    for (let item in ctx.session.cart) {
        let prod = ctx.session.nomenclr.find(el => el.hierarchicalId.toString() === ctx.session.cart[item].id)
        Products.push({
            id: prod.hierarchicalId,
            count: ctx.session.cart[item].count,
            cost: prod.cost
        })
    }
    let data = {
        pointId: ctx.session.salePoint,
        priceListId,
        customerName: ctx.session.userId,
        customerPhone: ctx.session.u_phone,
        Products
    }

    let { orderId } = (await api.createOrder(data)).data
    if (orderId !== null) {
        ctx.session.nomenclr = []
        ctx.session.cart = []
        await ctx.reply(`Заказ № ${orderId} успешно создан! В ближайшее время с Вами свяжется по телефону наш сотрудник`)
        ctx.scene.enter('mainScene')
    }
    else {
        await ctx.reply('Ошибка при создании заказа. Попробуйте повторить позднее.')
        ctx.scene.enter('cartScene')
    }
})

cartScene.action('toMainMenu', async ctx => {
    await ctx.answerCbQuery()
    await deleteMessages(ctx)
    ctx.scene.enter('mainScene')
})

cartScene.action(/^incItem\d+$/, async ctx => {
    await ctx.answerCbQuery()
    await deleteMessages(ctx)
    let ndx = ctx.callbackQuery.data.match(/\d+$/)[0]
    ctx.session.cart[ndx].count++
    showCart(ctx)
})

cartScene.action(/^decItem\d+$/, async ctx => {
    await ctx.answerCbQuery()
    await deleteMessages(ctx)
    let ndx = ctx.callbackQuery.data.match(/\d+$/)[0]
    ctx.session.cart[ndx].count--
    if (ctx.session.cart[ndx].count === 0) ctx.session.cart.splice(ndx, 1)
    if (ctx.session.cart.length === 0) {
        await ctx.reply('Ваша корзина пуста!')
        ctx.scene.enter('mainScene')
    } else showCart(ctx)
})

cartScene.action(/^delItem\d+$/, async ctx => {
    await ctx.answerCbQuery()
    await deleteMessages(ctx)
    let ndx = ctx.callbackQuery.data.match(/\d+$/)[0]
    ctx.session.cart.splice(ndx, 1)
    if (ctx.session.cart.length === 0) {
        await ctx.reply('Ваша корзина пуста!')
        ctx.scene.enter('mainScene')
    } else showCart(ctx)
})

pointScene.enter(async ctx => {
    let res = await api.getPoints()
    if (res !== null) {
        ctx.session.salesPoints = res
        let btns = [];
        for (let i = 0; i < res.length; i++) {
            btns.push(Markup.button.callback(res[i].address.replace('г. Улан-Удэ, ', ''), 'pressSalesPoints' + res[i].id.toString()))
        }
        ctx.reply('Выберите адрес магазина:',
            Markup.inlineKeyboard(btns)
        )
    } else {
        await ctx.reply('Ошибка при выполнении запроса. Попробуйте повторить позднее.')
        ctx.scene.enter('mainScene')
    }
})

pointScene.action(/^pressSalesPoints\d+$/, pressSalesPoints)

async function pressSalesPoints(ctx) {
    await ctx.answerCbQuery()
    try { await ctx.deleteMessage() } catch (err) { }
    let ndx = ctx.callbackQuery.data.match(/\d+$/)[0]
    if (ctx.session.salePoint !== null && ctx.session.salePoint !== ndx)
        ctx.reply('Вы запросили изменение ранее выбранного магазина. В этом случае Ваша корзина будет очищена. Выбрать другой магазин?',
            Markup.inlineKeyboard([
                Markup.button.callback('Да', 'dialogYes' + ndx),
                Markup.button.callback('Нет', 'dialogNo')
            ]))
    else {
        ctx.session.salePoint = ndx
        ctx.scene.enter('orderScene')
    }
}

pointScene.action(/^dialogYes\d+$/, async ctx => {
    await ctx.answerCbQuery()
    ctx.session.nomenclr = []
    ctx.session.cart = []
    ctx.session.salePoint = ctx.callbackQuery.data.match(/\d+$/)[0]
    await ctx.reply('Корзина очищена.')
    ctx.scene.enter('orderScene')
})

pointScene.action('dialogNo', async ctx => {
    await ctx.answerCbQuery()
    ctx.scene.enter('orderScene')
})

orderScene.enter(async (ctx) => {
    await ctx.answerCbQuery()
    try { await ctx.deleteMessage() } catch (err) { }
    await ctx.reply('Получаю остатки товаров...')
    let res = await api.getNomenclature(ctx.session.salePoint, ctx.session.salesPoints.find(el => el.id.toString() === ctx.session.salePoint).priceLists[0].id)
    if (res !== null) {
        ctx.session.nomenclr = res
        showSections(ctx)
    } else {
        await ctx.reply('Ошибка при выполнении запроса. Попробуйте повторить позднее.')
        ctx.scene.enter('mainScene')
    }
})

async function showSections(ctx) {
    let btns = []
    for (let item in ctx.session.nomenclr) {
        if (ctx.session.nomenclr[item]?.isParent === true)
            btns.push([Markup.button.callback(ctx.session.nomenclr[item].name, `pressSection${ctx.session.nomenclr[item].hierarchicalId.toString()}`)])
    }
    btns.push([Markup.button.callback('🛒 В корзину', 'toCart')])
    btns.push([Markup.button.callback('🔙 В главное меню', 'toMainMenu')])
    ctx.reply('Выберите раздел:', Markup.inlineKeyboard(btns))
}

orderScene.action(/^pressSection\d+$/, async ctx => {
    await ctx.answerCbQuery()
    try { await ctx.deleteMessage() } catch (err) { }
    let btns = []
    for (let item in ctx.session.nomenclr) {
        if (ctx.session.nomenclr[item].hierarchicalParent == ctx.callbackQuery.data.match(/\d+$/)[0])
            btns.push([Markup.button.callback(`${ctx.session.nomenclr[item].name} - ${ctx.session.nomenclr[item].cost} р.`,
                `pressProduct${ctx.session.nomenclr[item].hierarchicalId.toString()}`)])
    }
    btns.push([Markup.button.callback('🛒 В корзину', 'toCart')])
    btns.push([Markup.button.callback('🔙 Назад', 'goBack')])
    ctx.reply('Выберите продукт:', Markup.inlineKeyboard(btns))
})

orderScene.action(/^pressProduct\d+$/, async ctx => {
    await ctx.answerCbQuery()
    try { await ctx.deleteMessage() } catch (err) { }
    let prodId = ctx.callbackQuery.data.match(/\d+$/)[0]
    if (!ctx.session.cart.find(el => el.id.toString() === prodId)) {
        let item = ctx.session.nomenclr.find(el => el.hierarchicalId.toString() === prodId)
        ctx.reply(`Описание товара. Стоимость за ${item.unit} - ${item.cost} руб. Выберите нужное количество. Вы всегда можете его изменить в корзине.`,
            Markup.inlineKeyboard(
                [
                    [
                        Markup.button.callback('1', `addToCart${prodId}:1`),
                        Markup.button.callback('2', `addToCart${prodId}:2`),
                        Markup.button.callback('3', `addToCart${prodId}:3`),
                        Markup.button.callback('4', `addToCart${prodId}:4`),
                        Markup.button.callback('5', `addToCart${prodId}:5`)
                    ],
                    [Markup.button.callback('🔙 Назад', 'goBack')]
                ]
            ))
    } else {
        try { await ctx.deleteMessage() } catch (err) { }
        await ctx.reply(`Товар ${prodId} уже в корзине`)
        showSections(ctx)
    }
})

orderScene.action(/^addToCart\d+:\d$/, async ctx => {
    await ctx.answerCbQuery()
    let reg = ctx.callbackQuery.data.match(/\d+/g)
    let prodId = reg[0]
    let prodCount = reg[1]
    ctx.session.cart.push(
        {
            id: prodId,
            count: prodCount,
            point: ctx.session.salePoint
        })
    try { await ctx.deleteMessage() } catch (err) { }
    let item = ctx.session.nomenclr.find(el => el.hierarchicalId.toString() === prodId)
    await ctx.reply(`Товар ${prodId} в количестве ${prodCount} ${item.unit} добавлен в корзину`)
    showSections(ctx)
})

orderScene.action('goBack', async (ctx) => {
    ctx.answerCbQuery()
    try { await ctx.deleteMessage() } catch (err) { }
    showSections(ctx)
})

orderScene.action('toMainMenu', async ctx => {
    await ctx.answerCbQuery()
    try { await ctx.deleteMessage() } catch (err) { }
    ctx.scene.enter('mainScene')
})

orderScene.action('toCart', async ctx => {
    await ctx.answerCbQuery()
    try { await ctx.deleteMessage() } catch (err) { }
    if (ctx.session.cart.length !== 0) {
        ctx.scene.enter('cartScene')
    } else {
        await ctx.reply('Ваша корзина пуста!')
        showSections(ctx)
    }
})

const bot = new Telegraf(process.env.BOT_API_TOKEN);

const stage = new Scenes.Stage([mainScene, pointScene, orderScene, cartScene])
bot.use(session(), stage.middleware())

const api = new SbisApi(process.env.SERVER, process.env.CLIENTNAME, process.env.CLIENTSECRET)

bot.start(async ctx => {
    ctx.session.nomenclr = []
    ctx.session.cart = []
    ctx.session.salePoint = null
    ctx.session.deletedMessages = []
    ctx.session.userName = ctx.message.from.first_name
    ctx.session.userId = ctx.message.from.id
    ctx.reply(`Добрый день, ${ctx.session.userName}!`)
    ctx.scene.enter('mainScene');
})

bot.help(ctx => ctx.reply('Здесь будет раздел помощи'))

await api.auth()

bot.launch()

process.once('SIGINT', () => { bot.stop('SIGINT'); console.log('Бот остановлен') })
process.once('SIGTERM', () => { bot.stop('SIGTERM'); console.log('Бот остановлен') })