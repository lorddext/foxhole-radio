const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sessionMiddleware = session({
    secret: "foxhole",
    resave: false,
    saveUninitialized: false
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

io.use((socket,next)=>{
    sessionMiddleware(socket.request,{},next);
});

// ===== CONFIG =====
const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK = "http://localhost:3000/auth/discord/callback";

const GUILD_ID = "1481362830753140939";
const ADMIN_ROLE_ID = "1481399008609042432";

// ===== PASSPORT =====
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((o,d)=>d(null,o));

passport.use(new DiscordStrategy(
{
clientID:DISCORD_CLIENT_ID,
clientSecret:DISCORD_CLIENT_SECRET,
callbackURL:DISCORD_CALLBACK,
scope:["identify","guilds","guilds.members.read"]
},
async(accessToken,refreshToken,profile,done)=>{

try{

const r = await fetch(
"https://discord.com/api/users/@me/guilds/"+GUILD_ID+"/member",
{ headers:{ Authorization:"Bearer "+accessToken } }
);

const member = await r.json();

profile.isAdmin =
member.roles && member.roles.includes(ADMIN_ROLE_ID);

done(null,profile);

}catch(e){

profile.isAdmin=false;
done(null,profile);

}

}
));

// ===== RADIO STATE =====
let radioState={
current:null,
queue:[],
startTime:0,
broadcaster:null
};

let listeners=0;

// ===== AUTH =====
app.get("/auth/discord",passport.authenticate("discord"));

app.get("/auth/discord/callback",
passport.authenticate("discord",{failureRedirect:"/"}),
(req,res)=>res.redirect("/radio")
);

// ===== HOMEPAGE =====
app.get("/",(req,res)=>{

const user=req.user;

res.send(`
<html>
<body style="background:#050505;color:#66cfff;font-family:Consolas;margin:0">

<div style="padding:15px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>THROB REGIMENT NETWORK</div>
<button onclick="location.href='/radio'">ENTER RADIO</button>
</div>

<div style="padding:30px">

${!user ? `<button onclick="location.href='/auth/discord'">SIGN IN WITH DISCORD</button>` :
`Logged in as ${user.username}`}

<h3>REGIMENT CHAT</h3>

<div id="chat" style="height:300px;border:1px solid #66cfff;padding:10px;overflow:auto"></div>

<input id="msg" onkeydown="if(event.key==='Enter')send()">

<button onclick="send()">SEND</button>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>

const s=io();
const c=document.getElementById("chat");

s.on("chat",m=>{
c.innerHTML+=m+"<br>";
c.scrollTop=c.scrollHeight;
});

function send(){
let a=localStorage.alias;
if(!a){a=prompt("Alias?");localStorage.alias=a}
s.emit("chat",{t:msg.value,a:a});
msg.value="";
}

</script>

</body>
</html>
`);
});

// ===== RADIO PAGE =====
app.get("/radio",(req,res)=>{

const user=req.user;
const admin=user && user.isAdmin;

res.send(`
<html>
<body style="background:#050505;color:#66cfff;font-family:Consolas;margin:0">

<div style="padding:15px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>REGIMENT RADIO</div>
<button onclick="location.href='/'">HOME</button>
</div>

<div style="padding:20px">

<div id="player"></div>

<h3>QUEUE</h3>
<div id="queue"></div>

${admin ? `
<input id="link">
<button onclick="playNow()">PLAY</button>
<button onclick="queueSong()">QUEUE</button>
<button onclick="skip()">SKIP</button>
` : `LISTENING MODE`}

<h3>RADIO CHAT</h3>
<div id="rchat" style="height:200px;border:1px solid #66cfff;overflow:auto"></div>
<input id="rmsg" onkeydown="if(event.key==='Enter')rsend()">
<button onclick="rsend()">SEND</button>

</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>

let player;
const s=io();
const isAdmin=${admin ? "true":"false"};

function extractId(url){
const m=url.match(/v=([^&]+)/);
return m?m[1]:url;
}

function onYouTubeIframeAPIReady(){
player=new YT.Player('player',{height:'405',width:'720'});
}

s.on("radioSync",state=>{

if(!state.current) return;

const elapsed=Math.floor((Date.now()-state.startTime)/1000);
const id=extractId(state.current);

player.loadVideoById({
videoId:id,
startSeconds:elapsed
});

renderQueue(state.queue);

});

function renderQueue(q){
queue.innerHTML="";
q.forEach((song,i)=>{
queue.innerHTML+=song+
(isAdmin? " <button onclick='removeSong("+i+")'>REMOVE</button>":"")+
"<br>";
});
}

function playNow(){ s.emit("playNow",link.value); }
function queueSong(){ s.emit("queueSong",link.value); }
function skip(){ s.emit("skipSong"); }
function removeSong(i){ s.emit("removeSong",i); }

function rsend(){
let a=localStorage.alias;
if(!a){a=prompt("Alias?");localStorage.alias=a}
s.emit("radiochat",{t:rmsg.value,a:a});
rmsg.value="";
}

s.on("radiochat",m=>{
rchat.innerHTML+=m+"<br>";
});

</script>

</body>
</html>
`);
});

// ===== SOCKET =====
io.on("connection",sock=>{

listeners++;

sock.emit("radioSync",{...radioState,listeners});

sock.on("chat",m=>{
io.emit("chat","["+m.a+"] "+m.t);
});

sock.on("radiochat",m=>{
io.emit("radiochat","["+m.a+"] "+m.t);
});

sock.on("playNow",link=>{
const user=sock.request.session?.passport?.user;
if(!user?.isAdmin) return;

radioState.current=link;
radioState.startTime=Date.now();
radioState.broadcaster=user.username;

io.emit("radioSync",{...radioState,listeners});
});

sock.on("queueSong",link=>{
radioState.queue.push(link);
io.emit("radioSync",{...radioState,listeners});
});

sock.on("removeSong",i=>{
radioState.queue.splice(i,1);
io.emit("radioSync",{...radioState,listeners});
});

sock.on("skipSong",()=>{
radioState.current=radioState.queue.shift()||null;
radioState.startTime=Date.now();
io.emit("radioSync",{...radioState,listeners});
});

});

server.listen(3000,()=>console.log("STABLE SERVER RUNNING"));