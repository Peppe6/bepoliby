

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const Rooms = require('./model/dbRooms');
const User = require('./model/dbUser');
const Pusher = require('pusher');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const port = process.env.PORT || 9000;

const allowedOrigins = [
  "https://bepoli.onrender.com",
  "https://bepoliby-1.onrender.com",
  "https://bepoliby-1-2.onrender.com",
  "http://localhost:3000"
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origin non consentita: " + origin));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecretkey',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // sessione valida 7 giorni
  }
}));

app.use(helmet.contentSecurityPolicy({
  useDefaults: true,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://translate.google.com", "https://www.gstatic.com", "https://apis.google.com", "'unsafe-inline'"],
    styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https://www.gstatic.com", "https://avatars.dicebear.com", "https://www.gravatar.com", "https://render-prod-avatars.s3.us-west-2.amazonaws.com"],
    connectSrc: ["'self'", "wss:", "https:", "http://localhost:3000", "http://localhost:9000", "wss://ws-eu.pusher.com"]
  }
}));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function authenticateSession(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Utente non autenticato. Effettua il login." });
  }
  // Estendi durata sessione ad ogni richiesta
  req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;

  req.user = {
    uid: req.session.user.id,
    nome: req.session.user.nome,
    username: req.session.user.username
  };
  next();
}

app.post('/api/ricevi-dati', (req, res) => {
  const { id, username, nome } = req.body;
  if (!id || !username || !nome) {
    return res.status(400).json({ message: "Dati utente mancanti" });
  }
  req.session.user = { id, username, nome };
  res.status(200).json({ message: "Dati ricevuti e sessione impostata" });
});

app.get("/api/session/user", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Utente non autenticato" });
  }
  res.status(200).json({ user: req.session.user });
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const db = mongoose.connection;
db.once("open", () => {
  const roomCollection = db.collection("rooms");
  const changeStream = roomCollection.watch();

  changeStream.on("change", async (change) => {
    if (change.operationType === "update") {
      const updatedFields = change.updateDescription.updatedFields;
      if (Object.keys(updatedFields).some(key => key.startsWith("messages"))) {
        const roomId = change.documentKey._id.toString();
        const room = await Rooms.findById(roomId);
        const lastMessage = room.messages.at(-1);
        if (lastMessage) {
          PusherClient.trigger(`room_${roomId}`, "inserted", { roomId, message: lastMessage });
        }
      }
    }
  });

  changeStream.on("error", (err) => {
    console.error("❌ ChangeStream error:", err);
  });
});

const PusherClient = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: "eu",
  useTLS: true,
});

app.get("/", (req, res) => res.send("🌐 API Bepoliby attiva"));
app.get("/api", (req, res) => res.send("🎉 Server attivo"));

// USERS
app.get("/api/v1/users", authenticateSession, async (req, res) => {
  try {
    const users = await User.find(
      { id: { $ne: req.user.uid } }, // escludi l’utente corrente
      { id: 1, nome: 1, username: 1, _id: 0 }
    );
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: "Errore nel recupero utenti" });
  }
});

app.get("/api/v1/users/email/:email", authenticateSession, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ error: "Utente non trovato" });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: "Errore nel recupero utente" });
  }
});

// ROOMS
app.get("/api/v1/rooms", authenticateSession, async (req, res) => {
  try {
    const data = await Rooms.find({ members: req.user.uid }).sort({ lastMessageTimestamp: -1 });
    res.status(200).send(data);
  } catch (err) {
    res.status(500).json({ error: "Errore nel recupero stanze" });
  }
});

app.post("/api/v1/rooms", authenticateSession, async (req, res) => {
  try {
    const { name, members = [] } = req.body;
    if (!name || members.length < 2) {
      return res.status(400).json({ error: "Dati stanza mancanti o insufficienti" });
    }

    // Verifica se esiste già una stanza tra gli stessi membri
    const existingRoom = await Rooms.findOne({
      members: { $all: members, $size: members.length }
    });

    if (existingRoom) {
      return res.status(409).json({ error: "Stanza già esistente", roomId: existingRoom._id });
    }

    const roomData = { name, members, messages: [], lastMessageTimestamp: null };
    const data = await Rooms.create(roomData);
    res.status(201).send(data);
  } catch (err) {
    res.status(500).json({ error: "Errore nella creazione stanza" });
  }
});

app.get("/api/v1/rooms/:id", authenticateSession, async (req, res) => {
  try {
    const room = await Rooms.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (!room.members.includes(req.user.uid)) return res.status(403).json({ message: "Access denied" });
    res.status(200).json(room);
  } catch (err) {
    res.status(500).json({ error: "Errore nel recupero stanza" });
  }
});

app.get("/api/v1/rooms/:id/messages", authenticateSession, async (req, res) => {
  try {
    const room = await Rooms.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (!room.members.includes(req.user.uid)) return res.status(403).json({ message: "Access denied" });
    res.status(200).json(room.messages || []);
  } catch (err) {
    res.status(500).json({ error: "Errore nel recupero messaggi" });
  }
});

app.post("/api/v1/rooms/:id/messages", authenticateSession, async (req, res) => {
  try {
    const dbRoom = await Rooms.findById(req.params.id);
    if (!dbRoom) return res.status(404).json({ message: "Room not found" });
    if (!dbRoom.members.includes(req.user.uid)) return res.status(403).json({ message: "Access denied" });

    const newMessage = {
      message: req.body.message,
      name: req.user.nome,
      timestamp: new Date().toISOString(),
      uid: req.user.uid
    };

    dbRoom.messages.push(newMessage);
    dbRoom.lastMessageTimestamp = new Date();
    await dbRoom.save();

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: "Errore nell'invio messaggio" });
  }
});

app.listen(port, () => console.log(`🚀 Server avviato sulla porta ${port}`));
