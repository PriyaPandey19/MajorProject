if(process.env.NODE_ENV != "production"){
  require('dotenv').config();
}

// Debug logging
console.log("Environment:", process.env.NODE_ENV);
console.log("Database URL:", process.env.ATLASDB_URL ? "MongoDB Atlas URL configured" : "MongoDB Atlas URL not found");
console.log("Secret:", process.env.SECRET);


const express = require("express");
const mongoose = require("mongoose");
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

const dbUrl = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";

app.use(async (req, res, next) => {
  try {
    // Fetch all locations from the database (only `location` field)
    const allListings = await Listing.find({}, "location");
    const uniqueLocations = [...new Set(allListings.map(l => l.location))];

    // Make them globally available to every EJS file
    res.locals.locations = uniqueLocations;
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
        await mongoose.connect(dbUrl);
        console.log("MongoDB Connected Successfully");
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
        throw err;  // Re-throw to be caught by the outer catch
    }
}

app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));    
app.use(express.urlencoded({extended: true}));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname,"/public")));

const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto:{
    secret:process.env.SECRET,

  },
  touchAfter: 24 * 3600,
});

store.on("error",() =>{
  console.log("ERROR in MONGO SESSION STORE ");
})

const sessionOptions = {
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,  // changed to false for better security
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // only use secure in production
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
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
app.get("/", (req, res) => {
  res.redirect("/listings");
});



app.all(/.*/,(req,res,next) =>{
    next(new ExpressError(404, "Page Not Found!"));
});






const port = process.env.PORT || 8080;
app.listen(port, ()=>{
    console.log(`server is listening on port ${port}`);
})

app.use((err, req, res, next) => {
  console.error("Error:", err);  // Log the full error
  let { statusCode = 500, message = "Something went wrong!" } = err;
  if (process.env.NODE_ENV === "production") {
    // In production, don't expose error details
    message = statusCode === 404 ? "Page Not Found!" : "Something went wrong!";
  }
  res.status(statusCode).render("error.ejs", { message });
});

