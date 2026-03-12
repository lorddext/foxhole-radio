const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;

const fetch = (...args)=>import("node-fetch").then(({default:fetch})=>fetch(...args));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sm = session({ secret:"foxhole", resave:false, saveUninitialized:false });

app.use(sm);
app.use(passport.initialize());
app.use(passport.session());
io.use((s,n)=>sm(s.request,{},n));

/* ================= RADIO STATE ================= */

let radio={
url:null,
queue:[],
time:0,
playing:false,
lastUpdate:Date.now(),
broadcaster:null,
listeners:0
};

function now(){ return new Date().toLocaleTimeString(); }

function getTime(){
if(!radio.playing) return radio.time;
return radio.time+(Date.now()-radio.lastUpdate)/1000;
}

function sync(){
io.emit("sync",{...radio,time:getTime()});
}

/* ================= BASIC PAGES ================= */

app.get("/",(req,res)=>{
res.send(`
<body style="background:#050505;color:#66cfff;font-family:Consolas;padding:40px">
<h1>THROB REGIMENT NETWORK</h1>
<button onclick="location.href='/radio'">ENTER RADIO</button>
<div style="margin-top:20px;font-size:12px;color:#8fdfff">
ver alpha001 • fixes & improvements in the works
</div>
</body>
`);
});

/* ================= RADIO PAGE ================= */

app.get("/radio",(req,res)=>{
res.send(`
<body style="margin:0;background:#050505;color:#66cfff;font-family:Consolas">

<div style="padding:16px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div>T.H.R.O.B RADIO</div>
<button onclick="location.href='/'">HOME</button>
</div>

<div style="display:flex">

<div style="flex:2;padding:30px">
<div style="border:1px solid #66cfff;padding:10px;margin-bottom:20px">
<div id="player"></div>
</div>

<div style="border:1px solid #66cfff;padding:10px">
<div id="queue"></div>
</div>
</div>

<div style="flex:1;padding:30px;border-left:1px solid #66cfff">

<div style="border:1px solid #66cfff;padding:10px;margin-bottom:20px">
<b>Listeners Online</b>
<div id="listenersBox">0</div>
</div>

<div style="border:1px solid #66cfff;padding:10px;margin-bottom:20px">
<b>Current Broadcaster</b>
<div id="broadcasterBox">No Broadcaster</div>
</div>

<div style="font-size:12px;color:#8fdfff;margin-bottom:20px">
If video breaks, refresh page to resync.<br>
Fixes & improvements in the works.
</div>

<div style="border:1px solid #66cfff;padding:10px">
<div id="chat" style="height:200px;overflow:auto;background:black"></div>
<input id="msg">
<button onclick="send()">Send</button>
</div>

</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<script>

const s=io();
let player;
let current=null;

function onYouTubeIframeAPIReady(){
player=new YT.Player("player",{height:"405",width:"100%"});
}

function vid(u){
const m=u.match(/v=([^&]+)/);
return m?m[1]:u;
}

s.on("sync",st=>{

listenersBox.innerText=st.listeners;

broadcasterBox.innerText=
st.broadcaster ? st.broadcaster : "No Broadcaster";

if(!st.url || !player) return;

const id=vid(st.url);

if(current!==id){
player.loadVideoById({videoId:id,startSeconds:st.time});
current=id;
return;
}

const local=player.getCurrentTime ? player.getCurrentTime() : 0;

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

s.on("chat",m=>{
chat.innerHTML+=m+"<br>";
chat.scrollTop=chat.scrollHeight;
});

function send(){
s.emit("chat",{text:msg.value});
msg.value="";
}

</script>
`);
});

/* ================= SOCKET ================= */

io.on("connection",sock=>{

radio.listeners++;
sync();

sock.emit("sync",{...radio,time:getTime()});

sock.on("disconnect",()=>{
radio.listeners--;
sync();
});

sock.on("chat",m=>{
io.emit("chat","["+now()+"] "+m.text);
});

sock.on("play",url=>{
radio.url=url;
radio.time=0;
radio.playing=true;
radio.lastUpdate=Date.now();
radio.broadcaster="Admin";
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

const PORT=process.env.PORT||3000;
server.listen(PORT,"0.0.0.0");