```js
// FOXHOLE REGIMENT WEBSITE v4 CLEAN

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);

const sessionMiddleware = session({
    secret: 'foxhole',
    resave: false,
    saveUninitialized: false
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

const io = new Server(server);

io.use((socket, next)=>{
    sessionMiddleware(socket.request, {}, next);
});

// ===== CONFIG =====
const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK = "http://localhost:3000/auth/discord/callback";
const ADMIN_ROLE_ID = "1481399008609042432";
const GUILD_ID = "1481362830753140939";

// ===== PASSPORT =====
passport.serializeUser((user, done)=>done(null,user));
passport.deserializeUser((obj, done)=>done(null,obj));

passport.use(new DiscordStrategy(
{
clientID: DISCORD_CLIENT_ID,
clientSecret: DISCORD_CLIENT_SECRET,
callbackURL: DISCORD_CALLBACK,
scope: ['identify','guilds.members.read']
},
async (accessToken, refreshToken, profile, done)=>{

try {

const response = await fetch(
"https://discord.com/api/users/@me/guilds/"+GUILD_ID+"/member",
{
headers:{ Authorization:"Bearer "+accessToken }
}
);

const member = await response.json();

profile.isAdmin = member.roles && member.roles.includes(ADMIN_ROLE_ID);

return done(null, profile);

} catch(err){

console.log("ROLE VERIFY FAIL", err);
profile.isAdmin = false;
return done(null, profile);

}

}
));

// ===== STATE =====
let currentRadioLink = null;
let lastMessageTime = {};

// ===== AUTH =====
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
passport.authenticate('discord',{failureRedirect:'/'}),
(req,res)=>res.redirect('/radio')
);

// ===== HOMEPAGE =====
app.get('/', (req,res)=>{

const user = req.user;

res.send(`
<html>
<body style="background:#070707;color:#bfe6ff;font-family:Consolas;margin:0">

<div style="background:#111;padding:15px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>THROB REGIMENT NETWORK</div>
<button onclick="location.href='/radio'">ENTER RADIO</button>
</div>

<div style="padding:20px">

<h1>WELCOME</h1>

${ user ? "<div>SIGNED IN AS "+user.username+"</div>" : "<a href='/auth/discord'>SIGN IN WITH DISCORD</a>" }

<div id="chat" style="height:350px;border:1px solid #66cfff;overflow:auto;padding:10px;margin-bottom:10px"></div>

<input id="msg">

<select id="color">
<option value="#66cfff">Blue</option>
<option value="#ffffff">White</option>
<option value="#ff5555">Red</option>
<option value="#ffaa00">Orange</option>
<option value="#ff00ff">Magenta</option>
<option value="#00ffff">Cyan</option>
<option value="#aaaaaa">Gray</option>
<option value="#ffff55">Yellow</option>
</select>

<button onclick="send()">SEND</button>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>

const socket = io();
const chat = document.getElementById("chat");

socket.on("chat", m=>{
chat.innerHTML += m+"<br>";
chat.scrollTop = chat.scrollHeight;
});

function send(){

let alias = localStorage.getItem("alias");

if(!alias){
alias = prompt("Choose alias:");
localStorage.setItem("alias", alias);
}

socket.emit("chat",{
text: document.getElementById("msg").value,
alias: alias,
color: document.getElementById("color").value
});

document.getElementById("msg").value="";
}

</script>

</body>
</html>
`);

});

// ===== RADIO PAGE =====
app.get('/radio',(req,res)=>{

const user = req.user;
const isAdmin = user && user.isAdmin === true;

res.send(`
<html>
<body style="background:#070707;color:#66cfff;font-family:Consolas;text-align:center">

<h2>REGIMENT RADIO</h2>

<div id="player"></div>

${ !user ? "<button onclick=\"location.href='/auth/discord'\">LOGIN AS BROADCASTER</button>" : "<div>"+user.username+"</div>" }

${ isAdmin ? "<input id='link'><button onclick='setRadio()'>BROADCAST</button>" : "<div>LISTENING MODE</div>" }

<h3>RADIO CHAT</h3>

<div id="rchat" style="height:200px;border:1px solid #66cfff;overflow:auto"></div>

<input id="rmsg">
<button onclick="rsend()">SEND</button>

<script src="/socket.io/socket.io.js"></script>
<script>

const socket = io();
const rchat = document.getElementById("rchat");

socket.on("radio", link=>{
document.getElementById("player").innerHTML =
"<iframe width='720' height='405' src='"+link.replace('watch?v=','embed/')+"?autoplay=1'></iframe>";
});

socket.on("radiochat", m=>{
rchat.innerHTML += m+"<br>";
rchat.scrollTop = rchat.scrollHeight;
});

function setRadio(){
socket.emit("setRadio", document.getElementById("link").value);
}

function rsend(){

let alias = localStorage.getItem("alias");

if(!alias){
alias = prompt("Choose alias:");
localStorage.setItem("alias", alias);
}

socket.emit("radiochat",{ text:document.getElementById("rmsg").value, alias:alias });

document.getElementById("rmsg").value="";
}

</script>

</body>
</html>
`);

});

// ===== SOCKET =====
io.on('connection', socket=>{

if(currentRadioLink) socket.emit("radio", currentRadioLink);

socket.on("chat", msg=>{

const now = Date.now();
if(lastMessageTime[socket.id] && now - lastMessageTime[socket.id] < 1200) return;

lastMessageTime[socket.id] = now;

const session = socket.request.session;
const user = session?.passport?.user;

const name = user?.username || msg.alias || "Anon";
const color = msg.color || "#66cfff";

const time = new Date().toLocaleTimeString();

io.emit("chat","["+time+"] <span style='color:"+color+"'>"+name+"</span>: "+msg.text);

});

socket.on("radiochat", msg=>{

const time = new Date().toLocaleTimeString();
io.emit("radiochat","["+time+"] "+msg.alias+": "+msg.text);

});

socket.on("setRadio", link=>{

const session = socket.request.session;
const user = session?.passport?.user;

if(!user?.isAdmin){
console.log("BLOCKED RADIO ATTEMPT");
return;
}

currentRadioLink = link;
io.emit("radio", link);

});

});

server.listen(3000, ()=>console.log("THROB NETWORK ONLINE"));
```
