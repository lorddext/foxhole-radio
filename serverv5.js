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

// ===== CONFIG =====
const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK = "http://localhost:3000/auth/discord/callback";

const GUILD_ID = "1481399008609042432";
const ADMIN_ROLE_ID = "1481362830753140939";

// ===== PASSPORT =====
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

// ===== STATE =====
let currentRadio = null;
let spam = {};

// ===== AUTH =====
app.get("/auth/discord", passport.authenticate("discord"));

app.get(
"/auth/discord/callback",
passport.authenticate("discord",{failureRedirect:"/"}),
(req,res)=>res.redirect("/radio")
);

// ===== HOMEPAGE =====
app.get("/", (req,res)=>{

const user = req.user;

res.send(
"<html><body style='background:#070707;color:#bfe6ff;font-family:Consolas'>" +

"<h1>THROB REGIMENT NETWORK</h1>" +

"<button onclick=\"location.href='/radio'\">ENTER RADIO</button>" +

(user ? "<div>SIGNED IN AS "+user.username+"</div>" :
"<a href='/auth/discord'>SIGN IN WITH DISCORD</a>") +

"<div id='chat' style='height:300px;border:1px solid #66cfff;overflow:auto'></div>" +

"<input id='msg'>" +

"<select id='color'>" +
"<option value='#66cfff'>Blue</option>" +
"<option value='#ffffff'>White</option>" +
"<option value='#ff5555'>Red</option>" +
"<option value='#ffaa00'>Orange</option>" +
"<option value='#ff00ff'>Magenta</option>" +
"<option value='#00ffff'>Cyan</option>" +
"<option value='#aaaaaa'>Gray</option>" +
"<option value='#ffff55'>Yellow</option>" +
"</select>" +

"<button onclick='send()'>SEND</button>" +

"<script src='/socket.io/socket.io.js'></script>" +
"<script>" +

"const s=io();" +
"const c=document.getElementById('chat');" +

"s.on('chat',m=>{c.innerHTML+=m+'<br>';c.scrollTop=c.scrollHeight});" +

"function send(){" +
"let a=localStorage.alias;" +
"if(!a){a=prompt('Alias?');localStorage.alias=a}" +
"s.emit('chat',{t:msg.value,a:a,col:color.value});" +
"msg.value='';" +
"}" +

"</script></body></html>"
);

});

// ===== RADIO =====
app.get("/radio",(req,res)=>{

const user = req.user;
const admin = user && user.isAdmin;

res.send(
"<html><body style='background:#070707;color:#66cfff;font-family:Consolas;text-align:center'>" +

"<h2>REGIMENT RADIO</h2>" +

"<div id='p'></div>" +

(!user ?
"<button onclick=\"location.href='/auth/discord'\">LOGIN AS BROADCASTER</button>"
:
"<div>"+user.username+"</div>") +

(admin ?
"<input id='l'><button onclick='b()'>BROADCAST</button>"
:
"<div>LISTENING MODE</div>") +

"<h3>RADIO CHAT</h3>" +

"<div id='rc' style='height:200px;border:1px solid #66cfff;overflow:auto'></div>" +

"<input id='rm'><button onclick='rs()'>SEND</button>" +

"<script src='/socket.io/socket.io.js'></script>" +
"<script>" +

"const s=io();" +
"const rc=document.getElementById('rc');" +

"s.on('radio',x=>{" +
"p.innerHTML=\"<iframe width='720' height='405' src='\"+x.replace('watch?v=','embed/')+\"'></iframe>\";" +
"});" +

"s.on('radiochat',m=>{rc.innerHTML+=m+'<br>';rc.scrollTop=rc.scrollHeight});" +

"function b(){s.emit('setRadio',l.value)}" +

"function rs(){" +
"let a=localStorage.alias;" +
"if(!a){a=prompt('Alias?');localStorage.alias=a}" +
"s.emit('radiochat',{t:rm.value,a:a});rm.value='';}" +

"</script></body></html>"
);

});

// ===== SOCKET =====
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