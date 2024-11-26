const http = require('http'); 
const socketIo = require('socket.io');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const path = require('path');
const fs = require('fs');


const db=require('./Database/db');
const User=require('./Schema/UserSchema')
const Admin=require('./Schema/AdminSchema');
const Ticket = require('./Schema/TicketSchema'); 
const Chat= require('./Schema/ChatMessageSchema');
const httpServer = http.createServer(app); // Use the http module to create the server
const io = socketIo(httpServer);


const PORT = 4000;


// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/images', express.static('images'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

async function findAdminWithLeastTicketsByDepartment(department) { 
  try { 
      const admins = await Admin.find({ department }); 

      if (admins.length === 0) { 
          throw new Error('No admins found in the specified department'); 
      } 

      // Find the admin with the least assigned pending tickets 
      let leastAssignedAdmin = admins[0]; 
      let leastPendingCount = await Ticket.countDocuments({ 
          assignedAdmin: leastAssignedAdmin._id, 
          status: 'pending' 
      }); 

      for (const admin of admins) { 
          const pendingTicketsCount = await Ticket.countDocuments({ 
              assignedAdmin: admin._id, 
              status: 'pending' 
          }); 

          if (pendingTicketsCount < leastPendingCount) { 
              leastPendingCount = pendingTicketsCount; 
              leastAssignedAdmin = admin; 
          } 
      } 


      return leastAssignedAdmin; 
  } catch (error) { 
      throw new Error(`Error finding admin with least pending tickets: ${error.message}`); 
  } 
}



async function findAdminAndUserForTicket(ticketId) {
  try {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const admin = await Admin.findById(ticket.assignedAdmin);
    const user = await User.findById(ticket.user);

    if (!admin || !user) {
      throw new Error('Associated admin or user not found');
    }

    return { admin, user };
  } catch (error) {
    throw new Error('Error finding associated admin and user');
  }
}

function isAlphaNumeric(str) {
  
  const regex = /^[a-zA-Z0-9]+$/;


  return regex.test(str);
}



app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'homepage.html'));
});






app.get('/create-account', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'create-account.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'homepage.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'homepage.html'));
});







app.get('/ticket', async (req, res) => {
  const email = req.query.email;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.redirect('/login');
      return;
    }

    const userTickets = await Ticket.find({ user: user._id });
    res.render('ticket', { username:user.username,loggedInUser: user, userTickets, email }); // Pass loggedInUser to the template
  } catch (error) {
    console.error(error);
    res.redirect('/login');
  }
});


app.get('/dashboard', async (req, res) => {
  const email = req.query.email;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      res.redirect('/login');
      return;
    }

    const assignedTickets = await Ticket.find({ assignedAdmin: admin._id });
    res.render('dashboard', { adminUsername: admin.username, adminEmail: admin.email, assignedTickets }); 
  } catch (error) {
    console.error(error);
    res.redirect('/login');
  }
});


app.get('/chat/:ticketId', async(req, res) => { 
  const { ticketId } = req.params; 
  const sends = req.query.sender; 
  const role = req.query.role; 
  try { 
      const ticket = await Ticket.findById(ticketId); 

      if (!ticket) { 
          // Handle ticket not found 
          res.status(404).send('Ticket not found'); 
          return; 
      } 

      let details = await findAdminAndUserForTicket(ticket); 
      
      // Fetch chat history for the specific ticket from the database 
      const chatDoc = await Chat.findOne({ ticketId: ticketId }); 
      const chatHistory = chatDoc ? chatDoc.messages : []; 

      res.render('chat', { ticket, userDetails: details, chatHistory, sends ,role}); // Pass chatHistory and senderName to the template 

  } catch (error) { 
      // Handle errors 
      res.status(500).send('Error opening chat'); 
  } 
});
app.get('/mytickets', async(req, res) => {
  const email = req.query.adminEmail;
  const admin = await Admin.findOne({ email });
  const assignedTickets = await Ticket.find({ assignedAdmin: admin._id });
  
  res.render('dashboard', {
    loggedInAdmin: admin._id,
    adminUsername:admin.username,
    assignedTickets,
    adminEmail:email,
    adminDepartment:admin.department
  });
});




io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('chatInit', async ({ userId, adminId, ticketId }) => {
    try {
      socket.join(ticketId.toString());

      // Fetch chat history for the specific ticket from the database
      const chatHistory = await Chat.findOne({ ticketId: ticketId });

      // Send the existing chat history to the user
      socket.emit('chatHistory', chatHistory);
    } catch (error) {
      console.error('Error initializing chat:', error);
    }
  });

  socket.on('chatMessage', async ({ sender, message, ticketId, messageType }) => {
    if(message=="")
    {
      console.log("");
    }
    else{
      try {
        const newMessage = {
          sender,
          message,
          timestamp: new Date(),
          messageType
        };
  
        await Chat.updateOne(
          { ticketId: ticketId },
          { $push: { messages: newMessage } },
          { upsert: true }
        );
  
  
        io.to(ticketId.toString()).emit('message', newMessage);
      } catch (error) {
        console.error('Error sending chat message:', error);
      }
    }

  });

  socket.on('chatImage', async ({ sender, image, ticketId, messageType }) => {
    try {
      // Extract the image data and filename
      const imageData = image.split(',')[1]; // Remove data URI scheme
      const imageExtension = 'jpg'; // You can modify this based on the uploaded image type
      const imageName = `image_${Date.now()}.${imageExtension}`;
  
      // Specify the path to the upload folder
      const uploadFolder = path.join(__dirname, 'uploads'); // Adjust this path as needed
  
      // Create the upload folder if it doesn't exist
      if (!fs.existsSync(uploadFolder)) {
        fs.mkdirSync(uploadFolder);
      }
  
      // Save the image to the upload folder
      const imagePath = path.join(uploadFolder, imageName);
      fs.writeFileSync(imagePath, imageData, 'base64');
  
      const newMessage = {
        sender,
        message: imageName, // Store the image name as the message
        timestamp: new Date(),
        messageType
      };
  
      await Chat.updateOne(
        { ticketId: ticketId },
        { $push: { messages: newMessage } },
        { upsert: true }
      );
  
      // Emit the new image message to the chat room
      io.to(ticketId.toString()).emit('image', newMessage);
    } catch (error) {
      console.error('Error sending image message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');

    // Leave all chat rooms
    socket.rooms.forEach(room => {
      socket.leave(room);
    });
  });
});








app.post('/create-ticket', async(req, res) => { 
  const { email, title, description, priority, department } = req.body; 
  if (department !== "Select") { 
      try { 
          const user = await User.findOne({ email }); 
          if (!user) { 
              console.log('User not found:', email); 
              res.redirect('/login'); 
              return; 
          } 

          const leastAssignedAdmin = await findAdminWithLeastTicketsByDepartment(department); 

          const newTicket = new Ticket({ 
              email, 
              user: user._id, 
              title, 
              department, 
              description, 
              priority, 
              status: 'pending', 
              assignedAdmin: leastAssignedAdmin._id // Assign the ticket to the admin with the least assigned tickets 
          }); 

          await newTicket.save(); 

          res.redirect(`/ticket?email=${email}&username=${user.username}`); 

      } catch (error) { 

          res.redirect(`/ticket?email=${email}`); 
      } 

  } else { 
      res.send('<script>alert("Select Appropiate Department."); </script>'); 
  } 
});

app.post("/register", async (req, res) => {
  const { who, username,department, email, password } = req.body;
  const existingUser = await User.findOne({ username });
  const existingEmail=await User.findOne({ email });
  const existingAdmin = await Admin.findOne({ username });
  const existingAdminemail = await Admin.findOne({ email });
  try {
    if (who === "user") {
      
      
      if ((existingUser || existingEmail) || (existingUser) || (existingEmail)) {
        if(existingUser)
        {
          res.send('<script>alert("Username already taken. Please choose a different username."); window.location="/create-account";</script>');
        }
        else{
          res.send('<script>alert("Email already taken. Please choose a different Email."); window.location="/create-account";</script>');
        }
        
      } else {
        if(isAlphaNumeric(username))
        {
          const newUser = new User({ username, email, password });
        await newUser.save();
        res.redirect('/login');
        }
        else{
          res.send('<script>alert("Username contains only Alpha numeric Characters."); window.location="/create-account";</script>');
        }
        
        
      }
    } else if (who === "admin") {
      
      if ( (existingAdmin || existingAdminemail) ||(existingAdmin) || (existingAdminemail)) {
        if(existingAdmin)
        {
          res.send('<script>alert("Admin username already taken. Please choose a different username."); window.location="/create-account";</script>');
        }
        else{
          res.send('<script>alert("Email already taken. Please choose a different Email."); window.location="/create-account";</script>');
        }
        
      } else {
        if(isAlphaNumeric(username))
        {
          const newAdmin = new Admin({ username,department, email, password });
        await newAdmin.save();
        res.redirect('/login');
        }
        else{
          res.send('<script>alert("Username contains only Alpha numeric Characters."); window.location="/create-account";</script>');
        }
        
      }
      
    }
    else if(who=="Select")
      {
        res.send('<script>alert("Please Select The Proper Role"); window.location="/create-account";</script>');
      }
  } catch (error) {
    
    res.send('<script>alert("Admin username already taken. Please choose a different username."); window.location="/create-account";</script>')
  }
});

app.post("/login", async (req, res) => {
  const { who, email, password } = req.body;

  try {
    if (who === "user") {
      const user = await User.findOne({ email, password });
      
      if (!user) {
        res.send('<script>alert("Please Enter the Valid Details of User"); window.location="/login";</script>');
      } else {
        
        const userTickets = await Ticket.find({ email });
        res.render('ticket', { username: user.username, userTickets, email });
      }
    } else if (who === "admin") {
      const admin = await Admin.findOne({ email, password });
      if (!admin) {
        res.send('<script>alert("Please Enter the Valid Details of Admin"); window.location="/login";</script>');
      } else {
      
        const departmentstickets=await Ticket.find({ department: admin.department });
        
       
        const assignedTickets = await Ticket.find({ assignedAdmin: admin._id });
        
        res.render('departmentdashboard', { admin,loggedInAdmin:admin.Adminid,adminUsername: admin.username, assignedTickets, adminEmail: admin.email ,departmentstickets});
      }
    }
    else if(who=="Select")
    {
      res.send('<script>alert("Please Select The Proper Role"); window.location="/login";</script>');
    }
  } catch (error) {
    console.error(error);
    res.redirect("/");
  }
});


app.post('/download-ticket-csv', async (req, res) => {
  try {
    const ticketId = req.body.ticketId;

    // Retrieve ticket data based on the ticketId
    // Replace this with your actual code to fetch ticket data
    const ticket = await Ticket.findById(ticketId);

    const ticketData = {
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
    };

    // Generate CSV content
    const csvContent = `Title,Description,Status,Priority\n${ticketData.title},"${ticketData.description}",${ticketData.status},${ticketData.priority}`;

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ticket_${ticketId}.csv`);

    // Send CSV content as the response
    res.send(csvContent);
  } catch (error) {
    console.error("Error in /download-ticket-csv route:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post('/admin-dashboard', async (req, res) => {
  const adminEmail = req.query.email;
  const searchQuery = req.body.search;
  const admin = await Admin.findOne({ email: adminEmail });
  try {
    if (!admin) {
      // Handle case where admin is not found
      res.status(404).send('Admin not found');
      return;
    }

    let assignedTickets = await Ticket.find({ assignedAdmin: admin._id });
    if (searchQuery) {
      assignedTickets = assignedTickets.filter(ticket => ticket.title.includes(searchQuery));
    }
    res.render('dashboard', {
      loggedInAdmin:admin.Adminid,
      adminUsername: admin.username,
      assignedTickets,
      adminEmail: admin.email,
      adminDepartment:admin.department
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
});



app.post('/update-ticket-status', async (req, res) => {
  try {
    const { ticketId, solved, adminemail } = req.body;
    const admin = await Admin.findOne({ email: adminemail });

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.redirect('/dashboard');
      return;
    }

    ticket.status = solved ? 'solved' : 'pending';
    await ticket.save();

    if (solved) {
      const assignedTickets = await Ticket.find({ assignedAdmin: ticket.assignedAdmin });
      const updatedAssignedTickets = assignedTickets.filter(t => t._id.toString() !== ticketId);
      await Admin.findByIdAndUpdate(ticket.assignedAdmin, { assignedTickets: updatedAssignedTickets });
    }

    const assignedTickets = await Ticket.find({ assignedAdmin: admin._id });

    res.render('dashboard', {
      loggedInAdmin: admin.Adminid,
      adminUsername: admin.username,
      assignedTickets,
      adminEmail: admin.email,
      adminDepartment: admin.department
    });

  } catch (error) {
    console.error(error);
    res.send('<script>alert("An error occurred"); window.location="/dashboard";</script>');
  }
});


httpServer.listen(PORT, async () => {
  await db.init().then(()=>{
    console.log("connection done");
  }); // Initialize the MongoDB connection
  console.log(`Server is running on http://localhost:${PORT}`);
});

