// FOXHOLE REGIMENT WEBSITE v3 PUBLIC RADIO AUTH

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== CONFIG =====
const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK = "http://localhost:3000/auth/discord/callback";
const ADMIN_ROLE_ID = "DISCORD_ADMIN_ROLE_ID";

// ===== PASSPORT =====
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK,
    scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

app.use(session({ secret: 'foxhole', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// ===== STATE =====
let currentRadioLink = null;
let lastMessageTime = {};

// ===== AUTH =====
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => res.redirect('/radio')
);

// ===== HOMEPAGE =====
app.get('/', (req, res) => {

const user = req.user;

res.send(`
<html>
<head>
<title>THROB Network</title>
<style>
body{background:#070707;color:#bfe6ff;font-family:Consolas;margin:0}
.header{background:#111;padding:15px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between}
.navbtn{background:#0f1b22;border:1px solid #66cfff;color:#66cfff;padding:6px 12px;cursor:pointer}
.main{padding:20px;width:65%}
.chatbox{background:#050505;border:1px solid #66cfff;height:350px;overflow-y:auto;padding:10px;margin-bottom:10px}
.msg{margin-bottom:6px}
.user{color:#66cfff}
input{background:#111;border:1px solid #66cfff;color:#66cfff;padding:6px;width:80%}
.send{width:18%}
</style>
</head>
<body>

<div class="header">
<div>THROB REGIMENT NETWORK</div>
<div><button class="navbtn" onclick="location.href='/radio'">ENTER RADIO</button></div>
</div>

<div class="main">
<h1>WELCOME</h1>
${ user ? `<div class='user'>SIGNED IN AS ${user.username}</div>` : `<a href='/auth/discord'>SIGN IN WITH DISCORD</a>` }
<h2>REGIMENT CHAT</h2>
<div id="chat" class="chatbox"></div>
<input id="msg"><button class="navbtn send" onclick="send()">SEND</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const chat = document.getElementById("chat");

socket.on("chat", m=>{
const div=document.createElement("div");
div.className="msg";
div.innerHTML=m;
chat.appendChild(div);
chat.scrollTop=chat.scrollHeight;
});

function send(){
const v=document.getElementById("msg").value;
socket.emit("chat", v);
document.getElementById("msg").value="";
}
</script>

</body>
</html>
`);
});

// ===== RADIO PAGE (PUBLIC) =====
app.get('/radio', (req, res) => {

const user = req.user;
const isAdmin = user ? true : false; // TEMP admin logic

res.send(`
<html>
<head>
<style>
body{background:#070707;color:#66cfff;font-family:Consolas;margin:0;text-align:center}
.header{background:#111;padding:15px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between}
.playerwrap{margin-top:30px}
iframe{border:1px solid #66cfff}
.slider{width:400px;margin-top:15px}
.chatwrap{width:500px;margin:30px auto}
.chatbox{height:220px;border:1px solid #66cfff;overflow-y:auto;padding:10px;margin-bottom:10px}
button,input{background:#111;border:1px solid #66cfff;color:#66cfff;padding:6px}
.login{margin-top:15px}
</style>
</head>
<body>

<div class="header">
<div>REGIMENT RADIO</div>
<button onclick="location.href='/'">RETURN HOME</button>
</div>

<div class="playerwrap">
<div id="player"></div>
<br>
<input type="range" min="0" max="100" value="50" class="slider">
</div>

${
!user
?
`<div class="login">
<button onclick="location.href='/auth/discord'">LOGIN AS BROADCASTER</button>
</div>`
:
`<div>LOGGED IN AS ${user.username}</div>`
}

${
isAdmin
?
`<div>
<input id="link" placeholder="youtube link">
<button onclick="setRadio()">BROADCAST</button>
</div>`
:
`<p>LISTENING MODE</p>`
}

<div class="chatwrap">
<h2>RADIO CHAT</h2>
<div id="rchat" class="chatbox"></div>
<input id="rmsg"><button onclick="rsend()">SEND</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket=io();
const player=document.getElementById("player");
const rchat=document.getElementById("rchat");

socket.on("radio", link=>{
player.innerHTML="<iframe width='720' height='405' src='"+link.replace('watch?v=','embed/')+"?autoplay=1'></iframe>";
});

socket.on("radiochat", m=>{
const div=document.createElement("div");
div.innerHTML=m;
rchat.appendChild(div);
rchat.scrollTop=rchat.scrollHeight;
});

function setRadio(){
const l=document.getElementById("link").value;
socket.emit("setRadio", l);
}

function rsend(){
const v=document.getElementById("rmsg").value;
socket.emit("radiochat", v);
document.getElementById("rmsg").value="";
}
</script>

</body>
</html>
`);
});

// ===== SOCKET =====
io.on('connection', socket => {

if(currentRadioLink) socket.emit('radio', currentRadioLink);

socket.on('chat', msg => {
const now = Date.now();
if(lastMessageTime[socket.id] && now - lastMessageTime[socket.id] < 1200) return;
if(msg.length > 200) return;

lastMessageTime[socket.id] = now;
io.emit('chat', msg);
});

socket.on('radiochat', msg=>{
io.emit('radiochat', msg);
});

socket.on('setRadio', link => {
currentRadioLink = link;
io.emit('radio', link);
});

});

server.listen(3000, () => console.log('THROB NETWORK ONLINE'));