"use strict";
const router = require('express').Router();
const db = require('../../models/index');
const request = require("request");
const url = require("url");
const uuid = require("uuid/v4");

module.exports = function (app) {
    var state = uuid();

	if(!process.env.OAUTH_CLIENT_ID || !process.env.OAUTH_CLIENT_SECRET) return router;
	
    router.get("/login", function (req, res) {
        var url = 'https://github.com/login/oauth/authorize?client_id=' + process.env.OAUTH_CLIENT_ID + '&state=' + state;
        res.setHeader('location', url);
        res.statusCode = 302;
        res.end();
    });

    router.get("/callback", function (req, res) {
        var query = url.parse(req.url, true).query;
        if (query.state == state) {
            var payload = {
                'code': query.code,
                'client_id': process.env.OAUTH_CLIENT_ID,
                'client_secret': process.env.OAUTH_CLIENT_SECRET
            }
            request.post({
                url: 'https://github.com/login/oauth/access_token',
                formData: payload,
                headers: { 'Accept': 'application/json' }
            }, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var token = JSON.parse(body).access_token;
                    request.get({
                        url: 'https://api.github.com/user?access_token='+token+'&token_type=bearer',
                        headers: {
                          'User-Agent': 'Hangar'
                        }
                    },function(error,response,body){
                        var userDetails = JSON.parse(body);
                        if(!userDetails.id){
                            res.status(500).end();
                            return;
                        } 
                        db.User.findOne({ where: {gitHubId: userDetails.id} }).then(user => {
                            var properties = { }
                            
                            properties.userName = userDetails.login;
                            properties.user = userDetails.user;
                            properties.email = userDetails.email;

                            if(user == null){
                                properties.apiKey = uuid();
                                properties.gitHubId = userDetails.id;
                                user = db.User.create(properties).then((user)=>{
                                    req.session.user = user;
                                    res.status(200).end();
                                })
                            }else{
                                properties.apiKey = user.apiKey;
                                properties.gitHubId = user.gitHubId;
                                user.update(properties).then((user)=>{
                                    req.session.user = user;
                                    res.status(200).end();
                                })
                            }
                        });
                    });
                }
            });
        };
    });


    router.get("/apiKey", function (req, res) {
        if(!req.authenticated || !req.user.apiKey) {
            res.status(401).end();
            return;
        }
        res.send(req.user.apiKey);
    });

    return router;
};