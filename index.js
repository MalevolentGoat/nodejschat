var fs          = require('fs');
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
//TODO: anzeige wen man wählt / leave button / Phasen indikator
var https       = require('https').Server(credentials, app);
var http        = require('http');
var io          = require('socket.io')(https);
var crypto      = require('crypto-js');
var bodyParser  = require('body-parser');
var jwt         = require('jsonwebtoken');

//Set Parameters for database
var con_config = {
    host: "localhost",
    user: "admin",
    pass: "",
    port: "3306",
    database: "userbase"
}
var con;
function handleDisconnect(){
    con = mysql.createConnection(con_config);
    con.connect( function onConnect(err){
        if (err) {
            console.log("DBCONNECT_ERROR: ", err);
            setTimeout(handleDisconnect, 10000);
        }
    });
    con.on('error', function onError(err){
        console.log('db error', err);
        if(err.code == 'PROTOCOL_CONNECTION_LOST'){
            handleDisconnect();
        } else {
            throw err;
        }
    })
}
handleDisconnect();

app.use(bodyParser.urlencoded({ extended : false }));   //this parses the post variables into js compatible strings/arrays
//app.use(bodyParser.json());                           //Maybe? NO!
//app.use(require('express').static(__dirname, { dotfile: 'allow' }));        //this makes the file directory public, comment out in final release

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');              //calling the domain sends the landing page
});

app.post('/login', function (req, res){
    var query_login = "SELECT password, name FROM `user` WHERE `mail`='" + removeXMLInvalidChars(req.body.email) + "'";
    req.body.pass = crypto.MD5(req.body.pass).toString();
    con.query(query_login, function (err, result) {
        try{
            if(err) throw err;
            if(result[0].password == req.body.pass) {
                var loggedIn=false;
                for(var i in io.sockets.sockets) {
                    if(io.sockets.sockets[i].game.username==result[0].name){
                        console.log(io.sockets.sockets[i].game.username);
                        loggedIn=true;
                        break;
                    }
                }
                if(loggedIn){
                    res.sendFile(__dirname + '/index.html');
                } else {
                    var token = jwt.sign({ user: result[0].name}, 'superSecretPassphrase');
                    res.cookie("token", token);                             //Token is saved in clients local storage
                    res.sendFile(__dirname + '/game.html');                 //send the actual game, hidden behind authentication
                }
            } else {
                res.sendStatus(400);
            }
        } catch(e) {res.sendStatus(400);console.log(e);}
    });
});

app.post('/register', function (req, res){
    req.body.pass = crypto.MD5(req.body.pass).toString();
    con.query("INSERT INTO `user` (`name`, `mail`, `password`) VALUES ('" + removeXMLInvalidChars(req.body.name) + "', '" + removeXMLInvalidChars(req.body.email) + "', '" + req.body.pass + "')", function (err, result) {
        try {if(err) {throw err;} else {
            res.sendStatus(201);
        }} catch (e) {res.sendStatus(400);console.log(e);}
    });
});

io.on("connection", function(socket){
    socket.game = new Object();
    io.to(socket.id).emit('get_username');
    var currentRoom = '';
    
    socket.on('username', function(username) {
        var verifiedToken = jwt.verify(username, 'superSecretPassphrase');
        socket.game.username = verifiedToken.user;
        console.log(socket.game.username);
        socket.join('Lobby', function(){
            currentRoom = 'Lobby';
            io.to(currentRoom).emit('con message', { msg: socket.game.username + ' has connected!', data: getUserlistInRoom(currentRoom)});
        });
    });
    socket.on('leave', function(){
        io.to(currentRoom).emit('discon message', socket.id);
        socket.leave(currentRoom);
        socket.game.role = '';
        socket.game.status = false;
        socket.game.alive = true;
        socket.game.vote = false;
        socket.join('Lobby', function(){
            currentRoom = 'Lobby';
            io.to(currentRoom).emit('con message', { msg: socket.game.username + ' has connected!', data: getUserlistInRoom(currentRoom)});
        });
    });
    socket.on('disconnecting', function(){
        io.to(currentRoom).emit('discon message', socket.id);
        if(io.sockets.adapter.rooms[currentRoom].phase!=undefined){
            io.sockets.adapter.rooms[currentRoom][socket.game.role]=io.sockets.adapter.rooms[currentRoom][socket.game.role].filter(item=>item!=socket.id);
            checkForVote(currentRoom, io.sockets.adapter.rooms[currentRoom].phase);
        }
        socket.leave(currentRoom);
    });
    
    socket.on('chat message', function(msg){        //receive message and broadcast it
        //debugging commands
        if(msg.charAt(0) == '/') {
            switch (msg) {
                case '/rooms':
                    console.log(io.sockets.adapter.rooms);
                    break;
                case '/players':
                    console.log(io.sockets.adapter.rooms[currentRoom].sockets);
                    break;
                case '/me':
                    console.log(socket.game);
                    break;
                case '/status':
                    for(var socketID in io.sockets.adapter.rooms[currentRoom].sockets){
                        console.log(io.sockets.sockets[socketID].game);
                    }
                    break;
                default:
                    io.to(socket.id).emit('chat message', 'invalid command');
            }
        } else if (io.sockets.adapter.rooms[currentRoom].phase != undefined) {
            switch (io.sockets.adapter.rooms[currentRoom].phase) {
                case 1://Peasant phase
                    if(socket.game.alive == true){
                       io.to(currentRoom).emit('chat message', socket.game.username + ': ' + msg);
                    }
                    break;
                case 2://inspector phase
                    if(socket.game.alive == true && io.sockets.adapter.rooms[currentRoom].Inspector.includes(socket.id)){
                        for(var inspector in io.sockets.adapter.rooms[currentRoom].Inspector){
                            var x = io.sockets.adapter.rooms[currentRoom].Inspector[inspector];
                            io.to(x).emit('chat message', socket.game.username + ': ' + msg);
                        }
                    }
                    break;
                case 3://spawn phase
                    if(socket.game.alive == true && io.sockets.adapter.rooms[currentRoom].Spawn.includes(socket.id)){
                        for(var spawn in io.sockets.adapter.rooms[currentRoom].Spawn){
                            var x = io.sockets.adapter.rooms[currentRoom].Spawn[spawn];
                            io.to(x).emit('chat message', socket.game.username + ': ' + msg);
                        }
                    }
                    break;
                default:
                    console.log('Fatal logic error');
            }
        } else {
            io.to(currentRoom).emit('chat message', socket.game.username + ': ' + msg);
        }
    });
    
    //room_refresh
    socket.on('t_refresh', function() {
        var list={};
        for(var x in io.sockets.adapter.rooms){
            if(typeof io.sockets.adapter.rooms[x].phase=="undefined" && x != 'Lobby' && x.length <= 18){
                list[x] = io.sockets.adapter.rooms[x].length;
            }
        }
        console.log(list);
        socket.emit('room_list', list);
    });
    //room_create
    socket.on('t_create', function(table_name) {
        if(!io.sockets.adapter.rooms[table_name]){
            io.to(currentRoom).emit('discon message', socket.id);
            socket.leave(currentRoom);
            socket.join(table_name, function(){                                           //asynchronous, therefore use this style of coding
                currentRoom = table_name;
                io.to(currentRoom).emit('room_joined', { msg: currentRoom, data: getUserlistInRoom(currentRoom)});
                socket.game.role = '';
                socket.game.alive = true;
                socket.game.vote = false;
                for(var socketID in io.sockets.adapter.rooms[currentRoom].sockets){
                    io.sockets.sockets[socketID].game.status = false;
                }
            });
        } else { socket.emit('alert', "Room exists already!"); }

        //console.log(io.sockets.adapter.rooms[table_name]);                          //Debug function to show all players in this room
        //console.log(io.sockets.sockets);                                            //Debug function to show all sockets
        //console.log(socket.rooms);                                                  //Debug to show the socket's rooms
    });
    socket.on('t_join', function(table_name){
        if(io.sockets.adapter.rooms[table_name].phase==undefined) {
            io.to(currentRoom).emit('discon message', socket.id);
            socket.leave(currentRoom);
            socket.join(table_name, function(){                                           //asynchronous, therefore use this style of coding
                currentRoom = table_name;
                io.to(currentRoom).emit('room_joined', { msg: currentRoom, data: getUserlistInRoom(currentRoom)});
                socket.game.role = '';
                socket.game.alive = true;
                socket.game.vote = false;
                for(var socketID in io.sockets.adapter.rooms[currentRoom].sockets){
                    io.sockets.sockets[socketID].game.status = false;
                }
            });
        } else { socket.emit('alert', "Game has already started!"); }
    });
    socket.on('vote', function() {
        socket.game.status = true;
        checkForStart(currentRoom);
    });
    socket.on('get_role', function(target){
        io.to(socket.id).emit('reveil_self', { target: target, role: io.sockets.sockets[target].game.role });
    });
    socket.on('phase_vote', function(target){
        var result={};
        switch(io.sockets.adapter.rooms[currentRoom].phase) {
            case 1:
                if(socket.game.alive == true){
                    socket.game.vote = target;
                    checkForVote(currentRoom, 1);
                }
                break;
            case 2:
                if(socket.game.alive == true && io.sockets.adapter.rooms[currentRoom].Inspector.includes(socket.id)){
                    socket.game.vote = target;
                    checkForVote(currentRoom, 2);
                }
                break;
            case 3:
                if(socket.game.alive == true && io.sockets.adapter.rooms[currentRoom].Spawn.includes(socket.id)){
                    socket.game.vote = target;
                    checkForVote (currentRoom, 3);
                }
                break;
            default:
                console.log('Another Critical');
        }
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
    for (var socketID in io.sockets.adapter.rooms[room].sockets) {
        if(io.sockets.sockets[socketID].game.status == true) {
            x++;
        }
    }
    if (x >= y && x >= 3) {
        assignRoles(y, room);
        io.sockets.adapter.rooms[room].phase = 1;
        io.to(room).emit('game_start', io.sockets.adapter.rooms[room].phase);
    }
}

function checkForVote (room, phase) {
    var buffer = {};
    var x = 0;
    var y = 0;
    var role;
    var response_type;
    var flag=true;
    switch(phase){
        case 1:
            role='Peasant';
            response_type='single';
            break;
        case 2:
            role='Inspector';
            response_type='mulit';
            break;
        case 3:
            role='Spawn';
            response_type='single';
            break;
        default:
            console.log('Critical Error!');
    }
    console.log('checking for votes');
    if(role == 'Peasant'){
        for (var z in io.sockets.adapter.rooms[room].sockets) {
            if(io.sockets.sockets[z].game.alive == true) {
                y++;
            }
        }
        for (var z in io.sockets.adapter.rooms[room].sockets) {
            if(io.sockets.sockets[z].game.vote != false) {
                buffer[z] = io.sockets.sockets[z].game.vote;
                x++;
            }
        }
    } else {
        y = io.sockets.adapter.rooms[room][role].length;
        for (var z in io.sockets.adapter.rooms[room][role]) {
            var zz = io.sockets.adapter.rooms[room][role][z];
            if(io.sockets.sockets[zz].game.vote != false) {
                buffer[zz] = io.sockets.sockets[zz].game.vote;
                x++;
            }
        }
    }
    console.log("x: " + x + " y: " + y);
    if(y==0){
        phaseHandler(room, false);
    } else if(x == y) {
        if(response_type=='single'){
            var modeMap = {};
            var maxCount = 1;
            var modes = [];
            for(var i in buffer)
            {
                var el = buffer[i];
                if (modeMap[el] == null)
                    modeMap[el] = 1;
                else
                    modeMap[el]++;
                if (modeMap[el] > maxCount)
                {
                    modes = [el];
                    maxCount = modeMap[el];
                }
                else if (modeMap[el] == maxCount)
                {
                    modes.push(el);
                    maxCount = modeMap[el];
                }
            }
            if(modes.length != 1){
                phaseHandler(room, false);
                flag=false;
            }
        }
        if(flag){
            switch(phase){
                case 1:
                    io.sockets.sockets[modes[0]].game.alive = false;
                    io.to(room).emit('reveil', {target: modes[0], role: io.sockets.sockets[modes[0]].game.role});
                    phaseHandler(room, modes);
                    break;
                case 2:
                    for(var zzz in buffer){
                        io.to(zzz).emit('reveil', {target: buffer[zzz], role: io.sockets.sockets[buffer[zzz]].game.role});
                    }
                    phaseHandler(room, false);
                    break;
                case 3:
                    io.sockets.sockets[modes[0]].game.alive = false;
                    io.to(room).emit('reveil', {target: modes[0], role: io.sockets.sockets[modes[0]].game.role});
                    phaseHandler(room, modes);
                    break;
                default:
                    console.log('Just how?');
            }
        }
    }
}

function phaseHandler(room, dead){
    for(var z in io.sockets.adapter.rooms[room].sockets) {
        io.sockets.sockets[z].game.vote = false;
    }
    var y;
    var phase=io.sockets.adapter.rooms[room].phase;
    switch(phase){
        case 1:
            y=0;
            for(var v in io.sockets.adapter.rooms[room].Spawn){
                var vv = io.sockets.adapter.rooms[room].Spawn[v];
                if(io.sockets.sockets[vv].game.alive == true) {
                    y++;
                }
            }
            console.log(y+" Spawn alive");
            if(y==0){
                cleanUp(room, 'Peasant');
                return false;
            }
            y=0;
            for(var x in io.sockets.adapter.rooms[room].Inspector){
                var xx = io.sockets.adapter.rooms[room].Inspector[x];
                if(io.sockets.sockets[xx].game.alive == true) {
                    y++;
                }
            }
            console.log(y+" Inspectors alive");
            if(y==0){
                phase++;
            } else {phase++;io.to(room).emit('phase', phase);break;}
        case 2:
            y=0;
            for(var x in io.sockets.adapter.rooms[room].Spawn){
                var xx = io.sockets.adapter.rooms[room].Spawn[x];
                if(io.sockets.sockets[xx].game.alive == true) {
                    y++;
                }
            }
            console.log(y+"  alive");
            if(y==0){
                cleanUp(room, 'Peasant');
                return false;
            } else {phase++;io.to(room).emit('phase', phase);break;}
        case 3:
            y=0;
            z=0;
            for(var x in io.sockets.adapter.rooms[room].sockets){
                if(io.sockets.sockets[x].game.alive == true) {
                    y++;
                }
            }
            for(var x in io.sockets.adapter.rooms[room].Spawn){
                var xx = io.sockets.adapter.rooms[room].Spawn[x];
                if(xx!=false && io.sockets.sockets[xx].game.alive == true) {
                    z++;
                }
            }
            console.log(y+" Players alive");
            console.log(z+" Spawns alive");
            if(z == y){
                cleanUp(room, 'Spawn');
                return false;
            } else {phase=1;io.to(room).emit('phase', phase);break;}
            break;
        default:
            console.log('Woopsie!');
    }
    io.sockets.adapter.rooms[room].phase = phase;
    io.to(room).emit('phaseHandler', {phase: phase, dead: dead});
}

function assignRoles(length, room) {
    var spawnCount = Math.ceil(length/4);
    var inspeCount = Math.ceil(length/8);
    io.sockets.adapter.rooms[room].Peasant = [];
    io.sockets.adapter.rooms[room].Inspector = [];
    io.sockets.adapter.rooms[room].Spawn = [];
    var target;
    var targetArray = new Array(length);
    for (var x=0;x<spawnCount;x++){
        target = Math.floor(Math.random() * length);
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
        if(targetArray[z]=='Spawn'){
            io.sockets.sockets[socketID].game.role='Spawn';
            io.sockets.adapter.rooms[room].Spawn.push(socketID);
        } else if (targetArray[z]=='Inspector') {
            io.sockets.sockets[socketID].game.role='Inspector';
            io.sockets.adapter.rooms[room].Inspector.push(socketID);
        } else {
            io.sockets.sockets[socketID].game.role='Peasant';
            io.sockets.adapter.rooms[room].Peasant.push(socketID);
        }
        z++;
    }
}

function cleanUp(room, winner){
    for(var x in io.sockets.adapter.rooms[room].sockets){
        io.sockets.sockets[x].game.role = '';
        io.sockets.sockets[x].game.status = false;
        io.sockets.sockets[x].game.alive = true;
        io.sockets.sockets[x].game.vote = false;
    }
    io.sockets.adapter.rooms[room].phase=undefined;
    io.sockets.adapter.rooms[room].Peasant=undefined;
    io.sockets.adapter.rooms[room].Inspector=undefined;
    io.sockets.adapter.rooms[room].Spawn=undefined;
    console.log('And the winner is: '+winner);
    io.to(room).emit('end', winner);
}

function removeXMLInvalidChars(string) {
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