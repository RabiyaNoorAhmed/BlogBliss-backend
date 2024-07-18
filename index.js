const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const { connect } = require('mongoose');
const upload = require('express-fileupload');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const cors = require('cors');
require('dotenv').config();

// Load Firebase Admin SDK credentials
const serviceAccount = require('./firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'blogbliss-6ce07.appspot.com'
});


const app = express();
app.use(upload());
app.use(express.json({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ credentials: true, origin: "http://localhost:5173" }));


app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

connect(process.env.MONGO_URI).then(() => {
  app.listen(process.env.PORT || 5000, () => {
    console.log(`Server Started on Port ${process.env.PORT}`);
  });
}).catch(error => {
  console.error("MongoDB connection error:", error);
});

module.exports = app;
