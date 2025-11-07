// Load environment variables
// Production check
const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
    require('dotenv').config();
}


console.log(`Starting application in ${process.env.NODE_ENV || 'development'} mode`);

// Validate required environment variables
const requiredEnvVars = ['ATLASDB_URL', 'SECRET', 'CLOUD_NAME', 'CLOUD_API_KEY', 'CLOUD_API_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    if (isProduction) {
        console.error('Missing required environment variables:', missingEnvVars);
        process.exit(1);
    } else {
        console.warn('Warning: missing some env vars for local dev:', missingEnvVars);
    }
}




const express = require("express");
const mongoose = require("mongoose");
// Disable mongoose command buffering so queries fail fast when DB is unreachable
mongoose.set('bufferCommands', true);
// Track DB connection status
let dbConnected = false;
const Listing = require("./models/listing");
const app = express();
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");
const {listingSchema, reviewSchema} = require("./schema.js");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");

const dbUrl = process.env.MONGODB_URL || process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";

app.use(async (req, res, next) => {
  try {
    if(dbConnected){
    // Fetch all locations from the database
    const allListings = await Listing.find({}, "location");
    const uniqueLocations = [...new Set(allListings.map(l => l.location))];
    res.locals.locations = uniqueLocations;
    }else{
        // DB not connected → fallback to empty array
      res.locals.locations = [];
    }
  } catch (err) {
    console.error("Error fetching locations:", err.message);
    res.locals.locations = [];
  }
  next();
 });




const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");



main()
.then(() => {
    console.log("connected to DB");
})
.catch((err) =>{
    console.log(err);
});

async function main(){
    try {
        console.log("Attempting to connect to MongoDB...");
        
        await mongoose.connect(dbUrl, {
            serverSelectionTimeoutMS: 30000,
            connectTimeoutMS: 30000
        });
        console.log("MongoDB Connected Successfully to:", dbUrl);
         dbConnected = true;
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
        // Log more details about the connection attempt
        console.error("Connection Details:", {
            url: dbUrl.replace(/mongodb\+srv:\/\/[^:]+:[^@]+@/, 'mongodb+srv://[username]:[password]@'),
            error: err.message
        });
        // Do not throw here to allow the app to start in a degraded mode for local development.
        // The app will run but database-dependent features will show errors or no data.
        return;
    }
}

app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));    
app.use(express.urlencoded({extended: true}));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname,"/public")));

// Use Mongo session store only when explicitly enabled or in production.
// In local development (default) we keep the built-in in-memory store to avoid start failures
// when Atlas is unreachable. Set USE_MONGO_STORE=true to force the Mongo store.
let store;
if (process.env.NODE_ENV === 'production' || process.env.USE_MONGO_STORE === 'true') {
    store = MongoStore.create({
        mongoUrl: dbUrl,
        crypto: { secret: process.env.SECRET },
        touchAfter: 24 * 3600,
        ttl: 24 * 60 * 60,
        autoRemove: 'native'
    });
    store.on("error", (e) => {
        console.error("MONGO SESSION STORE ERROR:", e);
    });
} else {
    console.log('Development: using default in-memory session store (not persisted).');
    store = undefined; // express-session will use default MemoryStore
}

const sessionOptions = {
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        // Set secure based on environment
        secure: process.env.NODE_ENV === 'production',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000
    },
    name: 'session' // Don't use default connect.sid
};


// Session must be before passport
app.use(session(sessionOptions));
app.use(flash());

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Flash and user middleware
app.use((req, res, next) => {
    // Set current user for templates
    res.locals.currUser = req.user;
    // Set flash messages
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    next();
});




app.use("/listings",listingRouter);
app.use("/listings/:id/reviews",reviewRouter);
app.use("/",userRouter);
// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy", environment: process.env.NODE_ENV });
});

// Root redirect
app.get("/", (req, res) => {
    res.redirect("/listings");
});



// Handle 404s - catch all unmatched routes
app.use((req, res, next) => {
    next(new ExpressError(404, "Page Not Found!"));
});






const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => {
    console.log(`Server started successfully:`);
    console.log(`- Environment: ${process.env.NODE_ENV}`);
    console.log(`- Port: ${port}`);
    if (process.env.NODE_ENV === 'production') {
        console.log('- Running in production mode');
    }
})

// Global error handler
app.use((err, req, res, next) => {
    // Log error details (only detailed in development)
    if (!isProduction) {
        console.error("Error details:", {
            message: err.message,
            stack: err.stack,
            status: err.statusCode || 500
        });
    } else {
        console.error("Production error:", err.message);
    }

    // Determine status code and message
    const statusCode = err.statusCode || 500;
    let message = err.message || "Something went wrong!";

    // In production, use generic messages
    if (isProduction) {
        message = statusCode === 404 ? "Page Not Found!" : "An unexpected error occurred. Please try again later.";
    }

    // Handle different response types
    if (req.accepts('html')) {
        res.status(statusCode).render("error.ejs", { message, statusCode });
    } else {
        res.status(statusCode).json({ error: message });
    }
});

