const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const session=require("express-session");
const passport=require("passport");
const DiscordStrategy=require("passport-discord").Strategy;

const app=express();
const server=http.createServer(app);
const io=new Server(server);

const sm=session({secret:"foxhole",resave:false,saveUninitialized:false});
app.use(sm);
app.use(passport.initialize());
app.use(passport.session());
io.use((s,n)=>sm(s.request,{},n));

// ===== CONFIG =====
const DISCORD_CLIENT_ID="1481383774225698916";
const DISCORD_CLIENT_SECRET="bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK="http://localhost:3000/auth/discord/callback";
const GUILD_ID="1481362830753140939";
const ADMIN_ROLE_ID="1481399008609042432";

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
async(a,r,p,done)=>{
try{
const g=await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,
{headers:{Authorization:"Bearer "+a}});
const m=await g.json();
p.isAdmin=m.roles?.includes(ADMIN_ROLE_ID);
done(null,p);
}catch{p.isAdmin=false;done(null,p);}
}
));

// ===== RADIO MODEL =====
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
<body style="margin:0;background:#050505;color:#66cfff;font-family:Consolas">

<div style="padding:14px 24px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between;align-items:center">
<div style="font-size:18px;letter-spacing:2px">THROB REGIMENT NETWORK</div>
<button style="padding:6px 16px;background:#0b0b0b;border:1px solid #66cfff;color:#66cfff;cursor:pointer"
onclick="location.href='/radio'">ENTER RADIO</button>
</div>

<div style="display:flex;justify-content:center;padding:50px">

<div style="width:720px">

<div style="background:#0b0b0b;border:1px solid #66cfff;padding:24px;margin-bottom:24px">
<div style="font-size:22px;margin-bottom:10px">WELCOME OPERATIVE</div>
${!user?`<button style="padding:6px 16px;background:#050505;border:1px solid #66cfff;color:#66cfff"
onclick="location.href='/auth/discord'">SIGN IN VIA DISCORD</button>`
:`Authenticated as ${user.username}`}
</div>

<div style="background:#0b0b0b;border:1px solid #66cfff;padding:20px">
<div style="margin-bottom:10px">REGIMENT CHAT</div>

<div id="chat" style="height:300px;border:1px solid #66cfff;padding:10px;overflow:auto;background:black"></div>

<div style="margin-top:10px">
<input id="msg" style="width:75%;background:#050505;border:1px solid #66cfff;color:#66cfff;padding:6px"
onkeydown="if(event.key==='Enter')send()">

<button style="padding:6px 16px;background:#050505;border:1px solid #66cfff;color:#66cfff"
onclick="send()">SEND</button>
</div>

</div>

</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const s=io();
s.on("chat",m=>{
chat.innerHTML+=m+"<br>";
chat.scrollTop=chat.scrollHeight;
});
function send(){
let a=localStorage.alias||prompt("Alias?");
localStorage.alias=a;
s.emit("chat",{a:a,t:msg.value});
msg.value="";
}
</script>
`);
});

// ===== RADIO PAGE =====
app.get("/radio",(req,res)=>{

const admin=req.user?.isAdmin;

res.send(`
<body style="margin:0;background:#050505;color:#66cfff;font-family:Consolas">

<div style="padding:14px 24px;border-bottom:1px solid #66cfff;display:flex;justify-content:space-between">
<div style="letter-spacing:2px">REGIMENT RADIO CONSOLE</div>
<button style="padding:6px 16px;background:#0b0b0b;border:1px solid #66cfff;color:#66cfff"
onclick="location.href='/'">HOME</button>
</div>

<div style="display:flex">

<div style="flex:2;padding:30px">

<div style="background:#000;border:1px solid #66cfff;padding:14px;margin-bottom:20px">
<div id="player"></div>
</div>

<div style="background:#0b0b0b;border:1px solid #66cfff;padding:14px">
<div style="margin-bottom:8px">QUEUE</div>
<div id="queue"></div>
</div>

</div>

<div style="flex:1;padding:30px;border-left:1px solid #66cfff">

<div style="background:#0b0b0b;border:1px solid #66cfff;padding:14px;margin-bottom:20px">
<div id="status"></div>
</div>

${admin?`
<div style="background:#0b0b0b;border:1px solid #66cfff;padding:14px;margin-bottom:20px">
<input id="link" style="width:100%;margin-bottom:8px;background:#050505;border:1px solid #66cfff;color:#66cfff">

<button onclick="play()">PLAY</button>
<button onclick="queueSong()">QUEUE</button>
<button onclick="skip()">SKIP</button>
<button onclick="pause()">PAUSE</button>
<button onclick="resume()">RESUME</button>

<br><br>

<input type="range" id="seek" min="0" max="1000" value="0" style="width:100%" oninput="seekTo()">
</div>
`:`<div style="background:#0b0b0b;border:1px solid #66cfff;padding:14px;margin-bottom:20px">LISTENING MODE</div>`}

<div style="background:#0b0b0b;border:1px solid #66cfff;padding:14px">
<div style="margin-bottom:8px">RADIO CHAT</div>
<div id="rchat" style="height:220px;border:1px solid #66cfff;background:black;padding:8px;overflow:auto"></div>

<div style="margin-top:8px">
<input id="rmsg" style="width:70%;background:#050505;border:1px solid #66cfff;color:#66cfff"
onkeydown="if(event.key==='Enter')rc()">
<button onclick="rc()">SEND</button>
</div>
</div>

</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>

let player;
const s=io();
const isAdmin=${admin?"true":"false"};

function vid(u){
const m=u.match(/v=([^&]+)/);
return m?m[1]:u;
}

function onYouTubeIframeAPIReady(){
player=new YT.Player('player',{height:'405',width:'100%'});
}

s.on("sync",st=>{

status.innerHTML=
"Listeners: "+st.listeners+"<br>"+
"Broadcaster: "+(st.broadcaster||"None");

if(!st.url) return;

player.loadVideoById({videoId:vid(st.url),startSeconds:st.time});

if(!st.playing) setTimeout(()=>player.pauseVideo(),500);

seek.value=Math.floor(st.time);

renderQueue(st.queue);

});

function renderQueue(q){
queue.innerHTML="";
q.forEach((u,i)=>{
queue.innerHTML+=u+
(isAdmin?" <button onclick='rem("+i+")'>X</button>":"")+
"<br>";
});
}

function play(){s.emit("play",link.value);}
function queueSong(){s.emit("queue",link.value);}
function skip(){s.emit("skip");}
function pause(){s.emit("pause");}
function resume(){s.emit("resume");}
function rem(i){s.emit("rem",i);}
function seekTo(){s.emit("seek",seek.value);}

function rc(){
let a=localStorage.alias||prompt("Alias?");
localStorage.alias=a;
s.emit("rc",{a:a,t:rmsg.value});
rmsg.value="";
}

s.on("rc",m=>{
rchat.innerHTML+=m+"<br>";
rchat.scrollTop=rchat.scrollHeight;
});

</script>
`);
});

// ===== SOCKET =====
io.on("connection",sock=>{

radio.listeners++;
sock.emit("sync",{...radio,time:getTime()});

sock.on("disconnect",()=>radio.listeners--);

sock.on("chat",m=>io.emit("chat","["+m.a+"] "+m.t));
sock.on("rc",m=>io.emit("rc","["+m.a+"] "+m.t));

sock.on("play",l=>{
const u=sock.request.session?.passport?.user;
if(!u?.isAdmin)return;
radio.url=l;
radio.time=0;
radio.playing=true;
radio.lastUpdate=Date.now();
radio.broadcaster=u.username;
io.emit("sync",{...radio,time:getTime()});
});

sock.on("queue",l=>{
radio.queue.push(l);
io.emit("sync",{...radio,time:getTime()});
});

sock.on("rem",i=>{
radio.queue.splice(i,1);
io.emit("sync",{...radio,time:getTime()});
});

sock.on("skip",()=>{
radio.url=radio.queue.shift()||null;
radio.time=0;
radio.lastUpdate=Date.now();
radio.playing=true;
io.emit("sync",{...radio,time:getTime()});
});

sock.on("pause",()=>{
radio.time=getTime();
radio.playing=false;
io.emit("sync",{...radio,time:getTime()});
});

sock.on("resume",()=>{
radio.lastUpdate=Date.now();
radio.playing=true;
io.emit("sync",{...radio,time:getTime()});
});

sock.on("seek",sec=>{
radio.time=Number(sec);
radio.lastUpdate=Date.now();
io.emit("sync",{...radio,time:getTime()});
});

});

server.listen(3000,()=>console.log("UI FINAL SERVER"));