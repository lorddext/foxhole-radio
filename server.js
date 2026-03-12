const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;

// FIX: fetch for Node <18
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sm = session({
  secret: "foxhole",
  resave: false,
  saveUninitialized: false,
});

app.use(sm);
app.use(passport.initialize());
app.use(passport.session());
io.use((s, n) => sm(s.request, {}, n));

/* ================= CONFIG ================= */

const DISCORD_CLIENT_ID = "1481383774225698916";
const DISCORD_CLIENT_SECRET = "bkuzEHamC1YljQqxBmW5TUXShjftgT3E";
const DISCORD_CALLBACK =
  "https://throbradio.lol/auth/discord/callback";

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
      scope: ["identify", "guilds", "guilds.members.read"],
    },
    async (a, r, p, done) => {
      try {
        const g = await fetch(
          "https://discord.com/api/users/@me/guilds/" +
            GUILD_ID +
            "/member",
          { headers: { Authorization: "Bearer " + a } }
        );
        const m = await g.json();
        p.isAdmin =
          m.roles && m.roles.includes(ADMIN_ROLE_ID);
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
  listeners: 0,
};

function getTime() {
  if (!radio.playing) return radio.time;
  return (
    radio.time +
    (Date.now() - radio.lastUpdate) / 1000
  );
}

/* ================= AUTH ================= */

app.get(
  "/auth/discord",
  passport.authenticate("discord")
);

app.get(
  "/auth/discord/callback",
  passport.authenticate("discord", {
    failureRedirect: "/",
  }),
  (req, res) => res.redirect("/radio")
);

/* ================= BASIC ROOT HEALTH ================= */

app.get("/", (req, res) => {
  res.send("SERVER ALIVE");
});

/* ================= SOCKET ================= */

io.on("connection", (sock) => {
  radio.listeners++;
  sock.emit("sync", { ...radio, time: getTime() });

  sock.on("disconnect", () => radio.listeners--);
});

/* ================= LISTEN FIX ================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("SERVER READY ON", PORT);
});