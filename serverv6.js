// FOXHOLE REGIMENT WEBSITE v6 UI PASS

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);

const sessionMiddleware = session({
    secret: "foxhole",
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

// CONFIG
const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK = "http://localhost:3000/auth/discord/callback";

const GUILD_ID = "1481399008609042432";
const ADMIN_ROLE_ID = "1481362830753140939";

// PASSPORT
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((o,d)=>d(null,o));

passport.use(new DiscordStrategy(
{
clientID: DISCORD_CLIENT_ID,
clientSecret: DISCORD_CLIENT_SECRET,
callbackURL: DISCORD_CALLBACK,
scope:["identify","guilds.members.read"]
},
async (accessToken, refreshToken, profile, done)=>{

try{

const r = await fetch(
"https://discord.com/api/users/@me/guilds/"+GUILD_ID+"/member",
{ headers:{ Authorization:"Bearer "+accessToken } }
);

const member = await r.json();

profile.isAdmin = member.roles && member.roles.includes(ADMIN_ROLE_ID);

done(null, profile);

}catch(e){

profile.isAdmin = false;
done(null, profile);

}

}
));

// STATE
let currentRadio = null;
let spam = {};

// AUTH
app.get("/auth/discord", passport.authenticate("discord"));

app.get(
"/auth/discord/callback",
passport.authenticate("discord",{failureRedirect:"/"}),
(req,res)=>res.redirect("/radio")
);

// HOMEPAGE
app.get("/", (req,res)=>{

const user = req.user;

res.send(`
<html>
<head>
<style>

body{
margin:0;
background:#050505;
color:#bfe6ff;
font-family:Consolas;
}

.header{
background:#0f0f0f;
border-bottom:1px solid #66cfff;
padding:12px;
display:flex;
justify-content:space-between;
align-items:center;
}

.container{
display:flex;
height:calc(100vh - 50px);
}

.left{
flex:3;
padding:20px;
}

.right{
flex:1;
border-left:1px solid #66cfff;
padding:20px;
background:#080808;
}

.panel{
border:1px solid #66cfff;
padding:12px;
margin-bottom:15px;
background:black;
}

.chatbox{
height:60vh;
overflow:auto;
padding:10px;
border:1px solid #66cfff;
}

input,select,button{
background:#111;
color:#66cfff;
border:1px solid #66cfff;
padding:6px;
margin-top:6px;
}

button:hover{
background:#66cfff;
color:black;
cursor:pointer;
}

</style>
</head>

<body>

<div class="header">
<div>THROB REGIMENT NETWORK</div>
<button onclick="location.href='/radio'">ENTER RADIO</button>
</div>

<div class="container">

<div class="left">

<div class="panel">
<h3>REGIMENT CHAT</h3>
<div id="chat" class="chatbox"></div>

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

</div>

<div class="right">

<div class="panel">
<h3>STATUS</h3>
${ user ? "<div>Logged in as "+user.username+"</div>" :
"<a href='/auth/discord'>Login via Discord</a>" }
</div>

<div class="panel">
<h3>RADIO CONSOLE</h3>
<button onclick="location.href='/radio'">Open Radio</button>
</div>

</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>

const s = io();
const c = document.getElementById("chat");

s.on("chat", m=>{
c.innerHTML += m + "<br>";
c.scrollTop = c.scrollHeight;
});

function send(){

let a = localStorage.alias;
if(!a){ a = prompt("Alias?"); localStorage.alias = a }

s.emit("chat",{ t:msg.value, a:a, col:color.value });
msg.value="";

}

</script>

</body>
</html>
`);
});

// RADIO
app.get("/radio",(req,res)=>{

const user = req.user;
const admin = user && user.isAdmin;

res.send(`
<html>
<head>
<style>

body{
margin:0;
background:#050505;
color:#66cfff;
font-family:Consolas;
text-align:center;
}

.header{
background:#0f0f0f;
border-bottom:1px solid #66cfff;
padding:12px;
display:flex;
justify-content:space-between;
}

.panel{
border:1px solid #66cfff;
padding:15px;
margin:20px auto;
width:720px;
background:black;
}

.chatbox{
height:200px;
overflow:auto;
border:1px solid #66cfff;
padding:10px;
margin-bottom:10px;
}

input,button{
background:#111;
color:#66cfff;
border:1px solid #66cfff;
padding:6px;
}

button:hover{
background:#66cfff;
color:black;
cursor:pointer;
}

</style>
</head>

<body>

<div class="header">
<div>REGIMENT RADIO CONSOLE</div>
<button onclick="location.href='/'">RETURN HOME</button>
</div>

<div class="panel">
<div id="p"></div>
</div>

<div class="panel">

${ !user ?
"<button onclick=\"location.href='/auth/discord'\">LOGIN AS BROADCASTER</button>"
:
"<div>"+user.username+"</div>" }

${ admin ?
"<input id='l'><button onclick='b()'>BROADCAST</button>"
:
"<div>LISTENING MODE</div>" }

</div>

<div class="panel">
<h3>RADIO CHAT</h3>
<div id="rc" class="chatbox"></div>
<input id="rm">
<button onclick="rs()">SEND</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>

const s=io();
const rc=document.getElementById("rc");

s.on("radio",x=>{
p.innerHTML="<iframe width='720' height='405' src='"+x.replace('watch?v=','embed/')+"'></iframe>";
});

s.on("radiochat",m=>{
rc.innerHTML+=m+"<br>";
rc.scrollTop=rc.scrollHeight;
});

function b(){ s.emit("setRadio", l.value); }

function rs(){

let a=localStorage.alias;
if(!a){ a=prompt("Alias?"); localStorage.alias=a }

s.emit("radiochat",{ t:rm.value, a:a });
rm.value="";

}

</script>

</body>
</html>
`);
});

// SOCKET
io.on("connection",sock=>{

if(currentRadio) sock.emit("radio",currentRadio);

sock.on("chat",m=>{

const now=Date.now();
if(spam[sock.id] && now-spam[sock.id]<1000) return;
spam[sock.id]=now;

const sess=sock.request.session;
const user=sess?.passport?.user;

const name=user?.username || m.a;
const time=new Date().toLocaleTimeString();

io.emit("chat","["+time+"] <span style='color:"+m.col+"'>"+name+"</span>: "+m.t);

});

sock.on("radiochat",m=>{
const time=new Date().toLocaleTimeString();
io.emit("radiochat","["+time+"] "+m.a+": "+m.t);
});

sock.on("setRadio",link=>{

const sess=sock.request.session;
const user=sess?.passport?.user;

if(!user?.isAdmin){
console.log("BLOCKED BROADCAST");
return;
}

currentRadio=link;
io.emit("radio",link);

});

});

server.listen(3000,()=>console.log("THROB ONLINE"));