#!/bin/env node
var cluster = require('cluster'),
    libssh = require('ssh'),
    http = require('http'),
    args = require('optimist')
        .default('daemon', true)
        .default('dev', false)
        .argv,
    fs = require('fs'),
    _ = require('underscore'),
    numCPUs = require('os').cpus().length,
    config = {},
    server, configFile;

if(args.dev) {
    configFile = './config/config.dev.json';
} else {
    configFile = './config/config.production.json';
}

config = JSON.parse(fs.readFileSync(configFile).toString());

if(cluster.isMaster) {
    for(var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died');
    });
} else {
    var server = libssh.createServer(config.server);
    
    server.on('connection', function(session) {
        session.on('auth', function(message) {
            if(message.subtype != 'publickey') {
                return message.replyDefault();
            }
            
            var request = http.request(config.authenticator, function(response) {
                if(response.statusCode == 200) {
                    var publicKey = new Buffer(response.headers['content-length']);
                    response.on('end', function() {
                        if(message.comparePublicKey(publicKey)) {
                            return message.replyAuthSuccess();
                        } else {
                            return message.replyDefault();
                        }
                    });
                    
                    response.pipe(publicKey);
                } else {
                    return message.replyDefault();
                }
            });
            
            request.on('error', function(error) {
                return message.replyDefault();
            });
            
            request.write(JSON.stringify({
                "authUser": message.authUser
            }));
            
            request.end();
        });
    });
    
    server.listen(config.port);
}
