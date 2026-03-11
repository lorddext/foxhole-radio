// FOXHOLE REGIMENT WEBSITE v14 BUGFIX + UI PATCH

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

// HOMEPAGE
app.get("/",(req,res)=>{

const user=req.user;

res.send(`
<html>
<body style="margin:0;background:#050505;color:#bfe6ff;font-family:Consolas">

<div style="padding:15px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>THROB REGIMENT NETWORK</div>
<button onclick="location.href='/radio'">ENTER RADIO</button>
</div>

<div style="display:flex;justify-content:center;padding:40px">

<div style="width:700px">

<div style="border:1px solid #66cfff;padding:20px;margin-bottom:20px;background:black">
<h2>WELCOME</h2>
${!user ? `<button onclick="location.href='/auth/discord'">SIGN IN WITH DISCORD</button>` :
`Logged in as ${user.username}`}
</div>

<div style="border:1px solid #66cfff;padding:20px;background:black">
<h3>REGIMENT CHAT</h3>
<div id="chat" style="height:300px;overflow:auto;border:1px solid #66cfff;padding:10px;margin-bottom:10px"></div>

<input id="msg" onkeydown="if(event.key==='Enter')send()">

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

// RADIO
app.get("/radio",(req,res)=>{

const user=req.user;
const admin=user && user.isAdmin;

res.send(`
<html>
<body style="background:#050505;color:#66cfff;font-family:Consolas;margin:0">

<div style="padding:15px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>REGIMENT RADIO CONSOLE</div>
<button onclick="location.href='/'">HOME</button>
</div>

<div style="display:flex">

<div style="flex:2;padding:20px">

<div style="border:1px solid #66cfff;padding:15px;margin-bottom:20px;background:black">
<div id="player"></div>
</div>

<div style="border:1px solid #66cfff;padding:15px;background:black">
<h3>QUEUE</h3>
<div id="queuePanel"></div>
</div>

</div>

<div style="flex:1;padding:20px;border-left:1px solid #66cfff">

<div style="border:1px solid #66cfff;padding:15px;margin-bottom:20px;background:black">
<div id="listeners"></div>
<div id="broadcaster"></div>
</div>

${admin?`
<div style="border:1px solid #66cfff;padding:15px;margin-bottom:20px;background:black">
<h3>BROADCAST CONTROL</h3>
<input id="link" style="width:100%;margin-bottom:8px">
<button onclick="playNow()">PLAY</button>
<button onclick="queueSong()">QUEUE</button>
<button onclick="skip()">SKIP</button>
<button onclick="pauseRadio()">PAUSE</button>
<button onclick="resumeRadio()">RESUME</button>
</div>
`:`<div style="border:1px solid #66cfff;padding:15px;margin-bottom:20px;background:black">LISTENING MODE</div>`}

<div style="border:1px solid #66cfff;padding:15px;background:black">
<h3>RADIO CHAT</h3>
<div id="rchat" style="height:200px;overflow:auto;border:1px solid #66cfff;padding:10px;margin-bottom:10px"></div>
<input id="rmsg" onkeydown="if(event.key==='Enter')rsend()">
<button onclick="rsend()">SEND</button>
</div>

</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>

let player;
const s=io();

function onYouTubeIframeAPIReady(){
player=new YT.Player('player',{height:'405',width:'100%'});
}

s.on("radioSync",state=>{

listeners.innerText="Listeners: "+state.listeners;
broadcaster.innerText="Broadcaster: "+(state.broadcaster||"None");

if(!state.current) return;

const elapsed=Math.floor((Date.now()-state.startTime)/1000);

player.loadVideoByUrl(
state.current.replace("watch?v=","embed/"),
elapsed
);

renderQueue(state.queue);

});

s.on("radiochat",m=>{
rchat.innerHTML+=m+"<br>";
rchat.scrollTop=rchat.scrollHeight;
});

function renderQueue(q){

queuePanel.innerHTML="";

q.forEach((song,i)=>{
queuePanel.innerHTML +=
"<div style='border-bottom:1px solid #66cfff;padding:4px'>"+
i+" : "+song+
" <button onclick='removeSong("+i+")'>REMOVE</button>"+
"</div>";
});

}

function playNow(){ s.emit("playNow",link.value); }
function queueSong(){ s.emit("queueSong",link.value); }
function skip(){ s.emit("skipSong"); }
function pauseRadio(){ s.emit("pauseRadio"); }
function resumeRadio(){ s.emit("resumeRadio"); }
function removeSong(i){ s.emit("removeSong",i); }

function rsend(){
let a=localStorage.alias;
if(!a){a=prompt("Alias?");localStorage.alias=a}
s.emit("radiochat",{t:rmsg.value,a:a});
rmsg.value="";
}

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

sock.on("radiochat",m=>{
const time=new Date().toLocaleTimeString();
io.emit("radiochat","["+time+"] "+m.a+": "+m.t);
});

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

sock.on("playNow",link=>{
const user=sock.request.session?.passport?.user;
if(!user?.isAdmin) return;

radioState.current=link;
radioState.startTime=Date.now();
radioState.broadcaster=user.username;

io.emit("radioSync",{...radioState,listeners});
});

sock.on("queueSong",link=>{
const user=sock.request.session?.passport?.user;
if(!user?.isAdmin) return;

radioState.queue.push(link);
io.emit("radioSync",{...radioState,listeners});
});

sock.on("removeSong",i=>{
const user=sock.request.session?.passport?.user;
if(!user?.isAdmin) return;

radioState.queue.splice(i,1);
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

server.listen(3000,()=>console.log("THROB RADIO UI PATCHED"));