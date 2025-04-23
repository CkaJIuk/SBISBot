import axios from "axios";
import axiosRetry from "axios-retry";

class SbisApi {

    constructor(server, clientName, clientSecret) {
        this.server = server
        this.clientName = clientName
        this.clientSecret = clientSecret
        axiosRetry(axios, {
            retries: 5,
            retryCondition: axiosRetry.isRetryableError,
            retryDelay: () => {
                console.log('Повторная попытка подключения к серверу SBIS...')
                return 5000
            }
        })
    }

    async auth() {
        try {
            let res = await axios.post(this.server + '/auth/login',
                {
                    'clientName': this.clientName,
                    'clientSecret': this.clientSecret,
                })
            if (res.data.status === "ok") {
                this.accessToken = res.data.accessToken
                this.refreshToken = res.data.refreshToken
                console.log('Авторизация на сервере SBIS прошла успешно')
            }
            else console.log('Ошибка авторизации на сервере SBIS! Неверные учетные данные!')
        } catch (err) { console.log('Ошибка! Невозможно подключиться к серверу SBIS!') }
    }

    async getNewToken() {
        try {
            let res = await axios.post(this.server + '/auth/token',
                {
                    'refreshToken': this.refreshToken
                })
            if (res.data.status === 'ok') {
                this.accessToken = res.data.accessToken
                console.log('Получен новый accessToken')
            }
            else {
                console.log('Ошибка получения accessToken, попытка повторной авторизации')
                await auth()
            }
        } catch (err) { console.log('Ошибка получения accessToken!') }

    }

    async getPoints() {
        console.log('Получение точек продаж')
        try {
            let res = await axios.get(this.server + '/retail/point/list',
                {
                    headers: { "Authorization": `Bearer ${this.accessToken}` }
                }
            )
            if (typeof res.data.salesPoints !== 'undefined') {
                console.log('Точки продаж получены')
                return await Promise.all(res.data.salesPoints.map(async point => ({ ...point, priceLists: await this.getPriceLists(point.id) })))
            }
            else console.log('Ошибка получения точек продаж!')
        } catch (err) {
            if (err.response.status == 401) {
                console.log('Ошибка проверки токена! Повторная авторизация по refreshToken')
                await this.getNewToken()
                return await this.getPoints()
            } else console.log('Ошибка! Невозможно подключиться к серверу SBIS!')
        }
        return []
    }

    async getPriceLists(pointId) {
        console.log(`Получение прайс-листа для точки продаж ${pointId}`)
        try {
            let res = await axios.get(this.server + '/retail/nomenclature/price-list',
                {
                    params: {
                        'pointId': pointId,
                        'actualDate': new Date().toISOString().slice(0, 10)
                    },
                    headers: { "Authorization": `Bearer ${this.accessToken}` }
                })
            if (typeof res.data.priceLists !== 'undefined') {
                console.log(`Прайс-листы для точки продаж ${pointId} получены`)
                return res.data.priceLists
            }
            else console.log(`Ошибка получения списка прайс-листов для точки продаж ${pointId}!`)
        } catch (err) {
            console.error(err)
            if (err.response.status == 401) {
                console.log('Ошибка проверки токена! Повторная авторизация по refreshToken')
                await this.getNewToken()
                return await this.getPoints()
            } else console.log('Ошибка! Невозможно подключиться к серверу SBIS!')
        }
        return []
    }

    async getPagefromNomencl(pointId, priceListId, page) {
        try {
            console.log(`Получение страницы ${page} списка товаров для точки продаж ${pointId} по прайс-листу ${priceListId}`)
            return await axios.get(this.server + '/retail/nomenclature/list',
                {
                    params: {
                        'pointId': pointId,
                        'priceListId': priceListId,
                    },
                    headers: { "Authorization": `Bearer ${this.accessToken}` }
                })
        } catch (err) {
            if (err.response.status == 401) {
                console.log('Ошибка проверки токена! Повторная авторизация по refreshToken')
                await this.getNewToken()
                return await this.getPoints()
            } else console.log('Ошибка! Невозможно подключиться к серверу SBIS!')
        }
        return []
    }

    async getNomenclature(pointId, priceListId) {
        let data = []
        for (let i = 0; true; i++) {
            let res = await this.getPagefromNomencl(pointId, priceListId, i)
            if (typeof res.data.products !== 'undefined') {
                console.log(`Страница ${i} списка товаров для точки продаж ${pointId} по прайс-листу ${priceListId} получена`)
                for (let item of res.data.products) data.push(item)
            } else {
                console.log(`Ошибка получения страницы ${i} списка товаров для точки продаж ${pointId} по прайс-листу ${priceListId}!`)
                break
            }
            if (typeof res.data.hasMore !== 'undefined' && res.data.hasMore === false) break
        }
        return data
    }

    async createOrder(data) {
        try {
            let res = await axios.post('https://api.sbis.ru/retail/order/create',
                {
                    'product': 'delivery',
                    'pointId': data.pointId,
                    'customer': {
                        name: data.customerName,
                        phone: data.customerPhone
                    },
                    'nomenclatures': data.prods,
                    'delivery': {
                        paymentType: 'cash',
                        isPickup: true
                    }
                }, { headers: { "Authorization": `Bearer ${this.accessToken}` } })

            //проверка статуса заказа
            console.log(res)
            return 2222

            /*if (typeof res.data.priceLists !== 'undefined') {
                console.log(`Прайс-листы для точки продаж ${pointId} получены`)
                return res.data.priceLists
            }
            else console.log(`Ошибка получения списка прайс-листов для точки продаж ${pointId}!`)*/
        } catch (err) {
            if (err.response.status == 401) {
                console.log('Ошибка проверки токена! Повторная авторизация.')
                await new Promise(resolve => setTimeout(resolve, 3000))
                await this.auth()
                return await this.createOrder(data)
            } else console.log('Ошибка! Невозможно подключиться к серверу SBIS!')
        }
        return []
    }
}

export default SbisApi;