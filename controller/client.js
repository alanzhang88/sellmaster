"use strict";

const rp = require("request-promise");
const Promise = require("bluebird");
const {getStoreName, getScope, getCallbackUrl, getNonceKey, getTockenKey} = require("./utility");
const {winston, redisClient} = require("../globals.js");


/**
 * Ebay http client
 **/
class eBayClient {
    constructor(username) {
        if (process.env.NODE_ENV == "sandbox") {
            this.baseUrl = "https://api.sandbox.ebay.com";
        } else {
            this.baseUrl = "https://api.ebay.com";
        }
        this.authKey = undefined;
        this.headers = {
            'User-Agent': 'SellMaster Ebay Client',·
            'Content-Type': 'application/json'
        }
        this.get = this._request('GET');
        this.post = this._request('POST');
        this.put = this._request('PUT');
        this.delete = this._request('DELETE');

    }

    _request(method) {
        let client = this;
        return (url, qs, data) => {
            let uri = [client.baseUrl, url].join('/');
            console.log(uri);
            return new Promise((res, rej) => {
                if (typeof client.authKey !== "undefined") {
                    return client.headers;
                } else {
                    return redisClient.getAsync(getTockenKey("ebay", username))
                    .then((token) => {
                        client.authKey = token;
                        if (!client.authKey.startsWith('Bearer ')) {
                            client.authKey = `Bearer ${authKey}`;
                        }
                        client.headers.Authorization = client.authKey;
                        return client.headers;
                    }).catch((err) => {
                        throw "Error occured in acquiring ebay access token, please have the store login first: " + err;
                    })
                }
            }).then((headers) => {
                console.log("get header:" + headers);
                return rp({
                    method: method,
                    uri: uri,
                    qs: qs,
                    headers: headers,
                    body: JSON.stringify(data),
                    resolveWithFullResponse: true,
                    simple: false
                }).then((response) => {
                    var body = JSON.parse(response.body);
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        return res(body);
                    } else {
                        return rej(body);
                    }
                }).catch((err) => {
                    return rej(err);
                })
            })

        }

    }
}


/**
 * Shopify http client
 **/
class ShopifyClient {

}

module.exports = {eBayClient, ShopifyClient};
