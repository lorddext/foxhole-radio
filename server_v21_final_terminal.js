const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sm = session({
  secret: "foxhole",
  resave: false,
  saveUninitialized: false
});

app.use(sm);
app.use(passport.initialize());
app.use(passport.session());
io.use((s, n) => sm(s.request, {}, n));

/* ================= CONFIG ================= */

const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK = "http://localhost:3000/auth/discord/callback";

const GUILD_ID = "1481362830753140939";
const ADMIN_ROLE_ID = "1481399008609042432";

/* ================= PASSPORT ================= */

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((o, d) => d(null, o));

passport.use(
  new DiscordStrategy(
    {
      clientID: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET,
      callbackURL: DISCORD_CALLBACK,
      scope: ["identify", "guilds", "guilds.members.read"]
    },
    async (a, r, p, done) => {
      try {
        const g = await fetch(
          "https://discord.com/api/users/@me/guilds/" + GUILD_ID + "/member",
          { headers: { Authorization: "Bearer " + a } }
        );
        const m = await g.json();
        p.isAdmin = m.roles && m.roles.includes(ADMIN_ROLE_ID);
        done(null, p);
      } catch {
        p.isAdmin = false;
        done(null, p);
      }
    }
  )
);

/* ================= RADIO STATE ================= */

let radio = {
  url: null,
  queue: [],
  time: 0,
  playing: false,
  lastUpdate: Date.now(),
  broadcaster: null,
  listeners: 0
};

function getTime() {
  if (!radio.playing) return radio.time;
  return radio.time + (Date.now() - radio.lastUpdate) / 1000;
}

/* ================= AUTH ================= */

app.get("/auth/discord", passport.authenticate("discord"));

app.get(
  "/auth/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => res.redirect("/radio")
);

/* ================= GLOBAL STYLE ================= */

const STYLE = `
<style>
body{margin:0;background:#050505;color:#66cfff;font-family:Consolas}
button{
background:#050505;
color:#66cfff;
border:1px solid #66cfff;
padding:6px 14px;
cursor:pointer;
}
button:hover{background:#66cfff;color:black}
input,select{
background:black;
color:#66cfff;
border:1px solid #66cfff;
padding:6px;
}
.panel{
background:#0b0b0b;
border:1px solid #66cfff;
padding:16px;
margin-bottom:20px;
}
</style>
`;

/* ================= HOMEPAGE ================= */

app.get("/", (req, res) => {
  const authBlock = req.user
    ? "Authenticated as " + req.user.username
    : "<button onclick=\"location.href='/auth/discord'\">SIGN IN</button>";

  res.send(`
${STYLE}

<div style="padding:16px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>THROB REGIMENT NETWORK</div>
<button onclick="location.href='/radio'">ENTER RADIO</button>
</div>

<div style="width:760px;margin:auto;padding:40px">

<div class="panel">${authBlock}</div>

<div class="panel">

<div id="chat" style="height:320px;background:black;border:1px solid #66cfff;padding:10px;overflow:auto;margin-bottom:10px"></div>

<input id="msg" style="width:60%">
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

</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const s = io();

msg.addEventListener("keydown", e=>{
 if(e.key==="Enter") send();
});

s.on("chat", m=>{
 chat.innerHTML += m + "<br>";
 chat.scrollTop = chat.scrollHeight;
});

function send(){
 const t = msg.value.trim();
 if(!t) return;

 let a = localStorage.alias;
 if(!a){
   a = prompt("Alias?");
   if(!a) return;
   localStorage.alias = a;
 }

 s.emit("chat",{text:t,alias:a,color:color.value});
 msg.value="";
}
</script>
`);
});

/* ================= RADIO ================= */

app.get("/radio", (req, res) => {
  const admin = req.user && req.user.isAdmin;

  const adminControls = admin
    ? `
<div class="panel">
<input id="link" style="width:100%">
<button onclick="play()">PLAY</button>
<button onclick="queueSong()">QUEUE</button>
<button onclick="skip()">SKIP</button>
<button onclick="pause()">PAUSE</button>
<button onclick="resume()">RESUME</button>
<input type="range" id="seek" min="0" max="1000" style="width:100%" oninput="seekTo()">
</div>`
    : `<div class="panel">LISTENING MODE</div>`;

  res.send(`
${STYLE}

<div style="padding:16px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>REGIMENT RADIO</div>
<button onclick="location.href='/'">HOME</button>
</div>

<div style="display:flex">

<div style="flex:2;padding:30px">
<div class="panel" style="background:black"><div id="player"></div></div>
<div class="panel"><div id="queue"></div></div>
</div>

<div style="flex:1;padding:30px;border-left:1px solid #66cfff">

<div class="panel"><div id="status"></div></div>

${adminControls}

<div class="panel">

<div id="rchat" style="height:220px;background:black;border:1px solid #66cfff;padding:8px;overflow:auto;margin-bottom:10px"></div>

<input id="rmsg" style="width:60%">
<select id="rcolor">
<option value="#66cfff">Blue</option>
<option value="#ffffff">White</option>
<option value="#ff5555">Red</option>
<option value="#ffaa00">Orange</option>
<option value="#ff00ff">Magenta</option>
<option value="#00ffff">Cyan</option>
<option value="#aaaaaa">Gray</option>
<option value="#ffff55">Yellow</option>
</select>

</div>

</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>

const s = io();
let player;

rmsg.addEventListener("keydown", e=>{
 if(e.key==="Enter") sendRadio();
});

function vid(u){
 const m = u.match(/v=([^&]+)/);
 return m ? m[1] : u;
}

function onYouTubeIframeAPIReady(){
 player = new YT.Player('player',{height:'405',width:'100%'});
}

s.on("sync", st=>{

 status.innerHTML =
 "Listeners: "+st.listeners+"<br>"+
 "Broadcaster: "+(st.broadcaster||"None");

 if(!st.url) return;

 player.loadVideoById({videoId:vid(st.url),startSeconds:st.time});

 if(!st.playing) setTimeout(()=>player.pauseVideo(),500);

 seek.value = Math.floor(st.time);

 queue.innerHTML="";
 st.queue.forEach((u,i)=>{
  queue.innerHTML += "["+(i+1)+"] "+u+"<br>";
 });

});

function sendRadio(){
 const t = rmsg.value.trim();
 if(!t) return;

 let a = localStorage.alias;
 if(!a){
   a = prompt("Alias?");
   if(!a) return;
   localStorage.alias = a;
 }

 s.emit("radiochat",{text:t,alias:a,color:rcolor.value});
 rmsg.value="";
}

s.on("radiochat", m=>{
 rchat.innerHTML += m + "<br>";
 rchat.scrollTop = rchat.scrollHeight;
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

/* ================= SOCKET ================= */

io.on("connection", sock=>{

radio.listeners++;
sock.emit("sync",{...radio,time:getTime()});

sock.on("disconnect",()=>radio.listeners--);

function stamp(){return new Date().toLocaleTimeString();}

sock.on("chat", m=>{
 const user = sock.request.session?.passport?.user;
 const name = user ? user.username : m.alias;
 io.emit("chat","["+stamp()+"] <span style='color:"+m.color+"'>"+name+"</span>: "+m.text);
});

sock.on("radiochat", m=>{
 const user = sock.request.session?.passport?.user;
 const name = user ? user.username : m.alias;
 io.emit("radiochat","["+stamp()+"] <span style='color:"+m.color+"'>"+name+"</span>: "+m.text);
});

sock.on("play", l=>{
 const u = sock.request.session?.passport?.user;
 if(!u || !u.isAdmin) return;
 radio.url=l;
 radio.time=0;
 radio.playing=true;
 radio.lastUpdate=Date.now();
 radio.broadcaster=u.username;
 io.emit("sync",{...radio,time:getTime()});
});

sock.on("queue", l=>{
 radio.queue.push(l);
 io.emit("sync",{...radio,time:getTime()});
});

sock.on("skip", ()=>{
 radio.url=radio.queue.shift()||null;
 radio.time=0;
 radio.lastUpdate=Date.now();
 radio.playing=true;
 io.emit("sync",{...radio,time:getTime()});
});

sock.on("pause", ()=>{
 radio.time=getTime();
 radio.playing=false;
 io.emit("sync",{...radio,time:getTime()});
});

sock.on("resume", ()=>{
 radio.lastUpdate=Date.now();
 radio.playing=true;
 io.emit("sync",{...radio,time:getTime()});
});

sock.on("seek", sec=>{
 radio.time=Number(sec);
 radio.lastUpdate=Date.now();
 io.emit("sync",{...radio,time:getTime()});
});

});

server.listen(3000,()=>console.log("SERVER READY"));