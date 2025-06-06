import React, { useState, useEffect } from 'react';
import { InsertEmoticon } from "@mui/icons-material";
import "./Chat.css";
import { Avatar, IconButton } from '@mui/material';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useStateValue } from '../StateProvider';
import Pusher from 'pusher-js';
import EmojiPicker from 'emoji-picker-react';

function Chat() {
  const { roomId } = useParams();
  const [input, setInput] = useState("");
  const [roomName, setRoomName] = useState("");
  const [lastSeen, setLastSeen] = useState("");
  const [roomMessages, setRoomMessages] = useState([]);
  const navigate = useNavigate();
  const [{ user }] = useStateValue();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Variabile d'ambiente per API
  const apiUrl = process.env.REACT_APP_API_URL || 'http://127.0.0.1:9000';

  const onEmojiClick = (emojiData) => {
    setInput(prev => prev + emojiData.emoji);
  };

  useEffect(() => {
    const pusher = new Pusher('6a10fce7f61c4c88633b', {
      cluster: 'eu'
    });

    const channel = pusher.subscribe(`room_${roomId}`);
    channel.bind('inserted', function (newMessage) {
      const correctedTimestamp = newMessage.timestamp && !isNaN(new Date(newMessage.timestamp))
        ? newMessage.timestamp
        : new Date().toISOString();

      const fixedMessage = {
        ...newMessage,
        timestamp: correctedTimestamp,
      };

      setRoomMessages(prevMessages => [...prevMessages, fixedMessage]);
    });

    return () => {
      channel.unbind_all();
      channel.unsubscribe();
    };
  }, [roomId]);

  useEffect(() => {
    const fetchRoomData = async () => {
      try {
        const roomRes = await axios.get(`${apiUrl}/api/v1/rooms/${roomId}`);
        setRoomName(roomRes.data.name);

        const messagesRes = await axios.get(`${apiUrl}/api/v1/rooms/${roomId}/messages`);
        setRoomMessages(messagesRes.data);

        const lastMsg = messagesRes.data[messagesRes.data.length - 1];
        setLastSeen(lastMsg?.timestamp || null);
      } catch (err) {
        console.error("❌ Errore nel recupero della stanza o dei messaggi:", err);
        navigate("/");
      }
    };

    if (roomId) fetchRoomData();
  }, [roomId, navigate, apiUrl]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      const newMessage = {
        message: input,
        name: user?.displayName || "Anonimo",
        timestamp: new Date().toISOString(),
        uid: user?.uid || "default",
      };

      await axios.post(`${apiUrl}/api/v1/rooms/${roomId}/messages`, newMessage);
      setInput("");

      setRoomMessages(prev => [...prev, newMessage]);
      setLastSeen(newMessage.timestamp);
    } catch (error) {
      console.error("❌ Errore nell'invio del messaggio:", error);
    }
  };

  return (
    <div className='Chat' key={roomId}>
      <div className='Chat_header'>
        <Avatar
          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(roomName)}&background=random&color=fff&size=128`}
          onError={(e) => {
            e.currentTarget.src = "/default-avatar.png";
          }}
        />
        <div className='Chat_header_info'>
          <h3>{roomName}</h3>
          <p>
            Visto l'ultima volta:{" "}
            {lastSeen
              ? new Date(lastSeen).toLocaleString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "Mai"}
          </p>
        </div>
      </div>

      <div className="Chat_body">
        {roomMessages.map((message, index) => {
          const date = new Date(message.timestamp);
          const isValidDate = !isNaN(date);
          const isOwnMessage = message.uid === user?.uid;

          return (
            <div
              key={message._id || index}
              className={`Chat_message_container ${isOwnMessage ? "Chat_receiver_container" : ""}`}
            >
              {!isOwnMessage && (
                <Avatar
                  className="Chat_avatar"
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(message.name)}&background=random&color=fff&size=64`}
                  onError={(e) => {
                    e.currentTarget.src = "/default-avatar.png";
                  }}
                />
              )}
              <span className="Chat_name">{message.name}</span>
              <div className={`Chat_message ${isOwnMessage ? "Chat_receiver" : ""}`}>
                {message.message}
                <span className="Chat_timestamp">
                  {isValidDate
                    ? date.toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "Data non valida"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className='Chat_footer'>
        <IconButton onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
          <InsertEmoticon />
        </IconButton>
        <form onSubmit={sendMessage}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Scrivi un messaggio..."
            type="text"
          />
          <button type="submit">Invia</button>
        </form>
        {showEmojiPicker && (
          <EmojiPicker
            onEmojiClick={(emojiData) => {
              onEmojiClick(emojiData);
              setShowEmojiPicker(false);
            }}
            width={300}
            height={350}
          />
        )}
      </div>
    </div>
  );
}

export default Chat;



