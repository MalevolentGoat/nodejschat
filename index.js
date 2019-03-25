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
    socket.game = new Object();
    io.to(socket.id).emit('get_username');
    
    socket.on('username', function(username) {
        var verifiedToken = jwt.verify(username, 'superSecretPassphrase');
        socket.game.username = verifiedToken.user;
        console.log('A user connected: ' + socket.game.username + ' is his name!');
        socket.leave(Object.keys(socket.rooms)[0]);
        socket.join('Lobby', function(){
          io.to(Object.keys(socket.rooms)[0]).emit('con message', { msg: socket.game.username + ' has connected!', data: getUserlistInRoom('Lobby')});
        });
    });
    
    socket.on('disconnecting', function(){
        var roomname = Object.keys(socket.rooms)[0];
        console.log(socket.game.username + ' has disconnected from ' + roomname);
        io.to(roomname).emit('discon message', socket.id);
        socket.leave(roomname);
    });
    
    socket.on('chat message', function(msg){        //receive message and broadcast it
        console.log(socket.game.username + ': ' + msg);
        var room = Object.keys(socket.rooms)[0];
        //debugging commands
        if(msg.charAt(0) == '/') {
            switch (msg) {
                case '/rooms':
                    console.log(io.sockets.adapter.rooms);
                    break;
                case '/players':
                    console.log(io.sockets.adapter.rooms[room].sockets);
                    break;
                case '/me':
                    console.log(socket.game);
                    break;
                case '/status':
                    for(var socketID in io.sockets.adapter.rooms[room].sockets){
                        console.log(io.sockets.sockets[socketID].game);
                    }
                    break;
                default:
                    io.to(socket.id).emit('chat message', 'invalid command');
            }
        } else if (io.sockets.adapter.rooms[room].phase != undefined) {
            switch (io.sockets.adapter.rooms[room].phase) {
                case 1:
                    break;
                case 2:
                    break;
                case 3:
                    break;
                default:
                    console.log('Fatal logic error');
            }
        } else {
            io.to(room).emit('chat message', socket.game.username + ': ' + msg);
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
            socket.game.role = '';
            socket.game.status = false;
            socket.game.alive = true;
        });
        //console.log(io.sockets.adapter.rooms[table_name]);                          //Debug function to show all players in this room
        //console.log(io.sockets.sockets);                                            //Debug function to show all sockets
        //console.log(socket.rooms);                                                  //Debug to show the socket's rooms
    });
    //room_join not needed same code as room_create
    socket.on('vote', function() {
        socket.game.status = true;
        checkForStart(Object.keys(socket.rooms)[0]);
    });
});

function getUserlistInRoom(room) {
    var conList = {};
    for (var socketID in io.sockets.adapter.rooms[room].sockets) {                      //iterates throug sockets in a room
        conList[socketID] = io.sockets.sockets[socketID].game.username;                 //appends username to the socketlist
    }
    return conList;
}

function checkForStart (room) {
    var x = 0;
    var y = io.sockets.adapter.rooms[room].length;
    console.log('roomlength: ' + y);
    for (var socketID in io.sockets.adapter.rooms[room].sockets) {
        if(io.sockets.sockets[socketID].game.status == true) {
            x++;
        }
    }
    if (x >= y && x >= 3) {
        console.log('assigning');
        assignRoles(y, room);
        io.sockets.adapter.rooms[room].phase = 1;
        io.to(room).emit('game_start', io.sockets.adapter.rooms[room].phase);
    }
}


function assignRoles(length, room) {
    var spawnCount = Math.ceil(length/4);
    var inspeCount = Math.ceil(length/8);
    var target;
    var targetArray = new Array(length);
    console.log('spawns: ' + spawnCount + ' inspectors: ' + inspeCount);
    for (var x=0;x<spawnCount;x++){
        target = Math.floor(Math.random() * length);
        console.log(target + ': ' + targetArray[target]);
        if(targetArray[target]==undefined){
            targetArray[target]='Spawn';
        } else { x--; }
    }
    for (var y=0;y<inspeCount;y++){
        target = Math.floor(Math.random() * length);
        if(targetArray[target]==undefined){
            targetArray[target]='Inspector';
        } else { y--; }
    }
    var z=0;
    for(var socketID in io.sockets.adapter.rooms[room].sockets){
        if(targetArray[z]!=undefined){
            io.sockets.sockets[socketID].game.role=targetArray[z];
        } else {
            io.sockets.sockets[socketID].game.role='Peasant';
        }
        z++;
    }
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