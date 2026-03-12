const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;

const fetch = (...args)=>
  import("node-fetch").then(({default:fetch})=>fetch(...args));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sm = session({
  secret:"foxhole",
  resave:false,
  saveUninitialized:false
});

app.use(sm);
app.use(passport.initialize());
app.use(passport.session());
io.use((s,n)=>sm(s.request,{},n));

const DISCORD_CLIENT_ID="1481383774225698916";
const DISCORD_CLIENT_SECRET="bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK="https://throbradio.lol/auth/discord/callback";

const GUILD_ID="1481362830753140939";
const ADMIN_ROLE_ID="1481399008609042432";

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((o,d)=>d(null,o));

passport.use(new DiscordStrategy({
clientID:DISCORD_CLIENT_ID,
clientSecret:DISCORD_CLIENT_SECRET,
callbackURL:DISCORD_CALLBACK,
scope:["identify","guilds","guilds.members.read"]
},
async(a,r,p,done)=>{
try{
const g=await fetch(
"https://discord.com/api/users/@me/guilds/"+GUILD_ID+"/member",
{headers:{Authorization:"Bearer "+a}}
);
const m=await g.json();
p.isAdmin=m.roles&&m.roles.includes(ADMIN_ROLE_ID);
done(null,p);
}catch{
p.isAdmin=false;
done(null,p);
}
}));

let radio={
url:null,
queue:[],
time:0,
playing:false,
lastUpdate:Date.now(),
broadcaster:null,
listeners:0
};

function getTime(){
if(!radio.playing) return radio.time;
return radio.time+(Date.now()-radio.lastUpdate)/1000;
}

function sync(){
io.emit("sync",{...radio,time:getTime()});
}

app.get("/auth/discord",passport.authenticate("discord"));

app.get("/auth/discord/callback",
passport.authenticate("discord",{failureRedirect:"/"}),
(req,res)=>res.redirect("/radio")
);

const STYLE=`<style>
body{margin:0;background:#050505;color:#66cfff;font-family:Consolas}
button{background:#050505;color:#66cfff;border:1px solid #66cfff;padding:6px 14px;cursor:pointer}
button:hover{background:#66cfff;color:black}
input,select{background:black;color:#66cfff;border:1px solid #66cfff;padding:6px}
.panel{background:#0b0b0b;border:1px solid #66cfff;padding:16px;margin-bottom:20px}
.small{font-size:12px;color:#8fdfff}
</style>`;

const COLORS=`
<option value="#66cfff">Blue</option>
<option value="#ffffff">White</option>
<option value="#ff5555">Red</option>
<option value="#ffaa00">Orange</option>
<option value="#ff00ff">Magenta</option>
<option value="#00ffff">Cyan</option>
<option value="#aaaaaa">Gray</option>
<option value="#ffff55">Yellow</option>
`;

/* HOMEPAGE */

app.get("/",(req,res)=>{

const auth=req.user
? "Authenticated as "+req.user.username
: "<button onclick=\"location.href='/auth/discord'\">SIGN IN</button>";

res.send(`${STYLE}

<div style="padding:16px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>THROB REGIMENT NETWORK</div>
<button onclick="location.href='/radio'">ENTER RADIO</button>
</div>

<div style="width:760px;margin:auto;padding:40px">

<div class="panel">${auth}</div>

<div class="panel">
<div id="chat" style="height:320px;background:black;border:1px solid #66cfff;padding:10px;overflow:auto;margin-bottom:10px"></div>

<input id="msg" style="width:60%">
<select id="color">${COLORS}</select>

<div class="small" style="margin-top:12px">
ver alpha001 • fixes & improvements in the works
</div>

</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const s=io();

function alias(){
let a=localStorage.alias;
if(!a){
a=prompt("Alias?");
if(!a) return null;
localStorage.alias=a;
}
return a;
}

msg.addEventListener("keydown",e=>{
if(e.key==="Enter") send();
});

s.on("chat",m=>{
chat.innerHTML+=m+"<br>";
chat.scrollTop=chat.scrollHeight;
});

function send(){
const t=msg.value.trim();
if(!t) return;
const a=alias();
if(!a) return;
s.emit("chat",{text:t,alias:a,color:color.value});
msg.value="";
}
</script>`);
});

/* RADIO PAGE */

app.get("/radio",(req,res)=>{

const admin=req.user&&req.user.isAdmin;

res.send(`${STYLE}

<div style="padding:16px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>T.H.R.O.B RADIO</div>
<button onclick="location.href='/'">HOME</button>
</div>

<div style="display:flex">

<div style="flex:2;padding:30px">
<div class="panel"><div id="player"></div></div>
<div class="panel"><div id="queue"></div></div>
</div>

<div style="flex:1;padding:30px;border-left:1px solid #66cfff">

<div class="panel">
<div id="status"></div>
<div class="small" style="margin-top:8px">
If video breaks, refresh page to resync to broadcaster timeline.
</div>
<div class="small">
Fixes & improvements in the works.
</div>
</div>

${admin?`
<div class="panel">
<input id="link" style="width:100%">
<button onclick="play()">PLAY</button>
<button onclick="queueSong()">QUEUE</button>
<button onclick="skip()">SKIP</button>
<button onclick="pause()">PAUSE</button>
<button onclick="resume()">RESUME</button>
<input type="range" id="seek" min="0" max="1000" style="width:100%" oninput="seekTo()">
</div>`:""}

<div class="panel">
<div id="rchat" style="height:200px;overflow:auto;background:black"></div>
<input id="rmsg">
<select id="rcolor">${COLORS}</select>
</div>

</div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>

const s=io();
let player;
let current=null;

function vid(u){
const m=u.match(/v=([^&]+)/);
return m?m[1]:u;
}

function onYouTubeIframeAPIReady(){
player=new YT.Player("player",{height:"405",width:"100%"});
}

setInterval(()=>{
if(player&&player.getCurrentTime&&seek){
seek.value=Math.floor(player.getCurrentTime());
}
},500);

s.on("sync",st=>{

status.innerHTML=
"Listeners: "+st.listeners+"<br>"+
"Broadcaster: "+(st.broadcaster||"None");

if(!st.url||!player) return;

const id=vid(st.url);

if(current!==id){
player.loadVideoById({videoId:id,startSeconds:st.time});
current=id;
return;
}

const local=player.getCurrentTime?player.getCurrentTime():0;
if(Math.abs(local-st.time)>3){
player.seekTo(st.time,true);
}

if(st.playing) player.playVideo();
else player.pauseVideo();

queue.innerHTML="";
st.queue.forEach((q,i)=>{
queue.innerHTML+="["+(i+1)+"] "+q+"<br>";
});

});

s.on("radiochat",m=>{
rchat.innerHTML+=m+"<br>";
rchat.scrollTop=rchat.scrollHeight;
});

rmsg.addEventListener("keydown",e=>{
if(e.key==="Enter"){
let a=localStorage.alias||prompt("Alias?");
if(!a) return;
localStorage.alias=a;
s.emit("radiochat",{text:rmsg.value,color:rcolor.value,alias:a});
rmsg.value="";
}
});

function play(){s.emit("play",link.value);}
function queueSong(){s.emit("queue",link.value);}
function skip(){s.emit("skip");}
function pause(){s.emit("pause");}
function resume(){s.emit("resume");}
function seekTo(){s.emit("seek",seek.value);}

</script>
`);
});

/* SOCKET */

io.on("connection",sock=>{

radio.listeners++;

/* broadcast to everyone */
sync();

/* guarantee new client gets state */
sock.emit("sync",{...radio,time:getTime()});

sock.on("disconnect",()=>{
radio.listeners--;
sync();
});

function stamp(){
return new Date().toLocaleTimeString();
}

sock.on("chat",m=>{
const user=sock.request.session?.passport?.user;
const name=user?user.username:m.alias;
io.emit("chat","["+stamp()+"] <span style='color:"+m.color+"'>"+name+"</span>: "+m.text);
});

sock.on("radiochat",m=>{
const user=sock.request.session?.passport?.user;
const name=user?user.username:m.alias;
io.emit("radiochat","["+stamp()+"] <span style='color:"+m.color+"'>"+name+"</span>: "+m.text);
});

sock.on("play",l=>{
const u=sock.request.session?.passport?.user;
if(!u||!u.isAdmin) return;

radio.url=l;
radio.time=0;
radio.playing=true;
radio.lastUpdate=Date.now();
radio.broadcaster=u.username;

sync();
});

sock.on("queue",l=>{
radio.queue.push(l);
sync();
});

sock.on("skip",()=>{
radio.url=radio.queue.shift()||null;
radio.time=0;
radio.lastUpdate=Date.now();
radio.playing=true;
sync();
});

sock.on("pause",()=>{
radio.time=getTime();
radio.playing=false;
sync();
});

sock.on("resume",()=>{
radio.lastUpdate=Date.now();
radio.playing=true;
sync();
});

sock.on("seek",t=>{
radio.time=Number(t);
radio.lastUpdate=Date.now();
sync();
});

});

/* LISTEN */

const PORT=process.env.PORT||3000;
server.listen(PORT,"0.0.0.0",()=>console.log("SERVER READY",PORT));