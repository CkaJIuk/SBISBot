import axios from "axios";
import axiosRetry from "axios-retry";

class SbisApi {

    constructor(server, clientName, clientSecret) {
        this.server = server
        this.clientName = clientName
        this.clientSecret = clientSecret
        this.token = null
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
        } catch (err) {
            console.log('Ошибка! Невозможно подключиться к серверу SBIS!')
            this.token = null
        }
    }

    async getPoints() {
        console.log('Получение точек продаж')
        try {
            let res = await axios.get('/retail/point/list',
                {
                    headers: { "Authorization": `Bearer ${this.accessToken}`}
                }
            )
            if (typeof res.data.salesPoints !== 'undefined') {
                console.log('Точки продаж получены')
                return res.data.salesPoints
            }
            else console.log('Ошибка получения точек продаж!')
        } catch (err) {
            if (err.response.status == 401) {//нужно обработать unautorized
                /*console.log('Ошибка проверки токена! Повторная авторизация.')
                await new Promise(resolve => setTimeout(resolve, 3000))
                await this.auth()
                return await this.getPoints()*/
            } else console.log('Ошибка! Невозможно подключиться к серверу SBIS!')
        }
        return []
    }

    async getPriceLists(pointId) {
        console.log(`Получение прайс-листа для точки продаж ${pointId}`)
        try {
            let res = await axios.get('https://api.sbis.ru/retail/nomenclature/price-list?',
                {
                    params: {
                        'pointId': pointId,
                        'actualDate': Date.now()
                    },
                    headers: { 'X-SBISAccessToken': this.token }
                })
            if (typeof res.data.priceLists !== 'undefined') {
                console.log(`Прайс-листы для точки продаж ${pointId} получены`)
                return res.data.priceLists
            }
            else console.log(`Ошибка получения списка прайс-листов для точки продаж ${pointId}!`)
        } catch (err) {
            if (err.response.status == 401) {
                console.log('Ошибка проверки токена! Повторная авторизация.')
                await new Promise(resolve => setTimeout(resolve, 3000))
                await this.auth()
                return await this.getPriceLists(pointId)
            } else console.log('Ошибка! Невозможно подключиться к серверу SBIS!')
        }
        return []
    }

    async getPagefromNomencl(pointId, priceListId, page) {
        try {
            console.log(`Получение страницы ${page} списка товаров для точки продаж ${pointId} по прайс-листу ${priceListId}`)
            return await axios.get('https://api.sbis.ru/retail/nomenclature/list?',
                {
                    params: {
                        'pointId': pointId,
                        'priceListId': priceListId,
                        'withBalance': 'true',
                        'page': page
                    },
                    headers: { 'X-SBISAccessToken': this.token }
                })
        } catch (err) {
            if (err.response.status == 401) {
                console.log('Ошибка проверки токена! Повторная авторизация.')
                await new Promise(resolve => setTimeout(resolve, 3000))
                await this.auth()
                return await this.getPagefromNomencl(pointId, priceListId, page)
            } else console.log('Ошибка! Невозможно подключиться к серверу SBIS!')
        }
        return []
    }

    async getNomenclature(pointId, priceListId) {
        let data = []
        for (let i = 0; true; i++) {
            let res = await this.getPagefromNomencl(pointId, priceListId, i)
            if (typeof res.data.nomenclatures !== 'undefined') {
                console.log(`Страница ${i} списка товаров для точки продаж ${pointId} по прайс-листу ${priceListId} получена`)
                for (let item in res.data.nomenclatures) {
                    let val = res.data.nomenclatures[item]
                    data.push({
                        name: val.name,
                        description: val.description,
                        isParent: val.isParent,
                        hierarchicalId: val.hierarchicalId,
                        hierarchicalParent: val.hierarchicalParent,
                        externalId: val.externalId,
                        cost: val.cost,
                        unit: val.unit,
                        balance: val.balance,
                        images: val.images
                    })
                }
            } else {
                console.log(`Ошибка получения страницы ${i} списка товаров для точки продаж ${pointId} по прайс-листу ${priceListId}!`)
                break
            }
            if (typeof res.data.outcome.hasMore !== 'undefined' && res.data.outcome.hasMore === false) break
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
                }, { headers: { 'X-SBISAccessToken': this.token } })

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