const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true, // Each ticket should have a single chat document
  },
  messages: [
    {
      sender: {
        type: String,
        required: true,
      },
      message: {
        type: String,
        required: true,
      },
      messageType: {
        type: String,
        enum: ['text', 'image'], // Enum to specify message type
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;
