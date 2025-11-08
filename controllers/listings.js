

const Listing = require("../models/listing");
const axios = require("axios"); // ✅ add this at top
require("dotenv").config(); // 2 line

module.exports.index = async (req, res) => {
  console.log("Fetching listings...");
  try {
    const allListings = await Listing.find({});
    console.log(`Found ${allListings.length} listings`);

    const locations = [...new Set(allListings.map(listing => listing.location))];
    console.log(`Available locations: ${locations.join(', ')}`);
    const { location } = req.query;
    let filteredListings = allListings;
    if (location) {
      filteredListings = allListings.filter(l => l.location === location);
    }
   
    res.render("listings/index.ejs", { 
      allListings: filteredListings,
      locations,
      currUser: req.user
    });
  } catch (err) {
    console.error("Error fetching listings:", err);
    res.status(500).render("error.ejs", { 
      message: "Error loading listings. Please try again later." 
    });
  }
};

 

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: {
        path: "author",
      },  
    })
    .populate("owner");
  if (!listing) {
    req.flash("error", "Listings you requested for does not exist!");
    res.redirect("/listings");
  }
  console.log(listing);
  res.render("listings/show.ejs", { listing });
};

module.exports.createListing = async (req, res, next) => {
  let url = req.file.path;
  let filename = req.file.filename;
  console.log(url, "..", filename);

  const newListing = new Listing(req.body.listing);
  newListing.owner = req.user._id;
  newListing.image = { url, filename };
  //newListing.geometry = newListing.geometry.coordinates;
  newListing.geometry = { type: "Point", coordinates: [0, 0] };

  const location = req.body.listing.location; //3 line

  try{
  const geoResponse = await axios.get(
    "https://nominatim.openstreetmap.org/search",
    {
      //4 line
      params: {
        q: location,
        format: "json",
        limit: 1,
      },
    }
  );
  if (geoResponse.data && geoResponse.data.length > 0) {
    const { lat, lon } = geoResponse.data[0];
    newListing.geometry = {
      type: "Point",
      coordinates: [parseFloat(lon), parseFloat(lat)],
    };
    console.log();
  } else {
    console.log("⚠️ No coordinates found for:", location);
    newListing.geometry = { type: "Point", coordinates: [0, 0] }; // fallback
  }
}catch(error){
  console.error("🌐 Geocoding failed due to network error/timeout:", error.message);
}

 let savedListings =  await newListing.save();
 console.log(savedListings);

  req.flash("success", "New listing created!");
  res.redirect("/listings");
};

module.exports.renderEditForm = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing you requested for does not exist!");
    res.redirect("/listings");
  }

  let originalImageUrl = listing.image.url;
  originalImageUrl = originalImageUrl.replace("/upload", "/upload/w_250");
  res.render("listings/edit.ejs", { listing, originalImageUrl });
};

module.exports.updateListing = async (req, res) => {
  let { id } = req.params;

 // let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });

 let listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/listings");
  }
    listing.set(req.body.listing);

  if (typeof req.file !== "undefined") {
    let url = req.file.path;
    let filename = req.file.filename;
    listing.image = { url, filename };
    //await listing.save();
  }


  
  // ✅ 4️⃣ Handle location update + geometry regeneration
  if (req.body.listing.location && req.body.listing.location !== listing.location) {
    try {
      const geoResponse = await axios.get("https://nominatim.openstreetmap.org/search", {
        params: {
          q: req.body.listing.location,
          format: "json",
          limit: 1,
        },
      });

      if (geoResponse.data && geoResponse.data.length > 0) {
        const { lat, lon } = geoResponse.data[0];
        listing.geometry = {
          type: "Point",
          coordinates: [parseFloat(lon), parseFloat(lat)],
        };
      } else {
        console.log("⚠️ No coordinates found for:", req.body.listing.location);
      }
    } catch (err) {
      console.log("🌐 Geocoding failed:", err.message);
    }
  }

   // ✅ 5️⃣ If no geometry exists (old data), preserve existing one
  if (!listing.geometry || !listing.geometry.type) {
    const oldListing = await Listing.findById(id);
    if (oldListing && oldListing.geometry) {
      listing.geometry = oldListing.geometry;
    } else {
      // fallback if nothing exists at all
      listing.geometry = { type: "Point", coordinates: [0, 0] };
    }
  }

  await listing.save();
  req.flash("success", " Listing Updated!");
  res.redirect(`/listings/${id}`);
};

module.exports.destroyListing = async (req, res) => {
  let { id } = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id);
  console.log(deletedListing);
  req.flash("success", "New listing deleted!");

  res.redirect("/listings");
};
