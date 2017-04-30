"use strict";

const router = require('express').Router();
const crypto = require('crypto');
const rp = require('request-promise');
const {winston, redisClient} = require("../globals");
const {getStoreName, getScope, getCallbackUrl, getNonceKey, getTockenKey} = require("./utility");
var shopifyAPI = require('shopify-node-api');

router.get('/shopify/initiate', (req, res, next) => {
    crypto.randomBytes(48, (err, buf) => {
        var nonce = buf.toString('hex');
        redisClient.setAsync(getNonceKey('shopify', getStoreName(req)), nonce)
        .then((result) => {
            console.log(getCallbackUrl("shopify"));
            var config = {
                shop: getStoreName(req),
                shopify_api_key: process.env.CLIENT_ID,
                shopify_shared_secret: process.env.APP_TOCKEN,
                shopify_scope: getScope(),
                redirect_uri: getCallbackUrl("shopify"),
                nonce: nonce,
                verbose: false
            };
            var Shopify = new shopifyAPI(config);
            var auth_url = Shopify.buildAuthURL();
            res.redirect(auth_url);
        }).catch((err) => {
            if (process.env.NODE_ENV) console.log(err);
            winston.log("error", err);
            res.status(500).send("Server error, please retry");
        });
    });
})

router.get('/ebay/initiate', (req, res, next) => {
    crypto.randomBytes(48, (err, buf) => {
        var nonce = buf.toString('hex');
        redisClient.setAsync(getNonceKey('ebay', getStoreName(req)), nonce)
        .then((result) => {
            var url = process.env.NODE_ENV == 'dev' ? process.env.EBAY_SANDBOX_SIGNIN_URL : process.env.EBAY_PROD_SIGNIN_URL;
            url += `&state=${nonce}`;
            res.redirect(url);
        })
    })
});

router.get('/shopify/callback', (req, res, next) => {
    redisClient.getAsync(getNonceKey('shopify', getStoreName(req)))
    .then((nonce) => {
        var config = {
            shop: getStoreName(req),
            shopify_api_key: process.env.CLIENT_ID,
            shopify_shared_secret: process.env.APP_SECRET,
            shopify_scope: getScope(),
            redirect_uri: getCallbackUrl("shopify"),
            nonce: nonce,
            verbose: false
        };
        var Shopify = new shopifyAPI(config),
            query_params = req.query;

        Shopify.exchange_temporary_token(query_params, function(err, data){
            if (err) {
                if (process.env.NODE_ENV) console.log(err);
                res.status(500).send("exchange token wrong");
            } else {
                redisClient.setAsync(getTockenKey("shopify", config.shop), data['access_token'])
                .then((result) => {
                    // console.log(data['access_token']);
                    res.status(200).send("success!");
                })
            }
        });
    });
});

router.get('/ebay/callback', (req, res, next) => {
    redisClient.getAsync(getNonceKey('ebay', getStoreName(req)))
    .then((nonce) => {
        var state = req.query.state,
            code = req.query.code;
        if (state != nonce) throw "Nonce verification failed";
        if (!code) throw "No authorization code";
        if (process.env.NODE_ENV == 'dev') {
            var credential = 'Basic ' + Buffer.from(`${process.env.EBAY_SANDBOX_CLIENT_ID}:${process.env.EBAY_SANDBOX_CLIENT_SECRET}`).toString('base64');
            var RuName = process.env.RUNAME_SANDBOX;
        } else {
            var credential = 'Basic ' + Buffer.from(`${process.env.EBAY_PROD_CLIENT_ID}:${process.env.EBAY_PROD_CLIENT_SECRET}`).toString('base64');
            var RuName = process.env.RUNAME_PROD;
        }
        return rp({
            method: 'POST',
            uri: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': credential
            },
            body: `grant_type=authorization_code&code=${code}&redirect_uri=${RuName}`,
            json: true,
            resolveWithFullResponse: true
        }).then((response) => {
            console.log("success");
            console.log(response);
            res.status(200).send("success");
        }).catch((err) => {
            console.log("authentication failed, user tocken not obtained: " + err);
            res.status(400).send("Server error: " + err);
        })
    }).catch((err) => {
        if (process.env.NODE_ENV) console.log(err);
        res.status(500).send("Server error: " + err);
    })
});

module.exports = router;
