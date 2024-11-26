const mongoose = require("mongoose");

module.exports.init = async function () {
  await mongoose.connect(
    "mongodb+srv://USER:helpdesk@cluster0.7ituoiq.mongodb.net/?retryWrites=true&w=majority"
  )
}