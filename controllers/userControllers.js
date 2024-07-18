const User = require('../models/userModel');
const HttpError = require("../models/errorModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid")
const admin = require('firebase-admin');

const bucket = admin.storage().bucket();

// REGISTER A NEW USER
//POST : api/users/register
//UnProtected
const registerUser = async (req, res, next) => {
    try {
        const { name, email, password, confirmPassword } = req.body
        if (!name || !email || !password || !confirmPassword) {
            return next(new HttpError("Fill In All Fields", 422));
        };
        const newEmail = email.toLowerCase()

        const emailExits = await User.findOne({ email: newEmail })
        if (emailExits) {
            return next(new HttpError("Email already Exists", 422))
        };
        if ((password.trim()).length < 8) {
            return next(new HttpError("Password should be atleast 8 Characters", 422))
        };
        if (password !== confirmPassword) {
            return next(new HttpError("Passwords Do Not Match", 422))
        };
        // Hashing Password
        const salt = await bcrypt.genSalt(10);
        const hashedPass = await bcrypt.hash(password, salt);
        const newUser = await User.create({ name, email: newEmail, password: hashedPass });
        res.status(201).json(`New User ${newUser.email} registered`)

    } catch (error) {
        return next(new HttpError("User Registration Failed", 422))
    }
}


// LOGIN A REGISTERED USER
//POST : api/users/login
//UnProtected
const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return next(new HttpError("Fill in all Fields", 422))
        };

        const newEmail = email.toLowerCase();
        const user = await User.findOne({ email: newEmail });
        if (!user) {
            return next(new HttpError("Invalid Credentials.", 422))
        };

        const comparePass = await bcrypt.compare(password, user.password);
        if (!comparePass) {
            return next(new HttpError("Invalid Credentials.", 422))
        };

        const { _id: id, name } = user;
        const token = jwt.sign({ id, name }, process.env.JWT_SECRET, { expiresIn: "1d" })

        res.status(200).json({ token, id, name })


    } catch (error) {
        return next(new HttpError("Login Failed. Please check your Credentials", 422))
    }
}


// USER PROFILE
//POST : api/users/:id
//Protected
const getUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('-password');
        if (!user) {
            return next(new HttpError('User Not Found', 404))
        }
        res.status(200).json(user);
    } catch (error) {
        return next(new HttpError(error))
    }
}

// CHANGE USER AVATAR (PROFILE PICTURE)
//POST : api/users/change-avatar
//Protected
const changeAvatar = async (req, res, next) => {
    try {
        if (!req.files || !req.files.avatar) {
            return next(new HttpError("Please Choose An Image.", 422));
        }

        const { avatar } = req.files;

        // Check File Size
        if (avatar.size > 500000) {
            return next(new HttpError("Profile Picture too big. Should be less than 500kb", 422));
        }
        // Find user from Database (example: MongoDB)
        const user = await User.findById(req.user.id);
        // Delete old Avatar if exists
        if (user.avatar) {
            try {
                const oldAvatarFile = bucket.file(`uploads/avatars/${user.avatar}`);
                const [exists] = await oldAvatarFile.exists();
                if (exists) {
                    await oldAvatarFile.delete();
                    console.log(`Old avatar ${user.avatar} deleted successfully`);
                } else {
                    console.log(`Old avatar ${user.avatar} not found in storage`);
                }
            } catch (error) {
                console.error("Error deleting old avatar:", error);
                // Handle deletion error gracefully, such as logging or continuing without blocking
            }
        }
        // Generate new filename for avatar
        const fileName = `${uuid()}.${avatar.name.split('.').pop()}`;
        const fileUpload = bucket.file(`uploads/avatars/${fileName}`);

        // Create write stream for file upload
        const avatarStream = fileUpload.createWriteStream({
            metadata: {
                contentType: avatar.mimetype,
            },
            resumable: false // Optional: Disables resumable uploads, useful for smaller files
        });

        // Handle upload errors
        avatarStream.on('error', (err) => {
            console.error("Error uploading avatar:", err);
            return next(new HttpError("Failed to upload avatar", 500));
        });

        // Handle upload completion
        avatarStream.on('finish', async () => {
            // Make uploaded file publicly accessible
            await fileUpload.makePublic();

            // Get the public URL of the uploaded file
            const avatarUrl = `https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`;

            // Update user's avatar field in your database (if needed)
            // Example: MongoDB update
            await User.findByIdAndUpdate(req.user.id, { avatar: avatarUrl }, { new: true });

            // Return the avatar URL to the client
            res.status(200).json({ avatarUrl });
        });

        // Start uploading avatar data
        avatarStream.end(avatar.data);

    } catch (error) {
        console.error("Change avatar error:", error);
        return next(new HttpError(error.message, 500));
    }
};





// EDIT USER DETAILS (from profile)
//POST : api/users/edit-user
//Protected
const editUser = async (req, res, next) => {
    try {
        const { name, email, currentPassword, newPassword, confirmNewPassword } = req.body;
        if (!name, !email, !currentPassword, !newPassword, !confirmNewPassword) {
            return next(new HttpError('Fill in all Fields', 422))
        }
        // Get user from database
        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new HttpError("User Not Found.", 403))
        }
        //New Email doesn't already exist
        const emailExit = await User.findOne({ email });
        /* I want to update other details with/without changing
         the email (which is a unique id because we use it to login)*/
        if (emailExit && (emailExit._id != req.user.id)) {
            return next(new HttpError("Email already Exist.", 422))
        };

        // Compare Current Password to Database Password
        const validateUserPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validateUserPassword) {
            return next(new HttpError("Invalid Current Password.", 422))
        }

        //Compare new Passwords
        if (newPassword !== confirmNewPassword) {
            return next(new HttpError("New Passwords do not Match.", 422))
        };

        //Hash New Passwords
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        //Update User Info In Database
        const newInfo = await User.findByIdAndUpdate(req.user.id, { name, email, password: hash }, { new: true });
        res.status(200).json(newInfo)
    } catch (error) {
        return next(new HttpError(error))
    }
}

// GET AUTHORS
//POST : api/users/authors
//UnProtected
const getAuthors = async (req, res, next) => {
    try {
        const authors = await User.find().select('-password');
        res.json(authors);
    } catch (error) {
        return next(new HttpError(error))
    }
}


module.exports = {
    registerUser,
    loginUser, getUser, changeAvatar,
    editUser, getAuthors
}