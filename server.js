"use strict";

// dot env for environment variables
require('dotenv').config();

const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require("express");
const bluebird = require("bluebird");
const exphbs  = require('express-handlebars');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const {winston, redisClient} = require("./globals.js");
const favicon = require('serve-favicon');
const compression = require('compression');
const session = require('express-session');
const crypto = require('crypto');
const RedisStore = require('connect-redis')(session);
require('body-parser-xml')(bodyParser);

if (process.env.NODE_ENV == 'prod' && process.env.HOSTNAME=='www.sellmaster.in') {
    var ca_bundle = fs.readFileSync('sslcert/ca_bundle.crt', 'utf8');
    var privateKey  = fs.readFileSync('sslcert/private.key', 'utf8');
    var certificate = fs.readFileSync('sslcert/certificate.crt', 'utf8');
    var credentials = {ca: ca_bundle, key: privateKey, cert: certificate};
} else if (process.env.NODE_ENV == 'prod' && process.env.HOSTNAME=='testsite.sellmaster.in') {
  var ca_bundle = fs.readFileSync('sslcert/ca_bundle_test.crt', 'utf8');
  var privateKey  = fs.readFileSync('sslcert/private_test.key', 'utf8');
  var certificate = fs.readFileSync('sslcert/certificate_test.crt', 'utf8');
  var credentials = {ca: ca_bundle, key: privateKey, cert: certificate};
} else {
    var privateKey  = fs.readFileSync('sslcert/localhost.key', 'utf8');
    var certificate = fs.readFileSync('sslcert/localhost.crt', 'utf8');
    var credentials = {key: privateKey, cert: certificate};
}

var app = express();
// handle google health check before use session
app.get('/_ah/health', (req, res, next) => {res.status(200).send('OK');});
// use session middleware
app.use(session({
    store: new RedisStore({
        host: process.env.REDIS_HOSTNAME,
        port: process.env.REDIS_PORT,
        pass: process.env.REDIS_PASS
    }),
    secret: process.env.SESSION_SECRET,
    name: 'sellmaster.sid',
    resave: true,
    saveUninitialized: true,
    cookie:{maxAge:60000000}
}));
// serve favicon
app.use(favicon(__dirname + '/public/favicon.ico'));
// compression
app.use(compression());
// add body parser middle ware
app.use(bodyParser.json({verify: function(req, res, buf, encoding) {
    var shopHMAC = req.get('x-shopify-hmac-sha256');
    if(!shopHMAC) return;
    if(req.get('x-kotn-webhook-verified')) throw "Unexpected webhook verified header";

    var sharedSecret = process.env.APP_SECRET;
    var digest = crypto.createHmac('SHA256', sharedSecret).update(buf).digest('base64');
    if(digest == req.get('x-shopify-hmac-sha256')){
      req.headers['x-kotn-webhook-verified']= '200';
    }
 }}));
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.xml({limit: '1MB'}));
// set view engine
var hbs = exphbs.create({
    defaultLayout: 'main',
    helpers: {
        linkhref: function(source) {
            return '<link rel="stylesheet" href="' + source + '" type="text/css">';
        },
        ifCond: function (v1, operator, v2, options) {
            switch (operator) {
                case '==':
                    return (v1 == v2) ? options.fn(this) : options.inverse(this);
                case '===':
                    return (v1 === v2) ? options.fn(this) : options.inverse(this);
                case '!=':
                    return (v1 != v2) ? options.fn(this) : options.inverse(this);
                case '!==':
                    return (v1 !== v2) ? options.fn(this) : options.inverse(this);
                case '<':
                    return (v1 < v2) ? options.fn(this) : options.inverse(this);
                case '<=':
                    return (v1 <= v2) ? options.fn(this) : options.inverse(this);
                case '>':
                    return (v1 > v2) ? options.fn(this) : options.inverse(this);
                case '>=':
                    return (v1 >= v2) ? options.fn(this) : options.inverse(this);
                case '&&':
                    return (v1 && v2) ? options.fn(this) : options.inverse(this);
                case '||':
                    return (v1 || v2) ? options.fn(this) : options.inverse(this);
                default:
                    return options.inverse(this);
            }
        }
    }
})
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
// use morgan for logging
app.use(morgan('short'));
// use cors
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    next();
});
// set static serving
app.use(express.static('public'));
// create server
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);
// establish socket
var io = require('socket.io')(httpsServer);
// delegate routing to routes.js
app.use('/', require('./routes.js')(io));

// define error handler
app.use((err, req, res, next) => {
    console.log(err);
    res.status(err.status || 500);
    res.send({
        "msg": "Server error",
        "data": err
    });
    if (process.env.NODE_ENV == 'env') {
        console.log(err);
    }
})



httpServer.listen(process.env.UNSECURE_PORT);
httpsServer.listen(process.env.SECURE_PORT);
console.log(`Express started at port:${process.env.UNSECURE_PORT}`);
console.log(`Express started at port:${process.env.SECURE_PORT}`);


module.exports = {app, httpsServer};
