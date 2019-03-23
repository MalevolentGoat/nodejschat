﻿var fs          = require('fs');
var app         = require('express')();
var mysql       = require('mysql');
var privateKey = fs.readFileSync('/etc/letsencrypt/live/malevolentgoat.at/privkey.pem', 'utf8');
var certificate = fs.readFileSync('/etc/letsencrypt/live/malevolentgoat.at/cert.pem', 'utf8');
var ca = fs.readFileSync('/etc/letsencrypt/live/malevolentgoat.at/chain.pem', 'utf8');
var credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};
var https       = require('https').Server(credentials, app);
var http        = require('http');
var io          = require('socket.io')(https);
var crypto      = require('crypto-js');
var bodyParser  = require('body-parser');
var jwt         = require('jsonwebtoken');
//Set Parameters for database
var con = mysql.createConnection({
    host: "localhost",
    user: "admin",
    pass: "",
    port: "3306",
    database: "userbase"
});

app.use(bodyParser.urlencoded({ extended : false }));   //this parses the post variables into js compatible strings/arrays
//app.use(bodyParser.json());                           //Maybe? NO!
//app.use(require('express').static(__dirname, { dotfile: 'allow' }));        //this makes the file directory public, comment out in final release

con.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
});

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');              //calling the domain sends the landing page
});

app.post('/login', function (req, res){
    console.log(req.body.email);
    console.log(req.body.pass);
    var query_login = "SELECT password, name FROM `user` WHERE `mail`='" + removeXMLInvalidChars(req.body.email) + "'";
    req.body.pass = crypto.MD5(req.body.pass).toString();
    console.log(req.body.pass);
    con.query(query_login, function (err, result) {
        try{
            if(err) throw err;
            console.log(result[0].password);
            console.log(result[0].name);
            if(result[0].password == req.body.pass) {
                console.log("Login Success!");
                var token = jwt.sign({ user: result[0].name}, 'superSecretPassphrase');
                res.cookie("token", token);                             //Token is saved in clients local storage
                res.sendFile(__dirname + '/game.html');                 //send the actual game, hidden behind authentication
            } else {
                console.log("something´s wrong");
                res.sendStatus(400);
            }
        } catch(e) {res.sendStatus(400);console.log(e);}
    });
});

app.post('/register', function (req, res){
    console.log(req.body.name);
    console.log(req.body.email);
    console.log(req.body.pass);
    req.body.pass = crypto.MD5(req.body.pass).toString();
    console.log(req.body.pass);
    con.query("INSERT INTO `user` (`name`, `mail`, `password`) VALUES ('" + removeXMLInvalidChars(req.body.name) + "', '" + removeXMLInvalidChars(req.body.email) + "', '" + req.body.pass + "')", function (err, result) {
        try {if(err) {throw err;} else {
            console.log(result);
            res.sendStatus(201);
        }} catch (e) {res.sendStatus(400);console.log(e);}
    });
});

io.on("connection", function(socket){
    io.to(socket.id).emit('get_username');
    
    socket.on('username', function(username) {
        var verifiedToken = jwt.verify(username, 'superSecretPassphrase');
        socket.username = verifiedToken.user;
        console.log('A user connected: ' + socket.username + ' is his name!');
        socket.leave(Object.keys(socket.rooms)[0]);
        socket.join('Lobby', function(){
          io.to(Object.keys(socket.rooms)[0]).emit('con message', { msg: socket.username + ' has connected!', data: getUserlistInRoom('Lobby')});
        });
    });
    
    socket.on('disconnecting', function(){
        var roomname = Object.keys(socket.rooms)[0];
        console.log(socket.username + ' has disconnected from ' + roomname);
        io.to(roomname).emit('discon message', socket.id);
        socket.leave(roomname);
        if(typeof io.sockets.adapter.rooms[roomname] !== "undefined") {
            io.sockets.adapter.rooms[roomname].players = getUserlistInRoom(roomname);
        }
    });
    
    socket.on('chat message', function(msg){        //receive message and broadcast it
        console.log(socket.username + ': ' + msg);
        //debugging commands
        if(msg.charAt(0) == '/') {
            switch (msg) {
                case '/rooms':
                    console.log(io.sockets.adapter.rooms);
                    break;
                case '/players':
                    console.log(socket.rooms[0].players);
                    break;
                default:
                    io.to(socket.id).emit('chat message', 'invalid command');
            }
        } else {
            io.to(Object.keys(socket.rooms)[0]).emit('chat message', socket.username + ': ' + msg);
        }
    });
    
    //room_refresh
    socket.on('t_refresh', function() {
        console.log(io.sockets.adapter.rooms);
        socket.emit('room_list', io.sockets.adapter.rooms);
    });
    //room_create
    socket.on('t_create', function(table_name) {
        io.to(Object.keys(socket.rooms)[0]).emit('discon message', socket.id);
        socket.leave(Object.keys(socket.rooms)[0]);
        socket.join(table_name, function(){                                           //asynchronous, therefore use this style of coding
            io.to(Object.keys(socket.rooms)[0]).emit('room_joined', { msg: table_name, data: getUserlistInRoom(table_name)});
            io.sockets.adapter.rooms[table_name].players = getUserlistInRoom(table_name);
        });
        //console.log(io.sockets.adapter.rooms[table_name].players);                    //Debug function to show all players in this room
        //console.log(io.sockets.sockets);                                            //Debug function to show all sockets
        //console.log(socket.rooms);                                                  //Debug to show the socket's rooms
    });
    //room_join not needed same code as room_create
});

function getUserlistInRoom(room) {
    var conList = {};
    for (var socketID in io.sockets.adapter.rooms[room].sockets) {                //iterates throug sockets in a room
        conList[socketID] = io.sockets.sockets[socketID].username;                      //appends username to the socketlist
    }
    return conList;
}

function removeXMLInvalidChars(string)
{
    // remove everything forbidden by XML 1.0 specifications, plus the unicode replacement character U+FFFD
    var regex = /((?:[\0-\x08\x0B\f\x0E-\x1F\uFFFD\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]))/g;
    string = string.replace(regex, "");
    return string;
}

var http = require('http');
http.createServer(function (req, res) {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);

https.listen(443, function(){
  console.log('listening on *:443');
});