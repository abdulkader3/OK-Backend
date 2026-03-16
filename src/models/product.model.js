import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      minlength: [1, "Name cannot be empty"],
      maxlength: [200, "Name cannot exceed 200 characters"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"],
    },
    imageUrl: {
      type: String,
      default: null,
    },
    imageLocalUri: {
      type: String,
      default: null,
    },
    clientTempId: {
      type: String,
      index: true,
    },
    syncStatus: {
      type: String,
      enum: ["synced", "pending", "failed"],
      default: "pending",
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ ownerId: 1, deleted: 1 });
productSchema.index({ ownerId: 1, syncStatus: 1 });

const Product = mongoose.model("Product", productSchema);

export default Product;
