// FOXHOLE REGIMENT WEBSITE v10 REAL RADIO CONTROL

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;

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

io.use((socket,next)=>{
    sessionMiddleware(socket.request,{},next);
});

// CONFIG
const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK = "http://localhost:3000/auth/discord/callback";

const GUILD_ID = "1481362830753140939";
const ADMIN_ROLE_ID = "1481399008609042432";

// PASSPORT
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

// RADIO STATE
let radioState={
current:null,
queue:[],
startTime:0,
paused:false,
pauseStamp:0,
broadcaster:null
};

let listeners=0;
let spam={};

// AUTH
app.get("/auth/discord",passport.authenticate("discord"));

app.get("/auth/discord/callback",
passport.authenticate("discord",{failureRedirect:"/"}),
(req,res)=>res.redirect("/radio")
);

// HOMEPAGE ⭐ RESTORED
app.get("/",(req,res)=>{

const user=req.user;

res.send(`
<html>
<body style="margin:0;background:#050505;color:#bfe6ff;font-family:Consolas">

<div style="background:#0f0f0f;border-bottom:1px solid #66cfff;padding:12px;display:flex;justify-content:space-between">
<div>THROB REGIMENT NETWORK</div>
<button onclick="location.href='/radio'">ENTER RADIO</button>
</div>

<div style="padding:20px">

${!user ? `<button onclick="location.href='/auth/discord'">SIGN IN WITH DISCORD</button>` 
: `<div>Logged in as ${user.username}</div>`}

<br><br>

<div id="chat" style="height:350px;border:1px solid #66cfff;overflow:auto;padding:10px"></div>

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

const s=io();
const c=document.getElementById("chat");

s.on("chat",m=>{
c.innerHTML+=m+"<br>";
c.scrollTop=c.scrollHeight;
});

function send(){
let a=localStorage.alias;
if(!a){a=prompt("Alias?");localStorage.alias=a}
s.emit("chat",{t:msg.value,a:a,col:color.value});
msg.value="";
}

</script>

</body>
</html>
`);
});

// RADIO ⭐ PLAYER API VERSION
app.get("/radio",(req,res)=>{

const user=req.user;
const admin=user && user.isAdmin;

res.send(`
<html>
<body style="background:#050505;color:#66cfff;font-family:Consolas;text-align:center">

<h2>REGIMENT RADIO</h2>

<div id="listeners"></div>
<div id="broadcaster"></div>

<div id="player"></div>

<input type="range" id="vol" min="0" max="100" value="50">

${!user ? `<button onclick="location.href='/auth/discord'">LOGIN AS BROADCASTER</button>` : ""}

${admin?`
<input id="link">
<button onclick="playNow()">PLAY</button>
<button onclick="queueSong()">QUEUE</button>
<button onclick="skip()">SKIP</button>
<button onclick="pauseRadio()">PAUSE</button>
<button onclick="resumeRadio()">RESUME</button>
<div id="queuePanel"></div>
`:`<div>LISTENING MODE</div>`}

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>

let player;
const s=io();

function onYouTubeIframeAPIReady(){
player=new YT.Player('player',{height:'405',width:'720'});
}

s.on("radioSync",state=>{

document.getElementById("listeners").innerText="Listeners: "+state.listeners;
document.getElementById("broadcaster").innerText="Broadcaster: "+(state.broadcaster||"None");

if(!state.current) return;

const elapsed=Math.floor((Date.now()-state.startTime)/1000);

player.loadVideoByUrl(
state.current.replace("watch?v=","embed/"),
elapsed
);

});

document.getElementById("vol").oninput=e=>{
if(player) player.setVolume(e.target.value);
};

function playNow(){ s.emit("playNow",link.value); }
function queueSong(){ s.emit("queueSong",link.value); }
function skip(){ s.emit("skipSong"); }
function pauseRadio(){ s.emit("pauseRadio"); }
function resumeRadio(){ s.emit("resumeRadio"); }

</script>
</body>
</html>
`);
});

// SOCKET
io.on("connection",sock=>{

listeners++;
sock.emit("radioSync",{...radioState,listeners});

sock.on("disconnect",()=>listeners--);

sock.on("playNow",link=>{
const user=sock.request.session?.passport?.user;
if(!user?.isAdmin) return;

radioState.current=link;
radioState.startTime=Date.now();
radioState.broadcaster=user.username;
radioState.paused=false;

io.emit("radioSync",{...radioState,listeners});
});

sock.on("queueSong",link=>{
const user=sock.request.session?.passport?.user;
if(!user?.isAdmin) return;

radioState.queue.push(link);
io.emit("radioSync",{...radioState,listeners});
});

sock.on("skipSong",()=>{
const user=sock.request.session?.passport?.user;
if(!user?.isAdmin) return;

radioState.current=radioState.queue.shift()||null;
radioState.startTime=Date.now();

io.emit("radioSync",{...radioState,listeners});
});

sock.on("pauseRadio",()=>{
radioState.paused=true;
radioState.pauseStamp=Date.now();
io.emit("radioSync",{...radioState,listeners});
});

sock.on("resumeRadio",()=>{
radioState.paused=false;
radioState.startTime+=Date.now()-radioState.pauseStamp;
io.emit("radioSync",{...radioState,listeners});
});

});

server.listen(3000,()=>console.log("THROB RADIO CONTROL ONLINE"));