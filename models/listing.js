const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review= require("./review.js");

const listingSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  description: String,
  image: {
//     filename: {
//       type: String,
//       default: "listingimage",
//     },
//     url: {
//       type: String,
//       default:
//         "https://plus.unsplash.com/premium_photo-1661962841993-99a07c27c9f4?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=1031",
//       set: (v) =>
//         v === ""
//           ? "https://plus.unsplash.com/premium_photo-1661962841993-99a07c27c9f4?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=1031"
//           : v,
//     },
url:String,
filename:String
  },  
  price: Number,
  location: String,
  country: String,
  reviews: [
    {
      type: Schema.Types.ObjectId,
      ref:"Review",
    },
  ],
  owner:{
    type: Schema.Types.ObjectId,
    ref:"User",
  },
  geometry:{
    type:{
      type:String,
    enum:['Point'],
    required:true
  },
  coordinates:{
    type:[Number],
    required:true
  }
  }
});


listingSchema.post("findOneAndDelete",async(listing) =>{
  if(listing){
    await Review.deleteMany({_id:{ $in: listing.reviews}});
  }
})
const Listing = mongoose.model("Listing", listingSchema); //in this the model is created with the help of schema
module.exports = Listing;
