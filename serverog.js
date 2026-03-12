// FOXHOLE REGIMENT WEBSITE v2
// Discord OAuth Login + Admin Role Radio Control

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== CONFIG =====
const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK = "http://localhost:3000/auth/discord/callback";
const ADMIN_ROLE_ID = "DISCORD_ADMIN_ROLE_ID";

// ===== PASSPORT =====
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK,
    scope: ['identify', 'guilds', 'guilds.members.read']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

app.use(session({ secret: 'foxhole', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// ===== STATE =====
let currentRadioLink = null;
let lastMessageTime = {};

// ===== AUTH ROUTES =====
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => res.redirect('/')
);

function checkAuth(req, res, next){
    if(req.isAuthenticated()) return next();
    res.redirect('/auth/discord');
}

// ===== HOMEPAGE =====
app.get('/', (req, res) => {

    const user = req.user;

    res.send(`
    <html>
    <head>
        <title>Foxhole Regiment</title>
        <style>
            body { background:#0b0b0b; color:#cfe8ff; font-family: monospace; }
            .accent { color:#7ec8ff; }
            .container { width:75%; margin:auto; }
            .chat { border:1px solid #7ec8ff; height:320px; overflow:auto; padding:6px; }
            input, button { background:#111; color:#7ec8ff; border:1px solid #7ec8ff; }
            .discordBanner { position:fixed; right:0; top:0; width:260px; height:100%; border-left:1px solid #7ec8ff; }
        </style>
    </head>
    <body>

        <div class="discordBanner">
            <iframe src="https://discord.com/widget?id=1481362830753140939&theme=dark" width="100%" height="100%"></iframe>
        </div>

        <div class="container">
            <h1 class="accent">WELCOME</h1>
            <p>Regiment Operations Network Terminal</p>
            <a class="accent" href="YOUR_DISCORD_INVITE">Join Discord</a>
            <br><br>
            ${ user ? `<span class='accent'>SIGNED IN AS ${user.username}</span>` : `<a href='/auth/discord' class='accent'>SIGN IN WITH DISCORD</a>` }

            <h2>LIVE CHAT</h2>
            <div id="chat" class="chat"></div>
            <input id="msg" placeholder="message" />
            <button onclick="send()">SEND</button>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            const chat = document.getElementById('chat');

            socket.on('chat', m => {
                chat.innerHTML += m + '<br>';
                chat.scrollTop = chat.scrollHeight;
            });

            function send(){
                const v = document.getElementById('msg').value;
                socket.emit('chat', v);
            }
        </script>

    </body>
    </html>
    `);
});

// ===== RADIO PAGE =====
app.get('/radio', checkAuth, (req, res) => {

    const isAdmin = req.user?.roles?.includes(ADMIN_ROLE_ID);

    res.send(`
    <html>
    <head>
        <style>
            body { background:#0b0b0b; color:#7ec8ff; font-family: monospace; text-align:center; }
            input,button { background:#111; color:#7ec8ff; border:1px solid #7ec8ff; }
        </style>
    </head>
    <body>

        <h1>REGIMENT RADIO</h1>
        <div id="player"></div>

        ${ isAdmin ? `
            <div>
                <input id="link" placeholder="youtube link" />
                <button onclick="setRadio()">BROADCAST</button>
            </div>
        ` : `<p>Listening Mode</p>` }

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            const player = document.getElementById('player');

            socket.on('radio', link => {
                player.innerHTML = "<iframe width='700' height='400' src='" + link.replace('watch?v=','embed/') + "?autoplay=1'></iframe>";
            });

            function setRadio(){
                const l = document.getElementById('link').value;
                socket.emit('setRadio', l);
            }
        </script>

    </body>
    </html>
    `);
});

// ===== SOCKET =====
io.on('connection', socket => {

    if(currentRadioLink) socket.emit('radio', currentRadioLink);

    socket.on('chat', msg => {
        const now = Date.now();
        if(lastMessageTime[socket.id] && now - lastMessageTime[socket.id] < 1500) return;
        if(msg.length > 200) return;

        lastMessageTime[socket.id] = now;
        io.emit('chat', msg);
    });

    socket.on('setRadio', link => {
        currentRadioLink = link;
        io.emit('radio', link);
    });

});

server.listen(3000, () => console.log('Foxhole Regiment Network Online'));
