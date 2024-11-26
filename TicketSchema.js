const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  email: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  title: { type: String, required: true },
  department: { type: String, required: true },
  description: { type: String, required: true },
  priority: { type: String, required: true },
  
  status: { type: String, default: 'Pending' } // Default status is "Pending"
});

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;
